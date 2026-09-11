// spriteGen.js — Frontend for sprite-gen pipeline (aldegad/sprite-gen repo)
// Calls /api/sprite-gen to run the actual CLI commands
const SpriteGen = {
  runDir: null,

  async callAPI(step, params = {}) {
    const r = await fetch('/api/sprite-gen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, ...params }),
    });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) throw new Error('Server returned ' + r.status);
    const data = await r.json();
    if (!data.success) throw new Error(data.error || 'Failed');
    return data;
  },

  async prepare(charId, desc, cellW, cellH) {
    return this.callAPI('prepare', { characterId: charId, description: desc, cellWidth: cellW, cellHeight: cellH });
  },

  async genSet(runDir, states) {
    return this.callAPI('gen-set', { runDir, states });
  },

  async extract(runDir) {
    return this.callAPI('extract', { runDir });
  },

  async composeAtlas(runDir) {
    return this.callAPI('compose-atlas', { runDir });
  },

  async status(runDir) {
    return this.callAPI('status', { runDir });
  },

  async listRuns() {
    return this.callAPI('list-runs');
  },

  async getImage(filePath) {
    const data = await this.callAPI('get-image', { path: filePath });
    return data.base64;
  },

  // Render frames in the preview area (like sprite tab)
  renderFrames(previewEl, framesData, runDir) {
    let html = '';
    for (const { state, files } of framesData) {
      html += `<h4 style="color:#6fb3ff; margin:8px 0 4px">${state} (${files.length} frames)</h4>`;
      html += '<div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:12px">';
      for (const file of files) {
        const filePath = `${runDir}/frames/${state}/${file}`;
        html += `<div style="text-align:center">
          <img src="/api/sprite-gen?step=get-image&path=${encodeURIComponent(filePath)}" 
               style="width:75px; height:80px; object-fit:contain; background:repeating-conic-gradient(#1e1e2a 0% 25%, #191924 0% 50%) 0 0 / 8px 8px; border-radius:4px; image-rendering:pixelated"
               onerror="this.style.opacity=0.3" />
          <div style="font-size:9px; color:#666">${file}</div>
        </div>`;
      }
      html += '</div>';
    }
    // Also show raw generated images
    previewEl.innerHTML = html || '<span class="muted">No frames yet</span>';
  },

  // Render the atlas (final composed sheet)
  renderAtlas(previewEl, runDir, manifest) {
    const atlasUrl = `/api/sprite-gen?step=get-image&path=${encodeURIComponent(runDir + '/sprite-sheet-alpha.png')}`;
    let html = '<h4 style="color:#55c97a; margin:8px 0 4px">📋 Final Atlas</h4>';
    html += `<img src="${atlasUrl}" style="max-width:100%; border-radius:6px; border:1px solid #34344a; image-rendering:pixelated; background:repeating-conic-gradient(#1e1e2a 0% 25%, #191924 0% 50%) 0 0 / 12px 12px" />`;
    if (manifest) {
      html += '<details><summary style="cursor:pointer; color:#888; font-size:12px; margin-top:8px">manifest.json</summary>';
      html += `<pre style="font-size:10px; color:#666; background:#0d0d14; padding:8px; border-radius:4px; overflow:auto; max-height:200px">${JSON.stringify(manifest, null, 2)}</pre>`;
      html += '</details>';
    }
    // Add save-as buttons
    html += '<div class="row" style="margin-top:12px">';
    html += '<button class="primary" onclick="SpriteGen.saveAsSkin(\'EntityPlayer\')">💾 Save as Player Skin</button>';
    html += '<button onclick="SpriteGen.saveAsCustom()">💾 Save as Custom Sprite</button>';
    html += '</div>';
    previewEl.innerHTML += html;
  },

  async saveAsSkin(target) {
    if (!this.runDir) return;
    const atlasPath = this.runDir + '/sprite-sheet-alpha.png';
    const base64 = await this.getImage(atlasPath);
    const dataUrl = 'data:image/png;base64,' + base64;
    // Fetch the image, convert to canvas, assign as skin
    const img = new Image();
    img.onload = () => {
      const cnv = document.createElement('canvas');
      cnv.width = img.naturalWidth; cnv.height = img.naturalHeight;
      cnv.getContext('2d').drawImage(img, 0, 0);
      PlayStudio.assignSkin(target, 'animSheet_walk_down', cnv, 150, 160);
      PlayStudio.refreshStatus();
      if (window.App) App.setStatus('✓ Atlas saved as ' + target + ' skin', true);
    };
    img.src = dataUrl;
  },

  async saveAsCustom() {
    if (!this.runDir) return;
    const atlasPath = this.runDir + '/sprite-sheet-alpha.png';
    const base64 = await this.getImage(atlasPath);
    const path = 'media/graphics/game/custom/spritegen-atlas-' + Date.now() + '.png';
    const p = PlayStudio.patches();
    p.additions = (p.additions || []).filter(a => a.path !== path);
    p.additions.push({ path, data: 'data:image/png;base64,' + base64 });
    PlayStudio.savePatches(p);
    const img = new Image();
    img.onload = () => {
      const cnv = document.createElement('canvas');
      cnv.width = img.naturalWidth; cnv.height = img.naturalHeight;
      cnv.getContext('2d').drawImage(img, 0, 0);
      PlayStudio.additionCanvases.set(path, cnv);
      if (window.GameData) GameData._additionCanvases[path] = cnv;
      PlayStudio.repackTexture2();
      if (window.App) { App.refreshMySprites(); App.setStatus('✓ Atlas saved as custom sprite', true); }
      if (window.SpriteExplorer) SpriteExplorer.renderTree('');
    };
    img.src = 'data:image/png;base64,' + base64;
  },
};

window.SpriteGen = SpriteGen;
