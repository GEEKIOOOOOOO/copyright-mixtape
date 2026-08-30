// =============================================================
//  Sistema di particelle — morph fluido e ordinato (swirl) con
//  casualità LEGGERA che rompe gli allineamenti prematuri.
//
//  Ogni glifo non vuoto della sorgente diventa una particella.
//  Sorgente e target sono ordinati con la stessa chiave spaziale
//  (angolo attorno al centroide, poi raggio) e accoppiati per rango:
//  i vicini restano vicini, il campo di moto è ordinato, senza incroci.
//  Poi tre jitter leggeri lo rendono organico senza sporcarlo:
//   - swap locali del target (permutazione preservata -> nessun buco);
//   - ritardo di partenza per-glifo (rompe il lockstep, arrivo a u=1);
//   - ondeggiamento laterale + curl variabile (lobo zero agli estremi).
//
//  TUTTI i glifi si spostano (stesso campo di moto): cambia solo l'alpha.
//   'morph'   — primario: scorre e si posa su un target (forma l'immagine finale)
//   'fadeout' — sorgente in eccesso (N>M): scorre verso la forma e si DISSOLVE
//               fondendosi (dissolvenza tardiva lungo il percorso)
//   'fadein'  — target mancante (M>N): EMERGE da una sorgente vicina e scorre
//               alla propria cella MATERIALIZZANDOSI (dissolvenza precoce)
//
//  Anti-accatastamento: in draw() un glifo per cella (z-buffer di
//  occupazione). L'inchiostro non può impilarsi -> niente zone scure dense.
// =============================================================

import { ANIM, CHAR_COLOR } from './config.js';

