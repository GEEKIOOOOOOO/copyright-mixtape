// =============================================================
//  Configurazione globale — tutti i parametri si regolano da qui.
// =============================================================

// --- Aspetto ASCII ---
const FONT_SIZE   = 9;                   // dimensione carattere ASCII 3D: più piccolo = più dettaglio
const MANIFESTO_FONT_SIZE = 20;          // dimensione carattere del manifesto (indipendente dal logo)
const CHAR_COLOR  = '#1a1a1a';          // colore dei caratteri (nero su bianco)
const BG_COLOR    = 255;                 // sfondo bianco
const SPIN_SPEED  = 0.4;                 // velocità di rotazione in radianti AL SECONDO (costante, indipendente dagli fps)

// Rampa di luminosità ordinata per densità del glifo: da scuro (spazio) a chiaro (@).
// Più glifi = passaggi tonali più fini e variegati (non più quasi solo '@').
const RAMP        = ' .:-=+*cvxznoaeJCQ0OZmwpdb#W&8%B@';

// Tone-mapping: rimappa la luminanza campionata per distribuire l'istogramma
// su tutta la rampa, invece di farlo accumulare sull'ultimo carattere.
const BLACK_LEVEL = 0.05;   // sotto questo livello -> spazio (taglio dei neri)
const WHITE_LEVEL = 0.73;   // sopra questo livello -> glifo più chiaro (taglio dei bianchi): solo i nuclei più luminosi clippano a @, la fascia sotto sfuma sui glifi densi (%B8&W#) -> gradiente = volume 3D. Le linee interne restano fuori (le governa EDGE_BG_MAX, non il tono).
const GAMMA       = 0.8;    // < 1 espande i toni intermedi

// Rilevamento bordi (Sobel): i contorni vengono tracciati con glifi-linea / \ | -.
// Soglia alta = il Sobel scatta solo sulla vera sagoma. Sotto i ~120 il gradiente
// morbido *interno* al tubo tondo faceva comparire falsi contorni (/ \ | -) dove
// non c'è nessun bordo: era la causa dell'"effetto strano" sull'anello della ©.
const EDGE_THRESHOLD = 220; // intensità minima del gradiente per disegnare una linea (più alta = contorni più sottili)
const EDGE_MIN_LUM   = 6;   // la linea è disegnata solo sopra questa luminanza (resta sul simbolo)
// Una linea è un CONTORNO VERO solo se confina col fondo nero (superficie ↔ sfondo).
// Se anche il vicino più scuro è illuminato, il "bordo" è interno alla superficie
// (il falloff del tubo tondo, o una sovrapposizione C/anello) e va RIEMPITO, non
// tracciato: è ciò che eliminava i falsi `--` dentro le masse piene di @.
// Più basso = più severo (meno linee interne, ma occhio a non assottigliare la sagoma).
const EDGE_BG_MAX    = 22;  // una linea passa solo se il vicino più scuro è sotto questo livello (≈ fondo)

// Profilo ASCII di DEFAULT (tono + bordi): i valori "ben tunati" qui sopra,
// impacchettati. charAt (ascii.js) usa il profilo del MODELLO ATTIVO, o questo
// se il modello non ne ha uno -> un singolo modello può sovrascrivere solo ciò
// che gli serve senza toccare gli altri.
const ASCII_DEFAULT = {
  RAMP, BLACK_LEVEL, WHITE_LEVEL, GAMMA,
  EDGE_THRESHOLD, EDGE_MIN_LUM, EDGE_BG_MAX,
};

// --- Illuminazione (vedi CopyrightModel.render): una key bassa evita la saturazione a bianco ---
const LIGHT_KEY   = 180;    // luce direzionale principale
const LIGHT_FILL  = 50;     // luce direzionale opposta (rivela il lato in ombra)
const LIGHT_AMB   = 38;     // luce ambiente (lato in ombra scuro ma non nero)
const DIFFUSE     = 210;    // colore base diffuso della superficie
const SPECULAR    = 140;    // intensità del riflesso speculare (accento mobile): abbassato per evitare la "striscia" luminosa lungo il tubo
const SHININESS   = 8;      // concentrazione del riflesso: più basso = glint largo e morbido, si fonde nel gradiente invece di leggersi come una linea

// --- Cosa gira al centro ---
// Per ora solo il simbolo ©. In futuro si potranno aggiungere altri modelli
// al ciclo (es. 'image' per il logo) e riattivare il click-morph.
const MODEL_CYCLE = ['copyright'];

// Dimensione a schermo dell'elemento centrale, UGUALE per tutti i modelli:
// è il lato più lungo del bounding box frontale visibile, bordi inclusi.
// Ogni modello si normalizza da solo a questa misura.
const MODEL_SIZE = 640;

// Modello 'copyright': proporzioni del simbolo (la scala finale la dà MODEL_SIZE)
const COPYRIGHT_MODEL = {
  RING_R:    230,  // raggio dell'anello esterno
  RING_TUBE: 30,   // spessore del tubo dell'anello
  C_R:       126,  // raggio della C interna
  C_TUBE:    27,   // spessore della C
  C_GAP:     80,   // apertura della C in gradi (rivolta a destra)
};

// --- Navigazione verticale a scroll ---
// Infrastruttura conservata per uso futuro. Non attiva nella versione corrente
// (nessuna schermata di contenuto, interazione disabilitata).
const SCROLL_SENSITIVITY = 0.0009;  // quanto un "notch" di wheel sposta il bersaglio (0..1)
const SCRUB_FOLLOW       = 6;       // rapidità con cui il morph insegue il bersaglio (1/s): più basso = più morbido
const SNAP_DELAY_MS      = 160;     // ms di scroll fermo prima di agganciare la schermata più vicina
const SCREEN_DWELL_MS    = 250;     // sosta minima su una schermata dopo l'aggancio (lo scroll è assorbito): detent
const SETTLE_EPS         = 0.02;    // quanto vicino a una schermata il morph "atterra" e torna idle

