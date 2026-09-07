// pixelEditor.js — modifica i pixel di una sprite reale (regione dell'atlante) con griglia e strumenti
const PixelEditor = {
  overlay: null, canvas: null, ctx: null, work: null,
  path: null, fd: null, zoom: 8, tool: 'pencil', color: '#ff0044',
  grid: true, frameW: 0, undoStack: [], painting: false,

  init() {
    this.overlay = document.getElementById('pixelOverlay');
    this.canvas = document.getElementById('pixelCanvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    document.getElementById('pixelClose').addEventListener('click', () => this.close());
    document.getElementById('pixelSave').addEventListener('click', () => this.save());
    document.getElementById('pixelDownload').addEventListener('click', () => {
      const a = document.createElement('a'); a.href = this.work.toDataURL('image/png');
      a.download = (this.path || 'sprite').split('/').pop(); a.click();
    });
    document.getElementById('pixelUndo').addEventListener('click', () => this.undo());
    document.getElementById('pixelGrid').addEventListener('change', e => { this.grid = e.target.checked; this.render(); });
    document.getElementById('pixelZoom').addEventListener('change', e => { this.zoom = +e.target.value; this.fit(); });
    document.getElementById('pixelColor').addEventListener('input', e => { this.color = e.target.value; });
    document.getElementById('pixelImport').addEventListener('change', e => this.importPNG(e.target.files[0]));
    document.querySelectorAll('#pixelOverlay .tool-btn').forEach(b =>
      b.addEventListener('click', () => {
        document.querySelectorAll('#pixelOverlay .tool-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active'); this.tool = b.dataset.tool;
      }));
    this.canvas.addEventListener('pointerdown', e => { this.pushUndo(); this.painting = true; this.paint(e); });
    this.canvas.addEventListener('pointermove', e => { this.moveGhost(e); if (this.painting) this.paint(e); });
    window.addEventListener('pointerup', () => { this.painting = false; this.renderPalette(); });
    window.addEventListener('keydown', e => { if (!this.overlay.classList.contains('open')) return; if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undo(); } });
  },

  open(path) {
    const region = GameData.extractRegion(path);
    if (!region) { alert('Sprite non trovata: ' + path); return; }
    this.path = path;
    this.mode = 'atlas';
    this.fd = GameData.frameFor(path);
    this.work = document.createElement('canvas');
    this.work.width = region.width; this.work.height = region.height;
    this.work.getContext('2d').drawImage(region, 0, 0);
    const sheet = GameData.sheets.find(s => s.path === path && s.w > 0 && s.w < region.width);
    this.frameW = sheet ? sheet.w : 0;
    document.getElementById('pixelTitle').textContent = 'Editor pixel — ' + path.split('/').pop();
    document.getElementById('pixelPath').textContent = path + '  (' + this.fd.texture + ' @ ' + this.fd.frame.x + ',' + this.fd.frame.y + ')';
    this.overlay.classList.add('open');
    this.undoStack = [];
    this.fit();
    this.renderPalette();
  },

  // apertura di un canvas arbitrario (creazione nuove sprite): il salvataggio passa dal repack
  openCanvas(canvas, title, frameW, newName) {
    this.path = null;
    this.newName = newName || 'creazione';
    this.mode = 'new';
    this.fd = null;
    this.work = document.createElement('canvas');
    this.work.width = canvas.width; this.work.height = canvas.height;
    this.work.getContext('2d').drawImage(canvas, 0, 0);
    this.frameW = frameW || 0;
    document.getElementById('pixelTitle').textContent = title;
    document.getElementById('pixelPath').textContent = this.work.width + '×' + this.work.height + ' (frame ' + (this.frameW || this.work.width) + '×' + this.work.height + ')';
    this.overlay.classList.add('open');
    this.undoStack = [];
    this.fit();
    this.renderPalette();
  },

  close() { this.overlay.classList.remove('open'); },

  fit() {
    this.canvas.width = this.work.width * this.zoom;
    this.canvas.height = this.work.height * this.zoom;
    this.render();
  },

  render() {
    const ctx = this.ctx, z = this.zoom, w = this.work.width, h = this.work.height;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      ctx.fillStyle = ((x + y) % 2) ? '#3a3a48' : '#30303c';
      ctx.fillRect(x * z, y * z, z, z);
    }
    ctx.drawImage(this.work, 0, 0, w * z, h * z);
    if (this.grid && z >= 4) {
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.lineWidth = 1;
      for (let x = 1; x < w; x++) { ctx.beginPath(); ctx.moveTo(x * z + .5, 0); ctx.lineTo(x * z + .5, h * z); ctx.stroke(); }
      for (let y = 1; y < h; y++) { ctx.beginPath(); ctx.moveTo(0, y * z + .5); ctx.lineTo(w * z, y * z + .5); ctx.stroke(); }
    }
    if (this.frameW) { // separatori frame animazione
      ctx.strokeStyle = 'rgba(80,200,255,.55)'; ctx.lineWidth = 2;
      for (let x = this.frameW; x < w; x += this.frameW) { ctx.beginPath(); ctx.moveTo(x * z, 0); ctx.lineTo(x * z, h * z); ctx.stroke(); }
    }
  },

  cellOf(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / (r.width / this.work.width));
    const y = Math.floor((e.clientY - r.top) / (r.height / this.work.height));
    if (x < 0 || y < 0 || x >= this.work.width || y >= this.work.height) return null;
    return { x, y };
  },

  pushUndo() {
    this.undoStack.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
    if (this.undoStack.length > 40) this.undoStack.shift();
  },

  undo() {
    const s = this.undoStack.pop();
    if (s) { this.ctx.putImageData(s, 0, 0); this.flushToWork(); }
  },

  paint(e) {
    const c = this.cellOf(e);
    if (!c) return;
    const ctx = this.ctx, z = this.zoom;
    if (this.tool === 'pencil') {
      ctx.fillStyle = this.color; ctx.fillRect(c.x * z, c.y * z, z, z);
      this.flushToWork();
    } else if (this.tool === 'eraser') {
      ctx.clearRect(c.x * z, c.y * z, z, z);
      this.flushToWork();
    } else if (this.tool === 'picker') {
      const d = this.work.getContext('2d').getImageData(c.x, c.y, 1, 1).data;
      if (d[3] > 0) { this.color = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''); document.getElementById('pixelColor').value = this.color; }
    } else if (this.tool === 'bucket') {
      this.floodFill(c.x, c.y);
      this.flushToWork();
    }
  },

  moveGhost(e) {
    const c = this.cellOf(e);
    document.getElementById('pixelPos').textContent = c ? `x:${c.x} y:${c.y}` : '';
  },

  flushToWork() {
    // scala giù il canvas zoomato sul canvas di lavoro 1:1
    const wctx = this.work.getContext('2d');
    wctx.clearRect(0, 0, this.work.width, this.work.height);
    wctx.drawImage(this.canvas, 0, 0, this.work.width, this.work.height);
  },

  floodFill(sx, sy) {
    const w = this.work.width, h = this.work.height;
    const img = this.work.getContext('2d').getImageData(0, 0, w, h);
    const d = img.data;
    const idx = (x, y) => (y * w + x) * 4;
    const start = idx(sx, sy);
    const target = [d[start], d[start + 1], d[start + 2], d[start + 3]];
    const hex = this.color;
    const fill = [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16), 255];
    if (target.every((v, i) => v === fill[i])) return;
    const stack = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = idx(x, y);
      if (d[i] !== target[0] || d[i + 1] !== target[1] || d[i + 2] !== target[2] || d[i + 3] !== target[3]) continue;
      d[i] = fill[0]; d[i + 1] = fill[1]; d[i + 2] = fill[2]; d[i + 3] = fill[3];
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    this.work.getContext('2d').putImageData(img, 0, 0);
    this.fit();
  },

  importPNG(file) {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const wctx = this.work.getContext('2d');
      // adatta 1:1 dall'alto a sinistra; se più grande, scala per entrare
      const scale = Math.min(1, this.work.width / img.width, this.work.height / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      wctx.clearRect(0, 0, this.work.width, this.work.height);
      wctx.drawImage(img, (this.work.width - dw) / 2, (this.work.height - dh) / 2, dw, dh);
      this.fit();
    };
    img.src = URL.createObjectURL(file);
  },

  renderPalette() {
    const pal = document.getElementById('pixelPalette');
    if (!pal || !this.work) return;
    const img = this.work.getContext('2d').getImageData(0, 0, this.work.width, this.work.height).data;
    const colors = new Map();
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] < 128) continue;
      const key = (img[i] << 16) | (img[i + 1] << 8) | img[i + 2];
      colors.set(key, (colors.get(key) || 0) + 1);
    }
    const top = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);
    pal.innerHTML = top.map(([c]) =>
      `<button class="pal-swatch" style="background:#${c.toString(16).padStart(6, '0')}" data-c="#${c.toString(16).padStart(6, '0')}"></button>`).join('');
    pal.querySelectorAll('.pal-swatch').forEach(b => b.addEventListener('click', () => {
      this.color = b.dataset.c; document.getElementById('pixelColor').value = this.color;
    }));
  },

  save() {
    try {
      if (this.mode === 'new') {
        const path = PlayStudio.addNewSprite(this.newName, this.work);
        alert('Sprite aggiunta all\'atlante: ' + path + '\nOra la trovi in «Skin entità» o nell\'Explorer.');
      } else {
        GameData.writeRegion(this.path, this.work);
        // patch immediata nel play (stessa dimensione: rimpiazzo in place della texture)
        PlayStudio.storeTexturePatch(this.fd.texIndex);
        SpriteExplorer.renderPreview();
      }
      this.close();
      PlayStudio.refreshStatus();
    } catch (e) { alert(e.message); }
  }
};
window.PixelEditor = PixelEditor;
