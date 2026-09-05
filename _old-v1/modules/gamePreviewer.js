// Game Previewer Module
class GamePreviewer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.gameLoop = null;
        this.isRunning = false;
        this.isPaused = false;
        this.lastTime = 0;
        
        this.entities = [];
        this.player = null;
        this.camera = { x: 0, y: 0 };
        this.keys = {};
        
        this.currentMap = null;
        this.debugMode = false;
        
        this.gameTime = 0;
        this.fps = 0;
        this.frameCount = 0;
        this.lastFpsUpdate = 0;
        
        // Texture system
        this.useGameTextures = false;
        this.loadedTextures = {};
        this.textureAtlasJSON = null;
    }
    
    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.setupEventListeners();
        this.setupKeyboardControls();
        
        // Load game textures
        this.loadGameTextures();
        
        this.renderInitialState();
        
        console.log('Game Previewer initialized');
    }
    
    async loadGameTextures() {
        try {
            const assetImporter = window.brawlHeroStudio?.modules['asset-importer'];
            if (assetImporter) {
                const textures = assetImporter.getTextureImages();
                const json = assetImporter.getTextureAtlasJSON();
                
                if (textures && textures.length > 0) {
                    this.loadedTextures = {};
                    textures.forEach(texture => {
                        this.loadedTextures[texture.name] = texture.image;
                    });
                    
                    if (json) {
                        this.textureAtlasJSON = json;
                        this.useGameTextures = true;
                        console.log('Game textures loaded in previewer');
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load game textures in previewer:', error);
            this.useGameTextures = false;
        }
    }
    
    getSpriteFromAtlas(spritePath) {
        if (!this.useGameTextures || !this.textureAtlasJSON) return null;
        
        const frame = this.textureAtlasJSON.frames[spritePath];
        if (!frame) return null;
        
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
        this.stopGame();
    }
    
    reset() {
        this.stopGame();
        this.entities = [];
        this.player = null;
        this.currentMap = null;
        this.gameTime = 0;
        this.renderInitialState();
    }
    
    setupEventListeners() {
        document.getElementById('playGameBtn').addEventListener('click', () => {
            this.startGame();
        });
        
        document.getElementById('pauseGameBtn').addEventListener('click', () => {
            this.togglePause();
        });
        
        document.getElementById('resetGameBtn').addEventListener('click', () => {
            this.resetGame();
        });
        
        document.getElementById('debugBtn').addEventListener('click', () => {
            this.toggleDebugMode();
        });
        
        document.getElementById('mapSelect').addEventListener('change', (e) => {
            this.loadMap(e.target.value);
        });
    }
    
    setupKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            // Prevent scrolling with arrow keys
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                e.preventDefault();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }
    
    renderInitialState() {
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = '#888';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Select a map and press Play to start', this.canvas.width / 2, this.canvas.height / 2);
    }
    
    loadMap(mapId) {
        if (!mapId) {
            this.currentMap = null;
            this.renderInitialState();
            return;
        }
        
        if (mapId === 'custom') {
            // Load custom map from map editor
            const mapEditor = window.brawlHeroStudio.modules['map-editor'];
            if (mapEditor) {
                this.currentMap = mapEditor.currentMap;
            }
        } else {
            // Load predefined map (would need to implement parsing from game.js)
            console.log('Loading predefined map:', mapId);
            // For now, create a simple test map
            this.currentMap = this.createTestMap(mapId);
        }
        
        if (this.currentMap) {
            this.initializeEntities();
            this.render();
        }
    }
    
    createTestMap(mapId) {
        // Create a simple test map for demonstration
        return {
            id: mapId,
            tiles: Array(24).fill(null).map(() => Array(12).fill(0)),
            environments: [
                { entity: 'EntityWall', x: 0, y: 0, settings: {} },
                { entity: 'EntityWall', x: 1, y: 0, settings: {} },
                { entity: 'EntityWall', x: 11, y: 0, settings: {} },
                { entity: 'EntitySlime', x: 5, y: 5, settings: {} },
                { entity: 'EntitySlime', x: 7, y: 8, settings: {} }
            ],
            enemies: [
                { entity: 'EntitySlime', x: 5, y: 5, settings: {} },
                { entity: 'EntitySlime', x: 7, y: 8, settings: {} }
            ],
            markers: [
                { label: 'P', x: 5.5, y: 20, settings: {} },
                { label: 'E', x: 5.5, y: 2, settings: {} }
            ]
        };
    }
    
    loadCustomMap(mapData) {
        this.currentMap = mapData;
        this.initializeEntities();
        this.render();
    }
    
    initializeEntities() {
        this.entities = [];
        
        if (!this.currentMap) return;
        
        // Create environment entities
        this.currentMap.environments.forEach(envData => {
            const entity = this.createEntity(envData);
            if (entity) {
                this.entities.push(entity);
            }
        });
        
        // Create enemy entities
        this.currentMap.enemies.forEach(enemyData => {
            const entity = this.createEntity(enemyData);
            if (entity) {
                this.entities.push(entity);
            }
        });
        
        // Create player
        const playerMarker = this.currentMap.markers.find(m => m.label === 'P');
        if (playerMarker) {
            this.player = new PlayerEntity({
                x: playerMarker.x * 60,
                y: playerMarker.y * 60
            });
            this.entities.push(this.player);
        }
        
        // Create portal
        const portalMarker = this.currentMap.markers.find(m => m.label === 'E');
        if (portalMarker) {
            const portal = new PortalEntity({
                x: portalMarker.x * 60,
                y: portalMarker.y * 60
            });
            this.entities.push(portal);
        }
    }
    
    createEntity(data) {
        switch(data.entity) {
            case 'EntityWall':
                return new WallEntity(data);
            case 'EntitySpike':
                return new SpikeEntity(data);
            case 'EntitySlime':
                return new SlimeEnemy(data);
            case 'EntityMushroom':
                return new MushroomEnemy(data);
            case 'EntityBowldog':
                return new BowldogEnemy(data);
            case 'EntityCactus':
                return new CactusEnemy(data);
            case 'EntityDrone':
                return new DroneEnemy(data);
            default:
                return new BaseEntity(data);
        }
    }
    
    startGame() {
        if (!this.currentMap) {
            alert('Please select a map first');
            return;
        }
        
        if (!this.isRunning) {
            this.isRunning = true;
            this.isPaused = false;
            this.lastTime = performance.now();
            this.gameLoop = requestAnimationFrame((time) => this.update(time));
            this.hideOverlay();
        }
    }
    
    togglePause() {
        if (this.isRunning) {
            this.isPaused = !this.isPaused;
            if (this.isPaused) {
                this.showOverlay('Game Paused', 'Press Play to continue');
            } else {
                this.hideOverlay();
                this.lastTime = performance.now();
            }
        }
    }
    
    resetGame() {
        this.stopGame();
        this.initializeEntities();
        this.gameTime = 0;
        this.render();
    }
    
    stopGame() {
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
            this.gameLoop = null;
        }
        this.isRunning = false;
        this.isPaused = false;
    }
    
    toggleDebugMode() {
        this.debugMode = !this.debugMode;
        document.getElementById('debugPanel').style.display = this.debugMode ? 'block' : 'none';
    }
    
    showOverlay(title, message) {
        document.getElementById('overlayTitle').textContent = title;
        document.getElementById('overlayMessage').textContent = message;
        document.getElementById('gameOverlay').style.display = 'flex';
    }
    
    hideOverlay() {
        document.getElementById('gameOverlay').style.display = 'none';
    }
    
    update(currentTime) {
        if (!this.isRunning || this.isPaused) {
            this.gameLoop = requestAnimationFrame((time) => this.update(time));
            return;
        }
        
        const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;
        
        // Cap delta time to prevent huge jumps
        const cappedDelta = Math.min(deltaTime, 0.1);
        
        this.gameTime += cappedDelta;
        
        // Update entities
        this.entities.forEach(entity => {
            entity.update(cappedDelta, this);
        });
        
        // Update camera
        this.updateCamera();
        
        // Handle collisions
        this.handleCollisions();
        
        // Update debug info
        this.updateDebugInfo(cappedDelta);
        
        // Render
        this.render();
        
        // Update stats
        this.updateStats(cappedDelta);
        
        // Continue game loop
        this.gameLoop = requestAnimationFrame((time) => this.update(time));
    }
    
    updateCamera() {
        if (this.player) {
            // Smooth camera follow
            const targetX = this.player.x - this.canvas.width / 2;
            const targetY = this.player.y - this.canvas.height / 2;
            
            this.camera.x += (targetX - this.camera.x) * 0.1;
            this.camera.y += (targetY - this.camera.y) * 0.1;
            
            // Clamp camera to map bounds
            const mapWidth = 12 * 60;
            const mapHeight = 24 * 60;
            
            this.camera.x = Math.max(0, Math.min(this.camera.x, mapWidth - this.canvas.width));
            this.camera.y = Math.max(0, Math.min(this.camera.y, mapHeight - this.canvas.height));
        }
    }
    
    handleCollisions() {
        for (let i = 0; i < this.entities.length; i++) {
            for (let j = i + 1; j < this.entities.length; j++) {
                const a = this.entities[i];
                const b = this.entities[j];
                
                if (this.checkCollision(a, b)) {
                    this.resolveCollision(a, b);
                }
            }
        }
    }
    
    checkCollision(a, b) {
        return a.x < b.x + b.width &&
               a.x + a.width > b.x &&
               a.y < b.y + b.height &&
               a.y + a.height > b.y;
    }
    
    resolveCollision(a, b) {
        // Player vs Wall
        if (a instanceof PlayerEntity && b instanceof WallEntity) {
            this.resolvePlayerWall(a, b);
        } else if (b instanceof PlayerEntity && a instanceof WallEntity) {
            this.resolvePlayerWall(b, a);
        }
        
        // Player vs Enemy
        if (a instanceof PlayerEntity && b instanceof EnemyEntity) {
            this.resolvePlayerEnemy(a, b);
        } else if (b instanceof PlayerEntity && a instanceof EnemyEntity) {
            this.resolvePlayerEnemy(b, a);
        }
        
        // Player vs Portal
        if (a instanceof PlayerEntity && b instanceof PortalEntity) {
            this.resolvePlayerPortal(a, b);
        } else if (b instanceof PlayerEntity && a instanceof PortalEntity) {
            this.resolvePlayerPortal(b, a);
        }
    }
    
    resolvePlayerWall(player, wall) {
        // Simple collision resolution - push player back
        const overlapX = (player.x + player.width) - wall.x;
        const overlapY = (player.y + player.height) - wall.y;
        
        if (overlapX < overlapY) {
            if (player.x < wall.x) {
                player.x = wall.x - player.width;
            } else {
                player.x = wall.x + wall.width;
            }
        } else {
            if (player.y < wall.y) {
                player.y = wall.y - player.height;
            } else {
                player.y = wall.y + wall.height;
            }
        }
    }
    
    resolvePlayerEnemy(player, enemy) {
        // Simple damage logic
        if (!player.invulnerable && player.health > 0) {
            player.health -= 10;
            player.invulnerable = true;
            setTimeout(() => {
                player.invulnerable = false;
            }, 1000);
        }
    }
    
    resolvePlayerPortal(player, portal) {
        // Level complete logic
        this.showOverlay('Level Complete!', 'Press Reset to play again');
        this.isPaused = true;
    }
    
    updateDebugInfo(deltaTime) {
        if (!this.debugMode) return;
        
        const debugInfo = document.getElementById('debugInfo');
        let info = `Game Time: ${this.gameTime.toFixed(2)}s\n`;
        info += `Entities: ${this.entities.length}\n`;
        info += `Camera: (${this.camera.x.toFixed(1)}, ${this.camera.y.toFixed(1)})\n`;
        
        if (this.player) {
            info += `Player: (${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)})\n`;
            info += `Player Health: ${this.player.health}\n`;
            info += `Player Speed: ${this.player.speed}\n`;
        }
        
        info += `\nKeys: ${Object.keys(this.keys).filter(k => this.keys[k]).join(', ')}`;
        
        debugInfo.textContent = info;
    }
    
    updateStats(deltaTime) {
        // FPS calculation
        this.frameCount++;
        if (this.gameTime - this.lastFpsUpdate >= 1) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = this.gameTime;
        }
        
        document.getElementById('fpsCounter').textContent = this.fps;
        document.getElementById('entityCount').textContent = this.entities.length;
        
        if (this.player) {
            document.getElementById('playerPos').textContent = 
                `${Math.round(this.player.x)}, ${Math.round(this.player.y)}`;
        }
        
        const minutes = Math.floor(this.gameTime / 60);
        const seconds = Math.floor(this.gameTime % 60);
        document.getElementById('gameTime').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    render() {
        // Clear canvas
        this.ctx.fillStyle = '#93bf45'; // Game background color
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Apply camera transform
        this.ctx.save();
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
        // Draw grid (optional, for debug)
        if (this.debugMode) {
            this.drawGrid();
        }
        
        // Render entities
        this.entities.forEach(entity => {
            entity.render(this.ctx, this);
        });
        
        this.ctx.restore();
    }
    
    drawGrid() {
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.lineWidth = 1;
        
        for (let x = 0; x <= 12 * 60; x += 60) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, 24 * 60);
            this.ctx.stroke();
        }
        
        for (let y = 0; y <= 24 * 60; y += 60) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(12 * 60, y);
            this.ctx.stroke();
        }
    }
}

