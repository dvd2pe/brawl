// mapEditor.js — editor di mappe nel FORMATO REALE del gioco:
// { id, tiles[12x24], environments[{entity,tileType,x,y,settings}], enemies[{entity,x,y,settings}], markers[{label,x,y,settings}] }
// Anteprima fedele: arena + autotiling acqua/fossa (port da EntityTileHandler) + muri come sprite + y-sort.
const MapEditor = {
  canvas: null, ctx: null, map: null, tool: null, zoom: 1,
  history: [], hIndex: -1, showGrid: true,

  init() {
    this.canvas = document.getElementById('mapCanvas');
    this.ctx = this.canvas.getContext('2d');
    const $ = id => document.getElementById(id);
    $('mapToolApply').addEventListener('click', () => this.setTool('wall'));
    $('mapToolWater').addEventListener('click', () => this.setTool('water'));
    $('mapToolDitch').addEventListener('click', () => this.setTool('ditch'));
    $('mapToolSpike').addEventListener('click', () => this.setTool('spike'));
    document.querySelectorAll('[data-enemy]').forEach(b => b.addEventListener('click', () => this.setTool('enemy:' + b.dataset.enemy)));
    $('mapToolPlayer').addEventListener('click', () => this.setTool('marker:P'));
    $('mapToolBoss').addEventListener('click', () => this.setTool('marker:B'));
    $('mapToolRandom').addEventListener('click', () => this.setTool('marker:E'));
    $('mapToolErase').addEventListener('click', () => this.setTool('erase'));
    $('mapUndo').addEventListener('click', () => this.undo());
    $('mapRedo').addEventListener('click', () => this.redo());
    $('mapGrid').addEventListener('change', e => { this.showGrid = e.target.checked; this.render(); });
    $('mapNew').addEventListener('click', () => { this.loadMap(GameData.emptyMap('easy-custom-' + (Date.now() % 1000))); });
    $('mapLoadSelect').addEventListener('change', e => {
      const m = GameData.maps.find(m => m.id === e.target.value);
      if (m) this.loadMap(GameData.cloneMap(m));
    });
    $('mapId').addEventListener('input', e => { this.map.id = e.target.value.trim(); });
    $('mapValidate').addEventListener('click', () => this.validate());
    $('mapTest').addEventListener('click', () => this.testInGame());
    $('mapSaveProject').addEventListener('click', () => this.saveToProject());
    $('mapProjectSelect').addEventListener('change', e => {
      const p = this.projectMaps().find(m => m.id === e.target.value);
      if (p) this.loadMap(GameData.cloneMap(p));
    });
    this.canvas.addEventListener('pointerdown', e => { this.pushHistory(); this.apply(e); });
    this.canvas.addEventListener('pointermove', e => { this.hover(e); if (e.buttons) this.apply(e); });
    this.canvas.addEventListener('pointerleave', () => { document.getElementById('mapCursor').textContent = ''; });
  },

  setTool(t) {
    this.tool = t;
    document.querySelectorAll('#tab-mappe .tool-btn').forEach(b => b.classList.remove('active'));
    let btn = document.querySelector(`#tab-mappe [data-tool="${t}"]`);
    if (!btn && t.startsWith('enemy:')) btn = document.querySelector(`#tab-mappe [data-enemy="${t.slice(6)}"]`);
    if (btn) btn.classList.add('active');
  },

  projectMaps() {
    try { return JSON.parse(localStorage.getItem('bhs_project_maps') || '[]'); } catch { return []; }
  },

  loadMap(map) {
    this.map = map;
    document.getElementById('mapId').value = map.id;
    this.history = []; this.hIndex = -1; this.pushHistory();
    this.resize();
    this.render();
  },

  resize() {
    const W = this.map.tiles[0].length * 60, H = this.map.tiles.length * 60;
    this.canvas.width = W; this.canvas.height = H;
    const maxH = window.innerHeight - 260;
    this.zoom = Math.min(1, maxH / H);
    this.canvas.style.width = (W * this.zoom) + 'px';
    this.canvas.style.height = (H * this.zoom) + 'px';
  },

  cellOf(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / (r.width / this.map.tiles[0].length));
    const y = Math.floor((e.clientY - r.top) / (r.height / this.map.tiles.length));
    if (x < 0 || y < 0 || x >= this.map.tiles[0].length || y >= this.map.tiles.length) return null;
    return { x, y };
  },

  hover(e) {
    const c = this.cellOf(e);
    document.getElementById('mapCursor').textContent = c ? `cella (${c.x}, ${c.y})` : '';
  },

  pushHistory() {
    if (!this.map) return;
    this.history = this.history.slice(0, this.hIndex + 1);
    this.history.push(JSON.stringify(this.map));
    if (this.history.length > 60) this.history.shift();
    this.hIndex = this.history.length - 1;
  },
  undo() { if (this.hIndex > 0) { this.hIndex--; this.restore(); } },
  redo() { if (this.hIndex < this.history.length - 1) { this.hIndex++; this.restore(); } },
  restore() {
    this.map = JSON.parse(this.history[this.hIndex]);
    document.getElementById('mapId').value = this.map.id;
    this.render();
  },

  // ------------------------------------------------------------- editing
  apply(e) {
    if (!this.map || !this.tool) return;
    const c = this.cellOf(e);
    if (!c) return;
    const T = GameData.tileTypes, m = this.map;
    const envOf = (x, y, entity) => m.environments.find(v => v.entity === entity && v.x === x && v.y === y);
    const enemyOf = (x, y, entity) => m.enemies.find(v => v.entity === entity && v.x === x && v.y === y);
    const markerOf = (x, y, label) => m.markers.find(v => v.label === label && v.x === x && v.y === y);

    if (this.tool === 'wall') {
      if (m.tiles[c.y][c.x] === T.wall) return;
      m.tiles[c.y][c.x] = T.wall;
      if (!envOf(c.x, c.y, 'EntityWall')) m.environments.push({ entity: 'EntityWall', tileType: T.wall, x: c.x, y: c.y, settings: {} });
    } else if (this.tool === 'water' || this.tool === 'ditch') {
      const v = T[this.tool];
      if (m.tiles[c.y][c.x] === v) return;
      m.tiles[c.y][c.x] = v;
      // acqua/fossa: solo griglia (bake), niente entità; rimuovi eventuale muro
      m.environments = m.environments.filter(v => !(v.entity === 'EntityWall' && v.x === c.x && v.y === c.y));
    } else if (this.tool === 'spike') {
      if (envOf(c.x, c.y, 'EntitySpike')) return;
      m.environments.push({ entity: 'EntitySpike', tileType: T.none, x: c.x, y: c.y, settings: {} });
    } else if (this.tool.startsWith('enemy:')) {
      const entity = this.tool.slice(6);
      if (enemyOf(c.x, c.y, entity)) return;
      m.enemies.push({ entity, x: c.x, y: c.y, settings: {} });
    } else if (this.tool.startsWith('marker:')) {
      const label = this.tool.slice(7);
      if (label === 'P') m.markers = m.markers.filter(v => v.label !== 'P');
      if (!markerOf(c.x, c.y, label)) m.markers.push({ label, x: c.x, y: c.y, settings: {} });
    } else if (this.tool === 'erase') {
      m.tiles[c.y][c.x] = T.none;
      m.environments = m.environments.filter(v => !(v.x === c.x && v.y === c.y));
      m.enemies = m.enemies.filter(v => !(v.x === c.x && v.y === c.y));
      m.markers = m.markers.filter(v => !(v.label !== 'P' && v.x === c.x && v.y === c.y));
    }
    this.render();
  },

  // ------------------------------------------------------------- rendering (anteprima fedele)
  render() {
    if (!this.map) return;
    const ctx = this.ctx, T = GameData.tileTypes, ts = GameData.tileset;
    const W = this.map.tiles[0].length, H = this.map.tiles.length, S = ts.tileSize;
    ctx.fillStyle = ts.backgroundColor; ctx.fillRect(0, 0, W * S, H * S);
    // arena + autotile bake (identico al gioco)
    const baked = GameData.buildTileCanvas(this.map.tiles);
    ctx.drawImage(baked, ts.backgroundOffset.x, ts.backgroundOffset.y);
    // entità environment y-sorted (zIndex = base + 2*y; spike base-10 -> sotto i muri)
    const draws = [];
    for (const env of this.map.environments) {
      if (env.entity === 'EntityWall') {
        draws.push({ y: env.y, z: 2, draw: () => GameData.drawRegion(ctx, ts ? 'media/graphics/game/environments/tile-wall.png' : '', env.x * S, env.y * S - 30) });
      } else if (env.entity === 'EntitySpike') {
        draws.push({ y: env.y, z: -1, draw: () => GameData.drawRegion(ctx, 'media/graphics/game/environments/tile-spike.png', env.x * S, env.y * S - 2) });
      }
    }
    for (const en of this.map.enemies) {
      const cat = GameData.entities.find(x => x.entity === en.entity);
      const sh = cat && cat.sheet;
      if (sh && sh.path) draws.push({ y: en.y, z: 1, draw: () => GameData.drawRegion(ctx, sh.path, en.x * S + (S - sh.w) / 2, en.y * S + S - sh.h + 8, { frameW: sh.w, frameH: sh.h }) });
      else { draws.push({ y: en.y, z: 1, draw: () => { ctx.fillStyle = '#ff00ff'; ctx.fillRect(en.x * S + 15, en.y * S + 15, 30, 30); } }); }
    }
    draws.sort((a, b) => (a.y + a.z / 10) - (b.y + b.z / 10));
    draws.forEach(d => d.draw());
    // marker
    for (const mk of this.map.markers) {
      const px = mk.x * S, py = mk.y * S;
      if (mk.label === 'P') {
        const sh = GameData.sheetOf('EntityPlayer');
        if (sh && sh.path) GameData.drawRegion(ctx, sh.path, px + (S - sh.w) / 2, py + S - sh.h + 8, { frameW: sh.w, frameH: sh.h });
      }
      ctx.fillStyle = mk.label === 'P' ? '#3399ff' : mk.label === 'B' ? '#ffcc00' : '#66ff66';
      ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(mk.label, px + S / 2, py + 20);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.strokeRect(px + 2, py + 2, S - 4, S - 4);
    }
    // griglia
    if (this.showGrid) {
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * S, 0); ctx.lineTo(x * S, H * S); ctx.stroke(); }
      for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * S); ctx.lineTo(W * S, y * S); ctx.stroke(); }
      // portale (auto-generato dal gioco in basso al centro)
      ctx.strokeStyle = 'rgba(120,220,255,.8)'; ctx.setLineDash([6, 4]);
      ctx.strokeRect(W * S / 2 - 60, 0, 120, S); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(120,220,255,.9)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('portale (auto)', W * S / 2, 14);
    }
    document.getElementById('mapStats').textContent =
      `${W}×${H} celle — muri: ${this.map.environments.filter(e => e.entity === 'EntityWall').length}, nemici: ${this.map.enemies.length}, marker: ${this.map.markers.map(m => m.label).join(',') || '-'}`;
  },

  // ------------------------------------------------------------- validazione
  validate() {
    const out = [], T = GameData.tileTypes, m = this.map;
    const hasP = m.markers.some(k => k.label === 'P');
    out.push(hasP ? ['ok', 'Marker P (spawn player) presente'] : ['err', 'Manca il marker P (spawn player)']);
    const borderOpen = m.tiles[0].some(v => v === T.none) || m.tiles[m.tiles.length - 1].some(v => v === T.none) ||
      m.tiles.some(r => r[0] === T.none || r[r.length - 1] === T.none);
    out.push(borderOpen ? ['warn', 'Bordo mappa con celle vuote: il gioco genera muri invisibili, ma il player potrebbe vedere il vuoto'] : ['ok', 'Bordo chiuso']);
    out.push(m.enemies.length || m.markers.some(k => k.label === 'E' || k.label === 'B') ? ['ok', `Nemici: ${m.enemies.length}`] : ['warn', 'Nessun nemico: mappa vuota di gioco']);
    if (!/^(easy|normal|hard|boss|tutorial)/.test(m.id)) out.push(['warn', "L'id dovrebbe iniziare con easy/normal/hard/boss/tutorial (es. easy-custom-1)"]);
    const el = document.getElementById('mapValidation');
    el.innerHTML = out.map(([t, s]) => `<div class="v-${t}">${t === 'ok' ? '✓' : t === 'warn' ? '!' : '✗'} ${s}</div>`).join('');
  },

  // ------------------------------------------------------------- persist + play
  saveToProject() {
    const maps = this.projectMaps().filter(m => m.id !== this.map.id);
    maps.push(this.map);
    localStorage.setItem('bhs_project_maps', JSON.stringify(maps));
    this.fillProjectSelect();
    alert('Mappa salvata nel progetto (' + this.map.id + ')');
  },

  fillProjectSelect() {
    const sel = document.getElementById('mapProjectSelect');
    const maps = this.projectMaps();
    sel.innerHTML = '<option value="">— mappe del progetto —</option>' + maps.map(m => `<option value="${m.id}">${m.id}</option>`).join('');
  },

  testInGame() {
    this.map.id = document.getElementById('mapId').value.trim() || this.map.id;
    PlayStudio.playCustomMap(this.map);
  }
};
window.MapEditor = MapEditor;