const Particles = {
  list: [],
  cellW: 1,   // memorizzate in spawn: servono al dedup per cella in draw()
  cellH: 1,

  // Crea le particelle dallo snapshot di celle sorgente (solo posizioni).
  spawn(cells, cellW, cellH) {
    this.cellW = cellW;
    this.cellH = cellH;
    this.list = cells.map(cell => ({
      // Posizione iniziale (sorgente)
      sx: cell.col * cellW,
      sy: cell.row * cellH,
      // Posizione corrente (animata)
      x: cell.col * cellW,
      y: cell.row * cellH,
      // Carattere sorgente e corrente
      charSrc: cell.char,
      charDst: cell.char,
      char: cell.char,
      // Alpha e stato
      alpha: 255,
      mode: 'fadeout',     // riassegnato in assignTargets
      // Target (impostato in assignTargets)
      tx: 0, ty: 0,
      // Perpendicolare per l'arco swirl (calcolata in assignTargets)
      arcX: 0, arcY: 0,
      // Jitter per-glifo (default neutri; impostati da _setMotion)
      delay: 0,        // ritardo di partenza (fraz. di u)
      curlMul: 1,      // moltiplicatore dell'ampiezza del curl
      wanderX: 0, wanderY: 0,   // ondeggiamento laterale (vettore, px)
      // Istante dello swap del glifo (solo 'morph')
      swapAt: 0.5,
    }));
  },

  // Imposta arco swirl + jitter per-glifo verso un target (px). Condiviso da
  // primari, eccessi e mancanti: tutti scorrono con lo stesso campo di moto.
  _setMotion(p, tx, ty) {
    const dx = tx - p.sx, dy = ty - p.sy;
    // Arco parabolico a curl UNICO (verso invariato) -> l'insieme cola ruotando.
    p.arcX = -dy * ANIM.CURL_STRENGTH;
    p.arcY =  dx * ANIM.CURL_STRENGTH;
    // Ritardo di partenza -> rompe il lockstep (arrivo comunque a u=1).
    p.delay = Math.random() * ANIM.TIME_JITTER;
    // Curl variabile + ondeggiamento laterale ad ampiezza ASSOLUTA (anche i glifi
    // quasi-fermi si animano: non sembrano "già lì"). Lobo -> zero agli estremi.
    p.curlMul = 1 + (Math.random() * 2 - 1) * ANIM.CURL_JITTER;
    const len = Math.hypot(dx, dy);
    let ux, uy;
    if (len > 1e-3) { ux = -dy / len; uy = dx / len; }   // perpendicolare al moto
    else { const a = Math.random() * Math.PI * 2; ux = Math.cos(a); uy = Math.sin(a); }
    const avgCell = (this.cellW + this.cellH) / 2;
    const amp = (Math.random() * 2 - 1) * ANIM.PATH_WANDER * avgCell;
    p.wanderX = ux * amp;
    p.wanderY = uy * amp;
  },

  // Accoppiamento per rango spaziale + casualità leggera. Ordino sorgente e
  // target con la stessa chiave (angolo attorno al centroide, poi raggio),
  // li appaio con striding uniforme, poi introduco i jitter.
  assignTargets(targetCells, cellW, cellH) {
    const src = this.list;
    const targets = targetCells.map(c => ({
      x: c.col * cellW, y: c.row * cellH, char: c.char,
    }));

    const N = src.length;
    const M = targets.length;
    if (N === 0 || M === 0) return;

    // Centroidi (sorgente: posizione d'origine sx/sy).
    let scx = 0, scy = 0;
    for (const p of src) { scx += p.sx; scy += p.sy; }
    scx /= N; scy /= N;
    let tcx = 0, tcy = 0;
    for (const t of targets) { tcx += t.x; tcy += t.y; }
    tcx /= M; tcy /= M;

    // Ordine spaziale attorno al centroide: angolo, poi raggio. I vicini
    // nella forma restano vicini nell'ordine -> flusso coerente, zero incroci.
    const sortByAngle = (items, gx, gy) => {
      for (const it of items) {
        const dx = it.x - gx, dy = it.y - gy;
        it._a = Math.atan2(dy, dx);
        it._r = dx * dx + dy * dy;
      }
      items.sort((p, q) => (p._a - q._a) || (p._r - q._r));
    };

    // Ordino su una copia indicizzata della sorgente (non riordino list).
    const srcOrder = src.map((p, i) => ({ x: p.sx, y: p.sy, i }));
    sortByAngle(srcOrder, scx, scy);
    sortByAngle(targets, tcx, tcy);

    const K = Math.min(N, M);
    const usedSrc = new Uint8Array(N);
    const usedTgt = new Uint8Array(M);

    // --- Primari: K coppie rango sorgente <-> rango target (striding uniforme).
    // denom = K-1 per coprire gli estremi (o 1 se c'è un solo mover).
    const denom = K > 1 ? K - 1 : 1;
    const movers = [];   // { si, ti } in ordine di rango
    for (let k = 0; k < K; k++) {
      const si = srcOrder[Math.round(k * (N - 1) / denom)].i;
      const ti = Math.round(k * (M - 1) / denom);
      if (usedSrc[si] || usedTgt[ti]) continue;   // salta doppioni da arrotondamento
      usedSrc[si] = 1; usedTgt[ti] = 1;
      movers.push({ si, ti });
    }

    // (1) SWAP LOCALI del target tra primari vicini di rango (prob. TARGET_JITTER,
    // entro ±SWAP_WINDOW). Essendo scambi, resta una permutazione: nessun doppione,
    // nessun buco, finale esatto. "vicino di rango" = "cella vicina".
    for (let idx = 0; idx < movers.length; idx++) {
      if (Math.random() >= ANIM.TARGET_JITTER) continue;
      const off = Math.round((Math.random() * 2 - 1) * ANIM.SWAP_WINDOW);
      const j = idx + off;
      if (j < 0 || j >= movers.length || j === idx) continue;
      const tmp = movers[idx].ti; movers[idx].ti = movers[j].ti; movers[j].ti = tmp;
    }

    // Finalizzo i primari sul target DEFINITIVO (post-swap): moto + swap glifo.
    // Sono esattamente K = min(N,M) e coprono tutti i target quando N>=M -> a u=1
    // formano l'immagine finale esatta.
    for (let idx = 0; idx < movers.length; idx++) {
      const p = src[movers[idx].si];
      const t = targets[movers[idx].ti];
      p.mode = 'morph';
      p.tx = t.x; p.ty = t.y;
      p.charDst = t.char;
      this._setMotion(p, t.x, t.y);

      // Swap del glifo lungo il rango (onda coerente) + piccola randomizzazione.
      const kf = movers.length > 1 ? idx / (movers.length - 1) : 0.5;
      const jitter = (Math.random() * 2 - 1) * ANIM.CHAR_CROSSFADE * 0.5;
      p.swapAt = constrain((0.5 - ANIM.CHAR_CROSSFADE) + kf * 2 * ANIM.CHAR_CROSSFADE + jitter, 0.05, 0.95);
    }

    // --- Sorgenti in eccesso (solo se N>M): NON restano ferme. Scorrono verso la
    // forma (target coerente per rango) col medesimo flusso e si dissolvono
    // fondendosi. I primari (uno per cella target) restano gli unici a u=1.
    for (let o = 0; o < srcOrder.length; o++) {
      const i = srcOrder[o].i;
      if (usedSrc[i]) continue;
      const p = src[i];
      const t = targets[this._surjRank(o, N, M)];
      p.mode = 'fadeout';
      p.tx = t.x; p.ty = t.y;
      p.char = p.charSrc;      // glifo sorgente che si dissolve confluendo
      this._setMotion(p, t.x, t.y);
    }

    // --- Target mancanti (solo se M>N): NON appaiono fermi. EMERGONO da una
    // sorgente coerente (per rango) e scorrono alla propria cella materializzandosi.
    for (let o = 0; o < targets.length; o++) {
      if (usedTgt[o]) continue;
      const t = targets[o];
      const origin = srcOrder[this._surjRank(o, M, N)];   // { x, y, i }
      const p = {
        sx: origin.x, sy: origin.y,
        x: origin.x, y: origin.y,
        charSrc: t.char, charDst: t.char, char: t.char,
        alpha: 0, mode: 'fadein',
        tx: t.x, ty: t.y,
        arcX: 0, arcY: 0, delay: 0, curlMul: 1, wanderX: 0, wanderY: 0,
        swapAt: 0.5,
      };
      this._setMotion(p, t.x, t.y);
      src.push(p);
    }
  },

  // Mappa suriettiva rango->rango: distribuisce i "surplus" del set più numeroso
  // su tutto il set più piccolo (nessun grappolo su un solo punto).
  _surjRank(o, big, small) {
    if (big <= 1) return 0;
    return constrain(Math.round(o * (small - 1) / (big - 1)), 0, small - 1);
  },

  // Aggiorna tutte le particelle: u = progresso 0->1 (già eased).
  // Tutti i modi condividono il campo di moto; cambia solo la dissolvenza.
  updateMorph(u) {
    // Finestra di dissolvenza degli eccessi lungo il percorso; il fadein usa la
    // finestra SPECULARE (materializzazione precoce mentre emerge).
    const FADE_LO = 0.5, FADE_HI = 0.9;
    for (const p of this.list) {
      // Progresso locale dopo il ritardo di partenza (arrivo comunque a u=1).
      const d = 1 - p.delay;
      const localU = d > 0 ? constrain((u - p.delay) / d, 0, 1) : 1;
      // Lobo parabolico (massimo a metà, ZERO agli estremi): arco + wander.
      const lobe = 4 * localU * (1 - localU);
      p.x = lerp(p.sx, p.tx, localU) + (p.arcX * p.curlMul + p.wanderX) * lobe;
      p.y = lerp(p.sy, p.ty, localU) + (p.arcY * p.curlMul + p.wanderY) * lobe;

      if (p.mode === 'morph') {
        p.alpha = 255;
        // Swap netto del glifo al proprio istante (su localU, desincronizzato).
        p.char = localU < p.swapAt ? p.charSrc : p.charDst;
      } else if (p.mode === 'fadeout') {
        // Visibile mentre scorre, poi si dissolve fondendosi (fade tardivo).
        p.alpha = 255 * constrain((FADE_HI - localU) / (FADE_HI - FADE_LO), 0, 1);
      } else { // fadein
        // Emerge invisibile e si materializza scorrendo (finestra speculare).
        p.alpha = 255 * constrain((localU - (1 - FADE_HI)) / (FADE_HI - FADE_LO), 0, 1);
      }
    }
  },

  // Disegna con z-buffer di occupazione: un solo glifo per cella (quello con
  // alpha maggiore). L'inchiostro non si somma -> niente zone scure dense.
  draw() {
    const col = color(CHAR_COLOR);
    noStroke();

    // 1) Occupazione: per ogni cella tengo la particella più opaca.
    const cellW = this.cellW, cellH = this.cellH;
    const occ = new Map();
    for (const p of this.list) {
      if (p.alpha <= 1) continue;
      const key = Math.round(p.x / cellW) + ',' + Math.round(p.y / cellH);
      const cur = occ.get(key);
      if (!cur || p.alpha > cur.alpha) occ.set(key, p);
    }

    // 2) Passata opachi (un solo fill) + passata semi-trasparenti (fill per glifo).
    fill(col);
    for (const p of occ.values()) {
      if (p.alpha >= 254) text(p.char, p.x, p.y);
    }
    for (const p of occ.values()) {
      if (p.alpha < 254) {
        fill(red(col), green(col), blue(col), p.alpha);
        text(p.char, p.x, p.y);
      }
    }
  },
};

export { Particles };
