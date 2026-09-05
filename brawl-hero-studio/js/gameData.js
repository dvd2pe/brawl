// gameData.js — Carica e parsa gli asset REALI del gioco (game.js + texture packed).
// Nessun upload: tutto parte dai file presenti in ../game.js e ../media/graphics/packed/.
const GameData = {
  loaded: false,
  raw: null,            // sorgente game.js
  packer: null,         // { textures: ['texture-2', ...], json: [ {frames, meta}, ... ] } allineati per indice
  images: [],           // HTMLImageElement per ogni texture (dal disco)
  canvases: [],         // canvas master editabile per ogni texture
  dirty: [],            // texture modificata e non ancora esportata in patch
  maps: [],             // mappe reali parseate da game.js
  mapBuckets: {},       // { easy: [...], normal: [...], ... } -> array di map objects
  sheets: [],           // { cls, prop, path, w, h }  (ig.AnimationSheet dichiarate nelle classi)
  anims: [],            // { cls, name, dir, prop, fps, frames } (addAnimation)
  tileset: null,        // _TILESET del gioco
  tileTypes: null,      // _TILE_TYPE del gioco
  entities: [],         // catalogo entità piazzabili (formato reale)

  // ------------------------------------------------------------- boot
  async load(onProgress) {
    if (this.loaded) return;
    onProgress = onProgress || function () {};
    onProgress('Letturo ../game.js ...');
    const res = await fetch('../game.js?v=' + Date.now());
    if (!res.ok) throw new Error('game.js non raggiungibile (' + res.status + '). Serve un server locale.');
    this.raw = await res.text();

    onProgress('Parso gli atlas packerplugin ...');
    this._parsePacker();

    onProgress('Carico le immagini texture ...');
    for (let i = 0; i < this.packer.textures.length; i++) {
      const img = await this._loadImage('../media/graphics/packed/' + this.packer.textures[i] + '.png');
      this.images[i] = img;
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      this.canvases[i] = c;
      this.dirty[i] = false;
    }

    onProgress('Parso le mappe ...');
    this._parseMaps();

    onProgress('Parso animazioni e tileset ...');
    this._parseSheets();
    this._parseTileData();
    this._buildEntityCatalog();

    this.loaded = true;
    onProgress('Asset di gioco caricati.');
  },

  // ------------------------------------------------------------- packerplugin
  _parsePacker() {
    const src = this.raw;
    const tHead = src.indexOf("window['packerplugin']");
    if (tHead < 0) throw new Error('packerplugin non trovato in game.js');
    const mTex = src.slice(tHead, tHead + 400).match(/'textures':\s*\[([^\]]+)\]/);
    if (!mTex) throw new Error('lista texture non trovata');
    const textures = mTex[1].match(/'([^']+)'/g).map(s => s.replace(/'/g, ''));
    const json = [];
    for (const name of textures) {
      const needle = "['json']['" + name + "'] = '";
      const i = src.indexOf(needle);
      if (i < 0) throw new Error('JSON atlas non trovato per ' + name);
      const start = i + needle.length;
      const end = src.indexOf("'", start);
      const decoded = src.slice(start, end).replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      json.push(JSON.parse(decoded));
    }
    this.packer = { textures, json };
  },

  // ------------------------------------------------------------- mappe (brace matching + eval dati puri)
  _parseMaps() {
    const src = this.raw;
    // bucket da _GAMEMAPS
    const gStart = src.indexOf('_GAMEMAPS = {');
    const gBlock = src.slice(gStart, src.indexOf('};', gStart));
    this.mapBuckets = {};
    const referenced = new Set();
    const bm = gBlock.match(/'(easy|normal|hard|boss|tutorial)':\s*\[([^\]]*)\]/g) || [];
    for (const entry of bm) {
      const m = entry.match(/'(easy|normal|hard|boss|tutorial)':\s*\[([^\]]*)\]/);
      const names = (m[2].match(/Map\w+/g) || []);
      this.mapBuckets[m[1]] = names;
      names.forEach(n => referenced.add(n));
    }
    // ogni Mapxxx = {...}; con bilanciamento delle graffe
    const mapsByName = {};
    const re = /\b(Map\w+)\s*=\s*\{/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const name = m[1];
      if (!referenced.has(name) || mapsByName[name]) continue;
      const body = this._extractBraces(src, m.index + m[0].length - 1);
      if (!body) continue;
      try {
        const data = new Function('return (' + body + ')')();
        if (data && data.id && Array.isArray(data.tiles)) mapsByName[name] = data;
      } catch (e) { console.warn('Map ' + name + ' non parsata:', e); }
    }
    this.maps = Object.values(mapsByName);
    this.mapsByName = mapsByName;
    this.mapBuckets = Object.fromEntries(Object.entries(this.mapBuckets).map(([k, names]) =>
      [k, names.map(n => mapsByName[n]).filter(Boolean)]));
  },

  _extractBraces(src, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
      else if (c === '"' || c === "'") { i = src.indexOf(c, i + 1); if (i < 0) return null; }
    }
    return null;
  },

  // ------------------------------------------------------------- AnimationSheet + addAnimation
  _parseSheets() {
    const src = this.raw;
    // indici di inizio classe per attribuire le dichiarazioni
    const classMarks = [];
    const cre = /\b(Entity\w+)\s*=\s*[A-Za-z_$[\]'"]+?['"]?extend\b/g;
    let cm;
    while ((cm = cre.exec(src)) !== null) classMarks.push({ idx: cm.index, cls: cm[1] });
    const ownerOf = (idx) => {
      let lo = 0, hi = classMarks.length - 1, best = null;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (classMarks[mid].idx <= idx) { best = classMarks[mid]; lo = mid + 1; } else hi = mid - 1; }
      return best ? best.cls : null;
    };
    this.sheets = [];
    const sre = /\['AnimationSheet'\]\('([^']+)',\s*(0x[0-9a-fA-F]+|\d+),\s*(0x[0-9a-fA-F]+|\d+)\)/g;
    let sm;
    while ((sm = sre.exec(src)) !== null) {
      this.sheets.push({ cls: ownerOf(sm.index), prop: null, path: sm[1], w: this._num(sm[2]), h: this._num(sm[3]) });
    }
    // prop (animSheet_down ecc.) — assegnata alle voci già trovate, senza duplicare
    const spre = /\b(animSheet\w*)\s*=\s*new\s*ig\['AnimationSheet'\]\('([^']+)',\s*(0x[0-9a-fA-F]+|\d+),\s*(0x[0-9a-fA-F]+|\d+)\)/g;
    while ((sm = spre.exec(src)) !== null) {
      const prop = sm[1], path = sm[2];
      const entry = this.sheets.find(s => s.prop === null && s.path === path && s.cls === ownerOf(sm.index));
      if (entry) entry.prop = prop;
      else this.sheets.push({ cls: ownerOf(sm.index), prop, path, w: this._num(sm[3]), h: this._num(sm[4]) });
    }
    // addAnimation (tollerante: name, dirs?, sheetProp, fps, [frames])
    this.anims = [];
    const are = /\['addAnimation'\]\('(\w+)',\s*this\['directions'\]\['(\w+)'\],\s*this\['(animSheet\w*)'\],\s*([0-9.]+),\s*\[([^\]]*)\]/g;
    let am;
    while ((am = are.exec(src)) !== null) {
      this.anims.push({
        cls: ownerOf(am.index), name: am[1], dir: am[2], prop: am[3], fps: parseFloat(am[4]),
        frames: am[5].split(',').map(s => this._num(s.trim())).filter(n => !isNaN(n))
      });
    }
  },

  _num(s) { return /^0x/i.test(s) ? parseInt(s, 16) : parseFloat(s); },

  _parseTileData() {
    const src = this.raw;
    let i = src.indexOf('_TILESET = {');
    this.tileset = new Function('return (' + this._extractBraces(src, src.indexOf('{', i)) + ')')();
    i = src.indexOf('_TILE_TYPE = {');
    this.tileTypes = new Function('return (' + this._extractBraces(src, src.indexOf('{', i)) + ')')();
  },

  // ------------------------------------------------------------- catalogo entità piazzabili
  _buildEntityCatalog() {
    const T = this.tileTypes;
    const sheetOf = (cls, prop) => this.sheets.find(s => s.cls === cls && (!prop || s.prop === prop));
    const envBase = (cls, spritePath, label, tileType, needsTile, icon) => {
      const sh = sheetOf(cls, 'animSheet') || { path: spritePath, w: 60, h: 60 };
      return { entity: cls, label, icon, kind: 'environment', tileType, needsTile, sheet: sh };
    };
    const enemy = (cls, label) => {
      const sh = sheetOf(cls, 'animSheet_down') || sheetOf(cls) || {};
      return { entity: cls, label, icon: '👾', kind: 'enemy', tileType: null, needsTile: false, sheet: sh };
    };
    this.entities = [
      envBase('EntityWall', 'media/graphics/game/environments/tile-wall.png', 'Muro', T.wall, true, '🧱'),
      envBase('EntitySpike', 'media/graphics/game/environments/tile-spike.png', 'Spuntoni', null, false, '🔺'),
      enemy('EntitySlime', 'Slime'),
      enemy('EntityMushroom', 'Mushroom'),
      enemy('EntityBowldog', 'Bowldog'),
      enemy('EntityCactus', 'Cactus'),
      enemy('EntityDrone', 'Drone'),
      { entity: 'BOSS', label: 'Boss (dal gioco)', icon: '👑', kind: 'marker', marker: 'B', tileType: null, needsTile: false, sheet: {} },
      { entity: 'ENEMY_RANDOM', label: 'Nemico random', icon: '❓', kind: 'marker', marker: 'E', tileType: null, needsTile: false, sheet: {} },
      { entity: 'PLAYER', label: 'Spawn Player', icon: '🧑', kind: 'marker', marker: 'P', tileType: null, needsTile: false, sheet: sheetOf('EntityPlayer') || {} }
    ];
  },

  // ------------------------------------------------------------- utility sprite
  frameFor(path) {
    if (!this.packer) return null;
    for (let i = 0; i < this.packer.json.length; i++) {
      const f = this.packer.json[i].frames[path];
      if (f) return { texIndex: i, texture: this.packer.textures[i], ...f };
    }
    return null;
  },

  // disegna la regione (o l'n-esimo frame di un foglio animato) su un ctx
  drawRegion(ctx, path, dx, dy, opts) {
    opts = opts || {};
    const fd = this.frameFor(path);
    if (!fd) return false;
    const img = this.canvases[fd.texIndex];
    const f = fd.frame;
    if (opts.frameW) {           // n-esimo frame dentro la regione
      const cols = Math.floor(f.w / opts.frameW);
      const idx = opts.frameIndex || 0;
      const sx = f.x + (idx % cols) * opts.frameW;
      const sy = f.y + Math.floor(idx / cols) * (opts.frameH || opts.frameW);
      if (opts.flip) {
        ctx.save(); ctx.translate(dx + opts.frameW, dy); ctx.scale(-1, 1);
        ctx.drawImage(img, sx, sy, opts.frameW, opts.frameH || opts.frameW, 0, 0, opts.frameW, opts.frameH || opts.frameW);
        ctx.restore();
      } else {
        ctx.drawImage(img, sx, sy, opts.frameW, opts.frameH || opts.frameW, dx, dy, opts.frameW, opts.frameH || opts.frameW);
      }
      return true;
    }
    ctx.drawImage(img, f.x, f.y, f.w, f.h, dx, dy, f.w, f.h);
    return true;
  },

  // canvas contenente la regione (per editing)
  extractRegion(path) {
    const fd = this.frameFor(path);
    if (!fd) return null;
    const c = document.createElement('canvas');
    c.width = fd.frame.w; c.height = fd.frame.h;
    c.getContext('2d').drawImage(this.canvases[fd.texIndex], fd.frame.x, fd.frame.y, fd.frame.w, fd.frame.h, 0, 0, fd.frame.w, fd.frame.h);
    return c;
  },

  // riscrive la regione nel canvas master (stesse dimensioni)
  writeRegion(path, sourceCanvas) {
    const fd = this.frameFor(path);
    if (!fd) throw new Error('path non in atlante: ' + path);
    if (sourceCanvas.width !== fd.frame.w || sourceCanvas.height !== fd.frame.h) {
      throw new Error('Le dimensioni devono restare ' + fd.frame.w + 'x' + fd.frame.h + ' (repack per cambiare dimensione)');
    }
    const ctx = this.canvases[fd.texIndex].getContext('2d');
    ctx.clearRect(fd.frame.x, fd.frame.y, fd.frame.w, fd.frame.h);
    ctx.drawImage(sourceCanvas, fd.frame.x, fd.frame.y);
    this.dirty[fd.texIndex] = true;
  },

  textureDataURL(texIndex) { return this.canvases[texIndex].toDataURL('image/png'); },

  // ------------------------------------------------------------ autotiling (port di EntityTileHandler)
  convertTile(tiles, x, y) {
    const TT = this.tileTypes;
    const t = tiles[y][x];
    if (t === TT.none) return { type: TT.none, background: null, foreground: null };
    const H = tiles.length, W = tiles[y].length;
    const at = (xx, yy) => (yy >= 0 && yy < H && xx >= 0 && xx < tiles[yy].length) ? tiles[yy][xx] : null;
    const topLeftSame = at(x - 1, y - 1) === t, topRightSame = at(x + 1, y - 1) === t;
    const leftSame = at(x - 1, y) === t, rightSame = at(x + 1, y) === t, bottomSame = at(x, y + 1) === t;
    const bg = this.tileset.backgroundID, fg = this.tileset.foregroundID;
    const bgA = [], fgA = [];
    const out = { type: t, background: bgA, foreground: fgA };
    if (at(x, y - 1) === t) {
      bgA[0] = bgA[1] = bgA[2] = bgA[4] = bg.full; fgA[1] = fg.none; fgA[4] = fg.none;
      if (topLeftSame && leftSame) { bgA[3] = bg.full; fgA[0] = fg.none; fgA[3] = fg.none; }
      else if (topLeftSame) { bgA[3] = bg.covered; fgA[0] = fg.cliffTop; fgA[3] = fg.side; }
      else if (leftSame) { bgA[3] = bg.full; fgA[0] = fg.cliffBottom; fgA[3] = fg.cliffBottomShadow; }
      else { bgA[3] = bg.covered; fgA[0] = fg.side; fgA[3] = fg.side; }
      if (topRightSame && rightSame) { bgA[5] = bg.full; fgA[2] = fg.none; fgA[5] = fg.none; }
      else if (topRightSame) { bgA[5] = bg.covered; fgA[2] = fg.cliffTop; fgA[5] = fg.side; }
      else if (rightSame) { bgA[5] = bg.full; fgA[2] = fg.cliffBottom; fgA[5] = fg.cliffBottomShadow; }
      else { bgA[5] = bg.covered; fgA[2] = fg.side; fgA[5] = fg.side; }
    } else {
      bgA[1] = bgA[4] = bg.covered; fgA[1] = fg.top; fgA[4] = fg.topShadow;
      if (leftSame) { bgA[0] = bgA[3] = bg.full; fgA[0] = fg.top; fgA[3] = fg.topShadow; }
      else { bgA[0] = bgA[3] = bg.covered; fgA[0] = fg.topCorner; fgA[3] = fg.topCornerShadow; }
      if (rightSame) { bgA[2] = bgA[5] = bg.full; fgA[2] = fg.top; fgA[5] = fg.topShadow; }
      else { bgA[2] = bgA[5] = bg.covered; fgA[2] = fg.topCorner; fgA[5] = fg.topCornerShadow; }
    }
    if (bottomSame) {
      bgA[7] = bg.full; fgA[7] = fg.none;
      bgA[6] = leftSame ? bg.full : bg.covered; fgA[6] = leftSame ? fg.none : fg.side;
      bgA[8] = rightSame ? bg.full : bg.covered; fgA[8] = rightSame ? fg.none : fg.side;
    } else {
      bgA[7] = bg.covered; fgA[7] = fg.none;
      bgA[6] = leftSame ? bg.full : bg.covered; fgA[6] = leftSame ? fg.none : fg.bottomCorner;
      bgA[8] = rightSame ? bg.full : bg.covered; fgA[8] = rightSame ? fg.none : fg.bottomCorner;
    }
    return out;
  },

  // port di EntityTileHandler.generateCanvasImage: arena + acqua/fossa autotiled su un canvas
  buildTileCanvas(tiles) {
    const ts = this.tileset;
    const tileSize = ts.tileSize, sts = ts.subTileSize;
    const cols = Math.ceil(tileSize / sts);
    const arenaFd = this.frameFor(ts.images.background);
    const w = arenaFd ? arenaFd.frame.w : tiles[0].length * tileSize, h = arenaFd ? arenaFd.frame.h : tiles.length * tileSize;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (arenaFd) ctx.drawImage(this.canvases[arenaFd.texIndex], arenaFd.frame.x, arenaFd.frame.y, arenaFd.frame.w, arenaFd.frame.h, 0, 0, w, h);
    // immagini autotile per tipo
    const tileImages = {};
    for (const name of ['water', 'ditch']) {
      tileImages[ts ? this.tileTypes[name] : 0] = Object.fromEntries(
        Object.entries(ts.images[name]).map(([k, p]) => [k, this.frameFor(p)]));
    }
    const fgPiece = ['', 'top', 'topShadow', 'side', 'topCorner', 'topCornerShadow', 'bottomCorner', 'cliffTop', 'cliffBottom', 'cliffBottomShadow'];
    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < tiles[y].length; x++) {
        const cell = this.convertTile(tiles, x, y);
        const imgs = tileImages[cell.type];
        if (!imgs || !cell.background) continue;
        const dx = x * tileSize - ts.backgroundOffset.x, dy = y * tileSize - ts.backgroundOffset.y;
        for (let i = 0; i < 9; i++) {
          const col = i % cols, row = Math.floor(i / cols);
          const bgf = imgs[cell.background[i] === ts.backgroundID.covered ? 'covered' : 'full'];
          if (!bgf) continue;
          ctx.drawImage(this.canvases[bgf.texIndex],
            bgf.frame.x + col * sts, bgf.frame.y + row * sts, sts, sts,
            dx + col * sts, dy + row * sts, sts, sts);
        }
        for (let i = 0; i < 9; i++) {
          const v = cell.foreground[i];
          if (!v) continue;
          const piece = imgs[fgPiece[v]];
          if (!piece) continue;
          const col = i % cols, row = Math.floor(i / cols);
          const px = dx + col * sts, py = dy + row * sts;
          if (col === cols - 1) { // ultimo colonna = flip orizzontale (come drawTileCtx)
            ctx.save(); ctx.translate(px + sts, py); ctx.scale(-1, 1);
            ctx.drawImage(this.canvases[piece.texIndex], piece.frame.x, piece.frame.y, sts, sts, 0, 0, sts, sts);
            ctx.restore();
          } else {
            ctx.drawImage(this.canvases[piece.texIndex], piece.frame.x, piece.frame.y, sts, sts, px, py, sts, sts);
          }
        }
      }
    }
    return canvas;
  },

  // ------------------------------------------------------------ fogli di un'entità (per preview/skin)
  sheetsOf(cls) { return this.sheets.filter(s => s.cls === cls); },
  sheetOf(cls, prop) {
    return this.sheets.find(s => s.cls === cls && (!prop || s.prop === prop)) ||
           this.sheets.find(s => s.cls === cls);
  },
  animsOf(cls, name) { return this.anims.filter(a => a.cls === cls && a.name === name); },

  emptyMap(id) {
    const W = 12, H = 24, T = this.tileTypes;
    const tiles = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        const edge = (y === 0 || y === H - 1) ? (x < 3 || x >= W - 3 ? T.wall : T.none) : (x === 0 || x === W - 1 ? T.wall : T.none);
        row.push(edge);
      }
      tiles.push(row);
    }
    const environments = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (tiles[y][x] === T.wall) environments.push({ entity: 'EntityWall', tileType: T.wall, x, y, settings: {} });
    return { id: id || 'easy-custom-1', tiles, environments, enemies: [], markers: [{ label: 'P', x: Math.floor(W / 2), y: H - 2, settings: {} }] };
  },

  cloneMap(map) {
    return JSON.parse(JSON.stringify(map));
  }
};
window.GameData = GameData;
