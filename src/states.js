// =============================================================
//  Macchina a stati — ogni stato è un oggetto con
//  { enter(app, opts), update(app, dt), draw(app), onClick(app, x, y), hover(app, x, y) }
//  (tutti opzionali tranne update/draw). Per aggiungere comportamenti
//  si aggiungono stati, senza toccare quelli esistenti.
//
//  Flusso:  IdleSpin --click sul logo--> Align -> Hold
//           -> Morph(modello corrente -> successivo) -> IdleSpin
// =============================================================

import {
  FONT_SIZE, MANIFESTO_FONT_SIZE,
  ASCII_DEFAULT, BG_COLOR, CHAR_COLOR, SPIN_SPEED, ANIM,
  SNAP_DELAY_MS, SCRUB_FOLLOW, SETTLE_EPS, SCREEN_DWELL_MS,
  easeInOutCubic, damp,
} from './config.js';
import { Ascii } from './ascii.js';
import { Particles } from './particles.js';
import { Manifesto } from './manifesto.js';
import { Mixtape } from './mixtape.js';
import { CopyrightModel, PlayModel, PauseModel } from './model.js';

function renderLogoFrame(app, offsetX = 0) {
  if (offsetX !== 0) {
    app.gfx.push();
    app.gfx.translate(offsetX, 0, 0);
  }
  
  app.model.render(app.gfx, app.angle);
  
  if (offsetX !== 0) {
    app.gfx.pop();
  }
  
  app.gfx.loadPixels();
  Ascii.sampleLuminance(app.gfx, app.cols, app.rows, app.cellW, app.cellH, app.lum);
}

// Profilo ASCII del modello (tono + bordi). Un modello può portarsi il suo
// (es. il gatto, più contrastato); altrimenti si usa quello di default.
function asciiOf(model) {
  return model.ascii || ASCII_DEFAULT;
}

// Disegna il frame ASCII corrente del logo (idle, align, hold).
// Forza textSize(FONT_SIZE) per sicurezza (ShowManifesto potrebbe averlo cambiato).
function drawLogoFrame(app, offsetX = 0) {
  renderLogoFrame(app, offsetX);
  background(BG_COLOR);
  fill(CHAR_COLOR);
  textSize(FONT_SIZE);
  Ascii.drawGrid(app.lum, app.cols, app.rows, app.cellH, asciiOf(app.model));
}

// Snapshot delle celle di un modello a un dato angolo: ricalcolato al momento,
// mai stantio (sopravvive a resize). Sorgente/destinazione del morph.
// NB: sovrascrive app.lum — se ti serve il frame VIVO come sorgente, leggilo
// (Ascii.gridToCells(app.lum, ...)) PRIMA di chiamare questa.
function cellsAtAngle(app, model, angle, offsetX = 0) {
  if (offsetX !== 0) {
    app.gfx.push();
    app.gfx.translate(offsetX, 0, 0);
  }
  
  model.render(app.gfx, angle);
  
  if (offsetX !== 0) {
    app.gfx.pop();
  }
  
  app.gfx.loadPixels();
  Ascii.sampleLuminance(app.gfx, app.cols, app.rows, app.cellW, app.cellH, app.lum);
  return Ascii.gridToCells(app.lum, app.cols, app.rows, asciiOf(model));
}

// Frontale (angolo 0): il caso usato dal click-morph logo<->©.
function frontalCells(app, model, offsetX = 0) {
  return cellsAtAngle(app, model, 0, offsetX);
}

function overLogo(app, x, y) {
  let cx = width / 2;
  if (app.state === ShowMixtape) cx += width / 4;
  return dist(x, y, cx, height / 2) <= app.model.hitRadius();
}

