// spriteExplorer.js — naviga le 130 sprite reali dell'atlante, preview + animazione, link all'editor pixel
// Features:
// - albero per cartella + gruppi di effetti (es. drone-laser-* raggruppato)
// - preview con griglia frame
// - auto-detect AnimationSheet (animazioni reali del gioco)
// - frame size manuale (per sheet senza AnimationSheet, es. effects/explosion/bullet_hit)
// - play/pause animazione
// - visualizza sheet multipli come strip affiancata (es. drone-laser-start+middle+end)
const SpriteExplorer = {
  root: null, listEl: null, previewEl: null, infoEl: null,
  animTimer: null, animFrame: 0, currentPath: null, currentSheet: null, zoom: 3,
  // manuale frame dims (per sheet senza AnimationSheet)
  manualFrameW: 0, manualFrameH: 0,

  init(root) {
    this.root = root;
    this.listEl = root.querySelector('#spriteTree');
    this.previewEl = root.querySelector('#spritePreview');
    this.infoEl = root.querySelector('#spriteInfo');
    root.querySelector('#spriteSearch').addEventListener('input', () => this.renderTree(this.root.querySelector('#spriteSearch').value));
    root.querySelector('#spriteZoom').addEventListener('change', e => { this.zoom = +e.target.value; this.renderPreview(); });
    root.querySelector('#editSpriteBtn').addEventListener('click', () => { if (this.currentPath) PixelEditor.open(this.currentPath); });
    const editFramesBtn = root.querySelector('#editFramesBtn');
    if (editFramesBtn) editFramesBtn.addEventListener('click', () => { if (this.currentPath) FrameEditor.open(this.currentPath); });
    root.querySelector('#downloadSpriteBtn').addEventListener('click', () => this.downloadCurrent());
    // controlli animazione manuale
    const fwInput = root.querySelector('#spriteFrameW');
    const fhInput = root.querySelector('#spriteFrameH');
    const playBtn = root.querySelector('#spritePlayBtn');
    const stopBtn = root.querySelector('#spriteStopBtn');
    if (fwInput) fwInput.addEventListener('change', e => { this.manualFrameW = +e.target.value || 0; this.renderPreview(); });
    if (fhInput) fhInput.addEventListener('change', e => { this.manualFrameH = +e.target.value || 0; this.renderPreview(); });
    if (playBtn) playBtn.addEventListener('click', () => this.togglePlay());
    if (stopBtn) stopBtn.addEventListener('click', () => this.stopAnim());
    this.renderTree('');
  },

  // classifica il tipo di gruppo per icona + descrizione
  groupKind(gname, gpaths) {
    const names = gpaths.map(p => p.split('/').pop().toLowerCase());
    // autotiling: contiene tile-water-* o tile-ditch-* con pezzi 20x20 + 60x60
    if (/^tile-(water|ditch)/.test(gname)) return 'autotile';
    // effetti: laser/healing/level-up/etc — sprite con suffissi tipo start/middle/end/beam/halo/light/particle
    if (names.some(n => /-(start|middle|end|beam|halo|light|particle|spore|explosion)/.test(n))) return 'effect';
    // animazioni: qualsiasi gruppo con direzione/stato (down/up/walk/idle/attack/etc)
    if (names.some(n => /-(down|up|left|right|walk|idle|attack|atk|throw|hurt)/.test(n))) return 'anim';
    return 'group';
  },

  // rileva gruppi di sprite che nel gioco vengono assemblate a runtime o usate come set correlato.
  // Riconosce:
  // - autotiling (tile-water-*, tile-ditch-*: full/covered/top/topShadow/side/topCorner/topCornerShadow/bottomCorner/cliffTop/cliffBottom/cliffBottomShadow)
  // - effetti runtime (drone-laser-start/middle/end/particle, healing-beam/particle/light/halo, level-up-*)
  // - animazioni personaggi per direzione/stato (*-down-walk, *-up-atk, *-idle, *-attack, *-throw, ecc.)
  detectGroups(paths) {
    const groups = {}; // key: prefix → array di path
    // lista suffissi, ordinati dal più lungo al più corto (per priorità match)
    const suffixes = [
      'top-corner-shadow', 'top-corner',
      'cliff-bottom-shadow', 'cliff-bottom',
      'bottom-corner',
      'top-center',
      'cliff-top',
      'top-shadow',
      'down-walk', 'up-walk', 'down-atk', 'up-atk',
      'down-attack', 'up-attack', 'down-idle', 'up-idle',
      'down-hurt', 'up-hurt', 'down-throw', 'up-throw',
      'down-side', 'up-side',
      'particle', 'explosion', 'spore',
      'start', 'middle', 'end',
      'beam', 'halo', 'light',
      'attack', 'atk', 'idle', 'walk', 'throw', 'hurt',
      'covered', 'full', 'side',
      'top', 'down', 'up', 'left', 'right'
    ];
    // suffissi che NON devono essere matchati se rimuovendoli lasciano un radical
    // che finisce con un'altra parola chiave (per evitare 'level' + '-up' che nasconde 'level-up')
    const protectedSuffixes = ['up', 'down', 'left', 'right'];
    const suffixPattern = suffixes.join('|');
    const re = new RegExp('^(.+?)-(' + suffixPattern + ')(?:[-_.]|$)');
    for (const p of paths) {
      const name = p.split('/').pop();
      const baseName = name.replace(/\.\w+$/, '');
      const m = baseName.match(re);
      if (m) {
        const radical = m[1];
        const suffix = m[2];
        // protezione: se il suffisso è up/down/left/right (singola direzione),
        // controlla se il radical + '-' + suffix è prefisso di un nome "composto" notissimo
        // (es. 'level-up-beam' dovrebbe avere radical 'level-up', non 'level')
        // euristica: se il radical contiene già un separatore che potrebbe essere -up/-down/etc,
        // mantieni il suffisso nel radical
        if (protectedSuffixes.includes(suffix)) {
          // controlla se rimuovendo solo questo suffisso, il radical risulta incompleto:
          // es. 'level-up-beam' → primo match: radical='level', suffix='up', resto='beam'
          // se il resto inizia con un'altra parola chiave (beam/halo/light/etc), ricostruisci radical completo
          const nextPart = baseName.slice(radical.length + 1 + suffix.length + 1);
          if (nextPart && suffixes.includes(nextPart.split(/[-_.]/)[0])) {
            // ricostruisci: radical = radical + '-' + suffix, suffix = nextPart
            const newRadical = radical + '-' + suffix;
            const newSuffix = nextPart.split(/[-_.]/)[0];
            const key = p.split('/').slice(0, -1).join('/') + '/' + newRadical;
            (groups[key] = groups[key] || []).push(p);
            continue;
          }
        }
        const key = p.split('/').slice(0, -1).join('/') + '/' + radical;
        (groups[key] = groups[key] || []).push(p);
      }
    }
    // tieni solo gruppi con 2+ elementi
    return Object.fromEntries(Object.entries(groups).filter(([_, arr]) => arr.length >= 2));
  },

  renderTree(filter) {
    filter = (filter || '').toLowerCase();
    const groups = {};
    // raccogli sprite originali
    for (const tex of GameData.packer.json) {
      for (const path of Object.keys(tex.frames)) {
        if (filter && !path.toLowerCase().includes(filter)) continue;
        const parts = path.split('/');
        const folder = parts.slice(0, parts.length - 1).join('/');
        (groups[folder] = groups[folder] || []).push(path);
      }
    }
    // raccogli sprite custom dalle patch
    const customs = [];
    try {
      const p = JSON.parse(localStorage.getItem('bhs_patches') || '{}');
      (p.additions || []).forEach(a => {
        if (filter && !a.path.toLowerCase().includes(filter)) return;
        customs.push(a.path);
        const parts = a.path.split('/');
        const folder = parts.slice(0, parts.length - 1).join('/');
        (groups[folder] = groups[folder] || []).push(a.path);
      });
    } catch (e) {}
    const folders = Object.keys(groups).sort();
    let html = '';
    for (const folder of folders) {
      const short = folder.replace('media/graphics/game/', '');
      // raggruppa sprite con prefisso comune dentro la cartella
      const spriteGroups = this.detectGroups(groups[folder]);
      const grouped = new Set();
      Object.values(spriteGroups).forEach(arr => arr.forEach(p => grouped.add(p)));
      const isCustomFolder = folder.includes('/custom');

      html += `<details ${filter ? 'open' : ''}><summary>${short} <span class="count">${groups[folder].length}</span>${isCustomFolder ? ' <span class="custom-tag">★ mie</span>' : ''}</summary>`;

      // prima i gruppi
      for (const [gkey, gpaths] of Object.entries(spriteGroups).sort()) {
        const gname = gkey.split('/').pop();
        // scegli icona + descrizione in base al tipo di gruppo
        const kind = this.groupKind(gname, gpaths);
        const icon = kind === 'autotile' ? '🧩' : kind === 'effect' ? '✨' : kind === 'anim' ? '🎬' : '⚙';
        const tag = kind === 'autotile' ? 'autotiling' : kind === 'effect' ? 'effetto runtime' : kind === 'anim' ? 'animazione' : 'gruppo';
        html += `<div class="sprite-item sprite-group" data-group="${gkey}" title="${tag}: ${gpaths.length} sprite — ${gpaths.map(p => p.split('/').pop().replace('.png','')).join(', ')}"><span class="group-tag">${icon}</span> ${gname} <span class="group-kind">${tag}</span> <span class="count">${gpaths.length}</span></div>`;
      }
      // poi le sprite non raggruppate
      for (const p of groups[folder].sort()) {
        if (grouped.has(p)) continue;
        const name = p.split('/').pop();
        const isCustom = customs.includes(p);
        html += `<div class="sprite-item${isCustom ? ' sprite-custom' : ''}" data-path="${p}" title="${isCustom ? 'sprite salvata da te (in localStorage)' : ''}">${isCustom ? '<span class="custom-tag">★</span> ' : ''}${name}</div>`;
      }
      html += '</details>';
    }
    this.listEl.innerHTML = html || '<p class="muted">Nessuna sprite</p>';
    this.listEl.querySelectorAll('.sprite-item').forEach(el => {
      el.addEventListener('click', () => {
        this.listEl.querySelectorAll('.sprite-item').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        if (el.dataset.group) this.selectGroup(el.dataset.group);
        else this.select(el.dataset.path);
      });
    });
  },

  async select(path) {
    this.stopAnim();
    this.currentPath = path;
    this.currentGroup = null;
    // se è custom: precarica il canvas
    try {
      const customs = JSON.parse(localStorage.getItem('bhs_patches') || '{}').additions || [];
      if (customs.find(a => a.path === path)) {
        await GameData._loadAdditionCanvas(path);
      }
    } catch (e) {}
    this.renderPreview();
  },

  selectGroup(groupKey) {
    this.stopAnim();
    this.currentGroup = groupKey;
    this.currentPath = null;
    this.renderGroupPreview();
  },

  // per sheet multipli: renderizza tutti affiancati in un'unica strip
  renderGroupPreview() {
    const key = this.currentGroup;
    if (!key) return;
    const cv = this.previewEl, ctx = cv.getContext('2d');
    // raccogli le sprite del gruppo
    const paths = [];
    for (const tex of GameData.packer.json) {
      for (const p of Object.keys(tex.frames)) {
        if (p.startsWith(key + '-') || p.startsWith(key + '_')) paths.push(p);
      }
    }
    paths.sort();
    if (!paths.length) { this.infoEl.textContent = 'Gruppo vuoto: ' + key; return; }
    // dimensiona canvas per strip orizzontale
    const fds = paths.map(p => GameData.frameFor(p)).filter(Boolean);
    const totalW = fds.reduce((a, fd) => a + fd.frame.w, 0);
    const maxH = Math.max(...fds.map(fd => fd.frame.h));
    const z = this.zoom;
    cv.width = totalW * z; cv.height = maxH * z;
    ctx.imageSmoothingEnabled = false;
    // scacchiera
    for (let y = 0; y < cv.height; y += 8 * z) for (let x = 0; x < cv.width; x += 8 * z) {
      ctx.fillStyle = ((x / (8 * z) + y / (8 * z)) % 2) ? '#2a2a35' : '#232330';
      ctx.fillRect(x, y, 8 * z, 8 * z);
    }
    // draw strip
    let dx = 0;
    for (const fd of fds) {
      ctx.drawImage(GameData.canvases[fd.texIndex], fd.frame.x, fd.frame.y, fd.frame.w, fd.frame.h, dx * z, 0, fd.frame.w * z, fd.frame.h * z);
      dx += fd.frame.w;
    }
    // separatori
    ctx.strokeStyle = 'rgba(255,255,255,.3)';
    let acc = 0;
    for (const fd of fds.slice(0, -1)) {
      acc += fd.frame.w;
      ctx.beginPath(); ctx.moveTo(acc * z, 0); ctx.lineTo(acc * z, cv.height); ctx.stroke();
    }
    this.infoEl.innerHTML =
      `<b>Gruppo: ${key.split('/').pop()}</b><br>${paths.length} sprite: ${paths.map(p => p.split('/').pop()).join(', ')}<br>` +
      `usato come: strip concatenata a runtime (es. laser start+middle*N+end, esplosione, ecc.)<br>` +
      `totale: ${totalW}×${maxH} (a zoom 1×)`;
  },

  renderPreview() {
    if (this.currentGroup) return this.renderGroupPreview();
    const path = this.currentPath;
    const cv = this.previewEl, ctx = cv.getContext('2d');
    if (!path) { cv.width = 300; cv.height = 200; ctx.fillStyle = '#111'; ctx.fillRect(0, 0, cv.width, cv.height); return; }
    const fd = GameData.frameFor(path);
    if (!fd) { this.infoEl.textContent = 'Non in atlante: ' + path; return; }
    // ferma animazione precedente
    this.stopAnim();
    // foglio animato? cerca w/h di qualche sheet con questo path
    const sheet = GameData.sheets.find(s => s.path === path && s.w > 0 && s.w < fd.frame.w);
    this.currentSheet = sheet || null;
    // manual override: se l'utente ha inserito frameW, usalo
    const useManual = this.manualFrameW > 0 && this.manualFrameW < fd.frame.w;
    const fw = useManual ? this.manualFrameW : (sheet ? sheet.w : fd.frame.w);
    const fh = useManual ? (this.manualFrameH > 0 ? this.manualFrameH : fw) : (sheet ? sheet.h : fd.frame.h);
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
    // === FIX: per le sprite custom usa il canvas cached (standalone), non l'atlante originale
    const isCustom = !!GameData._additionCanvases[path];
    const srcCanvas = isCustom ? GameData._additionCanvases[path] : GameData.canvases[fd.texIndex];
    const frameOriginX = isCustom ? 0 : fd.frame.x;
    const frameOriginY = isCustom ? 0 : fd.frame.y;
    // disegna tutti i frame come griglia
    for (let i = 0; i < frames; i++) {
      const sx = frameOriginX + (i % cols) * fw, sy = frameOriginY + Math.floor(i / cols) * fh;
      ctx.drawImage(srcCanvas, sx, sy, fw, fh, (i % cols) * fw * z, Math.floor(i / cols) * fh * z, fw * z, fh * z);
    }
    // griglia frame
    ctx.strokeStyle = 'rgba(255,255,255,.15)';
    for (let c = 1; c < cols; c++) { ctx.beginPath(); ctx.moveTo(c * fw * z, 0); ctx.lineTo(c * fw * z, cv.height); ctx.stroke(); }
    for (let r = 1; r < rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * fh * z); ctx.lineTo(cv.width, r * fh * z); ctx.stroke(); }

    const anims = GameData.anims.filter(a => a.prop && GameData.sheets.find(s => s.cls === a.cls && s.prop === a.prop && s.path === path));
    this.infoEl.innerHTML =
      `<b>${path.split('/').pop()}</b><br>${path}<br>` +
      `texture: ${fd.texture} @ (${fd.frame.x}, ${fd.frame.y}) ${fd.frame.w}×${fd.frame.h}${isCustom ? ' <span style="color:#55c97a">★ custom</span>' : ''}<br>` +
      (sheet ? `foglio animato: frame ${fw}×${fh}, ${frames} frame — classe: ${sheet.cls}${sheet.prop ? ' (' + sheet.prop + ')' : ''}<br>` : '') +
      (useManual ? `<b>frame size manuale: ${fw}×${fh}, ${frames} frame</b><br>` : '') +
      (!sheet && !useManual && fd.frame.w > 100 ? `<span class="muted">Sembra uno sheet (larghezza ${fd.frame.w}px). Imposta "Frame W" per vederlo come animazione.</span><br>` : '') +
      (anims.length ? `animazioni: ${[...new Set(anims.map(a => a.name))].join(', ')} — direzioni: ${[...new Set(anims.map(a => a.dir))].join(', ')}` : '');

    // AUTOPLAY: se è un sheet con più frame, anima automaticamente nel primo slot
    const playBar = this.root.querySelector('#spritePlayBar');
    const playBtn = this.root.querySelector('#spritePlayBtn');
    if ((sheet || useManual) && frames > 1) {
      if (playBar) playBar.style.display = '';
      // autoplay: usa l'animazione reale del gioco se esiste, altrimenti 0..frames-1
      const seq = (anims.find(a => a.frames.length > 1) || { frames: Array.from({ length: frames }, (_, i) => i), fps: 6 });
      this.playFrames(fd, { w: fw, h: fh }, seq.frames, seq.fps || 6, this.previewEl.getContext('2d'), z, cols, path);
      this.isPlaying = true;
      if (playBtn) playBtn.textContent = '⏸ Stop';
    } else {
      if (playBar) playBar.style.display = 'none';
      this.isPlaying = false;
      if (playBtn) playBtn.textContent = '▶ Animazione';
    }
  },

  // bottone "Animazione" → play/stop esplicito (toggle dello stato di animazione)
  togglePlay() {
    const path = this.currentPath;
    if (!path) return; // nessuna sprite selezionata: non fare niente (la sprite è già selezionata dall'utente)
    const fd = GameData.frameFor(path);
    if (!fd) return;
    const sheet = GameData.sheets.find(s => s.path === path && s.w > 0 && s.w < fd.frame.w);
    const useManual = this.manualFrameW > 0 && this.manualFrameW < fd.frame.w;
    const fw = useManual ? this.manualFrameW : (sheet ? sheet.w : fd.frame.w);
    const fh = useManual ? (this.manualFrameH > 0 ? this.manualFrameH : fw) : (sheet ? sheet.h : fd.frame.h);
    const cols = Math.max(1, Math.floor(fd.frame.w / fw));
    const rows = Math.max(1, Math.floor(fd.frame.h / fh));
    const frames = cols * rows;

    if (this.animTimer) {
      // stop: ridisegna lo sheet completo statico
      this.stopAnim();
      this.isPlaying = false;
      const playBtn = this.root.querySelector('#spritePlayBtn');
      if (playBtn) playBtn.textContent = '▶ Animazione';
      // ridisegna lo sheet statico
      this.renderPreview();
      // renderPreview riavvia autoplay: dobbiamo stopparlo di nuovo perché l'utente vuole stop
      this.stopAnim();
      this.isPlaying = false;
      if (playBtn) playBtn.textContent = '▶ Animazione';
      return;
    }
    // play: se c'è solo 1 frame, non c'è niente da animare
    if (frames <= 1) {
      alert('Questa sprite ha un solo frame — niente da animare.\nSe è uno sheet con più frame, imposta "Frame W" e poi click Animazione.');
      return;
    }
    // scegli sequenza: usa l'animazione reale del gioco se esiste, altrimenti 0..frames-1
    const anims = GameData.anims.filter(a => a.prop && GameData.sheets.find(s => s.cls === a.cls && s.prop === a.prop && s.path === path));
    const seq = (anims.find(a => a.frames.length > 1) || { frames: Array.from({ length: frames }, (_, i) => i), fps: 6 });
    const z = this.zoom;
    this.playFrames(fd, { w: fw, h: fh }, seq.frames, seq.fps || 6, this.previewEl.getContext('2d'), z, cols, path);
    this.isPlaying = true;
    const playBtn = this.root.querySelector('#spritePlayBtn');
    if (playBtn) playBtn.textContent = '⏸ Stop';
    if (this.root.querySelector('#spritePlayBar')) this.root.querySelector('#spritePlayBar').style.display = '';
  },

  playFrames(fd, sheet, seq, fps, ctx, z, cols, path) {
    this.stopAnim();
    this.animFrame = 0;
    // === FIX: per le sprite custom usa il canvas cached
    const isCustom = path && !!GameData._additionCanvases[path];
    const srcCanvas = isCustom ? GameData._additionCanvases[path] : GameData.canvases[fd.texIndex];
    const frameOriginX = isCustom ? 0 : fd.frame.x;
    const frameOriginY = isCustom ? 0 : fd.frame.y;
    const cv = this.previewEl;
    this.animTimer = setInterval(() => {
      const totalFrames = cols * Math.max(1, Math.floor(fd.frame.h / sheet.h));
      const i = seq[this.animFrame % seq.length] % totalFrames;
      // ridisegna solo il primo slot frame (animazione singola)
      const fw = sheet.w, fh = sheet.h;
      // cancella tutto il canvas e ridisegna solo il frame animato nel primo slot
      ctx.fillStyle = '#232330'; ctx.fillRect(0, 0, cv.width, cv.height);
      // ridisegna scacchiera solo nel primo slot
      for (let y = 0; y < fh * z; y += 8 * z) for (let x = 0; x < fw * z; x += 8 * z) {
        ctx.fillStyle = ((x / (8 * z) + y / (8 * z)) % 2) ? '#2a2a35' : '#232330';
        ctx.fillRect(x, y, 8 * z, 8 * z);
      }
      ctx.imageSmoothingEnabled = false;
      const sx = frameOriginX + (i % cols) * fw, sy = frameOriginY + Math.floor(i / cols) * fh;
      ctx.drawImage(srcCanvas, sx, sy, fw, fh, 0, 0, fw * z, fh * z);
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
