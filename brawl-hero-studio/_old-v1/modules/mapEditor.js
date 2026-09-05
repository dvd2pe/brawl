// Map Editor Module
class MapEditor {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.currentTool = 'select';
        this.currentMap = {
            id: 'custom-map',
            tiles: [],
            environments: [],
            enemies: [],
            markers: []
        };
        
        this.gridSize = { width: 12, height: 24 };
        this.tileSize = 60;
        this.selectedEntity = null;
        this.isDragging = false;
        this.history = [];
        this.historyIndex = -1;
        
        // Texture system
        this.useGameTextures = false;
        this.loadedTextures = {};
        this.textureAtlasJSON = null;
        
        this.entityTypes = {
            'EntityWall': { 
                name: 'Wall', 
                icon: '🧱', 
                color: '#888888',
                type: 'environment',
                size: { w: 1, h: 1 },
                spritePath: 'media/graphics/game/environments/wall.png'
            },
            'EntitySpike': { 
                name: 'Spike', 
                icon: '🔺', 
                color: '#ff4444',
                type: 'environment',
                size: { w: 1, h: 1 },
                spritePath: 'media/graphics/game/environments/spike.png'
            },
            'EntitySlime': { 
                name: 'Slime', 
                icon: '🟢', 
                color: '#44ff44',
                type: 'enemy',
                size: { w: 1, h: 1 },
                spritePath: 'media/graphics/game/characters/enemies/slime/idle.png'
            },
            'EntityMushroom': { 
                name: 'Mushroom', 
                icon: '🍄', 
                color: '#ff8844',
                type: 'enemy',
                size: { w: 1, h: 1 },
                spritePath: 'media/graphics/game/characters/enemies/mushroom/idle.png'
            },
            'EntityBowldog': { 
                name: 'Bowldog', 
                icon: '🐕', 
                color: '#8844ff',
                type: 'enemy',
                size: { w: 1, h: 1 },
                spritePath: 'media/graphics/game/characters/enemies/bowldog/idle.png'
            },
            'EntityCactus': { 
                name: 'Cactus', 
                icon: '🌵', 
                color: '#44ff88',
                type: 'enemy',
                size: { w: 1, h: 1 },
                spritePath: 'media/graphics/game/characters/enemies/cactus/idle.png'
            },
            'EntityDrone': { 
                name: 'Drone', 
                icon: '🚁', 
                color: '#ff88ff',
                type: 'enemy',
                size: { w: 1, h: 1 },
                spritePath: 'media/graphics/game/characters/enemies/drone/idle.png'
            },
            'EntityPlayer': { 
                name: 'Player', 
                icon: '👤', 
                color: '#4488ff',
                type: 'marker',
                size: { w: 1, h: 1 },
                spritePath: 'media/graphics/game/characters/player/idle.png'
            },
            'EntityPortal': { 
                name: 'Portal', 
                icon: '🌀', 
                color: '#88ffff',
                type: 'marker',
                size: { w: 1, h: 1 },
                spritePath: 'media/graphics/game/ui/portal.png'
            }
        };
    }
    
    init() {
        this.canvas = document.getElementById('gridCanvas');
        if (!this.canvas) {
            console.error('Canvas element not found!');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) {
            console.error('Could not get canvas context!');
            return;
        }
        
        // Set canvas size explicitly
        this.canvas.width = this.gridSize.width * this.tileSize;
        this.canvas.height = this.gridSize.height * this.tileSize;
        
        this.initializeGrid();
        this.setupEventListeners();
        this.populateEntityPalette();
        
        // Try to load game textures
        this.loadGameTextures();
        
        this.render();
        
        console.log('Map Editor initialized successfully');
    }
    
    async loadGameTextures() {
        try {
            // First, try to import textures if not already loaded
            const assetImporter = window.brawlHeroStudio?.modules['asset-importer'];
            if (assetImporter) {
                // Check if textures are already loaded
                const textures = assetImporter.getTextureImages();
                
                if (!textures || textures.length === 0) {
                    console.log('Textures not loaded yet, importing now...');
                    // Trigger texture import
                    await assetImporter.importTextureAtlas();
                }
                
                // Get texture images and JSON after import
                const updatedTextures = assetImporter.getTextureImages();
                const json = assetImporter.getTextureAtlasJSON();
                
                if (updatedTextures && updatedTextures.length > 0) {
                    this.loadedTextures = {};
                    updatedTextures.forEach(texture => {
                        this.loadedTextures[texture.name] = texture.image;
                    });
                    
                    if (json) {
                        this.textureAtlasJSON = json;
                        this.useGameTextures = true;
                        console.log('Game textures loaded successfully:', Object.keys(this.loadedTextures).length, 'textures');
                    } else {
                        console.warn('Texture atlas JSON not available');
                    }
                } else {
                    console.warn('No textures available after import');
                }
            } else {
                console.warn('Asset importer not available');
            }
        } catch (error) {
            console.warn('Failed to load game textures:', error);
            this.useGameTextures = false;
        }
    }
    
    getSpriteFromAtlas(spritePath) {
        if (!this.useGameTextures || !this.textureAtlasJSON) return null;
        
        const frame = this.textureAtlasJSON.frames[spritePath];
        if (!frame) return null;
        
        // Find which texture atlas contains this sprite
        for (const [name, image] of Object.entries(this.loadedTextures)) {
            if (image && 
                frame.frame.x < image.width && 
                frame.frame.y < image.height) {
                return {
                    image: image,
                    frame: frame.frame,
                    sourceSize: frame.sourceSize
                };
            }
        }
        
        return null;
    }
    
    cleanup() {
        // Cleanup when switching modules
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
    }
    
    reset() {
        this.currentMap = {
            id: 'custom-map',
            tiles: [],
            environments: [],
            enemies: [],
            markers: []
        };
        this.history = [];
        this.historyIndex = -1;
        this.selectedEntity = null;
        this.initializeGrid();
        this.render();
    }
    
    initializeGrid() {
        // Initialize empty grid
        this.currentMap.tiles = [];
        for (let y = 0; y < this.gridSize.height; y++) {
            this.currentMap.tiles[y] = [];
            for (let x = 0; x < this.gridSize.width; x++) {
                this.currentMap.tiles[y][x] = 0; // 0 = empty, 1 = wall
            }
        }
    }
    
    setupEventListeners() {
        // Tool buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent default behavior
                e.stopPropagation(); // Stop event bubbling
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;
                console.log('Tool selected:', this.currentTool);
            });
        });
        
        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());
        
        // Edit buttons
        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearMap());
        document.getElementById('validateBtn').addEventListener('click', () => this.validateMap());
        document.getElementById('testInGameBtn').addEventListener('click', () => this.testInGame());
        
        // Texture buttons
        document.getElementById('loadTexturesBtn').addEventListener('click', () => this.loadGameTextures());
        document.getElementById('toggleTexturesBtn').addEventListener('click', () => this.toggleTextures());
        
        // Layer selection
        document.querySelectorAll('.layer-item').forEach(layer => {
            layer.addEventListener('click', () => {
                document.querySelectorAll('.layer-item').forEach(l => l.classList.remove('active'));
                layer.classList.add('active');
            });
        });
    }
    
    populateEntityPalette() {
        const palette = document.getElementById('entityPalette');
        palette.innerHTML = '';
        
        for (const [key, entity] of Object.entries(this.entityTypes)) {
            const item = document.createElement('div');
            item.className = 'palette-item';
            item.dataset.entity = key;
            item.innerHTML = `
                <div style="font-size: 2rem;">${entity.icon}</div>
                <span>${entity.name}</span>
            `;
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.currentTool = key;
                
                // Find and activate the corresponding tool button
                const toolBtn = document.querySelector(`[data-tool="${key}"]`);
                if (toolBtn) {
                    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                    toolBtn.classList.add('active');
                }
                
                console.log('Entity selected from palette:', key);
            });
            palette.appendChild(item);
        }
    }
    
    handleMouseDown(e) {
        this.isDragging = true;
        this.handleCanvasClick(e);
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.tileSize);
        const y = Math.floor((e.clientY - rect.top) / this.tileSize);
        
        // Update cursor position display
        document.getElementById('cursorPos').textContent = `Cursor: (${x}, ${y})`;
        
        if (this.isDragging) {
            this.handleCanvasClick(e);
        }
    }
    
    handleMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            this.saveToHistory();
        }
    }
    
    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.tileSize);
        const y = Math.floor((e.clientY - rect.top) / this.tileSize);
        
        console.log('Canvas click at:', x, y, 'Tool:', this.currentTool);
        
        // Check bounds
        if (x < 0 || x >= this.gridSize.width || y < 0 || y >= this.gridSize.height) {
            console.log('Click out of bounds');
            return;
        }
        
        // Check if tool is valid
        if (!this.currentTool || this.currentTool === 'select') {
            console.log('No valid tool selected');
            return;
        }
        
        this.placeEntity(x, y, this.currentTool);
    }
    
    placeEntity(x, y, tool) {
        if (tool === 'select') {
            this.selectEntityAt(x, y);
            return;
        }
        
        // Remove existing entity at position
        this.removeEntityAt(x, y);
        
        // Place new entity based on tool
        switch(tool) {
            case 'wall':
                this.currentMap.tiles[y][x] = 1;
                this.currentMap.environments.push({
                    entity: 'EntityWall',
                    x: x,
                    y: y,
                    settings: {}
                });
                break;
                
            case 'spike':
                this.currentMap.environments.push({
                    entity: 'EntitySpike',
                    x: x,
                    y: y,
                    settings: {}
                });
                break;
                
            case 'slime':
                this.currentMap.enemies.push({
                    entity: 'EntitySlime',
                    x: x,
                    y: y,
                    settings: {}
                });
                break;
                
            case 'mushroom':
                this.currentMap.enemies.push({
                    entity: 'EntityMushroom',
                    x: x,
                    y: y,
                    settings: {}
                });
                break;
                
            case 'bowldog':
                this.currentMap.enemies.push({
                    entity: 'EntityBowldog',
                    x: x,
                    y: y,
                    settings: {}
                });
                break;
                
            case 'cactus':
                this.currentMap.enemies.push({
                    entity: 'EntityCactus',
                    x: x,
                    y: y,
                    settings: {}
                });
                break;
                
            case 'drone':
                this.currentMap.enemies.push({
                    entity: 'EntityDrone',
                    x: x,
                    y: y,
                    settings: {}
                });
                break;
                
            case 'player':
                // Remove existing player marker
                this.currentMap.markers = this.currentMap.markers.filter(m => m.label !== 'P');
                this.currentMap.markers.push({
                    label: 'P',
                    x: x + 0.5,
                    y: y,
                    settings: {}
                });
                break;
                
            case 'portal':
                // Remove existing portal marker
                this.currentMap.markers = this.currentMap.markers.filter(m => m.label !== 'E');
                this.currentMap.markers.push({
                    label: 'E',
                    x: x + 0.5,
                    y: y,
                    settings: {}
                });
                break;
        }
        
        this.render();
    }
    
    removeEntityAt(x, y) {
        // Remove from tiles
        this.currentMap.tiles[y][x] = 0;
        
        // Remove from environments
        this.currentMap.environments = this.currentMap.environments.filter(
            env => !(env.x === x && env.y === y)
        );
        
        // Remove from enemies
        this.currentMap.enemies = this.currentMap.enemies.filter(
            enemy => !(enemy.x === x && enemy.y === y)
        );
    }
    
    selectEntityAt(x, y) {
        // Find entity at position
        const env = this.currentMap.environments.find(e => e.x === x && e.y === y);
        const enemy = this.currentMap.enemies.find(e => e.x === x && e.y === y);
        const marker = this.currentMap.markers.find(m => 
            Math.floor(m.x) === x && Math.floor(m.y) === y
        );
        
        this.selectedEntity = env || enemy || marker || null;
        this.updatePropertiesPanel();
        this.render();
    }
    
    updatePropertiesPanel() {
        const panel = document.getElementById('propertiesContent');
        
        if (!this.selectedEntity) {
            panel.innerHTML = '<p>Select an entity to view properties</p>';
            return;
        }
        
        let html = `<div class="entity-properties">`;
        html += `<div class="prop-row"><strong>Type:</strong> ${this.selectedEntity.entity || this.selectedEntity.label}</div>`;
        html += `<div class="prop-row"><strong>Position:</strong> (${this.selectedEntity.x}, ${this.selectedEntity.y})</div>`;
        
        if (this.selectedEntity.settings) {
            html += `<div class="prop-row"><strong>Settings:</strong></div>`;
            for (const [key, value] of Object.entries(this.selectedEntity.settings)) {
                html += `<div class="prop-row indent">- ${key}: ${value}</div>`;
            }
        }
        
        html += `<button class="delete-entity-btn">Delete Entity</button>`;
        html += `</div>`;
        
        panel.innerHTML = html;
        
        // Add delete button handler
        panel.querySelector('.delete-entity-btn').addEventListener('click', () => {
            this.deleteSelectedEntity();
        });
    }
    
    deleteSelectedEntity() {
        if (!this.selectedEntity) return;
        
        if (this.selectedEntity.entity) {
            this.currentMap.environments = this.currentMap.environments.filter(
                e => e !== this.selectedEntity
            );
            this.currentMap.enemies = this.currentMap.enemies.filter(
                e => e !== this.selectedEntity
            );
        } else if (this.selectedEntity.label) {
            this.currentMap.markers = this.currentMap.markers.filter(
                m => m !== this.selectedEntity
            );
        }
        
        this.selectedEntity = null;
        this.updatePropertiesPanel();
        this.saveToHistory();
        this.render();
    }
    
    render() {
        // Clear canvas with game background color
        this.ctx.fillStyle = '#93bf45'; // Game's default background color
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid
        this.drawGrid();
        
        // Draw tiles
        this.drawTiles();
        
        // Draw entities
        this.drawEntities();
        
        // Draw markers
        this.drawMarkers();
        
        // Draw selection
        if (this.selectedEntity) {
            this.drawSelection();
        }
    }
    
    drawGrid() {
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        
        for (let x = 0; x <= this.gridSize.width; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * this.tileSize, 0);
            this.ctx.lineTo(x * this.tileSize, this.gridSize.height * this.tileSize);
            this.ctx.stroke();
        }
        
        for (let y = 0; y <= this.gridSize.height; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * this.tileSize);
            this.ctx.lineTo(this.gridSize.width * this.tileSize, y * this.tileSize);
            this.ctx.stroke();
        }
    }
    
    drawTiles() {
        for (let y = 0; y < this.gridSize.height; y++) {
            for (let x = 0; x < this.gridSize.width; x++) {
                if (this.currentMap.tiles[y][x] === 1) {
                    this.ctx.fillStyle = '#888888';
                    this.ctx.fillRect(
                        x * this.tileSize + 1,
                        y * this.tileSize + 1,
                        this.tileSize - 2,
                        this.tileSize - 2
                    );
                }
            }
        }
    }
    
    drawEntities() {
        // Draw environments
        this.currentMap.environments.forEach(env => {
            const entityData = this.entityTypes[env.entity];
            if (entityData) {
                const x = env.x * this.tileSize;
                const y = env.y * this.tileSize;
                
                // Try to use game texture
                if (this.useGameTextures && entityData.spritePath) {
                    const spriteData = this.getSpriteFromAtlas(entityData.spritePath);
                    if (spriteData && spriteData.image) {
                        // Draw actual sprite from texture atlas
                        this.ctx.drawImage(
                            spriteData.image,
                            spriteData.frame.x,
                            spriteData.frame.y,
                            spriteData.frame.w,
                            spriteData.frame.h,
                            x + (this.tileSize - spriteData.frame.w) / 2,
                            y + (this.tileSize - spriteData.frame.h) / 2,
                            spriteData.frame.w,
                            spriteData.frame.h
                        );
                    } else {
                        // Fallback to colored placeholder
                        this.drawPlaceholderEntity(x, y, entityData);
                    }
                } else {
                    // Fallback to colored placeholder
                    this.drawPlaceholderEntity(x, y, entityData);
                }
            }
        });
    }
    
    drawPlaceholderEntity(x, y, entityData) {
        this.ctx.fillStyle = entityData.color;
        this.ctx.fillRect(
            x + 5,
            y + 5,
            this.tileSize - 10,
            this.tileSize - 10
        );
        
        // Draw icon
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            entityData.icon,
            x + this.tileSize / 2,
            y + this.tileSize / 2 + 8
        );
    }
    
    drawMarkers() {
        this.currentMap.markers.forEach(marker => {
            const x = Math.floor(marker.x) * this.tileSize;
            const y = marker.y * this.tileSize;
            
            if (marker.label === 'P') {
                this.ctx.fillStyle = '#4488ff';
                this.ctx.beginPath();
                this.ctx.arc(
                    x + this.tileSize / 2,
                    y + this.tileSize / 2,
                    this.tileSize / 3,
                    0,
                    Math.PI * 2
                );
                this.ctx.fill();
                
                this.ctx.fillStyle = '#fff';
                this.ctx.font = '20px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('P', x + this.tileSize / 2, y + this.tileSize / 2 + 7);
            } else if (marker.label === 'E') {
                this.ctx.fillStyle = '#88ffff';
                this.ctx.beginPath();
                this.ctx.arc(
                    x + this.tileSize / 2,
                    y + this.tileSize / 2,
                    this.tileSize / 3,
                    0,
                    Math.PI * 2
                );
                this.ctx.fill();
                
                this.ctx.fillStyle = '#000';
                this.ctx.font = '20px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('E', x + this.tileSize / 2, y + this.tileSize / 2 + 7);
            }
        });
    }
    
    drawSelection() {
        if (!this.selectedEntity) return;
        
        let x, y;
        if (this.selectedEntity.x !== undefined) {
            x = this.selectedEntity.x * this.tileSize;
            y = this.selectedEntity.y * this.tileSize;
        } else if (this.selectedEntity.label) {
            x = Math.floor(this.selectedEntity.x) * this.tileSize;
            y = this.selectedEntity.y * this.tileSize;
        }
        
        this.ctx.strokeStyle = '#e94560';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(
            x,
            y,
            this.tileSize,
            this.tileSize
        );
    }
    
    saveToHistory() {
        // Remove future history if we're not at the end
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        // Save current state
        this.history.push(JSON.parse(JSON.stringify(this.currentMap)));
        this.historyIndex++;
        
        // Limit history size
        if (this.history.length > 50) {
            this.history.shift();
            this.historyIndex--;
        }
    }
    
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.currentMap = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            this.selectedEntity = null;
            this.updatePropertiesPanel();
            this.render();
        }
    }
    
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.currentMap = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            this.selectedEntity = null;
            this.updatePropertiesPanel();
            this.render();
        }
    }
    
    clearMap() {
        if (confirm('Clear the entire map?')) {
            this.reset();
        }
    }
    
    validateMap() {
        const issues = [];
        
        // Check for player spawn
        const hasPlayer = this.currentMap.markers.some(m => m.label === 'P');
        if (!hasPlayer) {
            issues.push('No player spawn point (P marker) found');
        }
        
        // Check for exit portal
        const hasPortal = this.currentMap.markers.some(m => m.label === 'E');
        if (!hasPortal) {
            issues.push('No exit portal (E marker) found');
        }
        
        // Check for enemies
        if (this.currentMap.enemies.length === 0) {
            issues.push('No enemies placed - map might be too easy');
        }
        
        // Check for walls
        const wallCount = this.currentMap.environments.filter(e => e.entity === 'EntityWall').length;
        if (wallCount === 0) {
            issues.push('No walls placed - consider adding some for gameplay');
        }
        
        // Display results
        const resultsDiv = document.getElementById('validationResults');
        if (issues.length === 0) {
            resultsDiv.innerHTML = '<div class="validation-success">✓ Map is valid!</div>';
        } else {
            resultsDiv.innerHTML = issues.map(issue => 
                `<div class="validation-issue">⚠ ${issue}</div>`
            ).join('');
        }
    }
    
    testInGame() {
        // Switch to game previewer and load current map
        const previewer = window.brawlHeroStudio.modules['game-previewer'];
        if (previewer) {
            previewer.loadCustomMap(this.currentMap);
            
            // Switch to game previewer tab
            document.querySelector('[data-tab="game-previewer"]').click();
        }
    }
    
    toggleTextures() {
        this.useGameTextures = !this.useGameTextures;
        console.log('Textures toggled:', this.useGameTextures ? 'Game textures' : 'Placeholder colors');
        this.render();
    }
    
    exportMaps() {
        return [this.currentMap];
    }
    
    loadProjectData(projectData) {
        if (projectData.maps && projectData.maps.length > 0) {
            this.currentMap = projectData.maps[0];
            this.render();
        }
    }
}