// --- Oggetto che gira: comportamento idle condiviso da OGNI schermata.
//     Gira app.model a SPIN_SPEED; il click è instradato al gestore della
//     schermata corrente (home -> morph logo<->©, playlist -> per ora nulla).
const IdleSpin = {
  update(app, dt) { app.angle += SPIN_SPEED * dt; },
  draw(app) { drawLogoFrame(app); },
  onClick(app, x, y) {
    if (!overLogo(app, x, y)) return;
    const handler = app.screens[app.screenIndex].onClick;
    if (handler) handler(app);
  },
  hover(app, x, y) {
    return !!app.screens[app.screenIndex].onClick && overLogo(app, x, y);
  },
};

// --- Raddrizzamento: easing fluido verso il multiplo di 2π più vicino ---
// opts.onAligned (opzionale): callback invocato al posto della transizione
// di default (Hold). Permette di riusare Align per flussi diversi (manifesto).
const Align = {
  enter(app, opts) {
    this.t = 0;
    this.opts = opts || {};
    this._onAligned = opts && opts.onAligned;
    this.from = app.angle;
    this.to = Math.round(app.angle / TWO_PI) * TWO_PI;   // sempre il giro "corto"
  },
  update(app, dt) {
    this.t = min(this.t + dt / ANIM.ALIGN_DURATION, 1);
    app.angle = lerp(this.from, this.to, easeInOutCubic(this.t));
    if (this.t >= 1) {
      if (this._onAligned) this._onAligned();
      else app.setState(Hold);
    }
  },
  draw(app) {
    if (this.opts && this.opts.drawOverride) {
      this.opts.drawOverride(app, this.t);
    } else {
      drawLogoFrame(app);
    }
  },
};

// --- Beat fermo frontale, poi snapshot e via col morph ---
// opts.onHeld (opzionale): callback invocato al posto della transizione
// di default (morph al modello successivo del ciclo). Permette di riusare
// Hold per flussi diversi (manifesto).
const Hold = {
  enter(app, opts) {
    this.t = 0;
    this.opts = opts || {};
    this._onHeld = opts && opts.onHeld;
  },
  update(app, dt) {
    this.t += dt;
    if (this.t >= ANIM.HOLD_DURATION) {
      if (this._onHeld) {
        this._onHeld();
      } else {
        const nextIndex = (app.modelIndex + 1) % app.models.length;
        app.setState(Morph, {
          source: frontalCells(app, app.model),
          targets: frontalCells(app, app.models[nextIndex]),
          next: IdleSpin,
          onDone: a => {
            a.modelIndex = nextIndex;
            a.model = a.models[nextIndex];
            a.angle = 0;   // il nuovo modello riparte a girare dal frontale
          },
        });
      }
    }
  },
  draw(app) {
    if (this.opts && this.opts.drawOverride) {
      this.opts.drawOverride(app, this.t / ANIM.HOLD_DURATION);
    } else {
      drawLogoFrame(app);
    }
  },
};

// --- Morph fluido: transizione diretta sorgente → destinazione ---
// opts.sourceCellW/H e opts.targetCellW/H (opzionali): dimensioni di cella
// diverse per sorgente e destinazione (es. logo 9px → manifesto 20px).
// Se assenti, usa app.cellW/cellH (stesso grid).
const Morph = {
  enter(app, opts) {
    this.opts = opts;
    this.t = 0;
    this.sCW = opts.sourceCellW || app.cellW;
    this.sCH = opts.sourceCellH || app.cellH;
    this.tCW = opts.targetCellW || app.cellW;
    this.tCH = opts.targetCellH || app.cellH;
    this.u = 0;
    Particles.spawn(opts.source, this.sCW, this.sCH);
    Particles.assignTargets(opts.targets, this.tCW, this.tCH);
  },
  update(app, dt) {
    this.t += dt;
    this.u = min(this.t / ANIM.MORPH_DURATION, 1);
    Particles.updateMorph(easeInOutCubic(this.u));
    if (this.t >= ANIM.MORPH_DURATION) {
      if (this.opts.onDone) this.opts.onDone(app);
      app.setState(this.opts.next);
    }
  },
  draw(app) {
    background(BG_COLOR);
    const currentCellH = lerp(this.sCH, this.tCH, easeInOutCubic(this.u));
    const currentCellW = lerp(this.sCW, this.tCW, easeInOutCubic(this.u));
    textSize(currentCellH);
    Particles.draw(currentCellW, currentCellH);
    
    if (this.opts.drawOverlay) {
      this.opts.drawOverlay(app, this.u);
    }
  },
};

