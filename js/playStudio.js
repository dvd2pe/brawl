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

  // ------------------------------------------------------------- comando play
  playCustomMap(map) {
    localStorage.setItem(this.PLAY_KEY, JSON.stringify({ type: 'custom', map }));
    window.open('../studio-play.html', '_blank');
  },
  playBuiltin(id) {
    localStorage.setItem(this.PLAY_KEY, JSON.stringify({ type: 'builtin', id }));
    window.open('../studio-play.html', '_blank');
  },
  playVanilla() { window.open('../index.html', '_blank'); },
  playDebug(id) {
    localStorage.setItem(this.PLAY_KEY, JSON.stringify({ type: 'builtin', id }));
    window.open('../studio-play.html?debug=true', '_blank');
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
      `skin entità: ${(p.skins || []).length}`
    ].map(l => `<div>• ${l}</div>`).join('');
  }
};
window.PlayStudio = PlayStudio;
