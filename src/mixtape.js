import { MANIFESTO_FONT_SIZE, FONT_SIZE, TRACKS } from './config.js';

// Prefissa ogni percorso audio con il base path di Vite (in dev è "/",
// in build per GitHub Pages è "/copyright-mixtape/"). Così gli URL
// funzionano sia in locale che su Pages senza dover cambiare nulla.
const resolvedTracks = TRACKS.map(t => ({
  title: t.title,
  file:  import.meta.env.BASE_URL + t.file,
}));


const Mixtape = {
  tracks: resolvedTracks,
  activeTrackIndex: 0,
  audio: null,
  isPlaying: false,
  _onEndCallback: null,

  // Geometria calcolata per interazioni
  uiBounds: {
    tracks: [],   // { col, row, width, height, index } in unità di cella
    progress: null // { x, y, width, height }
  },

  preload() {
    this.audio = new Audio();
    if (this.tracks.length > 0) {
      this.audio.src = this.tracks[this.activeTrackIndex].file;
    }
    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      if (this._onEndCallback) this._onEndCallback();
    });
  },

  onEnd(cb) {
    this._onEndCallback = cb;
  },

  play() {
    if (this.audio) {
      this.audio.play();
      this.isPlaying = true;
    }
  },

  pause() {
    if (this.audio) {
      this.audio.pause();
      this.isPlaying = false;
    }
  },

  seek(frac) {
    if (this.audio && this.audio.duration) {
      this.audio.currentTime = frac * this.audio.duration;
    }
  },

  setTrack(index) {
    if (index >= 0 && index < this.tracks.length) {
      this.activeTrackIndex = index;
      this.audio.src = this.tracks[index].file;
      this.play();
    }
  },

  // Disegna la tracklist e aggiorna la geometria
  drawTracklist(app, alpha = 255) {
    this.uiBounds.tracks = [];
    
    push();
    textSize(MANIFESTO_FONT_SIZE);
    
    // We scale the hit boxes based on MANIFESTO_FONT_SIZE
    const cellH = MANIFESTO_FONT_SIZE;
    // Calcoliamo una larghezza approssimativa del carattere monospace per questo font size
    textFont('monospace');
    const cellW = textWidth('M'); 
    
    const rows = Math.floor(height / cellH);
    
    // --- 1. Tracklist (Sinistra) ---
    const startRow = Math.floor(rows / 2) - Math.floor((this.tracks.length * 2) / 2);
    const startCol = 4; // Margine sinistro fisso in celle

    noStroke();

    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i];
      // Mostra un indicatore per la traccia attiva
      const isActive = (i === this.activeTrackIndex);
      const prefix = isActive ? "> " : "  ";
      const line = `${prefix}${i + 1}. ${track.title}`;
      
      this.uiBounds.tracks.push({
        x: startCol * cellW,
        y: (startRow + i * 2) * cellH,
        width: textWidth(line),
        height: cellH,
        index: i
      });

      // La canzone attiva è grigia (opacità 50%), le altre sono nere
      if (isActive) {
        fill(26, 26, 26, alpha * 0.5);
      } else {
        fill(26, 26, 26, alpha);
      }

      text(line, startCol * cellW, (startRow + i * 2) * cellH);
    }

    // --- 2. Progress Bar (Sotto il logo a destra) ---
    textSize(FONT_SIZE);
    
    const pbCols = 54; // larghezza in caratteri (più fitta usando FONT_SIZE)
    const pbRow = Math.floor(app.rows / 2) + 24; // distanziato ulteriormente dal tasto play
    const centerRightX = width * 0.75;
    const startPbCol = Math.floor(centerRightX / app.cellW) - Math.floor(pbCols / 2);

    this.uiBounds.progress = {
      x: startPbCol * app.cellW,
      y: pbRow * app.cellH,
      width: pbCols * app.cellW,
      height: app.cellH * 4
    };

    let frac = 0;
    if (this.audio && this.audio.duration) {
      frac = this.audio.currentTime / this.audio.duration;
    }
    
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < pbCols; c++) {
        let char = '@';
        
        if (r === 0 || r === 3) {
          char = '-';
        } else {
          const thumbC = Math.floor(frac * (pbCols - 1));
          if (c === thumbC) {
            char = '|';
          }
        }
        
        text(char, (startPbCol + c) * app.cellW, (pbRow + r) * app.cellH);
      }
    }
    pop();
  },

  // Ritorna l'elemento cliccato ('track' o null)
  hitTest(mouseX, mouseY) {
    // Controlla la tracklist usando bounding box esatte (pixel-based)
    for (const t of this.uiBounds.tracks) {
      if (mouseX >= t.x && mouseX < t.x + t.width && 
          mouseY >= t.y && mouseY < t.y + t.height) {
        return { type: 'track', index: t.index };
      }
    }

    // Controlla la progress bar
    const p = this.uiBounds.progress;
    if (p && mouseX >= p.x && mouseX < p.x + p.width && 
        mouseY >= p.y && mouseY < p.y + p.height) {
      const frac = (mouseX - p.x) / p.width;
      return { type: 'progress', frac: Math.max(0, Math.min(1, frac)) };
    }

    return null;
  }
};

export { Mixtape };