// --- Scrub verticale: lo scroll sposta un BERSAGLIO (app.scrollU) e il morph
//     lo insegue con smorzamento -> fluido anche con mouse a scatti, senza zona
//     morta ai primi tic. L'oggetto CONTINUA a girare: ogni frame ri-campiono i
//     due modelli al loro angolo VIVO, così la rotazione prosegue durante la
//     pozza invece di congelarsi. È AGNOSTICO AI CONFINI: morfa sempre tra le
//     due schermate adiacenti in cui cade app.morphU, quindi vale per N schede
//     e per inversioni di scroll a metà. Allo stop il bersaglio aggancia (snap)
//     la schermata più vicina e il morph ci scivola sopra, poi torna a IdleSpin.
const Scrub = {
  update(app, dt) {
    app.angle += SPIN_SPEED * dt;                       // continua a girare durante lo scroll

    // Allo stop dello scroll, il bersaglio aggancia la schermata più vicina.
    if (millis() - app.lastWheelMs > SNAP_DELAY_MS) app.scrollU = Math.round(app.scrollU);
    // Il morph insegue il bersaglio in modo fluido (come la transizione idle).
    app.morphU = damp(app.morphU, app.scrollU, SCRUB_FOLLOW, dt);

    // Le due schermate adiacenti in cui cade morphU, e la frazione tra loro.
    const maxU = app.screens.length - 1;
    const lo   = constrain(Math.floor(app.morphU), 0, maxU - 1);
    const frac = app.morphU - lo;                        // 0 = schermata lo, 1 = schermata lo+1

    // Ri-campiono i due oggetti al loro angolo VIVO: la rotazione prosegue.
    const source = cellsAtAngle(app, app.screens[lo].getModel(app),     app.angle);
    const target = cellsAtAngle(app, app.screens[lo + 1].getModel(app), app.angle);
    Particles.spawn(source, app.cellW, app.cellH);
    Particles.assignTargets(target, app.cellW, app.cellH);
    Particles.updateMorph(frac);

    // Posato su una schermata (bersaglio intero e morph arrivato) -> torna idle.
    const settled = Math.round(app.scrollU);
    if (app.scrollU === settled && Math.abs(app.morphU - settled) < SETTLE_EPS) {
      app.morphU = app.scrollU = settled;
      app.screenIndex = settled;
      app.model       = app.screens[settled].getModel(app);   // app.angle è già vivo -> idle in fase
      app.dwellUntil  = millis() + SCREEN_DWELL_MS;            // detent: breve sosta prima di poter proseguire
      app.setState(IdleSpin);
    }
  },

  draw(app) {
    background(BG_COLOR);
    textSize(FONT_SIZE);
    Particles.draw(app.cellW, app.cellH);
  },
};