// Entity Classes for Game Previewer
class BaseEntity {
    constructor(data) {
        this.x = (data.x || 0) * 60;
        this.y = (data.y || 0) * 60;
        this.width = 60;
        this.height = 60;
        this.type = 'base';
        this.spritePath = null;
    }
    
    update(deltaTime, game) {
        // Base update logic
    }
    
    render(ctx, game) {
        // Try to use game texture first
        if (game && game.useGameTextures && this.spritePath) {
            const spriteData = game.getSpriteFromAtlas(this.spritePath);
            if (spriteData && spriteData.image) {
                ctx.drawImage(
                    spriteData.image,
                    spriteData.frame.x,
                    spriteData.frame.y,
                    spriteData.frame.w,
                    spriteData.frame.h,
                    this.x + (this.width - spriteData.frame.w) / 2,
                    this.y + (this.height - spriteData.frame.h) / 2,
                    spriteData.frame.w,
                    spriteData.frame.h
                );
                return;
            }
        }
        
        // Fallback to colored placeholder
        ctx.fillStyle = '#888';
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

class WallEntity extends BaseEntity {
    constructor(data) {
        super(data);
        this.type = 'wall';
        this.spritePath = 'media/graphics/game/environments/wall.png';
    }
    
    render(ctx, game) {
        if (game && game.useGameTextures) {
            super.render(ctx, game);
        } else {
            ctx.fillStyle = '#888888';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            
            // Draw brick pattern
            ctx.strokeStyle = '#666666';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
        }
    }
}

class SpikeEntity extends BaseEntity {
    constructor(data) {
        super(data);
        this.type = 'spike';
        this.damage = 10;
    }
    
    render(ctx) {
        ctx.fillStyle = '#ff4444';
        
        // Draw triangle
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y);
        ctx.lineTo(this.x + this.width, this.y + this.height);
        ctx.lineTo(this.x, this.y + this.height);
        ctx.closePath();
        ctx.fill();
    }
}

class PlayerEntity extends BaseEntity {
    constructor(data) {
        super(data);
        this.type = 'player';
        this.speed = 200;
        this.health = 100;
        this.invulnerable = false;
        this.previousX = this.x;
        this.previousY = this.y;
    }
    
