// =============================================================
//  Manifesto — carica il testo da assets/manifesto.txt e lo
//  converte in una griglia di celle {col, row, char} compatibile
//  con il sistema Particles (spawn/assignTargets).
//
//  Il testo viene formattato con word-wrap per adattarsi alla
//  larghezza del canvas, centrato verticalmente e orizzontalmente.
//  Usa MANIFESTO_FONT_SIZE (indipendente dal FONT_SIZE del logo).
// =============================================================

import { FONT_SIZE, getManifestoFontSize } from './config.js';

const MARGIN_COLS_DESKTOP = 4;   // margine laterale in celle su desktop (per lato)
const MARGIN_COLS_MOBILE  = 2;   // margine laterale in celle su mobile (per lato)
const MARGIN_ROWS = 3;   // margine verticale in celle (per lato)
const PARA_GAP    = 1;   // righe vuote tra paragrafi

// Restituisce il margine colonne appropriato per la dimensione dello schermo
function getMarginCols() {
  if (typeof windowWidth === 'undefined') return MARGIN_COLS_DESKTOP;
  return windowWidth >= 800 ? MARGIN_COLS_DESKTOP : MARGIN_COLS_MOBILE;
}

const Manifesto = {
  _text: '',       // testo grezzo caricato
  _ready: false,   // true dopo il fetch

  // Carica il manifesto. Deve essere chiamato in preload() di p5
  // (o comunque prima di getCells). Usa fetch asincrono + callback
  // p5-friendly.
  preload() {
    fetch(import.meta.env.BASE_URL + 'assets/manifesto.txt')
      .then(r => r.text())
      .then(t => { this._text = t.trim(); this._ready = true; });
  },

  // Dimensioni di cella per il manifesto, derivate dal font monospace.
  // baseCellW è il cellW del logo (a FONT_SIZE): scaliamo linearmente.
  cellSize(baseCellW) {
    const mfs = getManifestoFontSize();
    const scale = mfs / FONT_SIZE;
    return {
      cellW: baseCellW * scale,
      cellH: mfs,
    };
  },

  // Genera le celle del manifesto adattate alle dimensioni del canvas.
  // Usa la propria griglia basata su getManifestoFontSize().
  // scrollOffset: offset di scroll in righe (default 0).
  // Restituisce un oggetto { cells, totalTextRows } dove cells è un array
  // di {col, row, char} (solo caratteri non-spazio) e totalTextRows è il
  // numero totale di righe del testo formattato (per calcolare lo scroll).
  getCells(canvasW, canvasH, cellW, cellH, scrollOffset) {
    if (!this._ready) return { cells: [], totalTextRows: 0 };

    const marginCols = getMarginCols();
    const cols = Math.floor(canvasW / cellW);
    const rows = Math.floor(canvasH / cellH);
    const usableCols = cols - marginCols * 2;
    const usableRows = rows - MARGIN_ROWS * 2;
    if (usableCols < 10 || usableRows < 4) return { cells: [], totalTextRows: 0 };

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

    const totalTextRows = wrappedLines.length;

    // Se il testo entra nello spazio, centra verticalmente (come prima).
    // Se non entra, applica scrollOffset per permettere lo scroll.
    const sOff = scrollOffset || 0;
    let startRow;
    if (totalTextRows <= usableRows) {
      // Il testo entra: centra verticalmente (comportamento desktop invariato)
      startRow = MARGIN_ROWS + Math.floor((usableRows - totalTextRows) / 2);
    } else {
      // Il testo non entra: parte dall'alto con offset di scroll
      startRow = MARGIN_ROWS - sOff;
    }

    // Genera le celle (solo caratteri non-spazio, solo righe visibili)
    const cells = [];
    for (let r = 0; r < wrappedLines.length; r++) {
      const screenRow = startRow + r;
      // Salta righe fuori schermo per performance
      if (screenRow < -1 || screenRow > rows + 1) continue;
      const line = wrappedLines[r];
      const startCol = marginCols;
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
        if (ch !== ' ') {
          cells.push({ col: startCol + c, row: screenRow, char: ch });
        }
      }
    }

    return { cells, totalTextRows };
  },
};

export { Manifesto };