// --- Animazione: click -> allineamento -> morph fluido ---
// Infrastruttura conservata per uso futuro.
const ANIM = {
  ALIGN_DURATION:   0.45,   // s, raddrizzamento frontale (easeInOutCubic, giro "corto")
  HOLD_DURATION:    0.1,    // s, beat fermo frontale prima del morph (breve: parte quasi subito)
  MORPH_DURATION:   1.3,    // s, durata totale del morph diretto
  CURL_STRENGTH:    0.15,   // forza dell'arco swirl (0 = rettilineo, 0.3 = molto curvo).
                            //   Tutti gli archi curvano nello STESSO verso: l'insieme sembra
                            //   colare ruotando, invece di incrociarsi.
  CHAR_CROSSFADE:   0.1,    // finestra attorno a u=0.5 in cui il glifo cambia sorgente->dest

  // --- Casualità LEGGERA: rompe gli allineamenti prematuri senza sporcare.
  //     Preservano bijezione, estremi esatti e "un glifo per cella".
  //     Alzarle = più disordine; azzerarle = morph deterministico di prima.
  TARGET_JITTER:    0.4,    // prob. che un glifo scambi target con un vicino di rango ("target lì vicino")
  SWAP_WINDOW:      3,      // ampiezza (in ranghi) dello scambio locale di target
  TIME_JITTER:      0.22,   // ritardo di partenza max per-glifo (fraz. durata): rompe il lockstep e
                            //   scagliona comparsa/dissolvenza degli eccessi (onda naturale)
  PATH_WANDER:      1.1,    // ampiezza dell'ondeggiamento laterale (in celle), verso casuale
  CURL_JITTER:      0.6,    // variazione ± dell'ampiezza del curl per-glifo (verso dello swirl invariato)
};

// Easing condiviso da allineamento e riformazione.
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2;
}

// Smorzamento esponenziale indipendente dal frame-rate: avvicina `current` a
// `target` di una frazione che dipende solo da rate*dt (non dagli fps). Usato
// dallo scrub per inseguire il bersaglio dello scroll in modo fluido.
function damp(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

// --- Tracklist del mixtape ---
// Ogni traccia ha un titolo (mostrato nel player) e il percorso del file
// relativo alla root pubblica. I file vivono in public/assets/audio/ e Vite
// li copia in dist/assets/audio/ al build.
const TRACKS = [
  { title: '3b3 - INTRO',                                             file: 'assets/audio/3b3 - INTRO.mp3' },
  { title: 'INTRO DIRITTI D\'AUTORE (Kodak Black - Skrilla)',         file: 'assets/audio/INTRO DIRITTI D\'AUTORE (Kodak Black - Skrilla).mp3' },
  { title: 'BASS LOVE (prod. Kerosene)',                              file: 'assets/audio/BASS LOVE (prod. Kerosene).mp3' },
  { title: 'hogan acustic',                                           file: 'assets/audio/hogan acustic.mp3' },
  { title: 'ILLEGAO',                                                 file: 'assets/audio/ILLEGAO.mp3' },
  { title: 'OVERDOSING (Calcutta-Paracetamolo)',                      file: 'assets/audio/OVERDOSING (Calcutta-Paracetamolo).mp3' },
  { title: 'COUS COUS ( Rami Music - تقطيع ربابة )',                  file: 'assets/audio/COUS COUS ( Rami Music - تقطيع ربابة ).mp3' },
  { title: 'bound 222',                                               file: 'assets/audio/bound 222.mp3' },
  { title: '777TRIBUTE (Dark Polo Gang - Pesi Sul Collo RMX)',        file: 'assets/audio/777TRIBUTE (Dark Polo Gang - Pesi Sul Collo RMX).mp3' },
  { title: 'BALLANDO BALLANDOLO',                                     file: 'assets/audio/BALLANDO BALLANDOLO.mp3' },
  { title: 'SKIT JUST GEEK!',                                         file: 'assets/audio/SKIT JUST GEEK!.mp3' },
  { title: 'W.G.M (Kesha - Tik Tok rmx)',                             file: 'assets/audio/W.G.M (Kesha - Tik Tok rmx).mp3' },
  { title: 'L\'america è donna e si è fatta troia (O\'lEan-Leaving)', file: 'assets/audio/L\'america è donna e si è fatta troia (O\'lEan-Leaving).mp3' },
];

// --- Superficie pubblica del modulo (ES Modules) ---
// Nota: p5 resta in "global mode", quindi le sue funzioni/costanti (pow, lerp,
// TWO_PI, …) restano globali e NON vanno importate: qui esportiamo solo la
// configurazione e gli helper propri del progetto.
export {
  FONT_SIZE, MANIFESTO_FONT_SIZE, CHAR_COLOR, BG_COLOR, SPIN_SPEED,
  RAMP, BLACK_LEVEL, WHITE_LEVEL, GAMMA,
  EDGE_THRESHOLD, EDGE_MIN_LUM, EDGE_BG_MAX, ASCII_DEFAULT,
  LIGHT_KEY, LIGHT_FILL, LIGHT_AMB, DIFFUSE, SPECULAR, SHININESS,
  MODEL_CYCLE, MODEL_SIZE, COPYRIGHT_MODEL,
  SCROLL_SENSITIVITY, SCRUB_FOLLOW, SNAP_DELAY_MS, SCREEN_DWELL_MS, SETTLE_EPS,
  ANIM, easeInOutCubic, damp,
  TRACKS,
};
