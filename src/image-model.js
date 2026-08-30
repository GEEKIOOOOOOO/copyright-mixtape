// =============================================================
//  Modello estruso — estrude una SAGOMA booleana (grid {cols,rows,solid})
//  in una lastra 3D e la fa girare come gli altri modelli.
//  createImageModel: sagoma dal canale alpha di un PNG, adattatore sottile
//  su createExtrudedModel. La mesh, le luci e il raggio cliccabile stanno
//  una volta sola qui.
//  Interfaccia: { preload?, init, render, hitRadius }.
//  La mesh è costruita una sola volta (retained), poi disegnarla costa
//  quanto un model() qualsiasi.
// =============================================================

import { MODEL_SIZE, DIFFUSE } from './config.js';
import { applyStudioLights } from './model.js';

// Core condiviso: `buildSilhouette()` -> grid ritagliata {cols,rows,solid},
// invocata a init (dopo l'eventuale preload di asset). Il resto è identico
// per ogni sorgente di sagoma.
function createExtrudedModel({ buildSilhouette, scale = 1, depth, wallShade }) {
  let geom, radius;

  return {
    init(pg) {
      const grid = buildSilhouette();
      const cell = MODEL_SIZE * scale / max(grid.cols, grid.rows);
      geom = pg.buildGeometry(() => emitExtrusion(pg, grid, cell, depth, wallShade));
      radius = 0.5 * cell * sqrt(grid.cols * grid.cols + grid.rows * grid.rows);
    },

    render(pg, angle) {
      pg.background(0);
      pg.noStroke();
      applyStudioLights(pg);
      pg.push();
      pg.rotateY(angle);
      pg.model(geom);
      pg.pop();
    },

    hitRadius() {
      return radius * 1.05;
    },
  };
}

// Adattatore: la sagoma viene dal canale alpha di un PNG (caricato in preload).
function createImageModel(cfg) {
  let img;
  const model = createExtrudedModel({
    buildSilhouette: () => sampleSilhouette(img, cfg.RES, cfg.ALPHA_MIN),
    scale: cfg.SCALE || 1,
    depth: cfg.DEPTH,
    wallShade: cfg.WALL_SHADE,
  });
  model.preload = () => { img = loadImage(cfg.PATH); };
  return model;
}

// Griglia booleana della sagoma (media alpha 2x2 per cella), ritagliata al
// bounding box delle celle piene: il logo gira centrato anche se il PNG ha margini.
function sampleSilhouette(img, res, alphaMin) {
  img.loadPixels();
  const longSide = max(img.width, img.height);
  const cols = max(1, round(img.width  / longSide * res));
  const rows = max(1, round(img.height / longSide * res));
  const solid = new Uint8Array(cols * rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let a = 0;
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const px = floor((c + (sx + 0.5) / 2) * img.width / cols);
          const py = floor((r + (sy + 0.5) / 2) * img.height / rows);
          a += img.pixels[4 * (py * img.width + px) + 3];
        }
      }
      if (a * 0.25 >= alphaMin) solid[r * cols + c] = 1;
    }
  }

  let c0 = cols, r0 = rows, c1 = -1, r1 = -1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (solid[r * cols + c]) {
        c0 = min(c0, c); c1 = max(c1, c);
        r0 = min(r0, r); r1 = max(r1, r);
      }
    }
  }
  if (c1 < 0) return { cols, rows, solid };   // immagine vuota: lascia com'è

  const w = c1 - c0 + 1, h = r1 - r0 + 1;
  const cropped = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      cropped[r * w + c] = solid[(r + r0) * cols + (c + c0)];
    }
  }
  return { cols: w, rows: h, solid: cropped };
}

// Mesh dell'estrusione: facce davanti/dietro per run orizzontali di celle
// piene (con le pareti ai capi del run), pareti alto/basso solo dove la
// sagoma confina col vuoto. Centrata sull'origine. Le pareti hanno un fill
// più scuro (baked nei vertici da buildGeometry): i fori della sagoma
// restano scuri anche quando la rotazione li mostra di taglio.
function emitExtrusion(pg, grid, cell, depth, wallShade) {
  const { cols, rows, solid } = grid;
  const filled = (c, r) => c >= 0 && c < cols && r >= 0 && r < rows && solid[r * cols + c] === 1;
  const X = c => (c - cols / 2) * cell;
  const Y = r => (r - rows / 2) * cell;
  const hz = depth / 2;
  const wallCol = DIFFUSE * wallShade;

  pg.beginShape(TRIANGLES);
  forEachRun(cols, rows, filled, (r, ca, cb) => {
    const x0 = X(ca), x1 = X(cb), y0 = Y(r), y1 = Y(r + 1);
    pg.fill(DIFFUSE);
    emitQuad(pg,  0, 0,  1, x0, y0,  hz, x1, y0,  hz, x1, y1,  hz, x0, y1,  hz);
    emitQuad(pg,  0, 0, -1, x0, y0, -hz, x1, y0, -hz, x1, y1, -hz, x0, y1, -hz);
    pg.fill(wallCol);
    emitQuad(pg, -1, 0,  0, x0, y0, -hz, x0, y0,  hz, x0, y1,  hz, x0, y1, -hz);
    emitQuad(pg,  1, 0,  0, x1, y0, -hz, x1, y0,  hz, x1, y1,  hz, x1, y1, -hz);
  });
  pg.fill(wallCol);
  forEachRun(cols, rows, (c, r) => filled(c, r) && !filled(c, r - 1), (r, ca, cb) => {
    const y = Y(r);
    emitQuad(pg, 0, -1, 0, X(ca), y, -hz, X(cb), y, -hz, X(cb), y, hz, X(ca), y, hz);
  });
  forEachRun(cols, rows, (c, r) => filled(c, r) && !filled(c, r + 1), (r, ca, cb) => {
    const y = Y(r + 1);
    emitQuad(pg, 0, 1, 0, X(ca), y, -hz, X(cb), y, -hz, X(cb), y, hz, X(ca), y, hz);
  });
  pg.endShape();
}

// Scorre le righe della griglia e invoca cb(r, cInizio, cFine) per ogni
// run orizzontale contiguo in cui pred(c, r) è vero.
function forEachRun(cols, rows, pred, cb) {
  for (let r = 0; r < rows; r++) {
    let start = -1;
    for (let c = 0; c <= cols; c++) {
      const on = c < cols && pred(c, r);
      if (on && start < 0) start = c;
      else if (!on && start >= 0) { cb(r, start, c); start = -1; }
    }
  }
}

function emitQuad(pg, nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
  pg.normal(nx, ny, nz);
  pg.vertex(ax, ay, az); pg.vertex(bx, by, bz); pg.vertex(cx, cy, cz);
  pg.vertex(ax, ay, az); pg.vertex(cx, cy, cz); pg.vertex(dx, dy, dz);
}

export { createImageModel, createExtrudedModel, sampleSilhouette };
