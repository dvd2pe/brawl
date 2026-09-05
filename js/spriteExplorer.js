// spriteExplorer.js — naviga le 130 sprite reali dell'atlante, preview + animazione, link all'editor pixel
const SpriteExplorer = {
  root: null, listEl: null, previewEl: null, infoEl: null,
  animTimer: null, animFrame: 0, currentPath: null, currentSheet: null, zoom: 3,

  init(root) {
    this.root = root;
    this.listEl = root.querySelector('#spriteTree');
    this.previewEl = root.querySelector('#spritePreview');
    this.infoEl = root.querySelector('#spriteInfo');
    root.querySelector('#spriteSearch').addEventListener('input', () => this.renderTree(this.root.querySelector('#spriteSearch').value));
    root.querySelector('#spriteZoom').addEventListener('change', e => { this.zoom = +e.target.value; this.renderPreview(); });
    root.querySelector('#editSpriteBtn').addEventListener('click', () => { if (this.currentPath) PixelEditor.open(this.currentPath); });
    root.querySelector('#downloadSpriteBtn').addEventListener('click', () => this.downloadCurrent());
    this.renderTree('');
  },

  renderTree(filter) {
    filter = (filter || '').toLowerCase();
    const groups = {};
    for (const tex of GameData.packer.json) {
      for (const path of Object.keys(tex.frames)) {
        if (filter && !path.toLowerCase().includes(filter)) continue;
        const parts = path.split('/');
        const folder = parts.slice(0, parts.length - 1).join('/');
        (groups[folder] = groups[folder] || []).push(path);
      }
    }
    const folders = Object.keys(groups).sort();
    let html = '';
    for (const folder of folders) {
      const short = folder.replace('media/graphics/game/', '');
      html += `<details ${filter ? 'open' : ''}><summary>${short} <span class="count">${groups[folder].length}</span></summary>`;
      for (const p of groups[folder].sort()) {
        const name = p.split('/').pop();
        html += `<div class="sprite-item" data-path="${p}">${name}</div>`;
      }
      html += '</details>';
    }
    this.listEl.innerHTML = html || '<p class="muted">Nessuna sprite</p>';
    this.listEl.querySelectorAll('.sprite-item').forEach(el => {
      el.addEventListener('click', () => {
        this.listEl.querySelectorAll('.sprite-item').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        this.select(el.dataset.path);
      });
    });
  },

  select(path) {
    this.stopAnim();
    this.currentPath = path;
    this.renderPreview();
  },

  renderPreview() {
    const path = this.currentPath;
    const cv = this.previewEl, ctx = cv.getContext('2d');
    if (!path) { cv.width = 300; cv.height = 200; ctx.fillStyle = '#111'; ctx.fillRect(0, 0, cv.width, cv.height); return; }
    const fd = GameData.frameFor(path);
    if (!fd) { this.infoEl.textContent = 'Non in atlante: ' + path; return; }
    // foglio animato? cerca w/h di qualche sheet con questo path
    const sheet = GameData.sheets.find(s => s.path === path && s.w > 0 && s.w < fd.frame.w);
    this.currentSheet = sheet || null;
    const fw = sheet ? sheet.w : fd.frame.w, fh = sheet ? sheet.h : fd.frame.h;
    const cols = Math.max(1, Math.floor(fd.frame.w / fw)), rows = Math.max(1, Math.floor(fd.frame.h / fh));
    const frames = cols * rows;
    const z = this.zoom;
    cv.width = cols * fw * z; cv.height = rows * fh * z;
    ctx.imageSmoothingEnabled = false;
    // scacchiera di fondo
    for (let y = 0; y < cv.height; y += 8 * z) for (let x = 0; x < cv.width; x += 8 * z) {
      ctx.fillStyle = ((x / (8 * z) + y / (8 * z)) % 2) ? '#2a2a35' : '#232330';
      ctx.fillRect(x, y, 8 * z, 8 * z);
    }
    for (let i = 0; i < frames; i++) {
      const sx = fd.frame.x + (i % cols) * fw, sy = fd.frame.y + Math.floor(i / cols) * fh;
      ctx.drawImage(GameData.canvases[fd.texIndex], sx, sy, fw, fh, (i % cols) * fw * z, Math.floor(i / cols) * fh * z, fw * z, fh * z);
    }
    // griglia frame
    ctx.strokeStyle = 'rgba(255,255,255,.15)';
    for (let c = 1; c < cols; c++) { ctx.beginPath(); ctx.moveTo(c * fw * z, 0); ctx.lineTo(c * fw * z, cv.height); ctx.stroke(); }
    for (let r = 1; r < rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * fh * z); ctx.lineTo(cv.width, r * fh * z); ctx.stroke(); }

    const anims = GameData.anims.filter(a => a.prop && GameData.sheets.find(s => s.cls === a.cls && s.prop === a.prop && s.path === path));
    this.infoEl.innerHTML =
      `<b>${path.split('/').pop()}</b><br>${path}<br>` +
      `texture: ${fd.texture} @ (${fd.frame.x}, ${fd.frame.y}) ${fd.frame.w}×${fd.frame.h}<br>` +
      (sheet ? `foglio animato: frame ${fw}×${fh}, ${frames} frame — classe: ${sheet.cls}${sheet.prop ? ' (' + sheet.prop + ')' : ''}<br>` : '') +
      (anims.length ? `animazioni: ${[...new Set(anims.map(a => a.name))].join(', ')} — direzioni: ${[...new Set(anims.map(a => a.dir))].join(', ')}` : '');

    // controlli play
    const playBar = this.root.querySelector('#spritePlayBar');
    if (sheet && frames > 1) {
      playBar.style.display = '';
      const seq = (anims.find(a => a.frames.length > 1) || { frames: Array.from({ length: frames }, (_, i) => i), fps: 6 });
      this.playFrames(fd, sheet, seq.frames, seq.fps || 6, cv.getContext('2d'), z, cols);
    } else playBar.style.display = 'none';
  },

  playFrames(fd, sheet, seq, fps, ctx, z, cols) {
    this.stopAnim();
    this.animFrame = 0;
    this.animTimer = setInterval(() => {
      const i = seq[this.animFrame % seq.length] % (cols * Math.max(1, Math.floor(fd.frame.h / sheet.h)));
      // ridisegna solo la fascia di anteprima: primo frame slot
      const fw = sheet.w, fh = sheet.h;
      ctx.fillStyle = '#232330'; ctx.fillRect(0, 0, fw * z, fh * z);
      ctx.imageSmoothingEnabled = false;
      const sx = fd.frame.x + (i % cols) * fw, sy = fd.frame.y + Math.floor(i / cols) * fh;
      ctx.drawImage(GameData.canvases[fd.texIndex], sx, sy, fw, fh, 0, 0, fw * z, fh * z);
      this.animFrame++;
    }, 1000 / fps);
  },

  stopAnim() { if (this.animTimer) { clearInterval(this.animTimer); this.animTimer = null; } },

  downloadCurrent() {
    if (!this.currentPath) return;
    const c = GameData.extractRegion(this.currentPath);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = this.currentPath.split('/').pop();
    a.click();
  }
};
window.SpriteExplorer = SpriteExplorer;
