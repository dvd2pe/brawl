// Entity Editor Module
class EntityEditor {
    constructor() {
        this.currentEntity = null;
        this.entities = [];
        this.classHierarchy = {
            'EntityBaseEnvironment': {
                'EntityWall': { properties: ['tileType', 'settings'] },
                'EntitySpike': { properties: ['damage', 'attackCooldown'] }
            },
            'EntityBaseCharacter': {
                'EntityPlayer': { properties: ['health', 'exp', 'level', 'upgrades'] },
                'EntityBaseEnemy': {
                    'EntitySlime': { properties: ['health', 'damage', 'speed'] },
                    'EntityMushroom': { properties: ['health', 'damage', 'projectileType'] },
                    'EntityBowldog': { properties: ['health', 'damage', 'projectileType'] },
                    'EntityCactus': { properties: ['health', 'damage', 'projectileType'] },
                    'EntityDrone': { properties: ['health', 'damage', 'projectileType'] }
                }
            }
        };
    }
    
    init() {
        this.setupEventListeners();
        this.populateClassTree();
        this.resetForm();
        
        console.log('Entity Editor initialized');
    }
    
    cleanup() {
        // Cleanup when switching modules
    }
    
    reset() {
        this.currentEntity = null;
        this.entities = [];
        this.resetForm();
    }
    
    setupEventListeners() {
        document.getElementById('newEntityBtn').addEventListener('click', () => {
            this.createNewEntity();
        });
        
        document.getElementById('saveEntityBtn').addEventListener('click', () => {
            this.saveEntity();
        });
        
        document.getElementById('deleteEntityBtn').addEventListener('click', () => {
            this.deleteEntity();
        });
        
        document.getElementById('addPropertyBtn').addEventListener('click', () => {
            this.addPropertyRow();
        });
        
        document.getElementById('spriteSheet').addEventListener('change', (e) => {
            this.handleSpriteUpload(e.target.files[0]);
        });
        
        document.getElementById('playAnimBtn').addEventListener('click', () => {
            this.playAnimation();
        });
        
        document.getElementById('stopAnimBtn').addEventListener('click', () => {
            this.stopAnimation();
        });
    }
    
    populateClassTree() {
        const tree = document.getElementById('classTree');
        tree.innerHTML = '';
        
        for (const [baseClass, subclasses] of Object.entries(this.classHierarchy)) {
            const baseItem = document.createElement('div');
            baseItem.className = 'class-item';
            baseItem.textContent = baseClass;
            baseItem.addEventListener('click', () => {
                this.selectParentClass(baseClass);
            });
            tree.appendChild(baseItem);
            
            for (const [subClass, data] of Object.entries(subclasses)) {
                const subItem = document.createElement('div');
                subItem.className = 'class-item subclass';
                subItem.textContent = subClass;
                subItem.addEventListener('click', () => {
                    this.selectEntityClass(subClass, baseClass);
                });
                tree.appendChild(subItem);
            }
        }
    }
    
    selectParentClass(baseClass) {
        document.getElementById('parentClass').value = baseClass;
    }
    
    selectEntityClass(entityClass, parentClass) {
        document.getElementById('entityName').value = entityClass;
        document.getElementById('parentClass').value = parentClass;
        
        // Load default properties for this class
        const classData = this.classHierarchy[parentClass]?.[entityClass];
        if (classData && classData.properties) {
            this.loadDefaultProperties(classData.properties);
        }
    }
    
    loadDefaultProperties(properties) {
        const propContainer = document.getElementById('entityProperties');
        propContainer.innerHTML = '';
        
        properties.forEach(prop => {
            this.addPropertyRow(prop, '');
        });
    }
    
    addPropertyRow(name = '', value = '') {
        const propContainer = document.getElementById('entityProperties');
        const row = document.createElement('div');
        row.className = 'property-row';
        
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Property name';
        nameInput.value = name;
        
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.placeholder = 'Value';
        valueInput.value = value;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-prop-btn';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => {
            row.remove();
        });
        
        row.appendChild(nameInput);
        row.appendChild(valueInput);
        row.appendChild(removeBtn);
        
        propContainer.appendChild(row);
    }
    
    handleSpriteUpload(file) {
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.drawPreview(img);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    drawPreview(image) {
        const canvas = document.getElementById('entityPreviewCanvas');
        const ctx = canvas.getContext('2d');
        
        // Clear canvas
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw image centered
        const scale = Math.min(
            (canvas.width - 20) / image.width,
            (canvas.height - 20) / image.height
        );
        
        const width = image.width * scale;
        const height = image.height * scale;
        const x = (canvas.width - width) / 2;
        const y = (canvas.height - height) / 2;
        
        ctx.drawImage(image, x, y, width, height);
    }
    
    playAnimation() {
        // Simple animation preview - would need more complex implementation
        const canvas = document.getElementById('entityPreviewCanvas');
        const ctx = canvas.getContext('2d');
        
        let frame = 0;
        const animate = () => {
            ctx.fillStyle = `hsl(${frame * 10}, 70%, 50%)`;
            ctx.fillRect(50 + Math.sin(frame * 0.1) * 20, 50, 100, 100);
            frame++;
            this.animationFrame = requestAnimationFrame(animate);
        };
        
        animate();
    }
    
    stopAnimation() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }
    
    createNewEntity() {
        this.currentEntity = {
            name: 'NewEntity',
            parentClass: 'EntityBaseEnvironment',
            properties: {},
            spriteSheet: null
        };
        
        this.resetForm();
    }
    
    saveEntity() {
        const name = document.getElementById('entityName').value;
        const parentClass = document.getElementById('parentClass').value;
        
        if (!name) {
            alert('Please enter an entity name');
            return;
        }
        
        // Collect properties
        const properties = {};
        document.querySelectorAll('#entityProperties .property-row').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs[0].value) {
                properties[inputs[0].value] = inputs[1].value;
            }
        });
        
        this.currentEntity = {
            name: name,
            parentClass: parentClass,
            properties: properties,
            definition: this.generateEntityDefinition(name, parentClass, properties)
        };
        
        this.entities.push(this.currentEntity);
        console.log('Entity saved:', this.currentEntity);
        alert('Entity saved successfully!');
    }
    
    generateEntityDefinition(name, parentClass, properties) {
        // Generate game.js compatible entity definition
        let definition = `${name} = ${parentClass}['extend']({\n`;
        
        for (const [key, value] of Object.entries(properties)) {
            definition += `    '${key}': ${value},\n`;
        }
        
        definition += '});';
        
        return definition;
    }
    
    deleteEntity() {
        if (this.currentEntity) {
            const index = this.entities.indexOf(this.currentEntity);
            if (index > -1) {
                this.entities.splice(index, 1);
            }
            this.currentEntity = null;
            this.resetForm();
            console.log('Entity deleted');
        }
    }
    
    resetForm() {
        document.getElementById('entityName').value = '';
        document.getElementById('parentClass').value = 'EntityBaseEnvironment';
        document.getElementById('spriteSheet').value = '';
        document.getElementById('entityProperties').innerHTML = '';
        
        // Clear preview
        const canvas = document.getElementById('entityPreviewCanvas');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    exportEntities() {
        return this.entities.map(entity => ({
            name: entity.name,
            parentClass: entity.parentClass,
            properties: entity.properties,
            definition: entity.definition
        }));
    }
    
    loadProjectData(projectData) {
        if (projectData.entities) {
            this.entities = projectData.entities;
            console.log('Loaded entities from project');
        }
    }
}