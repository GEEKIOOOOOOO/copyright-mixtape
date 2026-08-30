// =============================================================
//  Rasterizzatore ASCII — funzioni pure, riusabili su qualsiasi
//  p5.Graphics: pixel -> griglia di luminanza -> glifi.
// =============================================================

import { ASCII_DEFAULT } from './config.js';

const Ascii = {

  // Griglia di luminanza per cella. Per ogni cella media una sotto-griglia
  // 2x2 di pixel (supersampling): toni più morbidi e bordi anti-aliased.
  // Il buffer deve avere già loadPixels() chiamato.
  sampleLuminance(gfx, cols, rows, cellW, cellH, out) {
    const d  = gfx.pixelDensity();   // densità del buffer (per indicizzare i pixel)
    const pw = gfx.width * d;        // larghezza reale del buffer in pixel
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let sum = 0;
        for (let sy = 0; sy < 2; sy++) {
          for (let sx = 0; sx < 2; sx++) {
            const px = floor((c + (sx + 0.5) / 2) * cellW);
            const py = floor((r + (sy + 0.5) / 2) * cellH);
            const idx = 4 * ((py * d) * pw + px * d);
            sum += gfx.pixels[idx];    // canale rosso = luminanza (scena in grigi)
          }
        }
        out[r * cols + c] = sum * 0.25;
      }
    }
    return out;
  },

  // Glifo di una cella: i bordi (Sobel 3x3) diventano glifi-linea orientati,
  // l'interno usa la rampa tonale con tone-mapping. Può restituire ' '.
  // `p` = profilo ASCII del modello attivo (tono + bordi); default ASCII_DEFAULT.
  charAt(lum, c, r, cols, rows, p) {
    p = p || ASCII_DEFAULT;
    const i = r * cols + c;
    const b = lum[i];

    // --- Bordi: Sobel sui vicini (saltiamo la cornice esterna) ---
    if (b > p.EDGE_MIN_LUM && r > 0 && c > 0 && r < rows - 1 && c < cols - 1) {
      const tl = lum[i - cols - 1], tc = lum[i - cols], tr = lum[i - cols + 1];
      const ml = lum[i - 1],                            mr = lum[i + 1];
      const bl = lum[i + cols - 1], bc = lum[i + cols], br = lum[i + cols + 1];
      // Traccia la linea solo se il vicino più scuro è sotto EDGE_BG_MAX. Con la
      // soglia bassa (default) passa solo il contorno figura/sfondo; alzandola
      // (come per il gatto) passano anche i bordi INTERNI tra le facce.
      const minNb = Math.min(tl, tc, tr, ml, mr, bl, bc, br);
      if (minNb < p.EDGE_BG_MAX) {
        const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
        const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
        if (gx * gx + gy * gy > p.EDGE_THRESHOLD * p.EDGE_THRESHOLD) {
          return edgeGlyph(gx, gy);
        }
      }
    }

    // --- Interno: rampa tonale (tone-mapping per usare tutti i glifi) ---
    let t = constrain((b / 255 - p.BLACK_LEVEL) / (p.WHITE_LEVEL - p.BLACK_LEVEL), 0, 1);
    t = pow(t, p.GAMMA);
    return p.RAMP.charAt(constrain(floor(t * p.RAMP.length), 0, p.RAMP.length - 1));
  },

  // Fast-path dell'idle: compone le righe di testo e le disegna in blocco.
  // Usa fill/textAlign correnti del canvas principale. `p` = profilo del modello.
  drawGrid(lum, cols, rows, cellH, p) {
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        line += this.charAt(lum, c, r, cols, rows, p);
      }
      text(line, 0, r * cellH);
    }
  },

  // Snapshot della griglia: solo le celle non vuote, come {col, row, char}.
  // È la "fotografia" che alimenta il sistema di particelle. `p` = profilo del modello.
  gridToCells(lum, cols, rows, p) {
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = this.charAt(lum, c, r, cols, rows, p);
        if (ch !== ' ') cells.push({ col: c, row: r, char: ch });
      }
    }
    return cells;
  },
};

// Sceglie un glifo-linea allineato al bordo (perpendicolare al gradiente).
function edgeGlyph(gx, gy) {
  let a = atan2(gy, gx);          // direzione del gradiente, -PI..PI
  if (a < 0) a += PI;            // la linea non ha verso: ripiega in 0..PI
  const deg = degrees(a);
  if (deg < 22.5 || deg >= 157.5) return '|';   // gradiente orizzontale -> bordo verticale
  if (deg < 67.5)                 return '/';   // gradiente a 45°  -> bordo /
  if (deg < 112.5)                return '-';   // gradiente verticale -> bordo orizzontale
  return '\\';                                   // gradiente a 135° -> bordo \
}

export { Ascii };
