// main.js — shell dello Studio: boot asset reali, tab, collegamenti fra moduli
let _lastAIRef = null;
const App = {
  statusEl: null,

  $(id) { return document.getElementById(id); },

  setStatus(msg, ok) {
    if (!this.statusEl) this.statusEl = this.$('bootStatus');
    if (!this.statusEl) return;
    this.statusEl.textContent = msg;
    this.statusEl.className = 'header-status ' + (ok ? 'ok' : '');
  },

  async boot() {
    this.statusEl = this.$('bootStatus');
    PixelEditor.init();
    FrameEditor.init();
    MapEditor.init();
    this.bindNav();
    const btnPV = this.$('btnPlayVanilla');
    if (btnPV) btnPV.addEventListener('click', () => PlayStudio.playVanilla());
    try {
      await GameData.load(m => this.setStatus(m));
      this.setStatus(`✓ ${GameData.packer.json.reduce((a, j) => a + Object.keys(j.frames).length, 0)} sprite · ${GameData.maps.length} mappe`, true);
    } catch (e) {
      console.error(e);
      this.setStatus('✗ ' + e.message);
      const ov = this.$('setupOverlay');
      if (ov) ov.classList.remove('hidden');
      return;
    }

    SpriteExplorer.init(document.getElementById('tab-sprite'));
    this.initMapTab();
    this.initAssetsTab();
    this.populateToolThumbnails();
    PlayStudio.refreshStatus();

    // Fill map load select (68 maps)
    const loadSel = this.$('mapLoadSelect');
    if (loadSel) {
      GameData.maps.slice().sort((a, b) => a.id.localeCompare(b.id)).forEach(m => {
        const o = document.createElement('option'); o.value = m.id; o.textContent = m.id;
        loadSel.appendChild(o);
      });
    }

    // Fill play map select
    const playSel = this.$('playMapSelect');
    if (playSel) {
      const groups = [['tutorial', 'Tutorial'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['boss', 'Boss']];
      groups.forEach(([key, label]) => {
        const bucket = GameData.mapBuckets[key] || [];
        if (!bucket.length) return;
        const og = document.createElement('optgroup'); og.label = label;
        bucket.forEach(m => {
          const o = document.createElement('option');
          o.value = m.id; o.textContent = m.id + (this.customIds().includes(m.id) ? ' ★' : '');
          og.appendChild(o);
        });
        playSel.appendChild(og);
      });
    }

    // Default: tutorial-1
    const t = GameData.maps.find(m => m.id === 'tutorial-1') || GameData.maps[0];
    if (t) MapEditor.loadMap(GameData.cloneMap(t));
    MapEditor.setTool('wall');
    MapEditor.fillProjectSelect();
  },

  customIds() {
    try { return JSON.parse(localStorage.getItem('bhs_project_maps') || '[]').map(m => m.id); } catch { return []; }
  },

  bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const tc = document.getElementById(btn.dataset.tab);
      if (tc) tc.classList.add('active');
      if (btn.dataset.tab === 'tab-mappe' && MapEditor.map) { MapEditor.resize(); MapEditor.render(); }
    }));
  },

  initMapTab() {
    const $ = id => this.$(id);
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on('mapValidate', 'click', () => MapEditor.validate());
  },

  // ------------------------------------------------------------- Asset tab (null-safe, no try-catch blanket)
  initAssetsTab() {
    const $ = id => this.$(id);
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

    // --- Upload PNG → custom entity
    let uploadedFile = null;
    on('upFile', 'change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const lbl = $('upFileLabel'); if (lbl) lbl.textContent = f.name + ' (' + (f.size / 1024).toFixed(1) + ' KB)';
      uploadedFile = f;
    });
    on('upApplyBtn', 'click', () => {
      if (!uploadedFile) { alert('Choose a PNG first'); return; }
      const name = ($('upClassName')?.value || '').trim();
      if (!name) { alert('Enter a name'); return; }
      const baseClass = $('upBaseClass')?.value || 'EntityWall';
      const w = Math.max(1, +($('upFrameW')?.value || 60));
      const h = Math.max(1, +($('upFrameH')?.value || 60));
      const frames = Math.min(32, Math.max(1, +($('upFrames')?.value || 1)));
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const cnv = document.createElement('canvas');
          cnv.width = w * frames; cnv.height = h;
          const ctx = cnv.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, cnv.width, cnv.height);
          const result = PlayStudio.addCustomClass(name, baseClass, cnv.toDataURL('image/png'), w, h, frames);
          PlayStudio.additionCanvases.set(result.spritePath, cnv);
          PlayStudio.repackTexture2();
          this.refreshCustomList();
          MapEditor.refreshCustomTools();
          this.setStatus('✓ Custom entity: ' + result.className, true);
          uploadedFile = null;
          if ($('upClassName')) $('upClassName').value = '';
          if ($('upFile')) $('upFile').value = '';
          if ($('upFileLabel')) $('upFileLabel').textContent = 'no file';
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(uploadedFile);
    });

    // --- Arena color
    const storedColors = PlayStudio.patches().colors || {};
    if (storedColors.arena && $('colorArena')) $('colorArena').value = storedColors.arena;
    on('colorApplyBtn', 'click', () => {
      const c = $('colorArena')?.value;
      if (c) { PlayStudio.setColor(c); this.setStatus('✓ Arena color: ' + c, true); }
    });

    // --- Skin: populate class/slot/source
    const clsSel = $('skinClass'), propSel = $('skinProp'), srcSel = $('skinSource');
    if (clsSel) {
      const classes = [...new Set(GameData.sheets.filter(s => s.cls).map(s => s.cls))].sort();
      clsSel.innerHTML = classes.map(c => `<option>${c}</option>`).join('');
      const fillProps = () => {
        if (!clsSel.value || !propSel) return;
        const props = GameData.sheets.filter(s => s.cls === clsSel.value).map(s => s.prop || 'animSheet');
        propSel.innerHTML = [...new Set(props)].map(p => `<option>${p}</option>`).join('');
      };
      clsSel.addEventListener('change', fillProps);
      fillProps();
    }
    if (srcSel) {
      const fillSources = () => {
        const paths = [];
        for (const j of GameData.packer.json) paths.push(...Object.keys(j.frames));
        const customs = (PlayStudio.patches().additions || []).map(a => a.path);
        const all = [...new Set([...customs, ...paths])].sort();
        srcSel.innerHTML = all.map(p => `<option value="${p}">${p.replace('media/graphics/game/', '')}</option>`).join('');
      };
      fillSources();
    }
    on('skinApplyBtn', 'click', () => {
      const path = srcSel?.value;
      if (!path) return;
      const region = GameData.extractRegion(path);
      if (!region) { alert('Sprite not found: ' + path); return; }
      const sheet = GameData.sheets.find(s => s.cls === clsSel?.value && (s.prop || 'animSheet') === propSel?.value);
      PlayStudio.assignSkin(clsSel.value, propSel.value, region, sheet ? sheet.w : region.width, sheet ? sheet.h : region.height);
      this.setStatus('✓ Skin applied: ' + clsSel.value, true);
    });

    // --- Play buttons
    on('playModsBtn', 'click', () => PlayStudio.playBuiltinInline($('playMapSelect')?.value));
    on('playDebugBtn', 'click', () => PlayStudio.playDebug($('playMapSelect')?.value));
    on('clearPatchesBtn', 'click', () => {
      if (!confirm('Remove all patches?')) return;
      localStorage.removeItem(PlayStudio.PATCH_KEY);
      PlayStudio.refreshStatus();
      this.refreshCustomList();
      this.refreshMySprites();
      MapEditor.refreshCustomTools();
      if (window.SpriteExplorer) SpriteExplorer.renderTree('');
      this.setStatus('Patches cleared', true);
    });

    // --- Export / refresh
    on('exportAllBtn', 'click', () => this.exportAllPatches());
    on('refreshSpritesBtn', 'click', () => {
      this.refreshMySprites();
      if (window.SpriteExplorer) SpriteExplorer.renderTree('');
      this.setStatus('Refreshed', true);
    });

    // --- Sub-tab navigation
    document.querySelectorAll('.subnav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.subnav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.subtab-content').forEach(c => c.style.display = 'none');
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.subtab);
        if (target) target.style.display = '';
      });
    });

    // --- AI Character Generator (sequential frames with reference)
    this._charRef = null;
    this._charFrames = [];

    on('aiCharGenBtn', 'click', async () => {
      const desc = $('aiCharDesc')?.value.trim();
      const action = $('aiCharAction')?.value || 'walk-down-rest';
      if (!desc) { alert('Write a character description'); return; }
      const actionDescs = {
        'walk-down-rest': 'standing neutral, facing camera', 'walk-down-step1': 'walking LEFT leg forward, facing camera',
        'walk-down-step2': 'walking RIGHT leg forward, facing camera', 'walk-up-rest': 'standing, back view',
        'walk-side-rest': 'standing sideways right', 'attack-raise': 'raising weapon overhead, facing camera',
        'attack-swing': 'swinging weapon down, facing camera', 'hurt': 'staggering backward, facing camera',
      };
      const prompt = AIGenerator.STYLE_PREFIX + ' — ' + desc + ', ' + (actionDescs[action] || 'standing') + '. Full body, centered, transparent background. 150x160 frame.';
      const st = $('aiCharStatus'); if (st) st.textContent = '⏳ Generating...';
      const acts = $('aiCharActions'); if (acts) acts.style.display = 'none';
      const btn = $('aiCharGenBtn'); if (btn) btn.disabled = true;
      try {
        const result = await AIGenerator.generate(prompt, '1024x1024', m => { if (st) st.textContent = '⏳ ' + m; }, this._charRef);
        const img = new Image();
        img.onload = () => {
          // Extract character: remove white/near-white bg, crop to bbox, scale to 150x160
          const rawCnv = document.createElement('canvas');
          rawCnv.width = img.naturalWidth; rawCnv.height = img.naturalHeight;
          rawCnv.getContext('2d').drawImage(img, 0, 0);
          // Remove white background (make transparent)
          const rctx = rawCnv.getContext('2d');
          const imgData = rctx.getImageData(0, 0, rawCnv.width, rawCnv.height);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 220 && d[i+1] > 220 && d[i+2] > 220) d[i+3] = 0; // transparent
          }
          rctx.putImageData(imgData, 0, 0);
          // Crop to character bounding box
          const arr = new Uint8ClampedArray(d);
          let minX = rawCnv.width, minY = rawCnv.height, maxX = 0, maxY = 0;
          for (let y = 0; y < rawCnv.height; y++) {
            for (let x = 0; x < rawCnv.width; x++) {
              const a = arr[(y * rawCnv.width + x) * 4 + 3];
              if (a > 20) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
            }
          }
          const charW = maxX - minX + 1, charH = maxY - minY + 1;
          // Scale to fit 150x160 maintaining aspect ratio, center on transparent canvas
          const cnv = document.createElement('canvas');
          cnv.width = 150; cnv.height = 160;
          const ctx2 = cnv.getContext('2d');
          const scale = Math.min(150 / charW, 160 / charH);
          const dw = charW * scale, dh = charH * scale;
          ctx2.imageSmoothingEnabled = true;
          ctx2.drawImage(rawCnv, minX, minY, charW, charH, (150 - dw) / 2, (160 - dh) / 2, dw, dh);
          this._lastAICanvas = cnv;
          // Show preview
          const prev = $('aiCharPreview');
          if (prev) {
            prev.innerHTML = '<canvas style="max-width:200px; max-height:200px; border-radius:6px; border:1px solid #34344a; image-rendering:pixelated"></canvas>';
            prev.querySelector('canvas').getContext('2d').drawImage(cnv, 0, 0, 150, 160, 0, 0, 200, 200);
          }
          if (acts) acts.style.display = '';
          if (st) st.textContent = '✓ Frame ' + (this._charFrames.length + 1) + ' — transparent 150×160' + (this._charRef ? ' (with ref)' : '');
          this._charFrames.push({ canvas: cnv, action });
          this._renderCharFrames();
        };
        img.src = 'data:image/png;base64,' + result.base64;
      } catch (e) { if (st) st.textContent = '✗ ' + e.message; }
      if (btn) btn.disabled = false;
    });

    on('aiCharSetRef', 'click', () => {
      if (this._lastAICanvas) {
        this._charRef = this._lastAICanvas.toDataURL('image/png');
        const st = $('aiCharStatus'); if (st) st.textContent = '✓ Reference set — next frames will match';
      }
    });
    on('aiCharClearRef', 'click', () => {
      this._charRef = null; this._charFrames = []; this._renderCharFrames();
      const st = $('aiCharStatus'); if (st) st.textContent = 'Cleared';
    });
    on('aiCharToPixel', 'click', () => {
      if (this._lastAICanvas) PixelEditor.openCanvas(this._lastAICanvas, 'AI Char', 150, 'ai-char-' + Date.now());
    });
    on('aiCharDownload', 'click', () => {
      if (this._lastAICanvas) { const a = document.createElement('a'); a.href = this._lastAICanvas.toDataURL('image/png'); a.download = 'char-' + this._charFrames.length + '.png'; a.click(); }
    });
    on('aiCharBuildSheet', 'click', () => {
      if (this._charFrames.length < 2) { alert('Need 2+ frames'); return; }
      const sheet = document.createElement('canvas');
      sheet.width = 150 * this._charFrames.length; sheet.height = 160;
      const ctx = sheet.getContext('2d');
      this._charFrames.forEach((f, i) => ctx.drawImage(f.canvas, 0, 0, f.canvas.width, f.canvas.height, i * 150, 0, 150, 160));
      PlayStudio.assignSkin('EntityPlayer', 'animSheet_walk_down', sheet, 150, 160);
      PlayStudio.refreshStatus();
      this.setStatus('✓ Sheet: ' + this._charFrames.length + ' frames → EntityPlayer skin', true);
    });

    // --- Environment / Effect / UI generators (shared pattern)
    const wireGen = (genId, promptId, statusId, prevId) => {
      on(genId, 'click', async () => {
        const prompt = $(promptId)?.value.trim();
        if (!prompt) { alert('Write a prompt'); return; }
        const st = $(statusId); if (st) st.textContent = '⏳ Generating...';
        try {
          const r = await AIGenerator.generate(AIGenerator.STYLE_PREFIX + ' — ' + prompt, '1024x1024', m => { if (st) st.textContent = '⏳ ' + m; });
          const img = new Image();
          img.onload = () => {
            const cnv = document.createElement('canvas'); cnv.width = img.naturalWidth; cnv.height = img.naturalHeight; cnv.getContext('2d').drawImage(img, 0, 0);
            this._lastAICanvas = cnv;
            const prev = $(prevId);
            if (prev) { prev.innerHTML = '<canvas style="max-width:200px; max-height:200px; border-radius:6px; border:1px solid #34344a"></canvas>'; prev.querySelector('canvas').getContext('2d').drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, 200, 200); }
            if (st) st.textContent = '✓ Generated';
          };
          img.src = 'data:image/png;base64,' + r.base64;
        } catch (e) { if (st) st.textContent = '✗ ' + e.message; }
      });
    };
    wireGen('aiEnvGenBtn', 'aiEnvPrompt', 'aiEnvStatus', 'aiEnvPreview');
    wireGen('aiEffGenBtn', 'aiEffPrompt', 'aiEffStatus', 'aiEffPreview');
    wireGen('aiUiGenBtn', 'aiUiPrompt', 'aiUiStatus', 'aiUiPreview');

    this.refreshCustomList();
    this.refreshMySprites();
  },

  _renderCharFrames() {
    const el = this.$('aiCharFrames');
    if (!el) return;
    el.innerHTML = '';
    if (this._charFrames.length === 0) return;
    // Build strip canvas (all frames side by side)
    const totalW = 150 * this._charFrames.length;
    const stripCv = document.createElement('canvas');
    stripCv.width = totalW; stripCv.height = 160;
    const sctx = stripCv.getContext('2d');
    this._charFrames.forEach((f, i) => sctx.drawImage(f.canvas, i * 150, 0));
    // Display canvas (scaled down, no CSS background — solid fill each frame)
    const displayW = Math.min(totalW, 600);
    const displayH = Math.round(160 * (displayW / totalW));
    const displayCv = document.createElement('canvas');
    displayCv.width = displayW; displayCv.height = displayH;
    displayCv.style.cssText = 'border-radius:6px; border:1px solid #34344a; image-rendering:pixelated';
    const dctx = displayCv.getContext('2d');
    dctx.imageSmoothingEnabled = false;
    // Initial draw
    dctx.fillStyle = '#1a1a26';
    dctx.fillRect(0, 0, displayW, displayH);
    dctx.drawImage(stripCv, 0, 0, totalW, 160, 0, 0, displayW, displayH);
    el.appendChild(displayCv);
    // Frame labels
    const labelsDiv = document.createElement('div');
    labelsDiv.style.cssText = 'display:flex; gap:0; font-size:10px; color:#888; margin-top:4px';
    const labelW = displayW / this._charFrames.length;
    this._charFrames.forEach((f, i) => {
      const lbl = document.createElement('div');
      lbl.style.cssText = 'width:' + labelW + 'px; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap';
      lbl.textContent = 'F' + i + ': ' + f.action.replace(/-/g, ' ').slice(0, 12);
      labelsDiv.appendChild(lbl);
    });
    el.appendChild(labelsDiv);
    // Animation: redraw strip + highlight current frame
    if (this._charAnimTimer) clearInterval(this._charAnimTimer);
    if (this._charFrames.length < 2) {
      const bs = this.$('aiCharBuildSheet');
      if (bs) bs.style.display = 'none';
      return;
    }
    let animIdx = 0;
    this._charAnimTimer = setInterval(() => {
      animIdx = (animIdx + 1) % this._charFrames.length;
      // Fill background (not clearRect — that would show CSS bg through transparent pixels)
      dctx.fillStyle = '#1a1a26';
      dctx.fillRect(0, 0, displayW, displayH);
      // Redraw the full strip
      dctx.drawImage(stripCv, 0, 0, totalW, 160, 0, 0, displayW, displayH);
      // Highlight current frame
      dctx.strokeStyle = '#55c97a';
      dctx.lineWidth = 2;
      dctx.strokeRect(animIdx * labelW, 0, labelW, displayH);
    }, 200);
    const bs = this.$('aiCharBuildSheet');
    if (bs) bs.style.display = '';
  },

  refreshCustomList() {
    const el = this.$('upCustomList');
    if (!el) return;
    const list = PlayStudio.getCustomClasses();
    if (!list.length) { el.innerHTML = '<span class="muted">none</span>'; return; }
    el.innerHTML = list.map(c =>
      `<div class="v-ok">✓ <b>${c.className}</b> (${c.baseClass}) — ${c.w}×${c.h}px, ${c.frames}f
         <button data-remove="${c.className}" style="margin-left:8px; padding:0 6px; font-size:11px">✕</button></div>`
    ).join('');
    el.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
      PlayStudio.removeCustomClass(b.dataset.remove);
      this.refreshCustomList();
      MapEditor.refreshCustomTools();
    }));
  },

  refreshMySprites() {
    const el = this.$('mySprites');
    if (!el) return;
    const p = PlayStudio.patches();
    const additions = p.additions || [];
    if (!additions.length) { el.innerHTML = '<span class="muted">none</span>'; return; }
    el.innerHTML = additions.map(a => {
      const name = a.path.split('/').pop();
      return `<div style="display:flex; gap:8px; padding:6px; border:1px solid #2c2c40; border-radius:6px; margin-bottom:6px; align-items:center">
        <canvas class="my-sprite-thumb" data-path="${a.path}" width="48" height="48" style="image-rendering:pixelated; border-radius:4px"></canvas>
        <div style="flex:1; min-width:0">
          <div style="font-size:13px; color:#55c97a; overflow:hidden; text-overflow:ellipsis">${name}</div>
          <div style="font-size:10px; color:#888">${a.path}</div>
        </div>
        <button class="my-export" data-path="${a.path}" style="font-size:11px">⬇</button>
        <button class="my-remove" data-path="${a.path}" style="font-size:11px; color:#ee5555">✕</button>
      </div>`;
    }).join('');
    el.querySelectorAll('.my-sprite-thumb').forEach(async cv => {
      try {
        await GameData._loadAdditionCanvas(cv.dataset.path);
        const cnv = GameData._additionCanvases[cv.dataset.path];
        const ctx = cv.getContext('2d');
        const scale = Math.min(48 / cnv.width, 48 / cnv.height);
        ctx.drawImage(cnv, 0, 0, cnv.width, cnv.height, (48 - cnv.width * scale) / 2, (48 - cnv.height * scale) / 2, cnv.width * scale, cnv.height * scale);
      } catch (e) {}
    });
    el.querySelectorAll('.my-export').forEach(b => b.addEventListener('click', async () => {
      try { await GameData._loadAdditionCanvas(b.dataset.path); const c = GameData._additionCanvases[b.dataset.path]; const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = b.dataset.path.split('/').pop(); a.click(); } catch (e) {}
    }));
    el.querySelectorAll('.my-remove').forEach(b => b.addEventListener('click', () => {
      if (!confirm('Remove ' + b.dataset.path + '?')) return;
      const p = PlayStudio.patches();
      p.additions = (p.additions || []).filter(a => a.path !== b.dataset.path);
      PlayStudio.savePatches(p);
      if (p.customClasses) p.customClasses = p.customClasses.filter(c => c.spritePath !== b.dataset.path);
      PlayStudio.savePatches(p);
      PlayStudio.repackTexture2();
      this.refreshMySprites();
      this.refreshCustomList();
      MapEditor.refreshCustomTools();
      if (window.SpriteExplorer) SpriteExplorer.renderTree('');
      PlayStudio.refreshStatus();
    }));
  },

  populateToolThumbnails() {
    const drawThumb = (canvas, spritePath, frameW, frameH) => {
      const fullPath = 'media/graphics/game/' + spritePath;
      const fd = GameData.frameFor(fullPath);
      if (!fd) return false;
      const ctx = canvas.getContext('2d');
      const W = canvas.width = 40, H = canvas.height = 40;
      ctx.clearRect(0, 0, W, H);
      const fw = frameW || fd.frame.w, fh = frameH || fd.frame.h;
      const scale = Math.min(W / fw, H / fh) * 0.9;
      const dw = fw * scale, dh = fh * scale;
      ctx.imageSmoothingEnabled = false;
      const src = GameData._additionCanvases[fullPath] || GameData.canvases[fd.texIndex];
      if (!src) return false;
      if (GameData._additionCanvases[fullPath]) ctx.drawImage(src, 0, 0, src.width, src.height, (W - dw) / 2, (H - dh) / 2, dw, dh);
      else ctx.drawImage(src, fd.frame.x, fd.frame.y, fw, fh, (W - dw) / 2, (H - dh) / 2, dw, dh);
      return true;
    };
    document.querySelectorAll('#tab-mappe canvas.thumb').forEach(cv => {
      const spritePath = cv.dataset.sprite;
      const fw = +cv.dataset.frameW, fh = +cv.dataset.frameH;
      drawThumb(cv, spritePath, fw, fh);
      const btn = cv.closest('.tool-btn');
      if (btn) {
        const tip = document.createElement('div');
        tip.className = 'tool-tip';
        const big = document.createElement('canvas');
        big.width = 120; big.height = 120; big.style.cssText = 'width:120px; height:120px';
        tip.appendChild(big);
        const label = document.createElement('div');
        label.style.cssText = 'font-size:11px; color:#aab; text-align:center; margin-top:4px';
        label.textContent = spritePath.split('/').pop() + ' · ' + fw + '×' + fh;
        tip.appendChild(label);
        btn.appendChild(tip);
        let drawn = false;
        btn.addEventListener('mouseenter', () => {
          if (!drawn) {
            const bctx = big.getContext('2d');
            bctx.clearRect(0, 0, 120, 120);
            bctx.imageSmoothingEnabled = false;
            const fd = GameData.frameFor('media/graphics/game/' + spritePath);
            if (fd) {
              const scale = Math.min(120 / fw, 120 / fh) * 0.95;
              const dw = fw * scale, dh = fh * scale;
              const src = GameData._additionCanvases['media/graphics/game/' + spritePath] || GameData.canvases[fd.texIndex];
              if (GameData._additionCanvases['media/graphics/game/' + spritePath]) bctx.drawImage(src, 0, 0, src.width, src.height, (120 - dw) / 2, (120 - dh) / 2, dw, dh);
              else bctx.drawImage(src, fd.frame.x, fd.frame.y, fw, fh, (120 - dw) / 2, (120 - dh) / 2, dw, dh);
            }
            drawn = true;
          }
        });
      }
    });
  },

  exportAllPatches() {
    const p = PlayStudio.patches();
    if (!Object.keys(p).length) { alert('No patches'); return; }
    const projectMaps = JSON.parse(localStorage.getItem('bhs_project_maps') || '[]');
    const exportData = { version: 1, created: new Date().toISOString(), patches: p, maps: projectMaps };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'brawl-hero-studio-' + Date.now() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.setStatus('✓ Exported', true);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.boot());
} else {
  App.boot();
}
window.App = App;
