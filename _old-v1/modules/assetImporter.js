// Asset Importer Module
class AssetImporter {
    constructor() {
        this.importedAssets = {
            textures: [],
            maps: [],
            entities: []
        };
        
        this.gameJSPath = '../game.js';
        this.texturePath = '../media/graphics/packed/';
    }
    
    init() {
        this.setupEventListeners();
        console.log('Asset Importer initialized');
    }
    
    cleanup() {
        // Cleanup when switching modules
    }
    
    reset() {
        this.importedAssets = {
            textures: [],
            maps: [],
            entities: []
        };
        this.updateImportedAssetsList();
    }
    
    setupEventListeners() {
        document.getElementById('importFromGameBtn').addEventListener('click', () => {
            this.importFromGame();
        });
        
        document.getElementById('importAtlasBtn').addEventListener('click', () => {
            this.importTextureAtlas();
        });
        
        document.getElementById('importMapsBtn').addEventListener('click', () => {
            this.importMaps();
        });
    }
    
    async importFromGame() {
        const importTextures = document.getElementById('importTextures').checked;
        const importMaps = document.getElementById('importMaps').checked;
        const importEntities = document.getElementById('importEntities').checked;
        
        this.updateProgress(0, 'Starting import...');
        
        try {
            if (importTextures) {
                await this.importTextureAtlas();
                this.updateProgress(33, 'Textures imported');
            }
            
            if (importMaps) {
                await this.importMaps();
                this.updateProgress(66, 'Maps imported');
            }
            
            if (importEntities) {
                await this.importEntities();
                this.updateProgress(100, 'Entities imported');
            }
            
            this.updateProgress(100, 'Import complete!');
            this.updateImportedAssetsList();
            
        } catch (error) {
            console.error('Import failed:', error);
            this.updateProgress(0, 'Import failed: ' + error.message);
        }
    }
    
    async importTextureAtlas() {
        this.updateProgress(10, 'Loading texture atlases...');
        
        const textures = ['texture-0.png', 'texture-1.png', 'texture-2.png'];
        
        for (const texture of textures) {
            try {
                const response = await fetch(this.texturePath + texture);
                const blob = await response.blob();
                
                const textureData = {
                    name: texture,
                    blob: blob,
                    url: URL.createObjectURL(blob)
                };
                
                // Load the image to get dimensions
                const img = new Image();
                img.src = textureData.url;
                await new Promise((resolve, reject) => {
                    img.onload = () => {
                        textureData.image = img;
                        textureData.width = img.width;
                        textureData.height = img.height;
                        resolve();
                    };
                    img.onerror = reject;
                });
                
                this.importedAssets.textures.push(textureData);
                console.log(`Imported ${texture}`);
            } catch (error) {
                console.warn(`Failed to import ${texture}:`, error);
            }
        }
        
        // Parse the texture atlas JSON from game.js
        await this.parseTextureAtlasJSON();
        
        this.updateProgress(30, 'Texture atlases loaded');
    }
    
