// mapEditor.js — editor di mappe nel FORMATO REALE del gioco:
// { id, tiles[12x24], environments[{entity,tileType,x,y,settings}], enemies[{entity,x,y,settings}], markers[{label,x,y,settings}] }
// Anteprima fedele: arena + autotiling acqua/fossa (port da EntityTileHandler) + muri come sprite + y-sort.
// Supporto a: entità custom (caricate dall'utente), colori arena, selezione multipla con shift+drag.
const MapEditor = {
  canvas: null, ctx: null, map: null, tool: null, zoom: 1,
  history: [], hIndex: -1, showGrid: true,
  // selezione multipla
  selection: null, selectionStart: null, isSelecting: false,
  clipboard: null,

  init() {
    this.canvas = document.getElementById('mapCanvas');
    this.ctx = this.canvas.getContext('2d');
    const $ = (id) => document.getElementById(id);
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on('mapToolApply', 'click', () => this.setTool('wall'));
    on('mapToolWater', 'click', () => this.setTool('water'));
    on('mapToolDitch', 'click', () => this.setTool('ditch'));
    on('mapToolSpike', 'click', () => this.setTool('spike'));
    document.querySelectorAll('[data-enemy]').forEach(b => b.addEventListener('click', () => this.setTool('enemy:' + b.dataset.enemy)));
    on('mapToolPlayer', 'click', () => this.setTool('marker:P'));
    on('mapToolBoss', 'click', () => this.setTool('marker:B'));
    on('mapToolRandom', 'click', () => this.setTool('marker:E'));
    on('mapToolErase', 'click', () => this.setTool('erase'));
    on('mapUndo', 'click', () => this.undo());
    on('mapRedo', 'click', () => this.redo());
    on('mapGrid', 'change', e => { this.showGrid = e.target.checked; this.render(); });
    on('mapNew', 'click', () => { this.loadMap(GameData.emptyMap('easy-custom-' + (Date.now() % 1000))); });
    on('mapLoadSelect', 'change', e => {
      const m = GameData.maps.find(m => m.id === e.target.value);
      if (m) this.loadMap(GameData.cloneMap(m));
    });
    on('mapId', 'input', e => { if (this.map) this.map.id = e.target.value.trim(); });
    on('mapValidate', 'click', () => this.validate());
    on('mapTest', 'click', () => this.testInGame());
    on('mapSaveProject', 'click', () => this.saveToProject());
    on('mapProjectSelect', 'change', e => {
      const p = this.projectMaps().find(m => m.id === e.target.value);
      if (p) this.loadMap(GameData.cloneMap(p));
    });
    // azioni selezione
    on('selFill', 'click', () => this.selectionFill());
    on('selClear', 'click', () => this.selectionClear());
    on('selCopy', 'click', () => this.selectionCopy());
    on('selPaste', 'click', () => this.selectionPaste());
    on('selDelete', 'click', () => this.selectionDelete());
    if (this.canvas) {
      this.canvas.addEventListener('pointerdown', e => this.pointerDown(e));
      this.canvas.addEventListener('pointermove', e => this.pointerMove(e));
      this.canvas.addEventListener('pointerup', e => this.pointerUp(e));
      this.canvas.addEventListener('pointerleave', () => { const el = $('mapCursor'); if (el) el.textContent = ''; });
    }
    this.refreshCustomTools();
  },

  // ------------------------------------------------------------- entità custom
  refreshCustomTools() {
    const container = document.getElementById('customTools');
    if (!container) return;
    const customs = PlayStudio.getCustomClasses();
    if (!customs.length) { container.innerHTML = ''; return; }
    container.innerHTML = '<div class="muted" style="font-size:11px; margin-top:4px">Custom:</div>' +
      customs.map(c => {
        const icon = c.baseClass === 'EntityWall' ? '🧱' :
                     c.baseClass === 'EntitySpike' ? '🔺' : '👾';
        return `<button class="tool-btn" data-custom="${c.className}" title="${c.className} (extends ${c.baseClass})">${icon} ${c.className.replace(c.baseClass, '')}</button>`;
      }).join('');
    container.querySelectorAll('[data-custom]').forEach(b => b.addEventListener('click', () => this.setTool('custom:' + b.dataset.custom)));
  },

  // ------------------------------------------------------------- tool
  setTool(t) {
    this.tool = t;
    document.querySelectorAll('#tab-mappe .tool-btn').forEach(b => b.classList.remove('active'));
    let btn = document.querySelector(`#tab-mappe [data-tool="${t}"]`);
    if (!btn && t.startsWith('enemy:')) btn = document.querySelector(`#tab-mappe [data-enemy="${t.slice(6)}"]`);
    if (!btn && t.startsWith('custom:')) btn = document.querySelector(`#tab-mappe [data-custom="${t.slice(7)}"]`);
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
    const el = document.getElementById('mapCursor');
    if (el) el.textContent = c ? `cella (${c.x}, ${c.y})` : '';
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

  // ------------------------------------------------------------- pointer events (selezione + editing)
  pointerDown(e) {
    if (!this.map) return;
    const c = this.cellOf(e);
    if (!c) return;
    if (e.shiftKey) {
      // avvia selezione
      this.isSelecting = true;
      this.selectionStart = c;
      this.selection = { x: c.x, y: c.y, w: 1, h: 1 };
      this.render();
    } else {
      // editing normale
      this.pushHistory();
      if (this.selection) { this.selection = null; this.render(); }
      this.apply(e);
    }
  },

  pointerMove(e) {
    this.hover(e);
    const c = this.cellOf(e);
    if (!c) return;
    if (this.isSelecting && this.selectionStart) {
      const x0 = Math.min(this.selectionStart.x, c.x), y0 = Math.min(this.selectionStart.y, c.y);
      const x1 = Math.max(this.selectionStart.x, c.x), y1 = Math.max(this.selectionStart.y, c.y);
      this.selection = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      this.render();
    } else if (e.buttons && this.tool && !e.shiftKey) {
      this.apply(e);
    }
  },

  pointerUp(e) {
    if (this.isSelecting) {
      this.isSelecting = false;
      if (this.selection) {
        // mostra menu azione selezione
        const menu = document.getElementById('selectionMenu');
        if (menu) {
          menu.style.display = 'flex';
          const info = document.getElementById('selectionInfo');
          if (info) info.textContent = `Selezionate ${this.selection.w}×${this.selection.h} = ${this.selection.w * this.selection.h} celle`;
        }
      }
    }
  },

  // ------------------------------------------------------------- editing
  apply(e) {
    if (!this.map || !this.tool) return;
    const c = this.cellOf(e);
    if (!c) return;
    const T = GameData.tileTypes, m = this.map;
    const envOf = (x, y, entity) => m.environments.find(v => v.entity === entity && v.x === x && v.y === y);
    const envOfAny = (x, y) => m.environments.find(v => v.x === x && v.y === y);
    const enemyOf = (x, y, entity) => m.enemies.find(v => v.entity === entity && v.x === x && v.y === y);
    const enemyOfAny = (x, y) => m.enemies.find(v => v.x === x && v.y === y);
    const markerOf = (x, y, label) => m.markers.find(v => v.label === label && v.x === x && v.y === y);

    if (this.tool === 'wall') {
      if (m.tiles[c.y][c.x] === T.wall) return;
      m.tiles[c.y][c.x] = T.wall;
      // rimuovi eventuale environment custom/altro sulla stessa cella
      m.environments = m.environments.filter(v => !(v.x === c.x && v.y === c.y && v.entity !== 'EntityWall'));
      if (!envOf(c.x, c.y, 'EntityWall')) m.environments.push({ entity: 'EntityWall', tileType: T.wall, x: c.x, y: c.y, settings: {} });
    } else if (this.tool === 'water' || this.tool === 'ditch') {
      const v = T[this.tool];
      if (m.tiles[c.y][c.x] === v) return;
      m.tiles[c.y][c.x] = v;
      // acqua/fossa: solo griglia (bake); rimuovi muro/custom
      m.environments = m.environments.filter(v => !(v.x === c.x && v.y === c.y));
    } else if (this.tool === 'spike') {
      if (envOf(c.x, c.y, 'EntitySpike')) return;
      m.environments = m.environments.filter(v => !(v.x === c.x && v.y === c.y));
      m.environments.push({ entity: 'EntitySpike', tileType: T.none, x: c.x, y: c.y, settings: {} });
    } else if (this.tool.startsWith('enemy:')) {
      const entity = this.tool.slice(6);
      if (enemyOf(c.x, c.y, entity)) return;
      m.enemies = m.enemies.filter(v => !(v.x === c.x && v.y === c.y));
      m.enemies.push({ entity, x: c.x, y: c.y, settings: {} });
    } else if (this.tool.startsWith('custom:')) {
      const className = this.tool.slice(7);
      const customDef = PlayStudio.getCustomClasses().find(c => c.className === className);
      if (!customDef) return;
      const baseClass = customDef.baseClass;
      // rimuovi entità esistenti sulla cella
      m.environments = m.environments.filter(v => !(v.x === c.x && v.y === c.y));
      m.enemies = m.enemies.filter(v => !(v.x === c.x && v.y === c.y));
      if (baseClass === 'EntityWall') {
        m.tiles[c.y][c.x] = T.wall;
        m.environments.push({ entity: className, tileType: T.wall, x: c.x, y: c.y, settings: { custom: true } });
      } else if (baseClass === 'EntitySpike') {
        m.environments.push({ entity: className, tileType: T.none, x: c.x, y: c.y, settings: { custom: true } });
      } else {
        // nemico
        m.enemies.push({ entity: className, x: c.x, y: c.y, settings: { custom: true } });
      }
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

  // ------------------------------------------------------------- operazioni selezione
  selectionFill() {
    if (!this.selection) return;
    // riempi con il tool corrente (se è un tool tile/environment/enemy)
    if (!this.tool || this.tool === 'erase') { alert('Scegli un tool (muro/acqua/spuntoni/nemico) prima di riempire la selezione'); return; }
    this.pushHistory();
    const sel = this.selection, m = this.map;
    const fakeEvent = (x, y) => ({ clientX: 0, clientY: 0, _forceCell: { x, y } });
    // override temporaneo di cellOf per usare la cella forzata
    const orig = this.cellOf;
    for (let y = sel.y; y < sel.y + sel.h; y++) {
      for (let x = sel.x; x < sel.x + sel.w; x++) {
        this.cellOf = () => ({ x, y });
        this.apply(fakeEvent(x, y));
      }
    }
    this.cellOf = orig;
    this.render();
  },

  selectionClear() {
    this.selection = null;
    this.selectionStart = null;
    const menu = document.getElementById('selectionMenu');
    if (menu) menu.style.display = 'none';
    this.render();
  },

  selectionCopy() {
    if (!this.selection) return;
    const sel = this.selection, m = this.map;
    this.clipboard = {
      w: sel.w, h: sel.h,
      tiles: [],
      environments: [],
      enemies: [],
      markers: []
    };
    for (let y = 0; y < sel.h; y++) {
      this.clipboard.tiles.push(m.tiles[sel.y + y].slice(sel.x, sel.x + sel.w));
    }
    this.clipboard.environments = m.environments.filter(v => v.x >= sel.x && v.x < sel.x + sel.w && v.y >= sel.y && v.y < sel.y + sel.h)
      .map(v => ({ ...v, x: v.x - sel.x, y: v.y - sel.y }));
    this.clipboard.enemies = m.enemies.filter(v => v.x >= sel.x && v.x < sel.x + sel.w && v.y >= sel.y && v.y < sel.y + sel.h)
      .map(v => ({ ...v, x: v.x - sel.x, y: v.y - sel.y }));
    this.clipboard.markers = m.markers.filter(v => v.x >= sel.x && v.x < sel.x + sel.w && v.y >= sel.y && v.y < sel.y + sel.h)
      .map(v => ({ ...v, x: v.x - sel.x, y: v.y - sel.y }));
    this.setStatus('✓ copiato ' + sel.w + '×' + sel.h);
  },

  selectionPaste() {
    if (!this.clipboard) { alert('Niente negli appunti. Usa Copia prima.'); return; }
    // incolla a partire dalla cella angolo alto-sinistra della selezione corrente
    // (o a 0,0 se nessuna selezione)
    const ox = this.selection ? this.selection.x : 0;
    const oy = this.selection ? this.selection.y : 0;
    this.pushHistory();
    const m = this.map, T = GameData.tileTypes, cb = this.clipboard;
    for (let y = 0; y < cb.h; y++) {
      for (let x = 0; x < cb.w; x++) {
        const tx = ox + x, ty = oy + y;
        if (tx >= m.tiles[0].length || ty >= m.tiles.length) continue;
        m.tiles[ty][tx] = cb.tiles[y][x];
      }
    }
    // rimuovi environments/enemies/markers nella zona di destinazione
    m.environments = m.environments.filter(v => !(v.x >= ox && v.x < ox + cb.w && v.y >= oy && v.y < oy + cb.h));
    m.enemies = m.enemies.filter(v => !(v.x >= ox && v.x < ox + cb.w && v.y >= oy && v.y < oy + cb.h));
    m.markers = m.markers.filter(v => !(v.label !== 'P' && v.x >= ox && v.x < ox + cb.w && v.y >= oy && v.y < oy + cb.h));
    // incolla contents
    cb.environments.forEach(v => m.environments.push({ ...v, x: v.x + ox, y: v.y + oy }));
    cb.enemies.forEach(v => m.enemies.push({ ...v, x: v.x + ox, y: v.y + oy }));
    cb.markers.forEach(v => m.markers.push({ ...v, x: v.x + ox, y: v.y + oy }));
    this.render();
    this.setStatus('✓ incollato ' + cb.w + '×' + cb.h);
  },

  selectionDelete() {
    if (!this.selection) return;
    this.pushHistory();
    const sel = this.selection, m = this.map, T = GameData.tileTypes;
    for (let y = sel.y; y < sel.y + sel.h; y++) {
      for (let x = sel.x; x < sel.x + sel.w; x++) {
        m.tiles[y][x] = T.none;
      }
    }
    m.environments = m.environments.filter(v => !(v.x >= sel.x && v.x < sel.x + sel.w && v.y >= sel.y && v.y < sel.y + sel.h));
    m.enemies = m.enemies.filter(v => !(v.x >= sel.x && v.x < sel.x + sel.w && v.y >= sel.y && v.y < sel.y + sel.h));
    m.markers = m.markers.filter(v => !(v.label !== 'P' && v.x >= sel.x && v.x < sel.x + sel.w && v.y >= sel.y && v.y < sel.y + sel.h));
    this.render();
  },

  setStatus(msg) { if (window.App) window.App.setStatus(msg, true); },

  // ------------------------------------------------------------- rendering (anteprima fedele)
  render() {
    if (!this.map) return;
    const ctx = this.ctx, T = GameData.tileTypes, ts = GameData.tileset;
    const W = this.map.tiles[0].length, H = this.map.tiles.length, S = ts.tileSize;
    // colore arena: da patch se presente, altrimenti default
    const patches = PlayStudio.patches();
    const arenaColor = (patches.colors && patches.colors.arena) || ts.backgroundColor;
    ctx.fillStyle = arenaColor; ctx.fillRect(0, 0, W * S, H * S);
    // arena + autotile bake (identico al gioco)
    const baked = GameData.buildTileCanvas(this.map.tiles);
    ctx.drawImage(baked, ts.backgroundOffset.x, ts.backgroundOffset.y);
    // entità environment y-sorted
    const draws = [];
    const customs = PlayStudio.getCustomClasses();
    for (const env of this.map.environments) {
      if (env.entity === 'EntityWall') {
        draws.push({ y: env.y, z: 2, draw: () => GameData.drawRegion(ctx, 'media/graphics/game/environments/tile-wall.png', env.x * S, env.y * S - 30) });
      } else if (env.entity === 'EntitySpike') {
        draws.push({ y: env.y, z: -1, draw: () => GameData.drawRegion(ctx, 'media/graphics/game/environments/tile-spike.png', env.x * S, env.y * S - 2) });
      } else {
        // entità custom: cerca la definizione
        const customDef = customs.find(c => c.className === env.entity);
        if (customDef) {
          // disegna dalla sprite addition
          const fd = GameData.frameFor(customDef.spritePath);
          if (fd) {
            const w = customDef.w, h = customDef.h;
            const dy = customDef.baseClass === 'EntityWall' ? env.y * S - (h - S) : env.y * S;
            draws.push({ y: env.y, z: customDef.baseClass === 'EntitySpike' ? -1 : 2, draw: () => GameData.drawRegion(ctx, customDef.spritePath, env.x * S + (S - w) / 2, dy) });
          } else {
            // fallback: quadrato magenta
            draws.push({ y: env.y, z: 0, draw: () => { ctx.fillStyle = '#ff00ff'; ctx.fillRect(env.x * S + 5, env.y * S + 5, S - 10, S - 10); } });
          }
        }
      }
    }
    for (const en of this.map.enemies) {
      const cat = GameData.entities.find(x => x.entity === en.entity);
      const customDef = !cat ? customs.find(c => c.className === en.entity) : null;
      const sh = cat && cat.sheet;
      if (sh && sh.path) {
        draws.push({ y: en.y, z: 1, draw: () => GameData.drawRegion(ctx, sh.path, en.x * S + (S - sh.w) / 2, en.y * S + S - sh.h + 8, { frameW: sh.w, frameH: sh.h }) });
      } else if (customDef) {
        const fd = GameData.frameFor(customDef.spritePath);
        if (fd) {
          const w = customDef.w, h = customDef.h;
          draws.push({ y: en.y, z: 1, draw: () => GameData.drawRegion(ctx, customDef.spritePath, en.x * S + (S - w) / 2, en.y * S + S - h + 8, { frameW: w, frameH: h }) });
        } else {
          draws.push({ y: en.y, z: 1, draw: () => { ctx.fillStyle = '#ff00ff'; ctx.fillRect(en.x * S + 15, en.y * S + 15, 30, 30); } });
        }
      } else {
        draws.push({ y: en.y, z: 1, draw: () => { ctx.fillStyle = '#ff00ff'; ctx.fillRect(en.x * S + 15, en.y * S + 15, 30, 30); } });
      }
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
      ctx.strokeStyle = 'rgba(120,220,255,.8)'; ctx.setLineDash([6, 4]);
      ctx.strokeRect(W * S / 2 - 60, 0, 120, S); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(120,220,255,.9)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('portale (auto)', W * S / 2, 14);
    }
    // selezione
    if (this.selection) {
      ctx.strokeStyle = '#2f6fed';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(this.selection.x * S, this.selection.y * S, this.selection.w * S, this.selection.h * S);
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
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
    // verifica entità custom: controlla che tutte quelle riferite esistano nelle patch
    const customRefs = new Set();
    m.environments.forEach(v => { if (v.entity !== 'EntityWall' && v.entity !== 'EntitySpike' && !GameData.entities.find(e => e.entity === v.entity)) customRefs.add(v.entity); });
    m.enemies.forEach(v => { if (!GameData.entities.find(e => e.entity === v.entity)) customRefs.add(v.entity); });
    const customClasses = PlayStudio.getCustomClasses();
    const missing = [...customRefs].filter(c => !customClasses.find(cc => cc.className === c));
    if (missing.length) out.push(['warn', `Entità custom riferite non più definite: ${missing.join(', ')}. Crea di nuovo l'entità custom o rimuovi le celle.`]);
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
