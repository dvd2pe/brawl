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

  // ---- chiamata API (con gestione errori robusta: HTML → JSON parse error friendly)
  async generate(prompt, size = '1024x1024') {
    let r;
    try {
      r = await fetch('/api/generate-sprite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, size }),
      });
    } catch (e) {
      throw new Error('Errore di rete: ' + e.message);
    }
    // controlla content-type: se non è JSON, è una pagina di errore HTML (es. timeout proxy)
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      // leggi come testo per capire cos'è
      const text = await r.text();
      throw new Error('Il server ha risposto con ' + r.status + ' (' + ct + '), non JSON. Probabilmente il proxy è scaduto (timeout 30-60s). L\'AI impiega 60-90s. Riprova tra poco, oppure usa il bottone "Genera PNG sul disco" come fallback.');
    }
    let data;
    try { data = await r.json(); }
    catch (e) {
      throw new Error('Risposta non valida JSON: ' + e.message);
    }
    if (!data.success) throw new Error(data.error || 'Generazione fallita');
    return data; // { success, base64, prompt, size }
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
