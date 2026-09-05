# Brawl Hero Studio

A complete web-based tool suite for creating, editing, and testing Brawl Hero game content.

## Features

### 🗺️ Map Editor
- **Grid-based level editing** (12×24 tiles, 60px each)
- **Entity placement**: Walls, Spikes, Enemies (Slime, Mushroom, Bowldog, Cactus, Drone)
- **Player and Portal markers**
- **Undo/Redo functionality**
- **Map validation** (checks for required elements)
- **Direct test in game previewer**
- **Layer management** (Tiles, Environment, Enemies, Markers)

### 📦 Texture Atlas Packer
- **Drag & drop image upload**
- **Automatic shelf packing algorithm**
- **Multiple atlas sizes** (1024×1024, 2048×2048, 4096×4096)
- **Real-time preview**
- **JSON coordinate generation** (game.js compatible format)
- **Power-of-2 validation** for images
- **Space usage statistics**

### 🎮 Entity Editor
- **Class hierarchy browser** (based on game's entity system)
- **Custom entity creation**
- **Property management**
- **Sprite sheet upload**
- **Animation preview**
- **Game.js code generation**

### 🎯 Game Previewer
- **Real-time map testing**
- **Player movement** (WASD/Arrow keys)
- **Enemy AI simulation**
- **Collision detection**
- **Camera follow system**
- **Debug mode** with detailed info
- **FPS counter and game statistics**
- **Load custom maps from editor**

### 📥 Asset Importer
- **Import from existing game.js**
- **Texture atlas extraction**
- **Map definition parsing**
- **Entity class analysis**
- **Progress tracking**

## Installation

1. **Navigate to the brawl-hero-studio directory:**
   ```bash
   cd brawl-hero-studio
   ```

2. **Open the tool in your browser:**
   Simply open `index.html` in a modern web browser (Chrome, Firefox, Edge).

   Or use a local server:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve
   ```

3. **Access the tool:**
   Open `http://localhost:8000` in your browser.

## Quick Start Guide

### 1. Create Your First Map

1. **Open the Map Editor** (default tab)
2. **Select a tool** from the toolbar:
   - 🧱 **Wall**: Place solid walls
   - 🔺 **Spike**: Place damaging spikes
   - 🟢 **Slime**: Place slime enemies
   - 👤 **Player**: Set player spawn point
   - 🌀 **Portal**: Set exit portal
3. **Click on the grid** to place entities
4. **Add required elements:**
   - Place at least one **Player** marker (P)
   - Place at least one **Portal** marker (E)
   - Add some **enemies** for gameplay
5. **Validate your map** using the "Validate Map" button
6. **Test in game** by clicking "Test in Game"

### 2. Test Your Map

1. **Switch to Game Previewer** tab
2. **Select "Custom Map"** from the dropdown
3. **Click "Play"** to start the game
4. **Controls:**
   - **WASD / Arrow Keys**: Move player
   - **Space**: Pause/Resume
5. **Watch your map come to life!**

### 3. Create Custom Textures

1. **Switch to Atlas Packer** tab
2. **Upload your images** (drag & drop or click upload)
3. **Click "Pack Images"** to create the atlas
4. **Review the preview** and check space usage
5. **Copy or download the JSON** coordinates
6. **Use the generated JSON** in your game modifications

### 4. Import Existing Game Assets

1. **Switch to Asset Importer** tab
2. **Select what to import:**
   - ✅ Textures (texture-0,1,2)
   - ✅ Map definitions
   - ✅ Entity classes
3. **Click "Import from Game"**
4. **Watch the progress** and review imported assets
5. **Use imported assets** in other modules

## Workflow Example

### Creating a Complete Custom Level

1. **Design your map** in Map Editor
   - Place walls to create boundaries
   - Add enemies for challenge
   - Set player spawn and exit portal
   - Validate the map

2. **Test gameplay** in Game Previewer
   - Play through your level
   - Adjust enemy placement
   - Fine-tune difficulty

3. **Create custom assets** (optional)
   - Design custom sprites
   - Pack them into texture atlas
   - Generate JSON coordinates

4. **Export to game format**
   - Click "Export to Game" in header
   - Get the game.js compatible JSON
   - Integrate into the actual game

## Keyboard Shortcuts

- **Ctrl+Z**: Undo
- **Ctrl+Y**: Redo
- **Ctrl+S**: Save Project
- **Space**: Pause/Resume (in Game Previewer)
- **WASD / Arrow Keys**: Move player (in Game Previewer)

## Project Management

### Saving Projects
1. Click "Save Project" in the header
2. Downloads a `.json` file with all your work
3. Contains maps, entities, textures, and settings

### Loading Projects
1. Click "Load Project" in the header
2. Select your saved `.json` file
3. All your work is restored

### Exporting to Game
1. Click "Export to Game" in the header
2. Generates game.js compatible JSON
3. Contains custom maps, entities, and texture data
4. Ready for integration into the actual game

## Technical Details

### Map Format
Maps follow the Brawl Hero format:
```javascript
{
    "id": "custom-map",
    "tiles": [[0,1,0,...], ...], // 12×24 grid
    "environments": [
        {"entity": "EntityWall", "x": 0, "y": 0, "settings": {}}
    ],
    "enemies": [
        {"entity": "EntitySlime", "x": 5, "y": 5, "settings": {}}
    ],
    "markers": [
        {"label": "P", "x": 5.5, "y": 20, "settings": {}}
    ]
}
```

### Entity System
Based on the game's class hierarchy:
- `EntityBaseEnvironment` → Walls, Spikes
- `EntityBaseCharacter` → Player, Enemies
- `EntityBaseEnemy` → Slime, Mushroom, Bowldog, etc.

### Grid System
- **Tile size**: 60×60 pixels
- **Grid dimensions**: 12×24 tiles
- **Total map size**: 720×1440 pixels
- **Coordinates**: 0-11 (x), 0-23 (y)

## Testing with Existing Game Content

### Test with Tutorial Map
1. Go to **Asset Importer** tab
2. Click "Import from Game"
3. Select "Import Maps"
4. Wait for import to complete
5. Go to **Game Previewer** tab
6. Select "Tutorial 1" from dropdown
7. Click "Play" to test

### Test with Easy Maps
1. Import maps as above
2. In Game Previewer, select "Easy 1"
3. Test the first easy level

### Test Your Custom Map
1. Create map in Map Editor
2. Click "Test in Game"
3. Automatically loads in Game Previewer
4. Click "Play" to test

## Browser Compatibility

- **Chrome/Edge**: ✅ Full support
- **Firefox**: ✅ Full support
- **Safari**: ✅ Full support
- **Opera**: ✅ Full support

**Recommended**: Chrome or Firefox for best performance.

## Troubleshooting

### Map Editor Issues
- **Grid not visible**: Check canvas is properly initialized
- **Entities not placing**: Verify tool is selected
- **Validation fails**: Ensure player (P) and portal (E) markers exist

### Game Previewer Issues
- **Player not moving**: Check if game is paused
- **Collision not working**: Verify entity types are correct
- **Poor performance**: Try reducing map complexity

### Atlas Packer Issues
- **Images not packing**: Check image formats (PNG, JPG supported)
- **JSON not generating**: Ensure images are packed first
- **Atlas too small**: Increase atlas size in dropdown

## Development

### Module Structure
```
brawl-hero-studio/
├── index.html          # Main application
├── css/
│   └── main.css        # Styling
├── js/
│   └── main.js         # Application entry point
├── modules/
│   ├── mapEditor.js      # Map editing functionality
│   ├── atlasPacker.js    # Texture packing
│   ├── entityEditor.js   # Entity creation
│   ├── gamePreviewer.js  # Game testing
│   └── assetImporter.js  # Asset import
└── assets/            # Custom assets (optional)
```

### Adding New Features
Each module is self-contained with:
- `init()`: Module initialization
- `cleanup()`: Cleanup when switching
- `reset()`: Reset to default state
- Module-specific methods

## Performance Tips

1. **Limit map complexity** for smoother preview
2. **Use appropriate atlas sizes** for your image count
3. **Close unused browser tabs** to free memory
4. **Use local server** instead of file:// protocol

## Future Enhancements

Potential additions:
- [ ] Animation timeline editor
- [ ] Sound effect integration
- [ ] Multi-map projects
- [ ] Cloud save/load
- [ ] Collaborative editing
- [ ] Mobile version

## License

This tool is for educational and personal use with Brawl Hero.

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the console for error messages
3. Verify browser compatibility
4. Test with a simple map first

---

**Happy Game Development! 🎮**