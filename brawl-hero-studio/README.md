# Brawl Hero Studio — Versione standalone

## Avvio rapido

1. Estrai lo ZIP in una cartella
2. **Windows**: doppio-click su `start.bat`
3. **Mac/Linux**: apri il terminale nella cartella ed esegui `./start.sh`
4. Apri il browser a `http://localhost:8000/`

## Cosa include

- **Studio Editor** (`/studio/`): editor sprite/mappe con AI Generator
- **Gioco con patch** (`/studio-play.html`): gioca con custom entities
- **Gioco vaniglia** (`/vanilla.html`): gioco originale
- **AI Gallery** (`/ai-gallery.html`): immagini generate con AI
- **Firepit custom** già piazzato in `tutorial-1-firepit` (apri studio-play.html per giocare)

## Requisiti

- Python 3 installato (per `python -m http.server`)
- Browser moderno (Chrome/Firefox/Edge)

## Struttura file

```
brawl-hero-studio/
├── start.bat / start.sh    ← doppio-click per avviare
├── README.md
├── index.html              ← pagina principale (link a tutto)
├── studio/                 ← Studio Editor
│   ├── index.html
│   ├── css/main.css
│   └── js/                 ← 7 moduli JS
├── studio-play.html        ← bridge per giocare con patch
├── vanilla.html            ← gioco originale
├── game.js                 ← engine ImpactJS (1.9 MB)
├── game.css
├── media/                  ← texture PNG + audio + fonts
├── ai-test/                ← immagini AI generate
└── ai-gallery.html
```

## Note

- Le patch (custom class, custom mappe, AI generations) sono salvate in `localStorage` del browser
- Per resettare tutto: apri la console del browser (F12) ed esegui `localStorage.clear()`
- L'AI Generator usa z-ai-web-dev-sdk (in questa versione standalone NON funziona perché serve un backend — scarica le immagini dalla AI Gallery invece)
