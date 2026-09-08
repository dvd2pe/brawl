// main.js — shell dello Studio: boot asset reali, tab, collegamenti fra moduli
let _lastAIRef = null; // reference image data URL for AI generation consistency
const App = {
  statusEl: null,

  $(id) { return document.getElementById(id); },

  setStatus(msg, ok) {
    this.statusEl.textContent = msg;
    this.statusEl.className = 'header-status ' + (ok ? 'ok' : '');
  },

  async boot() {
    this.statusEl = this.$('bootStatus');
    PixelEditor.init();
    FrameEditor.init();
    MapEditor.init();
    this.bindNav();
    this.$('btnPlayVanilla').addEventListener('click', () => PlayStudio.playVanilla());
    try {
      await GameData.load(m => this.setStatus(m));
      this.setStatus(`✓ ${GameData.packer.json.reduce((a, j) => a + Object.keys(j.frames).length, 0)} sprite · ${GameData.maps.length} mappe`, true);
    } catch (e) {
      console.error(e);
      this.setStatus('✗ ' + e.message);
      this.$('setupOverlay').classList.remove('hidden');
      return;
    }

    SpriteExplorer.init(document.getElementById('tab-sprite'));
    this.initMapTab();
    this.initAssetsTab();
    this.populateToolThumbnails();
    PlayStudio.refreshStatus();

    // fill select: mappe di gioco
    const loadSel = this.$('mapLoadSelect');
    GameData.maps.slice().sort((a, b) => a.id.localeCompare(b.id)).forEach(m => {
      const o = document.createElement('option'); o.value = m.id; o.textContent = m.id;
      loadSel.appendChild(o);
    });
    // fill select: play
    const playSel = this.$('playMapSelect');
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
    // default: tutorial-1 nell'editor
    const t = GameData.maps.find(m => m.id === 'tutorial-1') || GameData.maps[0];
    MapEditor.loadMap(GameData.cloneMap(t));
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
      document.getElementById(btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'tab-mappe') MapEditor.resize(), MapEditor.render();
    }));
  },

  initMapTab() {
    this.$('mapValidate').addEventListener('click', () => MapEditor.validate());
    // ri-validation soft ad ogni salvataggio
    const origSave = MapEditor.saveToProject.bind(MapEditor);
    MapEditor.saveToProject = () => { MapEditor.validate(); origSave(); };
  },

  initAssetsTab() {
    const $ = id => this.$(id);

    // --- nuova sprite
    $('newSpriteBtn').addEventListener('click', () => {
      const name = $('newSpriteName').value.trim() || ('creazione-' + Date.now() % 10000);
      const w = Math.max(1, +$('newSpriteW').value), h = Math.max(1, +$('newSpriteH').value);
      const frames = Math.min(32, Math.max(1, +$('newSpriteFrames').value));
      const c = document.createElement('canvas');
      c.width = w * frames; c.height = h;
      PixelEditor.openCanvas(c, 'Nuova sprite — ' + name, w, name);
    });

    // --- upload PNG → entità custom
    let uploadedFile = null;
    $('upFile').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      $('upFileLabel').textContent = f.name + ' (' + (f.size / 1024).toFixed(1) + ' KB)';
      uploadedFile = f;
    });
    $('upApplyBtn').addEventListener('click', () => {
      if (!uploadedFile) { alert('Scegli un file PNG prima'); return; }
      const name = $('upClassName').value.trim();
      if (!name) { alert('Inserisci un nome per la classe'); return; }
      const baseClass = $('upBaseClass').value;
      const w = Math.max(1, +$('upFrameW').value);
      const h = Math.max(1, +$('upFrameH').value);
      const frames = Math.min(32, Math.max(1, +$('upFrames').value));
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          // ridimensiona se necessario in canvas dedicato (w*frames x h)
          const cnv = document.createElement('canvas');
          cnv.width = w * frames; cnv.height = h;
          const ctx = cnv.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          // se l'immagine è già w*frames x h → copia diretta, altrimenti scala
          ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, cnv.width, cnv.height);
          const { className, spritePath } = PlayStudio.addCustomClass(name, baseClass, cnv.toDataURL('image/png'), w, h, frames);
          // tieni il canvas per il repack
          PlayStudio.additionCanvases.set(spritePath, cnv);
          PlayStudio.repackTexture2();
          // aggiorna UI
          this.refreshCustomList();
          MapEditor.refreshCustomTools();
          this.setStatus('✓ entità custom creata: ' + className, true);
          // reset form
          $('upClassName').value = '';
          $('upFile').value = '';
          $('upFileLabel').textContent = 'nessun file';
          uploadedFile = null;
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(uploadedFile);
    });

    // --- colori
    const storedColors = PlayStudio.patches().colors || {};
    if (storedColors.arena) $('colorArena').value = storedColors.arena;
    $('colorApplyBtn').addEventListener('click', () => {
      PlayStudio.setColor($('colorArena').value);
      this.setStatus('✓ colore arena applicato: ' + $('colorArena').value, true);
    });

    // --- skin: classi/slot dalle definizioni reali
    const clsSel = $('skinClass'), propSel = $('skinProp'), srcSel = $('skinSource');
    const classes = [...new Set(GameData.sheets.filter(s => s.cls).map(s => s.cls))].sort();
    clsSel.innerHTML = classes.map(c => `<option>${c}</option>`).join('');
    const fillProps = () => {
      const props = GameData.sheets.filter(s => s.cls === clsSel.value).map(s => s.prop || 'animSheet');
      propSel.innerHTML = [...new Set(props)].map(p => `<option>${p}</option>`).join('');
    };
    clsSel.addEventListener('change', fillProps);
    fillProps();
    const fillSources = () => {
      const paths = [];
      for (const j of GameData.packer.json) paths.push(...Object.keys(j.frames));
      const customs = (PlayStudio.patches().additions || []).map(a => a.path);
      const all = [...new Set([...customs, ...paths])].sort();
      srcSel.innerHTML = all.map(p => `<option value="${p}">${p.replace('media/graphics/game/', '')}</option>`).join('');
    };
    fillSources();
    $('skinApplyBtn').addEventListener('click', () => {
      const path = srcSel.value;
      const region = GameData.extractRegion(path);
      if (!region) { alert('Sprite non trovata: ' + path); return; }
      const sheet = GameData.sheets.find(s => s.cls === clsSel.value && (s.prop || 'animSheet') === propSel.value);
      PlayStudio.assignSkin(clsSel.value, propSel.value, region, sheet ? sheet.w : region.width, sheet ? sheet.h : region.height);
      this.setStatus('✓ skin ' + clsSel.value + ' applicata', true);
    });

    // --- play
    $('playModsBtn').addEventListener('click', () => PlayStudio.playBuiltin($('playMapSelect').value));
    $('playDebugBtn').addEventListener('click', () => PlayStudio.playDebug($('playMapSelect').value));
    $('clearPatchesBtn').addEventListener('click', () => {
      if (!confirm('Rimuovere tutte le patch? Il gioco tornerà agli asset originali.')) return;
      localStorage.removeItem(PlayStudio.PATCH_KEY);
      PlayStudio.refreshStatus();
      this.refreshCustomList();
      this.refreshMySprites();
      MapEditor.refreshCustomTools();
      if (window.SpriteExplorer) SpriteExplorer.renderTree(this.$('spriteSearch').value);
      this.setStatus('Patch rimosse', true);
    });

    // esporta tutte le patch come file
    const expBtn = $('exportAllBtn');
    if (expBtn) expBtn.addEventListener('click', () => this.exportAllPatches());
    const refBtn = $('refreshSpritesBtn');
    if (refBtn) refBtn.addEventListener('click', () => { this.refreshMySprites(); if (window.SpriteExplorer) SpriteExplorer.renderTree(''); this.setStatus('Lista aggiornata', true); });

    this.refreshCustomList();
    this.refreshMySprites();
    this.initAIGenerator();
  },

  // ------------------------------------------------------------- AI Sprite Generator v3
  initAIGenerator() {
    const $ = id => this.$(id);
    _lastAIRef = null; // reference image data URL

    // popola categorie
    const catSel = $('aiCategory');
    if (catSel) {
      Object.entries(AIGenerator.CATEGORIES).forEach(([id, c]) => {
        const o = document.createElement('option'); o.value = id;
        o.textContent = c.label;
        catSel.appendChild(o);
      });
    }

    // popola template (filtra per categoria)
    const tplSel = $('aiTemplate');
    const fillTemplates = () => {
      const cat = catSel ? catSel.value : '';
      tplSel.innerHTML = '<option value="">— custom (no template) —</option>';
      Object.entries(AIGenerator.TEMPLATES).forEach(([id, t]) => {
        if (cat && t.category !== cat) return;
        const o = document.createElement('option'); o.value = id;
        o.textContent = t.label + ' · ' + t.w + '×' + t.h + ' · ' + t.frames + 'f';
        tplSel.appendChild(o);
      });
    };
    fillTemplates();
    if (catSel) catSel.addEventListener('change', fillTemplates);

    // fill from template
    const fillFromTemplate = () => {
      const id = tplSel.value;
      const t = AIGenerator.TEMPLATES[id];
      if (!t) return;
      $('aiPrompt').value = t.prompt;
      $('aiFrameW').value = t.w;
      $('aiFrameH').value = t.h;
    };
    tplSel.addEventListener('change', fillFromTemplate);

    // reference image
    $('aiRefBtn').addEventListener('click', () => $('aiRefFile').click());
    $('aiRefFile').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        _lastAIRef = reader.result;
        AIGenerator.setReference(reader.result, f.name);
        this._showRefPreview();
      };
      reader.readAsDataURL(f);
    });
    $('aiUseLastRef').addEventListener('click', () => {
      if (this._lastAICanvas) {
        _lastAIRef = this._lastAICanvas.toDataURL('image/png');
        AIGenerator.setReference(_lastAIRef, 'Last generated');
        this._showRefPreview();
      } else alert('Nessuna immagine generata da usare come reference');
    });
    $('aiClearRef').addEventListener('click', () => {
      _lastAIRef = null;
      AIGenerator.clearReference();
      this._showRefPreview();
    });
    $('aiSetRef').addEventListener('click', () => {
      if (this._lastAICanvas) {
        _lastAIRef = this._lastAICanvas.toDataURL('image/png');
        AIGenerator.setReference(_lastAIRef, 'Generated ' + new Date().toLocaleString());
        this._showRefPreview();
        this.setStatus('✓ Reference impostata — le prossime generazioni useranno questa immagine', true);
      }
    });
    this._showRefPreview();

    // salva in library
    $('aiSavePromptBtn').addEventListener('click', () => {
      const prompt = $('aiPrompt').value.trim();
      if (!prompt) { alert('Scrivi un prompt prima'); return; }
      const name = prompt.slice(0, 60).replace(/\s+/g, '_').replace(/[^\w-]/g, '');
      AIGenerator.saveToLibrary(name, prompt, tplSel.value, _lastAIRef);
      this.refreshLibrary();
      this.setStatus('✓ Prompt salvato in library: ' + name, true);
    });

    // queue button (placeholder — shows queue count)
    $('aiQueueBtn').addEventListener('click', () => {
      const q = AIGenerator.getQueue();
      if (!q.length) { alert('Queue vuota. Seleziona template e usa "Aggiungi a queue"'); return; }
      alert('Queue: ' + q.length + ' items\n' + q.map((q, i) => i + '. ' + (AIGenerator.TEMPLATES[q.templateId]?.label || q.templateId)).join('\n'));
    });

    // genera
    $('aiGenBtn').addEventListener('click', async () => {
      const prompt = $('aiPrompt').value.trim();
      if (!prompt) { alert('Scrivi un prompt prima'); return; }
      const size = $('aiSize').value;
      $('aiStatus').textContent = '⏳ Avvio generazione...';
      $('aiActions').style.display = 'none';
      $('aiPreview').innerHTML = '';
      $('aiGenBtn').disabled = true;
      try {
        const ref = _lastAIRef || AIGenerator.getReference()?.dataUrl || null;
        const result = await AIGenerator.generate(prompt, size, (msg) => {
          $('aiStatus').textContent = '⏳ ' + msg;
        }, ref);
        AIGenerator.addHistory(prompt, tplSel.value);
        const img = new Image();
        img.onload = () => {
          const cnv = document.createElement('canvas');
          cnv.width = img.naturalWidth; cnv.height = img.naturalHeight;
          cnv.getContext('2d').drawImage(img, 0, 0);
          this._lastAICanvas = cnv;
          this._lastAIPrompt = prompt;
          $('aiPreview').innerHTML = `<canvas id="aiPreviewCanvas" style="max-width:200px; max-height:200px; border:1px solid #34344a; border-radius:6px"></canvas>
            <div class="muted" style="font-size:11px; margin-top:4px">${img.naturalWidth}×${img.naturalHeight}px generati${ref ? ' (con reference)' : ''}</div>`;
          const pc = $('aiPreviewCanvas');
          pc.getContext('2d').drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, pc.width, pc.height);
          $('aiActions').style.display = '';
          $('aiStatus').textContent = '✓ Generata. Scegli cosa fare:';
        };
        img.src = 'data:image/png;base64,' + result.base64;
      } catch (e) {
        $('aiStatus').textContent = '✗ Errore: ' + e.message;
      }
      $('aiGenBtn').disabled = false;
      this.refreshHistory();
    });
    // azioni post-generazione
    $('aiToPixel').addEventListener('click', () => {
      if (!this._lastAICanvas) return;
      const w = +$('aiFrameW').value || this._lastAICanvas.width;
      const h = +$('aiFrameH').value || this._lastAICanvas.height;
      const cnv = document.createElement('canvas');
      cnv.width = w; cnv.height = h;
      const ctx = cnv.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this._lastAICanvas, 0, 0, this._lastAICanvas.width, this._lastAICanvas.height, 0, 0, w, h);
      PixelEditor.openCanvas(cnv, 'AI Sprite — ' + (this._lastAIPrompt || '').slice(0, 40), w, 'ai-' + Date.now());
    });
    $('aiToFrame').addEventListener('click', () => {
      if (!this._lastAICanvas) return;
      const w = +$('aiFrameW').value || 150;
      const h = +$('aiFrameH').value || 160;
      const sourceW = this._lastAICanvas.width;
      const sourceH = this._lastAICanvas.height;
      const cols = Math.max(1, Math.floor(sourceW / w));
      const rows = Math.max(1, Math.floor(sourceH / h));
      const sheetCnv = document.createElement('canvas');
      sheetCnv.width = cols * w; sheetCnv.height = rows * h;
      const ctx = sheetCnv.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this._lastAICanvas, 0, 0, sourceW, sourceH, 0, 0, sheetCnv.width, sheetCnv.height);
      const frames = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const f = document.createElement('canvas');
        f.width = w; f.height = h;
        f.getContext('2d').drawImage(sheetCnv, c * w, r * h, w, h, 0, 0, w, h);
        frames.push(f);
      }
      FrameEditor.spritePath = 'ai-generated-' + Date.now();
      FrameEditor.frameW = w; FrameEditor.frameH = h;
      FrameEditor.frames = frames;
      FrameEditor.selected = new Set();
      document.getElementById('frameTitle').textContent = 'Frame Editor — AI Generata';
      document.getElementById('framePath').textContent = FrameEditor.spritePath + ' · ' + w + '×' + h + ' · ' + frames.length + ' frame';
      document.getElementById('frameFrameW').value = w;
      document.getElementById('frameFrameH').value = h;
      document.getElementById('frameOverlay').classList.add('open');
      FrameEditor.render();
      if (window.App) App.setStatus('✓ AI sheet caricato nel Frame Editor: ' + frames.length + ' frame', true);
    });
    $('aiDownload').addEventListener('click', () => {
      if (!this._lastAICanvas) return;
      const a = document.createElement('a');
      a.href = this._lastAICanvas.toDataURL('image/png');
      a.download = 'ai-sprite-' + Date.now() + '.png';
      a.click();
    });
    this.refreshHistory();
    this.refreshLibrary();
  },

  _showRefPreview() {
    const el = this.$('aiRefPreview');
    if (!el) return;
    const ref = AIGenerator.getReference();
    if (ref) {
      el.innerHTML = '<span class="muted" style="font-size:11px">Reference: ' + ref.description + '</span> <img src="' + ref.dataUrl + '" style="max-width:80px; max-height:80px; border-radius:4px; vertical-align:middle; margin-left:8px">';
    } else {
      el.innerHTML = '<span class="muted" style="font-size:11px">Nessun reference impostato</span>';
    }
  },

  refreshLibrary() {
    const el = this.$('aiLibrary');
    if (!el) return;
    const lib = AIGenerator.getLibrary();
    if (!lib.length) { el.innerHTML = '<span class="muted">nessun prompt salvato</span>'; return; }
    el.innerHTML = lib.map(item => {
      const tplName = item.templateId ? AIGenerator.TEMPLATES[item.templateId]?.label || '' : '';
      return `<div class="ai-hist-row" style="display:flex; gap:6px; padding:6px; border:1px solid #2c2c40; border-radius:6px; margin-bottom:4px; align-items:center">
        <button class="ai-lib-fav" data-name="${item.name}" style="font-size:14px; padding:2px 6px; color:${item.favorite ? '#ffcc00' : '#666'}">${item.favorite ? '★' : '☆'}</button>
        ${item.reference ? '<span style="font-size:11px; color:#6fb3ff" title="ha reference">📷</span>' : ''}
        <div style="flex:1; min-width:0">
          <div style="font-size:12px; color:#ddd; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${item.name}</div>
          <div style="font-size:10px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${item.prompt.slice(0, 80)}</div>
        </div>
        <button class="ai-lib-use" data-name="${item.name}" style="font-size:11px; padding:2px 8px">↻</button>
        <button class="ai-lib-del" data-name="${item.name}" style="font-size:11px; padding:2px 8px; color:#ee5555">✕</button>
      </div>`;
    }).join('');
    el.querySelectorAll('.ai-lib-fav').forEach(b => b.addEventListener('click', () => { AIGenerator.toggleLibraryFavorite(b.dataset.name); this.refreshLibrary(); }));
    el.querySelectorAll('.ai-lib-use').forEach(b => b.addEventListener('click', () => {
      const item = AIGenerator.getLibrary().find(i => i.name === b.dataset.name);
      if (item) {
        this.$('aiPrompt').value = item.prompt;
        if (item.reference) { _lastAIRef = item.reference; AIGenerator.setReference(item.reference, item.name); this._showRefPreview(); }
      }
    }));
    el.querySelectorAll('.ai-lib-del').forEach(b => b.addEventListener('click', () => { AIGenerator.removeFromLibrary(b.dataset.name); this.refreshLibrary(); }));
  },

  refreshHistory() {
    const el = this.$('aiHistory');
    if (!el) return;
    const list = AIGenerator.getHistory();
    if (!list.length) { el.innerHTML = '<span class="muted">nessun prompt ancora</span>'; return; }
    el.innerHTML = list.map(h => {
      const dt = new Date(h.ts);
      const dateStr = dt.toLocaleDateString() + ' ' + dt.getHours() + ':' + String(dt.getMinutes()).padStart(2, '0');
      const tplName = h.templateId ? AIGenerator.TEMPLATES.find(t => t.id === h.templateId)?.label || '' : '';
      return `<div class="ai-hist-row" data-prompt="${h.prompt.replace(/"/g, '&quot;')}" style="display:flex; gap:6px; padding:6px; border:1px solid #2c2c40; border-radius:6px; margin-bottom:4px; align-items:center">
        <button class="ai-hist-fav" data-prompt="${h.prompt.replace(/"/g, '&quot;')}" title="preferito" style="font-size:14px; padding:2px 6px; color:${h.favorite ? '#ffcc00' : '#666'}">${h.favorite ? '★' : '☆'}</button>
        <div style="flex:1; min-width:0">
          <div style="font-size:12px; color:#ddd; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${h.prompt}</div>
          <div style="font-size:10px; color:#888">${dateStr}${tplName ? ' · ' + tplName : ''}</div>
        </div>
        <button class="ai-hist-use" data-prompt="${h.prompt.replace(/"/g, '&quot;')}" title="riusa" style="font-size:11px; padding:2px 8px">↻</button>
        <button class="ai-hist-del" data-prompt="${h.prompt.replace(/"/g, '&quot;')}" title="rimuovi" style="font-size:11px; padding:2px 8px; color:#ee5555">✕</button>
      </div>`;
    }).join('');
    // bind bottoni
    el.querySelectorAll('.ai-hist-fav').forEach(b => b.addEventListener('click', () => {
      AIGenerator.toggleFavorite(b.dataset.prompt); this.refreshHistory();
    }));
    el.querySelectorAll('.ai-hist-use').forEach(b => b.addEventListener('click', () => {
      this.$('aiPrompt').value = b.dataset.prompt;
    }));
    el.querySelectorAll('.ai-hist-del').forEach(b => b.addEventListener('click', () => {
      AIGenerator.removeHistory(b.dataset.prompt); this.refreshHistory();
    }));
  },

  refreshCustomList() {
    const el = this.$('upCustomList');
    if (!el) return;
    const list = PlayStudio.getCustomClasses();
    if (!list.length) { el.innerHTML = '<span class="muted">nessuno</span>'; return; }
    el.innerHTML = list.map(c =>
      `<div class="v-ok">✓ <b>${c.className}</b> (extends ${c.baseClass}) — ${c.w}×${c.h}px, ${c.frames} frame
         <button data-remove="${c.className}" style="margin-left:8px; padding:0 6px; font-size:11px">✕ rimuovi</button></div>`
    ).join('');
    el.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
      PlayStudio.removeCustomClass(b.dataset.remove);
      this.refreshCustomList();
      MapEditor.refreshCustomTools();
    }));
  },

  // ------------------------------------------------------------- thumbnail bottoni Map Editor
  populateToolThumbnails() {
    const drawThumb = (canvas, spritePath, frameW, frameH) => {
      const fullPath = 'media/graphics/game/' + spritePath;
      const fd = GameData.frameFor(fullPath);
      if (!fd) return false;
      const ctx = canvas.getContext('2d');
      const W = canvas.width = 40, H = canvas.height = 40;
      ctx.clearRect(0, 0, W, H);
      // calcola aspect ratio del frame
      const fw = frameW || fd.frame.w;
      const fh = frameH || fd.frame.h;
      const scale = Math.min(W / fw, H / fh) * 0.9;
      const dw = fw * scale, dh = fh * scale;
      const dx = (W - dw) / 2, dy = (H - dh) / 2;
      ctx.imageSmoothingEnabled = false;
      // se è custom: usa il canvas cached
      const src = GameData._additionCanvases[fullPath] || GameData.canvases[fd.texIndex];
      if (GameData._additionCanvases[fullPath]) {
        ctx.drawImage(src, 0, 0, src.width, src.height, dx, dy, dw, dh);
      } else {
        ctx.drawImage(src, fd.frame.x, fd.frame.y, fw, fh, dx, dy, dw, dh);
      }
      return true;
    };

    // per ogni canvas.thumb nel tab mappe
    document.querySelectorAll('#tab-mappe canvas.thumb').forEach(cv => {
      const spritePath = cv.dataset.sprite;
      const fw = +cv.dataset.frameW;
      const fh = +cv.dataset.frameH;
      const ok = drawThumb(cv, spritePath, fw, fh);
      if (!ok) {
        // fallback: emoji
        cv.style.display = 'none';
        const btn = cv.closest('.tool-btn');
        if (btn && !btn.querySelector('.emoji-fallback')) {
          const span = document.createElement('span');
          span.style.fontSize = '24px';
          span.className = 'emoji-fallback';
          btn.insertBefore(span, cv);
        }
      }
      // tooltip hover: anteprima più grande
      const btn = cv.closest('.tool-btn');
      if (btn) {
        const tip = document.createElement('div');
        tip.className = 'tool-tip';
        const big = document.createElement('canvas');
        big.width = 120; big.height = 120;
        big.style.width = '120px'; big.style.height = '120px';
        tip.appendChild(big);
        const label = document.createElement('div');
        label.style.fontSize = '11px';
        label.style.color = '#aab';
        label.style.textAlign = 'center';
        label.style.marginTop = '4px';
        label.textContent = spritePath.split('/').pop() + ' · ' + fw + '×' + fh;
        tip.appendChild(label);
        btn.appendChild(tip);
        // disegna anteprima grande sul primo hover (lazy)
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
              const dx = (120 - dw) / 2, dy = (120 - dh) / 2;
              const src = GameData._additionCanvases['media/graphics/game/' + spritePath] || GameData.canvases[fd.texIndex];
              if (GameData._additionCanvases['media/graphics/game/' + spritePath]) {
                bctx.drawImage(src, 0, 0, src.width, src.height, dx, dy, dw, dh);
              } else {
                bctx.drawImage(src, fd.frame.x, fd.frame.y, fw, fh, dx, dy, dw, dh);
              }
            }
            drawn = true;
          }
        });
      }
    });
  },

  // ------------------------------------------------------------- pannello "Le mie sprite"
  refreshMySprites() {
    const el = this.$('mySprites');
    if (!el) return;
    const p = PlayStudio.patches();
    const additions = p.additions || [];
    if (!additions.length) {
      el.innerHTML = '<span class="muted">nessuna sprite salvata — usa l\'editor pixel o l\'editor frame per crearne</span>';
      return;
    }
    // crea una riga per ogni addition con thumbnail + nome + bottoni
    el.innerHTML = additions.map((a, i) => {
      const name = a.path.split('/').pop();
      return `<div class="my-sprite-row" data-path="${a.path}" data-index="${i}" style="display:flex; align-items:center; gap:8px; padding:6px; border:1px solid #2c2c40; border-radius:6px; margin-bottom:6px">
        <canvas class="my-sprite-thumb" data-path="${a.path}" width="48" height="48" style="image-rendering:pixelated; background: repeating-conic-gradient(#1e1e2a 0% 25%, #191924 0% 50%) 0 0 / 8px 8px; border-radius:4px"></canvas>
        <div style="flex:1; min-width:0">
          <div style="font-size:13px; font-weight:500; color:#55c97a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${name}</div>
          <div style="font-size:11px; color:#888">${a.path}</div>
          <div style="font-size:10px; color:#666">${(a.data.length / 1024).toFixed(1)} KB dataURL</div>
        </div>
        <button class="tool-btn my-open" data-path="${a.path}" title="Apri nell'editor sprite" style="font-size:11px">✏️ Apri</button>
        <button class="tool-btn my-pixel" data-path="${a.path}" title="Apri nel pixel editor" style="font-size:11px">✏️ Pixel</button>
        <button class="tool-btn my-export" data-path="${a.path}" title="Esporta su disco come PNG" style="font-size:11px">⬇ PNG</button>
        <button class="tool-btn my-remove" data-path="${a.path}" title="Rimuovi (perdi questa sprite)" style="font-size:11px; color:#ee5555">✕</button>
      </div>`;
    }).join('');
    // per ogni riga: disegna la thumbnail + bind bottoni
    el.querySelectorAll('.my-sprite-row').forEach(async row => {
      const path = row.dataset.path;
      const thumbCv = row.querySelector('.my-sprite-thumb');
      try {
        await GameData._loadAdditionCanvas(path);
        const cnv = GameData._additionCanvases[path];
        const ctx = thumbCv.getContext('2d');
        const scale = Math.min(48 / cnv.width, 48 / cnv.height);
        const dw = cnv.width * scale, dh = cnv.height * scale;
        ctx.drawImage(cnv, (48 - dw) / 2, (48 - dh) / 2, dw, dh);
      } catch (e) {}
    });
    el.querySelectorAll('.my-open').forEach(b => b.addEventListener('click', () => {
      const path = b.dataset.path;
      // vai al tab sprite e seleziona
      document.querySelector('button[data-tab="tab-sprite"]').click();
      // forzar il refresh dell'albero per essere sicuri
      if (window.SpriteExplorer) {
        SpriteExplorer.renderTree('');
        // attendi re-render then click
        setTimeout(() => {
          const item = document.querySelector(`.sprite-item[data-path="${path}"]`);
          if (item) item.click();
        }, 50);
      }
    }));
    el.querySelectorAll('.my-pixel').forEach(b => b.addEventListener('click', async () => {
      const path = b.dataset.path;
      try {
        await GameData._loadAdditionCanvas(path);
        PixelEditor.openCanvas(GameData._additionCanvases[path], 'Sprite custom — ' + path.split('/').pop(), GameData._additionCanvases[path].width, 'custom-' + Date.now());
      } catch (e) { alert('Sprite non trovata: ' + path); }
    }));
    el.querySelectorAll('.my-export').forEach(b => b.addEventListener('click', async () => {
      const path = b.dataset.path;
      try {
        await GameData._loadAdditionCanvas(path);
        const cnv = GameData._additionCanvases[path];
        const a = document.createElement('a');
        a.href = cnv.toDataURL('image/png');
        a.download = path.split('/').pop();
        a.click();
      } catch (e) { alert('Errore esportazione: ' + e.message); }
    }));
    el.querySelectorAll('.my-remove').forEach(b => b.addEventListener('click', () => {
      const path = b.dataset.path;
      if (!confirm('Rimuovere la sprite "' + path + '"?\nLe entità che la riferiscono potrebbero non funzionare più.')) return;
      const p = PlayStudio.patches();
      p.additions = (p.additions || []).filter(a => a.path !== path);
      PlayStudio.savePatches(p);
      // anche rimuovi eventuale customClass che la riferisce
      if (p.customClasses) p.customClasses = p.customClasses.filter(c => c.spritePath !== path);
      PlayStudio.savePatches(p);
      PlayStudio.repackTexture2();
      this.refreshMySprites();
      this.refreshCustomList();
      MapEditor.refreshCustomTools();
      if (window.SpriteExplorer) SpriteExplorer.renderTree('');
      PlayStudio.refreshStatus();
    }));
  },

  // ------------------------------------------------------------- esporta tutte le patch
  exportAllPatches() {
    const p = PlayStudio.patches();
    if (!Object.keys(p).length) { alert('Nessuna patch da esportare'); return; }
    // crea un JSON con tutte le patch + tutte le mappe del progetto
    const projectMaps = JSON.parse(localStorage.getItem('bhs_project_maps') || '[]');
    const exportData = {
      version: 1,
      created: new Date().toISOString(),
      patches: p,
      maps: projectMaps
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'brawl-hero-studio-progetto-' + Date.now() + '.bhsproject.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.setStatus('✓ progetto esportato (' + ((blob.size || a.href.length) / 1024).toFixed(1) + ' KB)', true);
  }
};

// In iframe il DOMContentLoaded può essere già scattato quando i <script> vengono
// eseguiti, quindi verifichiamo lo stato invece di affidarci solo al listener.
window.App = App;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.boot());
} else {
  App.boot();
}