    async parseTextureAtlasJSON() {
        this.updateProgress(20, 'Parsing texture atlas JSON...');
        
        try {
            const response = await fetch(this.gameJSPath);
            const gameJS = await response.text();
            
            // Extract the packer plugin JSON data
            const jsonMatch = gameJS.match(/window\['packerplugin'\]\['json'\]\['texture-2'\] = '([^']+)'/);
            if (jsonMatch) {
                try {
                    const jsonString = jsonMatch[1].replace(/\\x22/g, '"').replace(/\\x([0-9A-Fa-f]{2})/g, (match, hex) => {
                        return String.fromCharCode(parseInt(hex, 16));
                    });
                    
                    this.importedAssets.textureAtlasJSON = JSON.parse(jsonString);
                    console.log('Parsed texture atlas JSON with', Object.keys(this.importedAssets.textureAtlasJSON.frames).length, 'frames');
                } catch (error) {
                    console.warn('Failed to parse texture atlas JSON:', error);
                }
            }
        } catch (error) {
            console.error('Failed to parse texture atlas JSON:', error);
        }
    }
    
    async importMaps() {
        this.updateProgress(40, 'Parsing game.js for maps...');
        
        try {
            const response = await fetch(this.gameJSPath);
            const gameJS = await response.text();
            
            // Parse map data from game.js
            const maps = this.parseMapsFromGameJS(gameJS);
            
            this.importedAssets.maps = maps;
            console.log(`Imported ${maps.length} maps`);
            
        } catch (error) {
            console.error('Failed to import maps:', error);
            throw error;
        }
    }
    
    parseMapsFromGameJS(gameJS) {
        const maps = [];
        
        // Try to extract map definitions using regex
        const mapPatterns = [
            /Map(\w+) = \{[\s\S]*?'id':\s*'([^']+)'[\s\S]*?\};/g,
            /Mapeasy(\d+) = \{[\s\S]*?\};/g,
            /Mapnormal(\d+) = \{[\s\S]*?\};/g,
            /Maphard(\d+) = \{[\s\S]*?\};/g
        ];
        
        for (const pattern of mapPatterns) {
            let match;
            while ((match = pattern.exec(gameJS)) !== null) {
                try {
                    const mapCode = match[0];
                    const mapData = this.parseMapDefinition(mapCode);
                    if (mapData) {
                        maps.push(mapData);
                    }
                } catch (error) {
                    console.warn('Failed to parse map:', error);
                }
            }
        }
        
        return maps;
    }
    
    parseMapDefinition(mapCode) {
        try {
            // Remove JavaScript syntax and convert to JSON-like format
            let jsonStr = mapCode
                .replace(/'/g, '"')
                .replace(/(\w+):/g, '"$1":')
                .replace(/0x(\w+)/g, (match, hex) => parseInt(hex, 16))
                .replace(/!/g, 'false')
                .replace(/\[\]/g, '[]')
                .replace(/\{\}/g, '{}');
            
            // Try to parse as JSON
            const mapData = JSON.parse(jsonStr);
            return mapData;
            
        } catch (error) {
            console.warn('Failed to parse map definition:', error);
            return null;
        }
    }
    
    async importEntities() {
        this.updateProgress(70, 'Parsing entity definitions...');
        
        try {
            const response = await fetch(this.gameJSPath);
            const gameJS = await response.text();
            
            // Parse entity classes from game.js
            const entities = this.parseEntitiesFromGameJS(gameJS);
            
            this.importedAssets.entities = entities;
            console.log(`Imported ${entities.length} entity definitions`);
            
        } catch (error) {
            console.error('Failed to import entities:', error);
            throw error;
        }
    }
    
    parseEntitiesFromGameJS(gameJS) {
        const entities = [];
        
        // Try to extract entity class definitions
        const entityPatterns = [
            /Entity(\w+) = EntityBaseEnemy\['extend'\]\(\{[\s\S]*?\}\);/g,
            /Entity(\w+) = EntityBaseEnvironment\['extend'\]\(\{[\s\S]*?\}\);/g,
            /Entity(\w+) = EntityBaseCharacter\['extend'\]\(\{[\s\S]*?\}\);/g
        ];
        
        for (const pattern of entityPatterns) {
            let match;
            while ((match = pattern.exec(gameJS)) !== null) {
                try {
                    const entityCode = match[0];
                    const entityName = match[1];
                    
                    entities.push({
                        name: 'Entity' + entityName,
                        code: entityCode,
                        type: this.getEntityType(entityName)
                    });
                } catch (error) {
                    console.warn('Failed to parse entity:', error);
                }
            }
        }
        
        return entities;
    }
    
    getEntityType(entityName) {
        const enemyTypes = ['Slime', 'Mushroom', 'Bowldog', 'Cactus', 'Drone', 'Boss'];
        const envTypes = ['Wall', 'Spike', 'Portal'];
        
        if (enemyTypes.some(type => entityName.includes(type))) {
            return 'enemy';
        }
        if (envTypes.some(type => entityName.includes(type))) {
            return 'environment';
        }
        if (entityName === 'Player') {
            return 'player';
        }
        
        return 'unknown';
    }
    
    updateProgress(percent, text) {
        document.getElementById('importProgress').style.width = percent + '%';
        document.getElementById('progressText').textContent = text;
    }
    
    updateImportedAssetsList() {
        const list = document.getElementById('importedAssetsList');
        
        if (this.importedAssets.textures.length === 0 && 
            this.importedAssets.maps.length === 0 && 
            this.importedAssets.entities.length === 0) {
            list.innerHTML = '<p>No assets imported yet</p>';
            return;
        }
        
        let html = '';
        
        if (this.importedAssets.textures.length > 0) {
            html += '<h4>Textures</h4>';
            this.importedAssets.textures.forEach(texture => {
                html += `<div class="asset-item">
                    <span>${texture.name}</span>
                    <button class="use-asset-btn">Use</button>
                </div>`;
            });
        }
        
        if (this.importedAssets.maps.length > 0) {
            html += '<h4>Maps</h4>';
            this.importedAssets.maps.forEach((map, index) => {
                html += `<div class="asset-item">
                    <span>${map.id || 'Map ' + (index + 1)}</span>
                    <button class="use-asset-btn">Load in Editor</button>
                </div>`;
            });
        }
        
        if (this.importedAssets.entities.length > 0) {
            html += '<h4>Entities</h4>';
            this.importedAssets.entities.forEach(entity => {
                html += `<div class="asset-item">
                    <span>${entity.name} (${entity.type})</span>
                    <button class="use-asset-btn">Use</button>
                </div>`;
            });
        }
        
        list.innerHTML = html;
        
        // Add event listeners to use buttons
        list.querySelectorAll('.use-asset-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => {
                this.useAsset(index);
            });
        });
    }
    
    useAsset(index) {
        // Determine which asset type to use based on context
        // This would integrate with other modules
        console.log('Using asset at index:', index);
        alert('Asset loaded! (Integration with other modules would be implemented here)');
    }
    
    getImportedAssets() {
        return this.importedAssets;
    }
    
    getTextureAtlasJSON() {
        return this.importedAssets.textureAtlasJSON;
    }
    
    getTextureImages() {
        return this.importedAssets.textures;
    }
    
    getSpriteFromAtlas(spritePath) {
        if (!this.importedAssets.textureAtlasJSON) return null;
        
        const frame = this.importedAssets.textureAtlasJSON.frames[spritePath];
        if (!frame) return null;
        
        // Find which texture atlas contains this sprite
        for (const texture of this.importedAssets.textures) {
            if (texture.image && 
                frame.frame.x < texture.width && 
                frame.frame.y < texture.height) {
                return {
                    image: texture.image,
                    frame: frame.frame,
                    sourceSize: frame.sourceSize
                };
            }
        }
        
        return null;
    }
    
    loadProjectData(projectData) {
        // Load assets from project data if available
        if (projectData.assets) {
            this.importedAssets = projectData.assets;
            this.updateImportedAssetsList();
        }
    }
}