// --- Manifesto: il testo del manifesto fermo al centro, reso come griglia ---
// di caratteri ASCII a MANIFESTO_FONT_SIZE. Al click ovunque (o click su
// "manifesto" di nuovo) avvia il morph inverso verso il © e torna a IdleSpin.
const ShowManifesto = {
  _cells: null,   // celle del manifesto (cache, invalidata su resize)
  _w: 0,          // dimensioni canvas al momento del calcolo (per invalidare)
  _h: 0,
  _mCellW: 0,     // dimensioni cella manifesto (per il draw e il morph inverso)
  _mCellH: 0,

  enter(app) {
    app.showingManifesto = true;
    this._cells = null;   // forza ricalcolo
  },

  update(app) {
    // Ricalcola le celle se il canvas è cambiato (resize)
    if (!this._cells || this._w !== width || this._h !== height) {
      this._w = width;
      this._h = height;
      const { cellW, cellH } = Manifesto.cellSize(app.cellW);
      this._mCellW = cellW;
      this._mCellH = cellH;
      this._cells = Manifesto.getCells(width, height, cellW, cellH);
    }
  },

  draw() {
    background(BG_COLOR);
    fill(CHAR_COLOR);
    noStroke();
    textSize(MANIFESTO_FONT_SIZE);
    for (const cell of this._cells || []) {
      text(cell.char, cell.col * this._mCellW, cell.row * this._mCellH);
    }
  },

  // Celle correnti e dimensioni per il morph inverso (manifesto → ©)
  getCells()  { return this._cells || []; },
  getCellW()  { return this._mCellW; },
  getCellH()  { return this._mCellH; },
};

// --- Mixtape: la playlist e il player ASCII ---
const ShowMixtape = {
  enter(app) {
    app.showingMixtape = true;
    app.model = Mixtape.isPlaying ? PauseModel : PlayModel;
    
    // Inverti il tasto quando la canzone finisce
    Mixtape.onEnd(() => {
      const offsetX = width / 4;
      const source = frontalCells(app, app.model, offsetX);
      const target = frontalCells(app, PlayModel, offsetX);
      app.setState(Morph, {
        source,
        targets: target,
        next: ShowMixtape,
        onDone: a => { a.model = PlayModel; }
      });
    });
  },

  update(app, dt) {
    app.angle += SPIN_SPEED * dt;
  },

  draw(app) {
    drawLogoFrame(app, width / 4);
    
    Mixtape.drawTracklist(app, 255);
  },

  onClick(app, x, y) {
    const hitTrack = Mixtape.hitTest(x, y);
    const offsetX = width / 4;
    
    if (hitTrack && hitTrack.type === 'track') {
      Mixtape.setTrack(hitTrack.index);
      if (app.model === PlayModel) {
        const source = cellsAtAngle(app, app.model, app.angle, offsetX);
        const target = cellsAtAngle(app, PauseModel, app.angle, offsetX);
        app.setState(Morph, {
          source, targets: target, next: ShowMixtape,
          drawOverlay: a => Mixtape.drawTracklist(a, 255),
          onDone: a => { a.model = PauseModel; }
        });
      }
    } else if (hitTrack && hitTrack.type === 'progress') {
      Mixtape.seek(hitTrack.frac);
    } else if (overLogo(app, x, y)) {
      if (Mixtape.isPlaying) {
        Mixtape.pause();
        const source = cellsAtAngle(app, app.model, app.angle, offsetX);
        const target = cellsAtAngle(app, PlayModel, app.angle, offsetX);
        app.setState(Morph, {
          source, targets: target, next: ShowMixtape,
          drawOverlay: a => Mixtape.drawTracklist(a, 255),
          onDone: a => { a.model = PlayModel; }
        });
      } else {
        Mixtape.play();
        const source = cellsAtAngle(app, app.model, app.angle, offsetX);
        const target = cellsAtAngle(app, PauseModel, app.angle, offsetX);
        app.setState(Morph, {
          source, targets: target, next: ShowMixtape,
          drawOverlay: a => Mixtape.drawTracklist(a, 255),
          onDone: a => { a.model = PauseModel; }
        });
      }
    } else {
      // Clicked outside, chiudi mixtape
      triggerMixtape(app);
    }
  }
};

