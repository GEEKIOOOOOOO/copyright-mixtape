// =============================================================
//  © in ASCII 3D — P5.js
//  Il simbolo © gira al centro, reso in caratteri ASCII
//  alla "spinning donut" (donut.c).
//
//  Orchestrazione minima: p5 setup/draw delegano allo stato
//  corrente (vedi states.js). La logica vive nei moduli src/.
//
//  p5 gira in "GLOBAL MODE": è caricato come <script> globale in index.html
//  (da public/p5.min.js), quindi le sue funzioni (radians, text, …) sono
//  globali e nei moduli restano chiamate nude, identiche a prima. Gli hook del
//  ciclo di vita (setup/draw/…) sono di modulo: li esponiamo su window in fondo
//  al file, così p5 li ritrova e si auto-avvia (come faceva col tag CDN).
// =============================================================

import { FONT_SIZE, MODEL_CYCLE } from './config.js';
import { CopyrightModel } from './model.js';
import { IdleSpin, triggerManifesto, triggerMixtape, ShowMixtape } from './states.js';
import { Manifesto } from './manifesto.js';
import { Mixtape } from './mixtape.js';

const App = {
  state: null,
  models: [],        // i modelli del ciclo home (vedi MODEL_CYCLE in config.js)
  modelIndex: 0,
  model: null,       // modello attivo: gira al centro
  angle: 0,          // angolo di rotazione accumulato (radianti)
  gfx: null,         // buffer WEBGL nascosto
  lum: null,         // griglia di luminanza per cella (riusata tra i frame)
  cols: 0, rows: 0,  // dimensioni della griglia di celle
  cellW: 0, cellH: 0,// dimensioni di una cella di carattere

  // --- Navigazione verticale (scroll) — infrastruttura conservata ---
  screens: [],           // descrittori schermata: { getModel(app), onClick(app)|null }
  screenIndex: 0,        // schermata a riposo corrente (0 = home)
  scrollU: 0,            // BERSAGLIO verticale [0 .. screens.length-1] (mosso dallo scroll)
  morphU: 0,             // posizione verticale ANIMATA (insegue scrollU con smorzamento)
  lastWheelMs: 0,        // ultimo evento di scroll (per lo snap)
  dwellUntil: 0,         // fino a quando lo scroll resta assorbito dopo un aggancio (detent)

  showingManifesto: false,  // true quando il manifesto è visibile
  showingMixtape: false,    // true quando il mixtape è visibile

  setState(state, opts) {
    this.state = state;
    if (state.enter) state.enter(this, opts);
  },
};

const MODEL_FACTORIES = {
  copyright: () => CopyrightModel,
};

function preload() {
  App.models = MODEL_CYCLE.map(name => MODEL_FACTORIES[name]());
  App.model = App.models[0];

  // Unica schermata: la home con il © che gira. onClick è null perché
  // l'interazione è disabilitata in questa versione.
  App.screens = [
    { getModel: app => app.models[app.modelIndex], onClick: null },
  ];

  for (const m of App.models) if (m.preload) m.preload();
  Manifesto.preload();
  Mixtape.preload();
}

function setup() {
  createCanvas(windowWidth, windowHeight);          // canvas 2D per i caratteri
  App.gfx = createGraphics(width, height, WEBGL);    // scena 3D fuori schermo
  App.gfx.pixelDensity(1);
  for (const m of App.models) if (m.init) m.init(App.gfx);

  textFont('monospace');
  textSize(FONT_SIZE);
  textAlign(LEFT, TOP);
  noStroke();

  refreshGrid();
  App.setState(IdleSpin);

  // Link "manifesto" nell'header: al click avvia la transizione morph.
  const manifestoLink = document.getElementById('manifesto-link');
  if (manifestoLink) {
    manifestoLink.addEventListener('click', e => {
      e.preventDefault();
      triggerManifesto(App);
    });
  }

  // Link "mixtape" nell'header
  const mixtapeLink = document.getElementById('mixtape-link');
  if (mixtapeLink) {
    mixtapeLink.addEventListener('click', e => {
      e.preventDefault();
      triggerMixtape(App);
    });
  }
}

function refreshGrid() {
  App.cellW = textWidth('M');   // larghezza di un carattere monospace
  App.cellH = FONT_SIZE;        // altezza di riga
  App.cols  = floor(width / App.cellW);
  App.rows  = floor(height / App.cellH);
  const n = App.cols * App.rows;
  if (!App.lum || App.lum.length < n) App.lum = new Float32Array(n);
}

function draw() {
  // Delta time in secondi, con clamp: evita lo scatto del primo frame
  // (quando deltaTime può essere molto grande) e dopo un tab in background.
  const dt = min(deltaTime, 100) / 1000;
  App.state.update(App, dt);
  App.state.draw(App);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  App.gfx.resizeCanvas(width, height);
  textSize(FONT_SIZE);
  textAlign(LEFT, TOP);
  refreshGrid();
}

// Click sul canvas: delega allo stato corrente se ha un onClick
// (es. ShowMixtape per tracce/play). NON chiude mai manifesto/mixtape
// con click casuale — la navigazione tra pagine è solo via header.
function mousePressed() {
  if (App.state && App.state.onClick) {
    App.state.onClick(App, mouseX, mouseY);
  }
}

function touchStarted(event) {
  // Permetti i click sui link dell'header
  if (event && event.target && event.target.tagName !== 'CANVAS') {
    return;
  }
  mousePressed();
  // Previene lo scrolling/zooming accidentale sul canvas da mobile
  return false;
}

// --- Aggancio del ciclo di vita p5 (global mode) ---
// In global mode p5 cerca queste funzioni su `window` e le invoca (preload
// prima, poi setup, quindi draw a ogni frame). Con i moduli ES sono di modulo,
// non globali: le esponiamo qui su window. p5 (caricato come <script> in
// index.html) si auto-avvia al load trovandole — nessun new p5().
//
// Interazione: il click su "manifesto" nell'header attiva la transizione
// morph particellare tra il logo © e il testo del manifesto.
// Il click ovunque sul canvas chiude il manifesto e torna al logo.
window.preload       = preload;
window.setup         = setup;
window.draw          = draw;
window.windowResized = windowResized;
window.mousePressed  = mousePressed;
window.touchStarted  = touchStarted;
