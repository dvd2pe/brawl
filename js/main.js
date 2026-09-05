// main.js — shell dello Studio: boot asset reali, tab, collegamenti fra moduli
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
      this.setStatus('Patch rimosse', true);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.boot());
window.App = App;