// Toggle manifesto: gestisce il passaggio IdleSpin ↔ ShowManifesto
// attraverso il sistema di morph particellare. Gestisce anche lo stile
// del link nell'header (classe 'active').
// Le dimensioni di cella per sorgente e destinazione sono passate al Morph
// separatamente: logo a FONT_SIZE, manifesto a MANIFESTO_FONT_SIZE.
function triggerManifesto(app) {
  const link = document.getElementById('manifesto-link');
  const { cellW: mCW, cellH: mCH } = Manifesto.cellSize(app.cellW);

  if (app.state === ShowManifesto) {
    // --- Morph inverso: manifesto → © ---
    const source = ShowManifesto.getCells();
    const target = frontalCells(app, app.model);
    app.setState(Morph, {
      source,
      targets: target,
      sourceCellW: ShowManifesto.getCellW(),
      sourceCellH: ShowManifesto.getCellH(),
      // targetCellW/H omessi → usa app.cellW/cellH (griglia logo)
      next: IdleSpin,
      onDone: a => {
        a.showingManifesto = false;
        if (link) link.classList.remove('active');
        a.angle = 0;
      },
    });
  } else if (app.state === IdleSpin) {
    // --- Avvia la sequenza: Align → Hold → Morph → ShowManifesto ---
    if (!Manifesto._ready) return;
    if (link) link.classList.add('active');
    app.setState(Align, {
      onAligned: () => {
        app.setState(Hold, {
          onHeld: () => {
            const source = frontalCells(app, app.model);
            const target = Manifesto.getCells(width, height, mCW, mCH);
            app.setState(Morph, {
              source,
              targets: target,
              // sourceCellW/H omessi → usa app.cellW/cellH (griglia logo)
              targetCellW: mCW,
              targetCellH: mCH,
              next: ShowManifesto,
              onDone: () => {},
            });
          },
        });
      },
    });
  }
  // Se siamo in Align/Hold/Morph (transizione in corso) → ignora
}

// Toggle mixtape: gestisce il passaggio IdleSpin ↔ ShowMixtape
function triggerMixtape(app) {
  const link = document.getElementById('mixtape-link');

  if (app.state === ShowMixtape) {
    // Esci dal mixtape: morph verso CopyrightModel al centro
    app.setState(Align, {
      drawOverride: a => {
        drawLogoFrame(a, width / 4);
        push();
        Mixtape.drawTracklist(a, 255);
        pop();
      },
      onAligned: () => {
        app.setState(Hold, {
          drawOverride: a => {
            drawLogoFrame(a, width / 4);
            push();
            Mixtape.drawTracklist(a, 255);
            pop();
          },
          onHeld: () => {
            const offsetX = width / 4;
            const source = frontalCells(app, app.model, offsetX);
            const target = frontalCells(app, CopyrightModel, 0);
            app.setState(Morph, {
              source,
              targets: target,
              next: IdleSpin,
              drawOverlay: (a, u) => {
                push();
                Mixtape.drawTracklist(a, (1 - u) * 255);
                pop();
              },
              onDone: a => {
                a.showingMixtape = false;
                a.model = CopyrightModel;
                if (link) link.classList.remove('active');
              }
            });
          }
        });
      }
    });
  } else if (app.state === IdleSpin) {
    if (link) link.classList.add('active');
    
    app.setState(Align, {
      onAligned: () => {
        app.setState(Hold, {
          onHeld: () => {
            const offsetX = width / 4;
            const source = frontalCells(app, app.model, 0);
            const targetModel = Mixtape.isPlaying ? PauseModel : PlayModel;
            const target = frontalCells(app, targetModel, offsetX);
            app.setState(Morph, {
              source,
              targets: target,
              next: ShowMixtape,
              drawOverlay: (a, u) => {
                push();
                Mixtape.drawTracklist(a, u * 255);
                pop();
              },
              onDone: a => {
                a.model = targetModel;
              }
            });
          }
        });
      }
    });
  }
}

// Align/Scrub sono usati anche da main.js (click home, scroll).
export { IdleSpin, Align, Hold, Morph, Scrub, ShowManifesto, triggerManifesto, ShowMixtape, triggerMixtape };


