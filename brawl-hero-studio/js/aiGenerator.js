// aiGenerator.js — modulino client per chiamare /api/generate-sprite
// + gestione template presets + history in localStorage

const AIGenerator = {
  // ---- template presets (dimensioni + prompt base già compilati)
  TEMPLATES: [
    { id: 'wall', label: '🧱 Muro', w: 60, h: 99, frames: 1,
      prompt: 'Pixel art stone wall, 60x99px single frame, top-down 3-quarter view, brown brick texture with green moss top edge, transparent background, retro game style' },
    { id: 'spike', label: '🔺 Spuntoni', w: 60, h: 60, frames: 1,
      prompt: 'Pixel art spike trap, 60x60px single frame, top-down view, sharp grey metal spikes pointing up, transparent background, retro game style' },
    { id: 'slime', label: '🟢 Slime', w: 80, h: 81, frames: 4,
      prompt: 'Pixel art green slime creature, 80x81px per frame, 4 frames horizontally showing idle breathing animation squish stretch, translucent jelly body with two eyes, top-down view, transparent background, retro game style' },
    { id: 'mushroom', label: '🍄 Mushroom', w: 80, h: 80, frames: 4,
      prompt: 'Pixel art mushroom enemy, 80x80px per frame, 4 frames horizontally showing idle wobble animation, red cap with white dots, top-down view, transparent background, retro game style' },
    { id: 'cactus', label: '🌵 Cactus', w: 80, h: 80, frames: 4,
      prompt: 'Pixel art cactus enemy, 80x80px per frame, 4 frames horizontally showing idle wobble animation, green spiky body with two arms, top-down view, transparent background, retro game style' },
    { id: 'drone', label: '🚁 Drone', w: 80, h: 80, frames: 4,
      prompt: 'Pixel art drone enemy, 80x80px per frame, 4 frames horizontally showing hover idle animation with rotor blur, dark metal body red eye, top-down view, transparent background, retro game style' },
    { id: 'player', label: '🧑 Player', w: 80, h: 96, frames: 4,
      prompt: 'Pixel art adventurer hero character, 80x96px per frame, 4 frames horizontally showing walk cycle down direction, blue armor with sword, top-down view, transparent background, retro game style' },
    { id: 'effect', label: '✨ Effect', w: 96, h: 96, frames: 4,
      prompt: 'Pixel art explosion effect, 96x96px per frame, 4 frames horizontally showing explosion sequence, orange and yellow particles, top-down view, transparent background, retro game style' },
  ],

  HISTORY_KEY: 'bhs_ai_history',

  // ---- chiamata API ASYNC (pattern: POST start job → GET poll status)
  // Evita timeout del proxy perché ogni richiesta HTTP è veloce (< 1s)
  // Usa il route Next.js su :3000 (Caddy proxya :81 → :3000 di default)
  async generate(prompt, size = '1024x1024', onProgress) {
    // 1. POST start job (immediato, ~10ms)
    let r;
    try {
      r = await fetch('/api/generate-sprite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, size }),
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
    if (onProgress) onProgress('Job avviato: ' + jobId.slice(0, 16) + '...');

    // 2. Poll GET status ogni 3 secondi
    const pollInterval = 3000;
    const maxWait = 180000; // 3 minuti max
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
      if (!data.success) {
        throw new Error(data.error || 'Errore polling');
      }
      if (data.status === 'done') {
        if (onProgress) onProgress('✓ Generata in ' + data.elapsed);
        return { success: true, base64: data.base64, prompt, size };
      }
      if (data.status === 'error') {
        throw new Error(data.error || 'Generazione fallita');
      }
      // pending: continua a pollare
      if (onProgress) onProgress('In corso... ' + data.elapsed);
    }
    throw new Error('Timeout: generazione troppo lunga (> 3 minuti)');
  },

  // ---- history in localStorage
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
    // evita duplicati recenti (stesso prompt nelle ultime 5)
    if (list[0]?.prompt !== prompt) {
      list.unshift({ prompt, templateId, ts: Date.now(), favorite: false });
      this.saveHistory(list);
    }
  },
  toggleFavorite(prompt) {
    const list = this.getHistory();
    const it = list.find(i => i.prompt === prompt);
    if (it) { it.favorite = !it.favorite; this.saveHistory(list); }
    return it?.favorite;
  },
  removeHistory(prompt) {
    const list = this.getHistory().filter(i => i.prompt !== prompt);
    this.saveHistory(list);
  },
  clearHistory() {
    localStorage.removeItem(this.HISTORY_KEY);
  },
};

window.AIGenerator = AIGenerator;
