/**
 * Ultimate Frisbee Field Renderer
 * Standard field dimensions: 70 yards long x 40 yards wide
 * End zones: 20 yards deep each
 */

class UltimateField {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Field dimensions in yards
        this.fieldLength = 70;  // Playing field length (excluding end zones)
        this.fieldWidth = 40;   // Field width
        this.endZoneDepth = 20; // End zone depth
        this.totalLength = this.fieldLength + (this.endZoneDepth * 2); // 110 yards total
        this.sidelineWidth = 15; // Sideline strip to the left of the field (x < 0)
        this.sidelineLeft = -this.sidelineWidth; // Left edge of coordinate system

        // Rendering options
        this.showGrid = options.showGrid !== undefined ? options.showGrid : true;
        this.scale = options.scale || 8; // pixels per yard
        this.padding = options.padding || 40;
        
        // Colors
        this.colors = {
            grass: '#2d5a3d',
            grassDark: '#1a472a',
            lines: '#ffffff',
            endZone1: 'rgba(239, 68, 68, 0.2)',
            endZone2: 'rgba(59, 130, 246, 0.2)',
            gridLines: 'rgba(255, 255, 255, 0.1)',
            brickMark: '#fbbf24',
            sideline: 'rgba(100, 100, 100, 0.5)',
            sidelineLine: 'rgba(255, 255, 255, 0.6)',
        };
        
        // Heat map settings
        this.showHeatMap = false;
        this.heatMapData = null;
        
