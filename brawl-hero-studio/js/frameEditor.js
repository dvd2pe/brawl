// frameEditor.js — editor di frame a livello di singolo quadrante.
// Permette di scomporre uno spritesheet (es. slime-down 320x81 = 4 frame da 80x81)
// in una lista di frame individuali, selezionarli (anche multipli), sostituirli/aggiungerli/rimuoverli/riordinarli.
// Save: ricostruisce il sheet concatenando i frame e lo riscrive come sprite addition (o in-place se dimensioni uguali).
const FrameEditor = {
  overlay: null, stripEl: null, infoEl: null,
  spritePath: null,       // path logico della sprite nell'atlante (es. media/graphics/game/characters/slime/slime-down.png)
  frameW: 0, frameH: 0,   // dimensioni di un singolo frame
  frames: [],             // array di canvas (uno per frame)
  selected: new Set(),    // indici selezionati
  multi: true,

  init() {
    this.overlay = document.getElementById('frameOverlay');
    this.stripEl = document.getElementById('frameStrip');
    this.infoEl = document.getElementById('frameInfo');
    const $ = (id) => document.getElementById(id);
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on('frameClose', 'click', () => this.close());
    on('frameAddBtn', 'click', () => this.addEmptyFrame());
    on('frameAddFromFile', 'click', () => this.addFromFile());
    on('frameDuplicate', 'click', () => this.duplicateSelected());
    on('frameReplace', 'click', () => this.replaceSelectedFromFile());
    on('frameDelete', 'click', () => this.deleteSelected());
    on('frameMoveLeft', 'click', () => this.moveSelected(-1));
    on('frameMoveRight', 'click', () => this.moveSelected(1));
    on('frameApplyDims', 'click', () => this.applyDims());
    on('frameMulti', 'change', e => { this.multi = e.target.checked; if (!this.multi) { this.selected = new Set([...this.selected].slice(0, 1)); this.render(); } });
    on('frameEditPixel', 'click', () => this.editSelectedInPixelEditor());
    on('frameDownload', 'click', () => this.downloadSheet());
    on('frameSave', 'click', () => this.save());
    // file picker nascosto (per addFromFile e replaceSelectedFromFile)
    on('frameImportFile', 'change', e => this._handleFileImport(e.target.files[0], e.target.dataset.action, e.target.dataset.frameIndex));
  },

  open(spritePath) {
    const fd = GameData.frameFor(spritePath);
    if (!fd) { alert('Sprite non trovata: ' + spritePath); return; }
    this.spritePath = spritePath;
    // determina le dimensioni del frame: cerca AnimationSheet, oppure usa frameW/H manuale dello SpriteExplorer, oppure fd intero
    const sheet = GameData.sheets.find(s => s.path === spritePath && s.w > 0 && s.w < fd.frame.w);
    let fw, fh;
    if (sheet) { fw = sheet.w; fh = sheet.h; }
    else if (SpriteExplorer.manualFrameW > 0 && SpriteExplorer.manualFrameW < fd.frame.w) {
      fw = SpriteExplorer.manualFrameW;
      fh = SpriteExplorer.manualFrameH > 0 ? SpriteExplorer.manualFrameH : fw;
    } else { fw = fd.frame.w; fh = fd.frame.h; }
    this.frameW = fw;
    this.frameH = fh;
    // split: crea un canvas per ogni frame
    this.frames = [];
    const cols = Math.floor(fd.frame.w / fw);
    const rows = Math.floor(fd.frame.h / fh);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cnv = document.createElement('canvas');
        cnv.width = fw; cnv.height = fh;
        cnv.getContext('2d').drawImage(GameData.canvases[fd.texIndex],
          fd.frame.x + c * fw, fd.frame.y + r * fh, fw, fh,
          0, 0, fw, fh);
        this.frames.push(cnv);
      }
    }
    document.getElementById('frameTitle').textContent = 'Editor frame — ' + spritePath.split('/').pop();
    document.getElementById('framePath').textContent = spritePath + ' · ' + fw + '×' + fh + ' · ' + this.frames.length + ' frame';
    document.getElementById('frameFrameW').value = fw;
    document.getElementById('frameFrameH').value = fh;
    this.selected = new Set();
    this.overlay.classList.add('open');
    this.render();
  },

  close() { this.overlay.classList.remove('open'); },

  render() {
    const strip = this.stripEl;
    strip.innerHTML = '';
    this.frames.forEach((cnv, i) => {
      const cell = document.createElement('div');
      cell.className = 'frame-cell' + (this.selected.has(i) ? ' selected' : '');
      // thumbnail
      const thumbCv = document.createElement('canvas');
      thumbCv.className = 'frame-thumb';
      const max = 100;
      const scale = Math.min(max / cnv.width, max / cnv.height);
      thumbCv.width = cnv.width * scale;
      thumbCv.height = cnv.height * scale;
      const ctx = thumbCv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cnv, 0, 0, cnv.width, cnv.height, 0, 0, thumbCv.width, thumbCv.height);
      cell.appendChild(thumbCv);
      // label + checkbox
      const label = document.createElement('div');
      label.className = 'frame-num';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = this.selected.has(i);
      cb.addEventListener('change', () => this.toggleSelect(i));
      label.appendChild(cb);
      label.appendChild(document.createTextNode('#' + i));
      cell.appendChild(label);
      // click sulla cella = toggle selezione
      cell.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return; // checkbox già gestito
        this.toggleSelect(i);
      });
      strip.appendChild(cell);
    });
    // info
    this.infoEl.textContent = `${this.frames.length} frame · ${this.frameW}×${this.frameH}px · selezionati: ${this.selected.size}`;
  },

  toggleSelect(i) {
    if (this.multi) {
      if (this.selected.has(i)) this.selected.delete(i);
      else this.selected.add(i);
    } else {
      this.selected = this.selected.has(i) ? new Set() : new Set([i]);
    }
    this.render();
  },

  // ----------------------------------------------------------- azioni sui frame
  addEmptyFrame() {
    const cnv = document.createElement('canvas');
    cnv.width = this.frameW; cnv.height = this.frameH;
    // trasparente (vuoto)
    this.frames.push(cnv);
    this.selected = new Set([this.frames.length - 1]);
    this.render();
  },

  addFromFile() {
    // attiva il file picker nascosto con action='add'
    const fp = document.getElementById('frameImportFile');
    fp.dataset.action = 'add';
    fp.value = '';
    fp.click();
  },

  replaceSelectedFromFile() {
    if (!this.selected.size) { alert('Seleziona almeno un frame da sostituire'); return; }
    const fp = document.getElementById('frameImportFile');
    fp.dataset.action = 'replace';
    fp.value = '';
    fp.click();
  },

  _handleFileImport(file, action, _frameIndex) {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const cnv = document.createElement('canvas');
      cnv.width = this.frameW; cnv.height = this.frameH;
      const ctx = cnv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      // se l'immagine è più grande, scala mantenendo aspect ratio; se più piccola, centra
      const scale = Math.min(this.frameW / img.width, this.frameH / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, (this.frameW - dw) / 2, (this.frameH - dh) / 2, dw, dh);
      if (action === 'add') {
        this.frames.push(cnv);
        this.selected = new Set([this.frames.length - 1]);
      } else if (action === 'replace') {
        // sostituisci tutti i selezionati con lo stesso canvas
        [...this.selected].forEach(i => {
          const rctx = this.frames[i].getContext('2d');
          rctx.clearRect(0, 0, this.frameW, this.frameH);
          rctx.drawImage(cnv, 0, 0);
        });
      }
      this.render();
    };
    img.src = URL.createObjectURL(file);
  },

  duplicateSelected() {
    if (!this.selected.size) { alert('Seleziona almeno un frame da duplicare'); return; }
    const sorted = [...this.selected].sort((a, b) => a - b);
    // inserisce duplicati dopo l'ultimo selezionato (per evitare indici che cambiano)
    const last = sorted[sorted.length - 1];
    const dups = sorted.map(i => this._cloneCanvas(this.frames[i]));
    this.frames.splice(last + 1, 0, ...dups);
    // aggiorna selezione ai duplicati
    this.selected = new Set();
    for (let k = 0; k < dups.length; k++) this.selected.add(last + 1 + k);
    this.render();
  },

  deleteSelected() {
    if (!this.selected.size) { alert('Seleziona almeno un frame da rimuovere'); return; }
    const sorted = [...this.selected].sort((a, b) => b - a); // descending
    for (const i of sorted) this.frames.splice(i, 1);
    this.selected = new Set();
    this.render();
  },

  moveSelected(dir) {
    if (!this.selected.size) { alert('Seleziona almeno un frame da spostare'); return; }
    const sorted = [...this.selected].sort((a, b) => a - b);
    if (dir === -1) {
      // sposta a sinistra: dal primo in giù
      for (const i of sorted) {
        if (i === 0) continue;
        // scambia solo se il precedente non è già selezionato (evita sovrapposizioni)
        if (this.selected.has(i - 1)) continue;
        [this.frames[i], this.frames[i - 1]] = [this.frames[i - 1], this.frames[i]];
        this.selected.delete(i); this.selected.add(i - 1);
      }
    } else {
      // sposta a destra: dall'ultimo in giù
      const rev = sorted.reverse();
      for (const i of rev) {
        if (i === this.frames.length - 1) continue;
        if (this.selected.has(i + 1)) continue;
        [this.frames[i], this.frames[i + 1]] = [this.frames[i + 1], this.frames[i]];
        this.selected.delete(i); this.selected.add(i + 1);
      }
    }
    this.render();
  },

  applyDims() {
    const newW = +document.getElementById('frameFrameW').value || this.frameW;
    const newH = +document.getElementById('frameFrameH').value || this.frameH;
    if (newW === this.frameW && newH === this.frameH) return;
    // ridimensiona ogni frame (scala nearest-neighbor)
    this.frames = this.frames.map(cnv => {
      const ncnv = document.createElement('canvas');
      ncnv.width = newW; ncnv.height = newH;
      const ctx = ncnv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cnv, 0, 0, newW, newH);
      return ncnv;
    });
    this.frameW = newW; this.frameH = newH;
    this.render();
  },

  editSelectedInPixelEditor() {
    if (this.selected.size !== 1) { alert('Seleziona esattamente un frame per aprirlo nel pixel editor'); return; }
    const i = [...this.selected][0];
    const cnv = this.frames[i];
    PixelEditor.openCanvas(cnv, 'Frame #' + i + ' — ' + this.spritePath.split('/').pop(), cnv.width, 'frame-' + i);
    // hook sul save del pixel editor per tornare qui
    const origSave = PixelEditor.save.bind(PixelEditor);
    PixelEditor.save = () => {
      // aggiorna il frame con il canvas modificato
      this.frames[i] = PixelEditor.work;
      PixelEditor.close();
      PixelEditor.save = origSave;
      this.render();
    };
  },

  downloadSheet() {
    const sheet = this._buildSheet();
    const a = document.createElement('a');
    a.href = sheet.toDataURL('image/png');
    a.download = (this.spritePath.split('/').pop() || 'sheet') + '.png';
    a.click();
  },

  // ----------------------------------------------------------- save
  _buildSheet() {
    const sheet = document.createElement('canvas');
    sheet.width = this.frameW * this.frames.length;
    sheet.height = this.frameH;
    const ctx = sheet.getContext('2d');
    this.frames.forEach((cnv, i) => ctx.drawImage(cnv, i * this.frameW, 0));
    return sheet;
  },

  save() {
    const sheet = this._buildSheet();
    const fd = GameData.frameFor(this.spritePath);
    if (!fd) { alert('Sprite non più nell\'atlante'); return; }
    // se il sheet finale ha le stesse dimensioni dell'originale → writeRegion (in-place)
    // altrimenti → nuova sprite addition (repack)
    if (sheet.width === fd.frame.w && sheet.height === fd.frame.h) {
      try {
        GameData.writeRegion(this.spritePath, sheet);
        PlayStudio.storeTexturePatch(fd.texIndex);
        if (window.SpriteExplorer) SpriteExplorer.renderPreview();
        this.close();
        if (window.App) App.setStatus('✓ sheet salvato in-place: ' + this.spritePath.split('/').pop(), true);
      } catch (e) { alert(e.message); }
    } else {
      // dimensioni diverse → nuova sprite con repack
      const name = this.spritePath.split('/').pop().replace(/\.\w+$/, '') + '-edited';
      const newPath = PlayStudio.addNewSprite(name, sheet);
      PlayStudio.additionCanvases.set(newPath, sheet);
      GameData._additionCanvases[newPath] = sheet;
      PlayStudio.repackTexture2();
      this.close();
      if (window.App) {
        App.setStatus('✓ sheet salvato come nuova sprite: ' + newPath.split('/').pop() + ' (in texture-2)', true);
        App.refreshMySprites();
        // aggiorna albero sprite per mostrare la nuova sprite nella cartella custom/
        if (window.SpriteExplorer) SpriteExplorer.renderTree('');
      }
    }
  },

  // ----------------------------------------------------------- utility
  _cloneCanvas(cnv) {
    const n = document.createElement('canvas');
    n.width = cnv.width; n.height = cnv.height;
    n.getContext('2d').drawImage(cnv, 0, 0);
    return n;
  }
};
window.FrameEditor = FrameEditor;
