// =============================================================
//  Modelli 3D — un modello è un oggetto con interfaccia
//  { render(pg, angle), hitRadius(), preload()?, init(pg)? }.
//  Per aggiungerne uno nuovo: stessa interfaccia, zero modifiche
//  al rasterizzatore o agli stati. La scelta è in config.js.
// =============================================================

import {
  LIGHT_KEY, LIGHT_FILL, LIGHT_AMB, DIFFUSE, SPECULAR, SHININESS,
  COPYRIGHT_MODEL, getModelSize,
} from './config.js';

// Luci bilanciate per ottenere un gradiente che copra tutta la rampa:
//  - key non satura (così i toni intermedi vengono usati e non solo '@')
//  - fill opposta debole: rivela la forma sul lato in ombra
//  - speculare: piccolo riflesso mobile = accento (i glifi più chiari)
// `o` = override opzionali per-modello (KEY/FILL/AMB/DIFFUSE/SPECULAR/SHININESS);
// se assenti si usano i valori globali -> comportamento invariato per © e scritte.
function applyStudioLights(pg, o) {
  o = o || {};
  const key  = o.KEY       ?? LIGHT_KEY;
  const fill = o.FILL      ?? LIGHT_FILL;
  const amb  = o.AMB       ?? LIGHT_AMB;
  pg.ambientLight(amb);
  pg.directionalLight(key,  key,  key,  -0.4, -0.6, -0.6);
  pg.directionalLight(fill, fill, fill,  0.5,  0.4,  0.4);
  pg.fill(o.DIFFUSE ?? DIFFUSE);
  pg.specularMaterial(o.SPECULAR ?? SPECULAR);
  pg.shininess(o.SHININESS ?? SHININESS);
}

const CopyrightModel = {

  // Disegna il simbolo © illuminato (bianco) su sfondo nero nel buffer pg.
  render(pg, angle) {
    const { RING_R, RING_TUBE, C_R, C_TUBE, C_GAP } = COPYRIGHT_MODEL;
    pg.background(0);
    pg.noStroke();
    applyStudioLights(pg);

    // IMPORTANTE: un buffer WEBGL non azzera la matrice tra un frame e l'altro,
    // quindi le rotazioni si accumulano. push()/pop() la riportano pulita ogni frame.
    pg.push();
    // Normalizza il diametro esterno (anello + tubo) a getModelSize() (dinamico per responsive).
    pg.scale(getModelSize() / (2 * (RING_R + RING_TUBE)));
    pg.rotateY(angle);

    // Anello esterno
    pg.torus(RING_R, RING_TUBE, 60, 28);

    // Lettera C interna (arco aperto verso destra)
    const start = radians(C_GAP / 2);
    const end   = radians(360 - C_GAP / 2);
    arcTube(pg, C_R, C_TUBE, start, end, 64, 24);
    pg.pop();
  },

  // Raggio cliccabile attorno al centro dello schermo (con un piccolo margine).
  hitRadius() {
    return (getModelSize() / 2) * 1.15;
  },
};

// Costruisce un "tubo" che segue un arco nel piano XY: è la C della ©.
function arcTube(pg, R, r, a0, a1, arcSteps, tubeSteps) {
  for (let i = 0; i < arcSteps; i++) {
    const t0 = lerp(a0, a1, i / arcSteps);
    const t1 = lerp(a0, a1, (i + 1) / arcSteps);
    pg.beginShape(TRIANGLE_STRIP);
    for (let j = 0; j <= tubeSteps; j++) {
      const phi = (j / tubeSteps) * TWO_PI;
      tubeVertex(pg, R, r, t0, phi);
      tubeVertex(pg, R, r, t1, phi);
    }
    pg.endShape();
  }
  endCap(pg, R, r, a0, tubeSteps, -1);
  endCap(pg, R, r, a1, tubeSteps, +1);
}

function tubeVertex(pg, R, r, theta, phi) {
  const cphi = cos(phi), sphi = sin(phi);
  const ct = cos(theta), st = sin(theta);
  pg.normal(cphi * ct, cphi * st, sphi);
  pg.vertex((R + r * cphi) * ct, (R + r * cphi) * st, r * sphi);
}

function endCap(pg, R, r, theta, tubeSteps, dir) {
  const ct = cos(theta), st = sin(theta);
  const nx = -st * dir, ny = ct * dir;
  pg.beginShape(TRIANGLE_FAN);
  pg.normal(nx, ny, 0);
  pg.vertex(R * ct, R * st, 0);
  for (let j = 0; j <= tubeSteps; j++) {
    const phi = (j / tubeSteps) * TWO_PI;
    const cphi = cos(phi), sphi = sin(phi);
    pg.normal(nx, ny, 0);
    pg.vertex((R + r * cphi) * ct, (R + r * cphi) * st, r * sphi);
  }
  pg.endShape();
}

// applyStudioLights è usato anche da image-model.
export { CopyrightModel, applyStudioLights };
