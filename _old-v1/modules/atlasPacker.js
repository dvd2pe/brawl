// Atlas Packer Module
class AtlasPacker {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.images = [];
        this.atlasSize = 2048;
        this.packedData = null;
    }
    
    init() {
        this.canvas = document.getElementById('atlasCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.setupEventListeners();
        this.clearCanvas();
        
        console.log('Atlas Packer initialized');
    }
    
    cleanup() {
        // Cleanup when switching modules
    }
    
    reset() {
        this.images = [];
        this.packedData = null;
        this.updateSourceList();
        this.clearCanvas();
        document.getElementById('jsonOutput').value = '';
        this.updateStats();
    }
    
    setupEventListeners() {
        document.getElementById('imageUpload').addEventListener('change', (e) => {
            this.handleImageUpload(e.target.files);
        });
        
        document.getElementById('packBtn').addEventListener('click', () => {
            this.packImages();
        });
        
        document.getElementById('clearAtlasBtn').addEventListener('click', () => {
            this.reset();
        });
        
        document.getElementById('atlasSize').addEventListener('change', (e) => {
            this.atlasSize = parseInt(e.target.value);
            this.canvas.width = this.atlasSize;
            this.canvas.height = this.atlasSize;
            this.clearCanvas();
        });
        
        document.getElementById('copyJsonBtn').addEventListener('click', () => {
            this.copyJsonToClipboard();
        });
        
        document.getElementById('downloadJsonBtn').addEventListener('click', () => {
            this.downloadJson();
        });
    }
    
    handleImageUpload(files) {
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) {
                console.warn(`Skipping non-image file: ${file.name}`);
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    // Check if image dimensions are power of 2
                    const isPowerOf2 = (n) => (n & (n - 1)) === 0;
                    const validSize = isPowerOf2(img.width) && isPowerOf2(img.height);
                    
                    this.images.push({
                        name: file.name,
                        originalName: file.name,
                        image: img,
                        width: img.width,
                        height: img.height,
                        validSize: validSize
                    });
                    
                    this.updateSourceList();
                    this.updateStats();
                };
                img.onerror = () => {
                    console.error(`Failed to load image: ${file.name}`);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }
    
    updateSourceList() {
        const sourceList = document.getElementById('sourceImages');
        sourceList.innerHTML = '';
        
        this.images.forEach((imgData, index) => {
            const item = document.createElement('div');
            item.className = 'source-image-item';
            
            const validityIndicator = imgData.validSize ? 
                '<span style="color: #51cf66;">✓</span>' : 
                '<span style="color: #ff6b6b;">⚠</span>';
            
            item.innerHTML = `
                <img src="${imgData.image.src}" alt="${imgData.name}">
                <span>${imgData.name.substring(0, 15)}${imgData.name.length > 15 ? '...' : ''}</span>
                ${validityIndicator}
                <button class="remove-image-btn" data-index="${index}">×</button>
            `;
            
            item.querySelector('.remove-image-btn').addEventListener('click', () => {
                this.images.splice(index, 1);
                this.updateSourceList();
                this.updateStats();
            });
            
            sourceList.appendChild(item);
        });
    }
    
    packImages() {
        if (this.images.length === 0) {
            alert('Please upload images first');
            return;
        }
        
        // Sort images by height (shelf packing optimization)
        const sortedImages = [...this.images].sort((a, b) => b.height - a.height);
        
        const placements = {};
        let currentX = 0;
        let currentY = 0;
        let maxHeightInRow = 0;
        
        for (const imgData of sortedImages) {
            // Check if image fits in current row
            if (currentX + imgData.width > this.atlasSize) {
                currentX = 0;
                currentY += maxHeightInRow;
                maxHeightInRow = 0;
            }
            
            // Check if image fits in atlas at all
            if (currentY + imgData.height > this.atlasSize) {
                alert(`Atlas too small! Image "${imgData.name}" doesn't fit.`);
                return;
            }
            
            // Save placement
            placements[imgData.name] = {
                x: currentX,
                y: currentY,
                w: imgData.width,
                h: imgData.height
            };
            
            currentX += imgData.width;
            maxHeightInRow = Math.max(maxHeightInRow, imgData.height);
        }
        
        this.packedData = {
            placements: placements,
            totalWidth: this.atlasSize,
            totalHeight: currentY + maxHeightInRow
        };
        
        // Draw atlas
        this.drawAtlas(placements);
        
        // Generate JSON
        this.generateJSON(placements);
    }
    
    drawAtlas(placements) {
        this.clearCanvas();
        
        // Draw background (game default color)
        this.ctx.fillStyle = '#93bf45';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw images
        for (const [name, imgData] of Object.entries(this.images)) {
            const placement = placements[name];
            if (placement) {
                this.ctx.drawImage(imgData.image, placement.x, placement.y);
                
                // Draw border for visualization
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(placement.x, placement.y, placement.w, placement.h);
            }
        }
    }
    
    generateJSON(placements) {
        const jsonOutput = {
            frames: {}
        };
        
        for (const [name, coords] of Object.entries(placements)) {
            // Convert to game format path
            const gamePath = `media/graphics/game/custom/${name}`;
            
            jsonOutput.frames[gamePath] = {
                frame: {
                    x: coords.x,
                    y: coords.y,
                    w: coords.w,
                    h: coords.h
                },
                rotated: false,
                trimmed: false,
                spriteSourceSize: { x: 0, y: 0, w: coords.w, h: coords.h },
                sourceSize: { w: coords.w, h: coords.h }
            };
        }
        
        const jsonString = JSON.stringify(jsonOutput, null, 2);
        document.getElementById('jsonOutput').value = jsonString;
    }
    
    clearCanvas() {
        this.ctx.fillStyle = '#93bf45';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid for reference
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.lineWidth = 1;
        
        const gridSize = 64;
        for (let x = 0; x <= this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y <= this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }
    
    updateStats() {
        document.getElementById('imageCount').textContent = this.images.length;
        
        if (this.packedData) {
            const usedPixels = this.packedData.totalWidth * this.packedData.totalHeight;
            const totalPixels = this.atlasSize * this.atlasSize;
            const usedPercentage = ((usedPixels / totalPixels) * 100).toFixed(1);
            document.getElementById('usedSpace').textContent = `${usedPercentage}%`;
        } else {
            document.getElementById('usedSpace').textContent = '0%';
        }
    }
    
    copyJsonToClipboard() {
        const jsonText = document.getElementById('jsonOutput').value;
        if (jsonText) {
            navigator.clipboard.writeText(jsonText).then(() => {
                alert('JSON copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy:', err);
                alert('Failed to copy to clipboard');
            });
        }
    }
    
    downloadJson() {
        const jsonText = document.getElementById('jsonOutput').value;
        if (jsonText) {
            const blob = new Blob([jsonText], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = 'texture_atlas.json';
            a.click();
            
            URL.revokeObjectURL(url);
        }
    }
    
    exportAtlasData() {
        if (this.packedData) {
            return {
                json: JSON.parse(document.getElementById('jsonOutput').value),
                canvas: this.canvas.toDataURL(),
                images: this.images.map(img => img.originalName)
            };
        }
        return null;
    }
    
    loadProjectData(projectData) {
        if (projectData.textures && projectData.textures.images) {
            // Would need to implement loading images from project data
            console.log('Loading texture data from project');
        }
    }
}