        this.setupCanvas();
        this.render();
    }
    
    setupCanvas() {
        const totalYardsX = this.sidelineWidth + this.totalLength;
        const width = (totalYardsX * this.scale) + (this.padding * 2);
        const height = (this.fieldWidth * this.scale) + (this.padding * 2);

        this.canvas.width = width;
        this.canvas.height = height;

        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
    }

    // Convert field coordinates (yards) to canvas coordinates (pixels).
    // Field x runs from sidelineLeft (-sidelineWidth) to totalLength.
    fieldToCanvas(x, y) {
        return {
            x: this.padding + (x - this.sidelineLeft) * this.scale,
            y: this.padding + (y * this.scale)
        };
    }

    // Convert canvas coordinates (pixels) to field coordinates (yards).
    canvasToField(x, y) {
        return {
            x: this.sidelineLeft + (x - this.padding) / this.scale,
            y: (y - this.padding) / this.scale
        };
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw sideline area (left of field — players here are off the field for heat maps)
        this.drawSideline();
        // Draw grass background
        this.drawGrass();
        // Draw end zones
        this.drawEndZones();
        
        // Draw heat map if enabled (before grid and field lines)
        if (this.showHeatMap && this.heatMapData) {
            this.drawHeatMap();
        }
        
        // Draw grid if enabled
        if (this.showGrid) {
            this.drawGrid();
        }
        
        // Draw field markings
        this.drawFieldLines();
        this.drawBrickMarks();
        this.drawCenterLine();
        
        // Draw yard markers
        this.drawYardMarkers();
    }
    
    drawSideline() {
        const topLeft = this.fieldToCanvas(this.sidelineLeft, 0);
        const bottomRight = this.fieldToCanvas(0, this.fieldWidth);
        this.ctx.fillStyle = this.colors.sideline;
        this.ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
        this.ctx.strokeStyle = this.colors.sidelineLine;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(bottomRight.x, topLeft.y);
        this.ctx.lineTo(bottomRight.x, bottomRight.y);
        this.ctx.stroke();
    }

    drawGrass() {
        const start = this.fieldToCanvas(0, 0);
        const end = this.fieldToCanvas(this.totalLength, this.fieldWidth);

        // Create striped grass pattern
        const stripeWidth = 5 * this.scale;
        for (let x = 0; x < this.totalLength; x += 10) {
            const pos = this.fieldToCanvas(x, 0);
            const width = stripeWidth;

            this.ctx.fillStyle = x % 20 === 0 ? this.colors.grass : this.colors.grassDark;
            this.ctx.fillRect(pos.x, start.y, width, end.y - start.y);
        }
    }
    
    drawEndZones() {
        // Left end zone (red)
        const leftStart = this.fieldToCanvas(0, 0);
        const leftEnd = this.fieldToCanvas(this.endZoneDepth, this.fieldWidth);
        this.ctx.fillStyle = this.colors.endZone1;
        this.ctx.fillRect(leftStart.x, leftStart.y, leftEnd.x - leftStart.x, leftEnd.y - leftStart.y);
        
        // Right end zone (blue)
        const rightStart = this.fieldToCanvas(this.endZoneDepth + this.fieldLength, 0);
        const rightEnd = this.fieldToCanvas(this.totalLength, this.fieldWidth);
        this.ctx.fillStyle = this.colors.endZone2;
        this.ctx.fillRect(rightStart.x, rightStart.y, rightEnd.x - rightStart.x, rightEnd.y - rightStart.y);
    }
    
    drawGrid() {
        this.ctx.strokeStyle = this.colors.gridLines;
        this.ctx.lineWidth = 0.5;
        
        // Vertical grid lines (every 5 yards)
        for (let x = 0; x <= this.totalLength; x += 5) {
            const start = this.fieldToCanvas(x, 0);
            const end = this.fieldToCanvas(x, this.fieldWidth);
            
            this.ctx.beginPath();
            this.ctx.moveTo(start.x, start.y);
            this.ctx.lineTo(end.x, end.y);
            this.ctx.stroke();
        }
        
        // Horizontal grid lines (every 5 yards)
        for (let y = 0; y <= this.fieldWidth; y += 5) {
            const start = this.fieldToCanvas(0, y);
            const end = this.fieldToCanvas(this.totalLength, y);
            
            this.ctx.beginPath();
            this.ctx.moveTo(start.x, start.y);
            this.ctx.lineTo(end.x, end.y);
            this.ctx.stroke();
        }
    }
    
    drawFieldLines() {
        this.ctx.strokeStyle = this.colors.lines;
        this.ctx.lineWidth = 2;
        
        // Perimeter
        const topLeft = this.fieldToCanvas(0, 0);
        const bottomRight = this.fieldToCanvas(this.totalLength, this.fieldWidth);
        this.ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
        
        // Goal lines (end zone boundaries)
        this.drawVerticalLine(this.endZoneDepth);
        this.drawVerticalLine(this.endZoneDepth + this.fieldLength);
    }
    
    drawVerticalLine(xPos) {
        const start = this.fieldToCanvas(xPos, 0);
        const end = this.fieldToCanvas(xPos, this.fieldWidth);
        
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.stroke();
    }
    
    drawCenterLine() {
        const centerX = this.endZoneDepth + (this.fieldLength / 2);
        this.ctx.strokeStyle = this.colors.lines;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        
        this.drawVerticalLine(centerX);
        
        this.ctx.setLineDash([]);
    }
    
    drawBrickMarks() {
        // Brick marks at 20 yards from goal lines
        const brickDistance = 20;
        const leftBrick = this.endZoneDepth + brickDistance;
        const rightBrick = this.endZoneDepth + this.fieldLength - brickDistance;
        
        this.ctx.fillStyle = this.colors.brickMark;
        this.ctx.strokeStyle = this.colors.brickMark;
        this.ctx.lineWidth = 2;
        
        // Draw brick marks
        [leftBrick, rightBrick].forEach(x => {
            const center = this.fieldToCanvas(x, this.fieldWidth / 2);
            
            // Draw a small cross
            const size = 8;
            this.ctx.beginPath();
            this.ctx.moveTo(center.x - size, center.y);
            this.ctx.lineTo(center.x + size, center.y);
            this.ctx.moveTo(center.x, center.y - size);
            this.ctx.lineTo(center.x, center.y + size);
            this.ctx.stroke();
        });
    }
    
    drawYardMarkers() {
        this.ctx.fillStyle = this.colors.lines;
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Mark every 10 yards on the playing field
        for (let i = 10; i <= this.fieldLength - 10; i += 10) {
            const x = this.endZoneDepth + i;
            const pos = this.fieldToCanvas(x, this.fieldWidth / 2);
            
            // Draw yard number at top and bottom
            const topPos = this.fieldToCanvas(x, -2);
            const bottomPos = this.fieldToCanvas(x, this.fieldWidth + 2);
            
            this.ctx.fillText(i.toString(), topPos.x, topPos.y);
            this.ctx.fillText(i.toString(), bottomPos.x, bottomPos.y);
        }
    }
    
    toggleGrid() {
        this.showGrid = !this.showGrid;
        this.render();
    }
    
    toggleHeatMap() {
        this.showHeatMap = !this.showHeatMap;
        this.render();
    }
    
    setHeatMapVisible(visible) {
        this.showHeatMap = !!visible;
    }
    
    setHeatMapData(heatMapData) {
        this.heatMapData = heatMapData;
    }
    
    drawHeatMap() {
        if (!this.heatMapData) return;
        
        const { gridSize, values } = this.heatMapData;
        
        // Always: 0 = red, 1 = green (no inversion per mode)
        for (let x = 0; x < this.totalLength; x += gridSize) {
            for (let y = 0; y < this.fieldWidth; y += gridSize) {
                const gridX = Math.floor(x / gridSize);
                const gridY = Math.floor(y / gridSize);
                const value = Math.max(0, Math.min(1, values[gridX][gridY]));
                
                const color = this.valueToColor(value);
                
                const start = this.fieldToCanvas(x, y);
                const end = this.fieldToCanvas(x + gridSize, y + gridSize);
                
                this.ctx.fillStyle = color;
                this.ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
            }
        }
    }
    
    valueToColor(value) {
        // Fine gradient: many shades so close values are easy to tell apart.
        // Low (0) = dark red -> red -> orange -> yellow -> lime -> green (1)
        const alpha = 0.6;
        // 10 stops for clear separation: 0, 0.1, 0.2, ... 1.0
        const stops = [
            { v: 0,   r: 128, g: 0,   b: 0 },   // dark red
            { v: 0.1, r: 200, g: 0,   b: 0 },   // red
            { v: 0.2, r: 255, g: 80,  b: 0 },   // red-orange
            { v: 0.3, r: 255, g: 140, b: 0 },   // orange
            { v: 0.4, r: 255, g: 180, b: 0 },   // orange-yellow
            { v: 0.5, r: 255, g: 220, b: 0 },   // yellow
            { v: 0.6, r: 220, g: 255, b: 0 },   // yellow-green
            { v: 0.7, r: 160, g: 255, b: 60 }, // lime
            { v: 0.8, r: 80,  g: 255, b: 80 }, // green
            { v: 0.9, r: 0,   g: 220, b: 80 }, // dark green
            { v: 1,   r: 0,   g: 180, b: 60 }, // deep green
        ];
        let i = 0;
        while (i < stops.length - 1 && value > stops[i + 1].v) i++;
        const a = stops[i];
        const b = stops[i + 1];
        const t = (value - a.v) / (b.v - a.v);
        const r = Math.round(a.r + t * (b.r - a.r));
        const g = Math.round(a.g + t * (b.g - a.g));
        const bl = Math.round(a.b + t * (b.b - a.b));
        return `rgba(${r}, ${g}, ${bl}, ${alpha})`;
    }
    
    // Helper method to draw objects on the field
    drawPlayer(x, y, color = '#ffffff', radius = 4, label = '') {
        const pos = this.fieldToCanvas(x, y);
        
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        if (label) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = `bold ${Math.max(6, radius * 1.4)}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(label, pos.x, pos.y);
        }
    }

    drawPlayerSelectionRing(x, y, radiusPixels = 12) {
        const pos = this.fieldToCanvas(x, y);
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, radiusPixels, 0, Math.PI * 2);
        this.ctx.fillStyle = 'transparent';
        this.ctx.strokeStyle = '#fbbf24';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([6, 4]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }
    
    drawDisc(x, y, radius = 3) {
        const pos = this.fieldToCanvas(x, y);
        
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fill();
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
    }
    
    drawLine(x1, y1, x2, y2, color = '#ffffff', width = 2, dashed = false) {
        const start = this.fieldToCanvas(x1, y1);
        const end = this.fieldToCanvas(x2, y2);
        
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        
        if (dashed) {
            this.ctx.setLineDash([5, 5]);
        }
        
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.stroke();
        
        if (dashed) {
            this.ctx.setLineDash([]);
        }
    }
}
