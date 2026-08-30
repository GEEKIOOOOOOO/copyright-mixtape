// =============================================================
//  Manifesto — carica il testo da assets/manifesto.txt e lo
//  converte in una griglia di celle {col, row, char} compatibile
//  con il sistema Particles (spawn/assignTargets).
//
//  Il testo viene formattato con word-wrap per adattarsi alla
//  larghezza del canvas, centrato verticalmente e orizzontalmente.
//  Usa MANIFESTO_FONT_SIZE (indipendente dal FONT_SIZE del logo).
// =============================================================

import { FONT_SIZE, MANIFESTO_FONT_SIZE } from './config.js';

const MARGIN_COLS = 4;   // margine laterale in celle (per lato)
const MARGIN_ROWS = 3;   // margine verticale in celle (per lato)
const PARA_GAP    = 1;   // righe vuote tra paragrafi

const Manifesto = {
  _text: '',       // testo grezzo caricato
  _ready: false,   // true dopo il fetch

  // Carica il manifesto. Deve essere chiamato in preload() di p5
  // (o comunque prima di getCells). Usa fetch asincrono + callback
  // p5-friendly.
  preload() {
    fetch('assets/manifesto.txt')
      .then(r => r.text())
      .then(t => { this._text = t.trim(); this._ready = true; });
  },

  // Dimensioni di cella per il manifesto, derivate dal font monospace.
  // baseCellW è il cellW del logo (a FONT_SIZE): scaliamo linearmente.
  cellSize(baseCellW) {
    const scale = MANIFESTO_FONT_SIZE / FONT_SIZE;
    return {
      cellW: baseCellW * scale,
      cellH: MANIFESTO_FONT_SIZE,
    };
  },

  // Genera le celle del manifesto adattate alle dimensioni del canvas.
  // Usa la propria griglia basata su MANIFESTO_FONT_SIZE.
  // Restituisce un array di {col, row, char} (solo caratteri non-spazio),
  // stesso formato di Ascii.gridToCells().
  getCells(canvasW, canvasH, cellW, cellH) {
    if (!this._ready) return [];

    const cols = Math.floor(canvasW / cellW);
    const rows = Math.floor(canvasH / cellH);
    const usableCols = cols - MARGIN_COLS * 2;
    const usableRows = rows - MARGIN_ROWS * 2;
    if (usableCols < 10 || usableRows < 4) return [];

    // Splitta in paragrafi (righe vuote), poi word-wrap ogni paragrafo.
    const paragraphs = this._text.split(/\n\s*\n/);
    const wrappedLines = [];

    for (let pi = 0; pi < paragraphs.length; pi++) {
      if (pi > 0) {
        for (let g = 0; g < PARA_GAP; g++) wrappedLines.push('');
      }
      const words = paragraphs[pi].replace(/\n/g, ' ').split(/\s+/).filter(w => w);
      let line = '';
      for (const word of words) {
        const candidate = line ? line + ' ' + word : word;
        if (candidate.length <= usableCols) {
          line = candidate;
        } else {
          if (line) wrappedLines.push(line);
          if (word.length > usableCols) {
            for (let i = 0; i < word.length; i += usableCols) {
              wrappedLines.push(word.slice(i, i + usableCols));
            }
            line = '';
          } else {
            line = word;
          }
        }
      }
      if (line) wrappedLines.push(line);
    }

    // Tronca se supera le righe disponibili
    const lines = wrappedLines.slice(0, usableRows);

    // Centra verticalmente
    const startRow = MARGIN_ROWS + Math.floor((usableRows - lines.length) / 2);

    // Genera le celle (solo caratteri non-spazio)
    const cells = [];
    for (let r = 0; r < lines.length; r++) {
      const line = lines[r];
      const startCol = MARGIN_COLS;
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
        if (ch !== ' ') {
          cells.push({ col: startCol + c, row: startRow + r, char: ch });
        }
      }
    }

    return cells;
  },
};

export { Manifesto };
