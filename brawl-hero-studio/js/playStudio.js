// playStudio.js — applica le modifiche al gioco vero e lancia la partita.
// Patch in localStorage['bhs_patches']; comando di play in localStorage['bhs_pending_play'];
// il bridge dentro ../studio-play.html le applica al motore reale.
const PlayStudio = {
  PATCH_KEY: 'bhs_patches',
  PLAY_KEY: 'bhs_pending_play',
  additionCanvases: new Map(),   // path -> canvas (runtime per il repack)

  patches() { try { return JSON.parse(localStorage.getItem(this.PATCH_KEY) || '{}'); } catch { return {}; } },
  savePatches(p) {
    try { localStorage.setItem(this.PATCH_KEY, JSON.stringify(p)); }
    catch (e) { alert('Storage pieno: le patch non entrano in localStorage. Rimuovi qualche patch o usa texture più piccole.'); }
  },

  // ------------------------------------------------------------- patch texture (edit in place)
  storeTexturePatch(texIndex) {
    const p = this.patches();
    p.textures = p.textures || {};
    p.textures[GameData.packer.textures[texIndex]] = GameData.textureDataURL(texIndex);
    this.savePatches(p);
  },

  // ------------------------------------------------------------- skin entità (nuova grafica su classe esistente)
  assignSkin(entityCls, prop, sourceCanvas, frameW, frameH) {
    const p = this.patches();
    p.skins = p.skins || [];
    p.skins = p.skins.filter(s => !(s.cls === entityCls && s.prop === prop));
    p.skins.push({ cls: entityCls, prop: prop || '', data: sourceCanvas.toDataURL('image/png'), w: frameW, h: frameH });
    this.savePatches(p);
    this.refreshStatus();
  },

  // ------------------------------------------------------------- entità custom (upload PNG → nuova classe)
  addCustomClass(name, baseClass, dataURL, frameW, frameH, frames) {
    // nome: "MuroDiPietra" → classe "EntityWallMuroDiPietra"
    const clean = name.replace(/[^A-Za-z0-9]/g, '');
    const className = baseClass + clean.charAt(0).toUpperCase() + clean.slice(1);
    const spritePath = 'media/graphics/game/custom/' + className.toLowerCase() + '.png';
    const p = this.patches();
    p.customClasses = (p.customClasses || []).filter(c => c.className !== className);
    p.customClasses.push({ className, baseClass, spritePath, data: dataURL, w: frameW, h: frameH, frames });
    // aggiungi anche come addition per il repack (così è visibile nell'editor)
    p.additions = (p.additions || []).filter(a => a.path !== spritePath);
    p.additions.push({ path: spritePath, data: dataURL });
    this.savePatches(p);
    // CRITICAL: carica il canvas dell'addition e fai il repack per aggiornare textureJSON
    // (altrimenti frameFor() non trova la sprite e il rendering fallisce)
    this._loadAdditionCanvasForRepack(spritePath, dataURL);
    return { className, spritePath };
  },

  // Carica il canvas da un dataURL e lo mette sia in additionCanvases (per il repack)
  // sia in GameData._additionCanvases (per il rendering diretto nel mapEditor)
  _loadAdditionCanvasForRepack(spritePath, dataURL) {
    const img = new Image();
    img.onload = () => {
      const cnv = document.createElement('canvas');
      cnv.width = img.naturalWidth; cnv.height = img.naturalHeight;
      cnv.getContext('2d').drawImage(img, 0, 0);
      // Salva in entrambi i cache
      this.additionCanvases.set(spritePath, cnv);
      if (window.GameData) GameData._additionCanvases[spritePath] = cnv;
      // Ora fai il repack per aggiornare textureJSON
      this.repackTexture2();
      // Forza re-render del mapEditor se aperto
      if (window.MapEditor && MapEditor.map) MapEditor.render();
      if (window.SpriteExplorer) SpriteExplorer.renderTree('');
    };
    img.src = dataURL;
  },

  removeCustomClass(className) {
    const p = this.patches();
    if (p.customClasses) p.customClasses = p.customClasses.filter(c => c.className !== className);
    if (p.additions) {
      const removed = p.customClasses ? [] : [];
      // rimuovi anche l'addition corrispondente
      p.additions = p.additions.filter(a => a.path !== 'media/graphics/game/custom/' + className.toLowerCase() + '.png');
    }
    this.savePatches(p);
    this.refreshStatus();
  },

  getCustomClasses() { const p = this.patches(); return p.customClasses || []; },

  // ------------------------------------------------------------- colori arena
  setColor(arenaColor) {
    const p = this.patches();
    p.colors = p.colors || {};
    p.colors.arena = arenaColor;
    this.savePatches(p);
    this.refreshStatus();
  },

  // ------------------------------------------------------------- sprite nuove (repack texture-2)
  newSpritePath(name) { return 'media/graphics/game/custom/' + name.replace(/[^\w-]/g, '') + '.png'; },

  addNewSprite(name, canvas) {
    const path = this.newSpritePath(name);
    const p = this.patches();
    p.additions = (p.additions || []).filter(a => a.path !== path);
    p.additions.push({ path, data: canvas.toDataURL('image/png') });
    this.savePatches(p);
    this.additionCanvases.set(path, canvas);
    this.repackTexture2();
    return path;
  },

  // Ricostruisce texture-2 mantenendo le regioni originali e accodando le sprite nuove.
  // Il JSON aggiornato va in localStorage: il bridge lo sostituisce PRIMA del boot del gioco.
  repackTexture2() {
    const p = this.patches();
    const name = 'texture-2';
    const texIdx = GameData.packer.textures.indexOf(name);
    if (texIdx < 0) return;
    const json = JSON.parse(JSON.stringify(GameData.packer.json[texIdx]));
    const orig = GameData.canvases[texIdx];
    const W = Math.max(2048, orig.width), H = Math.max(2048, orig.height);
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    ctx.drawImage(orig, 0, 0);                       // regioni originali al posto loro
    let maxY = 0;
    for (const f of Object.values(json.frames)) maxY = Math.max(maxY, f.frame.y + f.frame.h);
    let x = 0, y = Math.min(maxY + 8, H - 8), rh = 0;
    for (const add of (p.additions || [])) {
      const cnv = this.additionCanvases.get(add.path);
      if (!cnv) continue;
      if (x + cnv.width + 8 > W) { x = 0; y += rh + 8; rh = 0; }
      if (y + cnv.height > H) { console.warn('Atlante pieno: sprite ignorata', add.path); continue; }
      ctx.drawImage(cnv, x, y);
      json.frames[add.path] = {
        frame: { y, x, w: cnv.width, h: cnv.height }, rotated: false, trimmed: false,
        pivot: { y: 0.5, x: 0.5 },
        sourceSize: { h: cnv.height, w: cnv.width },
        spriteSourceSize: { y: 0, x: 0, w: cnv.width, h: cnv.height }
      };
      x += cnv.width + 8; rh = Math.max(rh, cnv.height);
    }
    p.textureJSON = p.textureJSON || {};
    p.textureJSON[name] = JSON.stringify(json);
    p.textures = p.textures || {};
    p.textures[name] = out.toDataURL('image/png');
    this.savePatches(p);
    this.refreshStatus();
  },

  // ------------------------------------------------------------- comando play — inline preview
  // Instead of opening a new tab (which gets blocked), embed the game in an iframe
  // inside the map tab. The iframe loads studio-play.html which runs the real engine.
  playCustomMapInline(map) {
    localStorage.setItem(this.PLAY_KEY, JSON.stringify({ type: 'custom', map }));
    this._showInlineGame();
  },
  playBuiltinInline(id) {
    localStorage.setItem(this.PLAY_KEY, JSON.stringify({ type: 'builtin', id }));
    this._showInlineGame();
  },
  _showInlineGame() {
    const canvasWrap = document.getElementById('mapCanvasWrap');
    const gameWrap = document.getElementById('gamePreviewWrap');
    const frame = document.getElementById('gamePreviewFrame');
    const closeBtn = document.getElementById('gamePreviewClose');
    if (!canvasWrap || !gameWrap || !frame) return;
    // Hide the map canvas, show the game iframe
    canvasWrap.style.display = 'none';
    gameWrap.style.display = 'flex';
    // Load the game in the iframe
    frame.src = '../studio-play.html';
    // Close button: restore the map canvas
    if (closeBtn) {
      closeBtn.onclick = () => {
        gameWrap.style.display = 'none';
        canvasWrap.style.display = 'flex';
        frame.src = 'about:blank'; // unload the game
        if (window.MapEditor) MapEditor.render(); // refresh the map
      };
    }
  },

  // ------------------------------------------------------------- comando play — new tab (fallback)
  // Apre studio-play.html per giocare la mappa con le patch applicate.
  // Usa un link diretto (non window.open) per evitare il blocco popup.
  // Crea un link temporaneo e clickalo — funziona anche dentro iframe.
  playCustomMap(map) {
    localStorage.setItem(this.PLAY_KEY, JSON.stringify({ type: 'custom', map }));
    this._openPlayUrl('../studio-play.html');
  },
  playBuiltin(id) {
    localStorage.setItem(this.PLAY_KEY, JSON.stringify({ type: 'builtin', id }));
    this._openPlayUrl('../studio-play.html');
  },
  playVanilla() { this._openPlayUrl('../vanilla.html'); },
  playDebug(id) {
    localStorage.setItem(this.PLAY_KEY, JSON.stringify({ type: 'builtin', id }));
    this._openPlayUrl('../studio-play.html?debug=true');
  },

  // Apre un URL in una nuova tab. Primo tentativo: window.open (popup).
  // Se bloccato (ritorna null), fallback: crea link con target=_blank e click programmato.
  // Se anche quello fallisce (iframe sandbox), mostra un link manuale all'utente.
  _openPlayUrl(relativeUrl) {
    const fullUrl = new URL(relativeUrl, window.location.href).href;
    // Tentativo 1: window.open
    let popup = null;
    try { popup = window.open(fullUrl, '_blank'); } catch (e) {}
    if (popup && !popup.closed) {
      try { popup.focus(); } catch (e) {}
      return;
    }
    // Tentativo 2: link con target=_blank
    try {
      const a = document.createElement('a');
      a.href = fullUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    } catch (e) {}
    // Tentativo 3: link manuale (l'utente clicca)
    this._showManualLink(fullUrl);
  },

  _showManualLink(url) {
    // Rimuovi eventuale messaggio precedente
    const old = document.getElementById('playLinkOverlay');
    if (old) old.remove();
    const div = document.createElement('div');
    div.id = 'playLinkOverlay';
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#000c;z-index:1000;display:flex;align-items:center;justify-content:center';
    div.innerHTML = '<div style="background:#1a1a26;border:1px solid #2f6fed;border-radius:12px;padding:32px;max-width:480px;text-align:center;color:#e8e8f0;font-family:system-ui">' +
      '<h2 style="color:#fff;margin:0 0 12px;font-size:20px">▶ Apri il gioco</h2>' +
      '<p style="color:#9aa0b8;margin:0 0 16px;font-size:14px">Il browser ha bloccato il popup. Clicca il bottone per aprire il gioco in una nuova tab:</p>' +
      '<a href="' + url + '" target="_blank" rel="noopener" style="display:inline-block;background:#2f6fed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">▶ Gioca ora</a>' +
      '<p style="color:#666;margin:16px 0 0;font-size:11px;font-family:monospace">' + url + '</p>' +
      '<button id="closePlayLink" style="margin-top:16px;background:#23232f;color:#aaa;border:1px solid #34344a;padding:6px 14px;border-radius:6px;cursor:pointer">Chiudi</button>' +
    '</div>';
    document.body.appendChild(div);
    document.getElementById('closePlayLink').addEventListener('click', () => div.remove());
  },

  // ------------------------------------------------------------- UI stato
  refreshStatus() {
    const el = document.getElementById('patchStatus');
    if (!el) return;
    const p = this.patches();
    const tex = Object.keys(p.textures || {});
    el.innerHTML = [
      `texture patchate: ${tex.length ? tex.join(', ') : 'nessuna'}`,
      `sprite nuove: ${(p.additions || []).length}`,
      `skin entità: ${(p.skins || []).length}`,
      `entità custom: ${(p.customClasses || []).length}`,
      `colori: ${p.colors && p.colors.arena ? 'arena=' + p.colors.arena : 'default'}`
    ].map(l => `<div>• ${l}</div>`).join('');
  }
};
window.PlayStudio = PlayStudio;