    update(deltaTime, game) {
        this.previousX = this.x;
        this.previousY = this.y;
        
        // Handle keyboard input
        if (game.keys['ArrowUp'] || game.keys['KeyW']) {
            this.y -= this.speed * deltaTime;
        }
        if (game.keys['ArrowDown'] || game.keys['KeyS']) {
            this.y += this.speed * deltaTime;
        }
        if (game.keys['ArrowLeft'] || game.keys['KeyA']) {
            this.x -= this.speed * deltaTime;
        }
        if (game.keys['ArrowRight'] || game.keys['KeyD']) {
            this.x += this.speed * deltaTime;
        }
        
        // Boundary check
        this.x = Math.max(0, Math.min(this.x, 12 * 60 - this.width));
        this.y = Math.max(0, Math.min(this.y, 24 * 60 - this.height));
    }
    
    render(ctx) {
        // Flash when invulnerable
        if (this.invulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
            return;
        }
        
        ctx.fillStyle = '#4488ff';
        ctx.beginPath();
        ctx.arc(
            this.x + this.width / 2,
            this.y + this.height / 2,
            this.width / 2 - 5,
            0,
            Math.PI * 2
        );
        ctx.fill();
        
        // Draw health bar
        const healthPercent = this.health / 100;
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x, this.y - 10, this.width, 5);
        ctx.fillStyle = healthPercent > 0.5 ? '#51cf66' : '#ff6b6b';
        ctx.fillRect(this.x, this.y - 10, this.width * healthPercent, 5);
    }
}

