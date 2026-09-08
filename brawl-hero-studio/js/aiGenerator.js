// aiGenerator.js — AI Sprite Generator client v3
// Features:
// - NO pixel art — uses "clean digital illustration" style
// - Reference image system: first generated pose → reference for subsequent poses
// - Prompt library: save/load prompts + references for reuse
// - Queue system: batch generation of multiple poses
// - RPG action templates: detailed walk cycle (left/right leg), combat, etc.
// - Terrain/object templates: grass, water, chest, portal
// - UI templates: buttons, dialogs
// - Async pattern (POST + poll GET) to avoid proxy timeout

const AIGenerator = {
  // ---- Style prefix (NO pixel art — clean digital illustration)
  STYLE_PREFIX: 'clean digital illustration, hand-drawn cartoon adventure game style, smooth shading, vibrant colors, NOT pixel art, NOT pixelated',

  // ---- Templates: character, terrain, objects, UI
  TEMPLATES: {
    // === CHARACTER ACTIONS (detailed RPG breakdown) ===
    'char-walk-down-rest': {
      category: 'character', label: '🧑 Walk Down — Rest', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, standing neutral pose, facing towards the camera (down view). Top-down 3-quarter view adventure game style like Zelda. Character stands upright, arms relaxed at sides, feet together. Full body visible, centered.'
    },
    'char-walk-down-step1': {
      category: 'character', label: '🧑 Walk Down — Left Leg Forward', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, walking mid-stride with LEFT leg forward and right leg back, facing towards the camera (down view). Top-down 3-quarter view adventure game style. Arms swinging naturally with opposite leg. Full body visible, centered.'
    },
    'char-walk-down-step2': {
      category: 'character', label: '🧑 Walk Down — Right Leg Forward', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, walking mid-stride with RIGHT leg forward and left leg back, facing towards the camera (down view). Top-down 3-quarter view adventure game style. Arms swinging naturally with opposite leg. Full body visible, centered.'
    },
    'char-walk-up-rest': {
      category: 'character', label: '🧑 Walk Up — Rest', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, standing neutral pose, facing AWAY from the camera (up view, back view). Top-down adventure game style. Character stands upright. Full body visible, centered. Back of character visible.'
    },
    'char-walk-up-step1': {
      category: 'character', label: '🧑 Walk Up — Left Leg', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, walking with LEFT leg forward, facing away from camera (up view). Top-down adventure game style. Back of character visible. Full body, centered.'
    },
    'char-walk-up-step2': {
      category: 'character', label: '🧑 Walk Up — Right Leg', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, walking with RIGHT leg forward, facing away from camera (up view). Top-down adventure game style. Back of character visible. Full body, centered.'
    },
    'char-walk-side-rest': {
      category: 'character', label: '🧑 Walk Side — Rest', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, standing neutral sideways pose (right-facing profile view). Side-scrolling adventure game style. Character stands upright, arms at sides. Full body visible, centered, facing right.'
    },
    'char-walk-side-step1': {
      category: 'character', label: '🧑 Walk Side — Front Step', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, walking sideways with front leg extended forward, right-facing profile view. Side-scrolling adventure game style. Arms swinging. Full body visible, centered, facing right.'
    },
    'char-walk-side-step2': {
      category: 'character', label: '🧑 Walk Side — Back Step', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, walking sideways with back leg extended behind, right-facing profile view. Side-scrolling adventure game style. Arms swinging. Full body visible, centered, facing right.'
    },
    'char-attack-raise': {
      category: 'character', label: '⚔️ Attack — Raise Weapon', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, raising a weapon above the head preparing to strike, facing towards camera (down view). Top-down adventure game style. Arms raised high, weapon vertical. Full body visible, centered.'
    },
    'char-attack-swing': {
      category: 'character', label: '⚔️ Attack — Swing', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, swinging weapon downward in an attack, facing towards camera (down view). Top-down adventure game style. Weapon mid-swing, arms extended. Full body visible, centered.'
    },
    'char-attack-recover': {
      category: 'character', label: '⚔️ Attack — Recover', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, recovering from attack, weapon lowered, facing towards camera (down view). Top-down adventure game style. Arms coming down, weapon at side. Full body visible, centered.'
    },
    'char-throw-raise': {
      category: 'character', label: '🏹 Throw — Raise', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, drawing back arm to throw a projectile, facing towards camera (down view). Top-down adventure game style. Arm pulled back, body coiled. Full body visible, centered.'
    },
    'char-throw-release': {
      category: 'character', label: '🏹 Throw — Release', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, releasing a projectile, arm extended forward, facing towards camera (down view). Top-down adventure game style. Arm fully extended, projectile leaving hand. Full body visible, centered.'
    },
    'char-hurt': {
      category: 'character', label: '💢 Hurt', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, hurt/reeling pose, staggering backward, facing towards camera (down view). Top-down adventure game style. Body leaning back, arms flailing. Full body visible, centered.'
    },
    'char-idle': {
      category: 'character', label: '🧑 Idle', w: 150, h: 160, frames: 1,
      prompt: 'Single character frame, idle breathing pose, slight chest expansion, facing towards camera (down view). Top-down 3-quarter view adventure game style. Relaxed stance. Full body visible, centered.'
    },

    // === TERRAIN TILES ===
    'tile-grass': {
      category: 'terrain', label: '🌱 Grass Tile', w: 60, h: 60, frames: 1,
      prompt: 'Single grass terrain tile, top-down view, lush green grass with small flowers, 60x60 pixels. Clean digital illustration adventure game style. Tiled seamlessly. Centered, fills entire frame.'
    },
    'tile-water': {
      category: 'terrain', label: '💧 Water Tile', w: 60, h: 60, frames: 1,
      prompt: 'Single water terrain tile, top-down view, blue water with gentle ripples and reflections, 60x60 pixels. Clean digital illustration adventure game style. Tiled seamlessly. Centered, fills entire frame.'
    },
    'tile-stone-floor': {
      category: 'terrain', label: '🪨 Stone Floor Tile', w: 60, h: 60, frames: 1,
      prompt: 'Single stone floor tile, top-down view, grey cobblestone pattern, 60x60 pixels. Clean digital illustration adventure game style. Tiled seamlessly. Centered, fills entire frame.'
    },
    'tile-lava': {
      category: 'terrain', label: '🌋 Lava Tile', w: 60, h: 60, frames: 1,
      prompt: 'Single lava terrain tile, top-down view, glowing orange-red molten lava with cracks, 60x60 pixels. Clean digital illustration adventure game style. Tiled seamlessly. Centered, fills entire frame.'
    },
    'tile-sand': {
      category: 'terrain', label: '🏖️ Sand Tile', w: 60, h: 60, frames: 1,
      prompt: 'Single sand terrain tile, top-down view, golden desert sand with subtle dune patterns, 60x60 pixels. Clean digital illustration adventure game style. Tiled seamlessly. Centered, fills entire frame.'
    },

    // === MAP OBJECTS ===
    'obj-chest': {
      category: 'object', label: '📦 Treasure Chest', w: 60, h: 60, frames: 1,
      prompt: 'Single treasure chest, top-down view, wooden chest with gold trim and lock, 60x60 pixels. Clean digital illustration adventure game style. Centered, fills frame.'
    },
    'obj-portal': {
      category: 'object', label: '🌀 Dungeon Portal', w: 60, h: 60, frames: 4,
      prompt: 'Single dungeon portal, swirling purple-blue energy vortex, top-down view, 60x60 pixels. Clean digital illustration adventure game style. Glowing magical effect. Centered, fills frame.'
    },
    'obj-torch': {
      category: 'object', label: '🔥 Torch', w: 60, h: 99, frames: 4,
      prompt: 'Single wall torch with animated flame, top-down view, 60x99 pixels. Clean digital illustration adventure game style. Flame flickering. Centered.'
    },
    'obj-sign': {
      category: 'object', label: '🪧 Sign Post', w: 60, h: 80, frames: 1,
      prompt: 'Single wooden sign post, top-down view, 60x80 pixels. Clean digital illustration adventure game style. Centered.'
    },
    'obj-potion': {
      category: 'object', label: '🧪 Potion', w: 40, h: 40, frames: 1,
      prompt: 'Single health potion bottle, top-down view, red liquid in glass vial, 40x40 pixels. Clean digital illustration adventure game style. Centered.'
    },
    'obj-firepit': {
      category: 'object', label: '🔥 Firepit', w: 60, h: 60, frames: 4,
      prompt: 'Single firepit with animated flames, stone base with logs and dancing fire, top-down view, 60x60 pixels. Clean digital illustration adventure game style. Centered.'
    },

    // === UI ELEMENTS ===
    'ui-btn-play': {
      category: 'ui', label: '▶️ Play Button', w: 200, h: 60, frames: 1,
      prompt: 'Single play button, green rounded rectangle with white play triangle icon, 200x60 pixels. Clean digital illustration mobile game UI style. Centered, fills frame.'
    },
    'ui-btn-settings': {
      category: 'ui', label: '⚙️ Settings Button', w: 60, h: 60, frames: 1,
      prompt: 'Single settings gear icon button, grey rounded square with gear symbol, 60x60 pixels. Clean digital illustration mobile game UI style. Centered, fills frame.'
    },
    'ui-health-bar': {
      category: 'ui', label: '❤️ Health Bar', w: 200, h: 30, frames: 1,
      prompt: 'Single health bar UI element, red fill in dark border, 200x30 pixels. Clean digital illustration RPG game UI style. Centered, fills frame.'
    },
    'ui-dialog-box': {
      category: 'ui', label: '💬 Dialog Box', w: 400, h: 150, frames: 1,
      prompt: 'Single dialog box UI element, dark semi-transparent rounded rectangle with text area, 400x150 pixels. Clean digital illustration RPG game UI style. Centered, fills frame.'
    },
    'ui-coin-icon': {
      category: 'ui', label: '🪙 Coin Icon', w: 40, h: 40, frames: 1,
      prompt: 'Single gold coin icon, shiny circular gold coin with star symbol, 40x40 pixels. Clean digital illustration game UI style. Centered.'
    },
    'ui-minimap': {
      category: 'ui', label: '🗺️ Minimap Frame', w: 200, h: 200, frames: 1,
      prompt: 'Single minimap frame UI element, dark border with semi-transparent center, 200x200 pixels. Clean digital illustration RPG game UI style. Centered, fills frame.'
    },

    // === EFFECTS ===
    'effect-explosion': {
      category: 'effect', label: '💥 Explosion', w: 96, h: 96, frames: 6,
      prompt: 'Single explosion effect frame, orange and yellow fireball expanding, top-down view, 96x96 pixels. Clean digital illustration adventure game style. Centered.'
    },
    'effect-sparkle': {
      category: 'effect', label: '✨ Sparkle', w: 32, h: 32, frames: 4,
      prompt: 'Single sparkle effect, small white-yellow star burst, top-down view, 32x32 pixels. Clean digital illustration game style. Centered.'
    },
    'effect-level-up': {
      category: 'effect', label: '⭐ Level Up Beam', w: 150, h: 350, frames: 4,
      prompt: 'Single level-up beam effect, golden vertical light shaft with particles, 150x350 pixels. Clean digital illustration RPG game style. Centered.'
    },
  },

  // ---- Template categories for UI grouping
  CATEGORIES: {
    'character': { label: '🧑 Character Actions', color: '#2f6fed' },
    'terrain': { label: '🌍 Terrain Tiles', color: '#55c97a' },
    'object': { label: '📦 Map Objects', color: '#e0b341' },
    'ui': { label: '🖥️ UI Elements', color: '#ee5555' },
    'effect': { label: '✨ Effects', color: '#a855f7' },
  },

  HISTORY_KEY: 'bhs_ai_history',
  LIBRARY_KEY: 'bhs_ai_library',
  REFERENCE_KEY: 'bhs_ai_reference',
  QUEUE_KEY: 'bhs_ai_queue',

  // ---- Reference image system
  getReference() {
    try { return JSON.parse(localStorage.getItem(this.REFERENCE_KEY) || 'null'); }
    catch { return null; }
  },
  setReference(dataUrl, description) {
    const ref = { dataUrl, description, ts: Date.now() };
    localStorage.setItem(this.REFERENCE_KEY, JSON.stringify(ref));
    return ref;
  },
  clearReference() { localStorage.removeItem(this.REFERENCE_KEY); },

  // ---- Prompt library (save/load for reuse)
  getLibrary() {
    try { return JSON.parse(localStorage.getItem(this.LIBRARY_KEY) || '[]'); }
    catch { return []; }
  },
  saveToLibrary(name, prompt, templateId, referenceDataUrl) {
    const lib = this.getLibrary();
    lib.push({ name, prompt, templateId, reference: referenceDataUrl, ts: Date.now(), favorite: false });
    this.saveLibrary(lib);
  },
  saveLibrary(list) {
    try { localStorage.setItem(this.LIBRARY_KEY, JSON.stringify(list.slice(0, 100))); }
    catch (e) { console.warn('library save failed', e); }
  },
  toggleLibraryFavorite(name) {
    const lib = this.getLibrary();
    const it = lib.find(i => i.name === name);
    if (it) { it.favorite = !it.favorite; this.saveLibrary(lib); }
  },
  removeFromLibrary(name) {
    this.saveLibrary(this.getLibrary().filter(i => i.name !== name));
  },

  // ---- Queue system (batch generation)
  getQueue() {
    try { return JSON.parse(localStorage.getItem(this.QUEUE_KEY) || '[]'); }
    catch { return []; }
  },
  addToQueue(templateIds) {
    const q = this.getQueue();
    templateIds.forEach(id => q.push({ templateId, ts: Date.now(), status: 'pending' }));
    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(q));
  },
  clearQueue() { localStorage.removeItem(this.QUEUE_KEY); },

  // ---- Async API call (with reference image support)
  async generate(prompt, size = '1024x1024', onProgress, referenceImage = null) {
    // Build full prompt with style prefix
    const fullPrompt = this.STYLE_PREFIX + ' — ' + prompt;
    
    let r;
    try {
      r = await fetch('/api/generate-sprite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fullPrompt, size, referenceImage }),
      });
    } catch (e) {
      throw new Error('Errore di rete (POST): ' + e.message);
    }
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      throw new Error('Il server ha risposto con ' + r.status + ' (' + ct + '). Il route AI non è raggiungibile.');
    }
    const startData = await r.json();
    if (!startData.success || !startData.jobId) {
      throw new Error(startData.error || 'Impossibile avviare la generazione');
    }
    const jobId = startData.jobId;
    if (onProgress) onProgress('Job avviato: ' + jobId.slice(0, 16) + '...' + (referenceImage ? ' (con reference)' : ''));

    // Poll GET status every 3 seconds
    const pollInterval = 3000;
    const maxWait = 180000;
    const t0 = Date.now();
    while (Date.now() - t0 < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      let pr;
      try {
        pr = await fetch('/api/generate-status?jobId=' + encodeURIComponent(jobId));
      } catch (e) {
        if (onProgress) onProgress('Retry poll (errore rete)...');
        continue;
      }
      const pct = pr.headers.get('content-type') || '';
      if (!pct.includes('application/json')) {
        if (onProgress) onProgress('Retry poll (risposta non JSON)...');
        continue;
      }
      const data = await pr.json();
      if (!data.success) throw new Error(data.error || 'Errore polling');
      if (data.status === 'done') {
        if (onProgress) onProgress('✓ Generata in ' + data.elapsed);
        return { success: true, base64: data.base64, prompt, size };
      }
      if (data.status === 'error') throw new Error(data.error || 'Generazione fallita');
      if (onProgress) onProgress('In corso... ' + data.elapsed);
    }
    throw new Error('Timeout: generazione troppo lunga (> 3 minuti)');
  },

  // ---- History
  getHistory() {
    try { return JSON.parse(localStorage.getItem(this.HISTORY_KEY) || '[]'); }
    catch { return []; }
  },
  saveHistory(list) {
    try { localStorage.setItem(this.HISTORY_KEY, JSON.stringify(list.slice(0, 50))); }
    catch (e) { console.warn('history save failed', e); }
  },
  addHistory(prompt, templateId) {
    const list = this.getHistory();
    if (list[0]?.prompt !== prompt) {
      list.unshift({ prompt, templateId, ts: Date.now(), favorite: false });
      this.saveHistory(list);
    }
  },
  toggleFavorite(prompt) {
    const list = this.getHistory();
    const it = list.find(i => i.prompt === prompt);
    if (it) { it.favorite = !it.favorite; this.saveHistory(list); }
  },
  removeHistory(prompt) {
    this.saveHistory(this.getHistory().filter(i => i.prompt !== prompt));
  },
  clearHistory() { localStorage.removeItem(this.HISTORY_KEY); },
};

window.AIGenerator = AIGenerator;