class EnemyEntity extends BaseEntity {
    constructor(data) {
        super(data);
        this.type = 'enemy';
        this.health = 30;
        this.speed = 50;
        this.damage = 5;
        this.direction = Math.random() * Math.PI * 2;
        this.changeDirectionTimer = 0;
    }
    
    update(deltaTime, game) {
        // Simple AI: move towards player occasionally
        this.changeDirectionTimer += deltaTime;
        
        if (this.changeDirectionTimer > 2) {
            this.changeDirectionTimer = 0;
            if (game.player && Math.random() > 0.5) {
                // Move towards player
                const dx = game.player.x - this.x;
                const dy = game.player.y - this.y;
                this.direction = Math.atan2(dy, dx);
            } else {
                // Random direction
                this.direction = Math.random() * Math.PI * 2;
            }
        }
        
        this.x += Math.cos(this.direction) * this.speed * deltaTime;
        this.y += Math.sin(this.direction) * this.speed * deltaTime;
        
        // Boundary check
        this.x = Math.max(0, Math.min(this.x, 12 * 60 - this.width));
        this.y = Math.max(0, Math.min(this.y, 24 * 60 - this.height));
    }
    
    render(ctx) {
        ctx.fillStyle = this.getEnemyColor();
        ctx.fillRect(this.x + 5, this.y + 5, this.width - 10, this.height - 10);
        
        // Health bar
        const healthPercent = this.health / 30;
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x, this.y - 8, this.width, 4);
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(this.x, this.y - 8, this.width * healthPercent, 4);
    }
    
    getEnemyColor() {
        return '#ff4444';
    }
}

class SlimeEnemy extends EnemyEntity {
    getEnemyColor() {
        return '#44ff44';
    }
}

class MushroomEnemy extends EnemyEntity {
    getEnemyColor() {
        return '#ff8844';
    }
}

class BowldogEnemy extends EnemyEntity {
    getEnemyColor() {
        return '#8844ff';
    }
}

class CactusEnemy extends EnemyEntity {
    getEnemyColor() {
        return '#44ff88';
    }
}

class DroneEnemy extends EnemyEntity {
    getEnemyColor() {
        return '#ff88ff';
    }
}

class PortalEntity extends BaseEntity {
    constructor(data) {
        super(data);
        this.type = 'portal';
        this.rotation = 0;
    }
    
    update(deltaTime, game) {
        this.rotation += deltaTime * 2;
    }
    
    render(ctx) {
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        ctx.rotate(this.rotation);
        
        ctx.fillStyle = '#88ffff';
        ctx.beginPath();
        ctx.arc(0, 0, this.width / 2 - 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#000';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('E', 0, 7);
        
        ctx.restore();
    }
}