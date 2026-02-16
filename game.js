/**
 * Game Logic and State Management
 * This is where you can build your simulation/game logic
 */

class UltimateGame {
    constructor(field) {
        this.field = field;
        this.players = [];
        this.disc = null;
        this.isRunning = false;
        this.animationFrameId = null;

        // Game state
        this.team1Score = 0;
        this.team2Score = 0;

        // Heat map settings
        this.heatMapGridSize = 1; // 1 yard per cell
        this.heatMapModesEnabled = { catch: false, difficulty: false, markingDifficulty: false, coverage: false };
        this.heatMapNormalize = true; // when true, scale combined values to 0–1 for coloring

        // Player selection for click-to-move
        this.selectedPlayer = null;
        this.clickHitRadiusYards = 2; // yards - how close click must be to select a player

        this.initialize();
    }

    initialize() {
        // Initialize with some example players
        this.createExamplePlayers();
        this.createDisc();
    }

    createExamplePlayers() {
        // Offensive player 1 - has the disc (stationary)
        this.players.push({
            id: 'offense_1',
            team: 1,
            x: 80, // Position on field
            y: 15, // Center width
            color: '#ef4444',
            hasDisc: true,
            isDefender: false,
            isMark: false // This player's defender will be the mark
        });

        // Defender 1 - marks the player with disc (rendered as perpendicular line)
        this.players.push({
            id: 'mark_1',
            team: 2,
            x: 79,
            y: 16,
            color: '#3b82f6',
            hasDisc: false,
            isDefender: true,
            isMark: true // This defender is rendered as a mark line
        });

        // Offensive player 2
        this.players.push({
            id: 'offense_2',
            team: 1,
            x: 55,
            y: 15,
            color: '#ef4444',
            hasDisc: false,
            isDefender: false,
            isMark: false
        });

        // Defender 2
        this.players.push({
            id: 'defender_2',
            team: 2,
            x: 55,
            y: 14, // 1 yard upward offset
            color: '#3b82f6',
            hasDisc: false,
            isDefender: true,
            isMark: false
        });
    }

    createDisc() {
        const holder = this.players.find(p => p.hasDisc) || null;
        const x = holder ? holder.x : 80;
        const y = holder ? holder.y : 15;
        this.disc = {
            x,
            y,
            vx: 0,
            vy: 0,
            holder, // Player holding the disc (synced with player.hasDisc)
            inFlight: false
        };
    }

    update(deltaTime) {
        // Update disc position
        if (this.disc.inFlight) {
            this.disc.x += this.disc.vx * deltaTime;
            this.disc.y += this.disc.vy * deltaTime;

            // Simple disc physics - slow down over time
            this.disc.vx *= 0.98;
            this.disc.vy *= 0.98;

            // Check if disc has landed
            if (Math.abs(this.disc.vx) < 0.1 && Math.abs(this.disc.vy) < 0.1) {
                this.disc.inFlight = false;
                this.disc.vx = 0;
                this.disc.vy = 0;
            }

            // Check for catches
            this.checkCatch();
        } else if (this.disc.holder) {
            // Disc follows the holder
            this.disc.x = this.disc.holder.x;
            this.disc.y = this.disc.holder.y;
        }
    }

    checkCatch() {
        if (!this.disc.inFlight) return;

        const catchRadius = 2; // yards

        this.players.forEach(player => {
            const dx = player.x - this.disc.x;
            const dy = player.y - this.disc.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < catchRadius) {
                this.catchDisc(player);
            }
        });
    }

    catchDisc(player) {
        this.disc.inFlight = false;
        this.disc.holder = player;
        this.disc.vx = 0;
        this.disc.vy = 0;
        player.hasDisc = true;

        console.log(`Player ${player.id} caught the disc at (${Math.round(player.x)}, ${Math.round(player.y)})`);
    }

    throwDisc(targetX, targetY, speed = 30) {
        if (!this.disc.holder) return;

        const dx = targetX - this.disc.x;
        const dy = targetY - this.disc.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        this.disc.vx = (dx / distance) * speed;
        this.disc.vy = (dy / distance) * speed;
        this.disc.inFlight = true;
        this.disc.holder.hasDisc = false;
        this.disc.holder = null;

        console.log(`Disc thrown to (${Math.round(targetX)}, ${Math.round(targetY)})`);
    }

    /**
     * Marking difficulty: how hard it is to throw to (targetX, targetY) given the mark.
     * Uses the same mark center line as throw value (thrower toward (0, 40)).
     * Directly behind the mark (0°) = very difficult = 0; 90° from mark = easiest = 1.
     * Returns a value in [0, 1].
     */
    calculateMarkingDifficultyAt(throwerX, throwerY, targetX, targetY) {
        // Calculate distance from the disc to (targetX, targetY)
        let ease = this.calculateEaseAt(throwerX, throwerY, targetX, targetY);
        const dx = targetX - this.disc.x;
        const dy = targetY - this.disc.y;
        const distanceFromDisc = Math.sqrt(dx * dx + dy * dy);
        let distanceFactor = 1 - (distanceFromDisc / 60)/3;
        if (distanceFactor < 0) distanceFactor = 0;
        //return ease;
        return 1-((1-ease) * distanceFactor);

    }

    calculateEaseAt(throwerX, throwerY, targetX, targetY) {
        const markVector = {
            x: 20 - throwerX,
            y: 40 - throwerY
        };
        const throwVector = {
            x: targetX - throwerX,
            y: targetY - throwerY
        };
        const markLength = Math.sqrt(markVector.x * markVector.x + markVector.y * markVector.y);
        if (markLength < 0.001) return 1; // no well-defined mark direction
        markVector.x /= markLength;
        markVector.y /= markLength;
        const throwLength = Math.sqrt(throwVector.x * throwVector.x + throwVector.y * throwVector.y);
        if (throwLength < 0.001) return 0; // same cell as thrower = ambiguous, treat as hard
        throwVector.x /= throwLength;
        throwVector.y /= throwLength;
        const dotProduct = markVector.x * throwVector.x + markVector.y * throwVector.y;
        const crossProduct = markVector.x * throwVector.y - markVector.y * throwVector.x;
        const angle = Math.atan2(crossProduct, dotProduct);
        const absAngle = Math.abs(angle); // 0 to PI radians (0° to 180°)
        // Ease: 0 at 0°, 1 at 45°, then stay 1 for 45–180° (both sides are easy)
        const quarterPi = Math.PI / 4; // 45 degrees
        if (absAngle >= quarterPi) return 1;
        let ease = absAngle / quarterPi;
        return ease;

        
    }

    /**
     * Difficulty at (x, y): increases with Euclidean distance from the disc.
     * Within 2 yards of the disc, difficulty is 0.7; beyond that it ramps to 1.
     * Returns raw value; normalized to 0–1 in heat map by dividing by max on field.
     */
    calculateDifficultyAt(x, y) {
        const dx = x - this.disc.x;
        const dy = y - this.disc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0) return 0
        const distSq = dist * dist;
        const difficulty = Math.sqrt(distSq) / 80 // distance^4 — difficulty increases faster
        
        //if (dist <= 2) return 1-((1-difficulty)*.7);
        //if (1-difficulty > .8) return .2;
        return difficulty;
    }

    /**
     * Catch value at (x, y): based on distance from the disc.
     * High near the disc (easy to catch), falls off with distance.
     * Uses inverse-distance style decay so the heat map follows the disc.
     */
    calculateCatchValue(x, y) {
        const endZoneDepth = this.field.endZoneDepth;
        const fieldLength = this.field.fieldLength;
        const totalLength = this.field.totalLength;
        // Offense scores at left end zone (low x); own end zone is right (high x)
        const offenseEndZoneEnd = endZoneDepth;
        const discVerticalPosition = this.disc.x //endZoneDepth + fieldLength;

        if (x <= offenseEndZoneEnd) {
            return 1; // In scoring end zone: always 1
        }
        if (x >= discVerticalPosition) {
            return 0; // In own end zone
        }
        // In field: 1 at offense end, 0 at own end
        const progress = (discVerticalPosition - x) / fieldLength;
        let positionValue = Math.max(0, Math.min(1, progress));
        positionValue = positionValue/2 +1/2;
        // Slight bonus for being near center width (easier to advance)
        // Middle 20 yards (10 yards from each sideline) are equally valuable
        // Only the outer 10 yards from each sideline have reduced value
        const fieldCenterY = this.field.fieldWidth / 2;
        const distanceFromCenter = Math.abs(y - fieldCenterY);
        const sideBoundary = 10; // 10 yards from sideline
        
        let centerBonus = 1;
        if (distanceFromCenter > (fieldCenterY - sideBoundary)) {
            // We're in the outer 10 yards from a sideline
            const distanceFromSideline = fieldCenterY - distanceFromCenter;
            const normalizedDist = distanceFromSideline / sideBoundary; // 0 at sideline, 1 at boundary
            centerBonus = 1 - (1 - normalizedDist) * .5 - .7 * ((1 - normalizedDist) ** 8);
        }
        
        return Math.max(0, Math.min(1, positionValue * centerBonus));
    }

    /**
     * Find the topmost player at field coordinates (for click hit-test).
     * Returns the last matching player in the list (drawn on top) or null.
     */
    getPlayerAt(fieldX, fieldY) {
        const r = this.clickHitRadiusYards;
        // Check in reverse order so we pick the one drawn on top
        for (let i = this.players.length - 1; i >= 0; i--) {
            const p = this.players[i];
            const dx = fieldX - p.x;
            const dy = fieldY - p.y;
            if (dx * dx + dy * dy <= r * r) return p;
        }
        return null;
    }

    selectPlayer(player) {
        this.selectedPlayer = player;
    }

    clearSelection() {
        this.selectedPlayer = null;
    }

    /**
     * Move a player to field coordinates (clamped to field bounds).
     */
    movePlayerTo(player, fieldX, fieldY) {
        const x = Math.max(0, Math.min(this.field.totalLength, fieldX));
        const y = Math.max(0, Math.min(this.field.fieldWidth, fieldY));
        player.x = x;
        player.y = y;
        if (player.hasDisc && this.disc.holder === player) {
            this.disc.x = x;
            this.disc.y = y;
        }
    }

    setHeatMapModeEnabled(mode, enabled) {
        if (this.heatMapModesEnabled.hasOwnProperty(mode)) {
            this.heatMapModesEnabled[mode] = !!enabled;
        }
    }

    getHeatMapModesEnabled() {
        return { ...this.heatMapModesEnabled };
    }

    isAnyHeatMapEnabled() {
        return this.heatMapModesEnabled.catch || this.heatMapModesEnabled.difficulty || this.heatMapModesEnabled.markingDifficulty || this.heatMapModesEnabled.coverage;
    }

    getHeatMapNormalize() {
        return this.heatMapNormalize;
    }

    setHeatMapNormalize(enabled) {
        this.heatMapNormalize = !!enabled;
    }

    /**
     * Coverage layer: for each square, the lesser of:
     * - 0 if closest defender is closer than closest offense, else 1 (open).
     * - 0.5 if closest defender's distance to square < half the distance from disc to square, else 1.
     * A square is covered (0) when defender is closer; half-disc gives 0.5; in overlapping areas the lesser value is used.
     */
    _getCoverageLayer(numCellsX, numCellsY, gridSize) {
        // Exclude thrower (has disc) and mark from coverage so we see downfield open/covered
        const offense = this.players.filter(p => !p.isDefender && !p.hasDisc);
        const defense = this.players.filter(p => p.isDefender && !p.isMark);
        const values = [];
        for (let x = 0; x < numCellsX; x++) {
            values[x] = [];
            for (let y = 0; y < numCellsY; y++) {
                const cellX = x * gridSize + gridSize / 2;
                const cellY = y * gridSize + gridSize / 2;
                const discToSquare = Math.hypot(cellX - this.disc.x, cellY - this.disc.y);
                let minOffenseDist = Infinity;
                let minDefenseDist = Infinity;
                for (const p of offense) {
                    const d = Math.hypot(cellX - p.x, cellY - p.y);
                    if (d < minOffenseDist) minOffenseDist = d;
                }
                for (const p of defense) {
                    const d = Math.hypot(cellX - p.x, cellY - p.y);
                    if (d < minDefenseDist) minDefenseDist = d;
                }
                minDefenseDist += 2;
                const defenderCloserThanOffense = minOffenseDist >= minDefenseDist;
                const defenderWithinHalfDiscDistance = minDefenseDist < discToSquare / 2;
                const fromCloser = defenderCloserThanOffense ? 0 : 1;
                const fromHalfDisc = defenderWithinHalfDiscDistance ? 0.5 : 1;
                values[x][y] = Math.min(fromCloser, fromHalfDisc);
            }
        }
        return { values };
    }

    _getCatchLayer(numCellsX, numCellsY, gridSize) {
        const values = [];
        for (let x = 0; x < numCellsX; x++) {
            values[x] = [];
            for (let y = 0; y < numCellsY; y++) {
                const cellX = x * gridSize + gridSize / 2;
                const cellY = y * gridSize + gridSize / 2;
                values[x][y] = this.calculateCatchValue(cellX, cellY);
            }
        }
        return { values };
    }

    _getDifficultyLayer(numCellsX, numCellsY, gridSize) {
        const values = [];
        let maxDifficulty = 0;
        for (let x = 0; x < numCellsX; x++) {
            values[x] = [];
            for (let y = 0; y < numCellsY; y++) {
                const cellX = x * gridSize + gridSize / 2;
                const cellY = y * gridSize + gridSize / 2;
                const d = this.calculateDifficultyAt(cellX, cellY);
                values[x][y] = d;
                if (d > maxDifficulty) maxDifficulty = d;
            }
        }
        if (maxDifficulty > 0) {
            for (let x = 0; x < numCellsX; x++) {
                for (let y = 0; y < numCellsY; y++) {
                    values[x][y] = Math.max(0.2, values[x][y] / maxDifficulty)/2;
                }
            }
        }
        return { values };
    }

    _getMarkingDifficultyLayer(numCellsX, numCellsY, gridSize) {
        const playerWithDisc = this.players.find(p => p.hasDisc);
        if (!playerWithDisc) return null;
        const throwerX = playerWithDisc.x;
        const throwerY = playerWithDisc.y;
        const values = [];
        for (let x = 0; x < numCellsX; x++) {
            values[x] = [];
            for (let y = 0; y < numCellsY; y++) {
                const targetX = x * gridSize + gridSize / 2;
                const targetY = y * gridSize + gridSize / 2;
                values[x][y] = this.calculateMarkingDifficultyAt(throwerX, throwerY, targetX, targetY);
            }
        }
        return { values, throwerX, throwerY };
    }

    calculateHeatMap() {
        if (!this.isAnyHeatMapEnabled()) return null;

        const gridSize = this.heatMapGridSize;
        const numCellsX = Math.ceil(this.field.totalLength / gridSize);
        const numCellsY = Math.ceil(this.field.fieldWidth / gridSize);
        const enabled = this.heatMapModesEnabled;
        const layers = [];

        if (enabled.catch) {
            layers.push({ key: 'catch', ...this._getCatchLayer(numCellsX, numCellsY, gridSize) });
        }
        if (enabled.difficulty) {
            const diff = this._getDifficultyLayer(numCellsX, numCellsY, gridSize);
            layers.push({ key: 'difficulty', ...diff });
        }
        if (enabled.markingDifficulty) {
            const layer = this._getMarkingDifficultyLayer(numCellsX, numCellsY, gridSize);
            if (layer) layers.push({ key: 'markingDifficulty', ...layer });
        }
        if (enabled.coverage) {
            layers.push({ key: 'coverage', ...this._getCoverageLayer(numCellsX, numCellsY, gridSize) });
        }

        if (layers.length === 0) return null;

        let throwerX = this.disc.x, throwerY = this.disc.y;
        const layerWithThrower = layers.find(l => l.throwerX !== undefined);
        if (layerWithThrower) {
            throwerX = layerWithThrower.throwerX;
            throwerY = layerWithThrower.throwerY;
        }
        const values = [];
        for (let x = 0; x < numCellsX; x++) {
            values[x] = [];
            for (let y = 0; y < numCellsY; y++) {
                let product = 1;
                for (const layer of layers) {
                    let v = layer.values[x][y];
                    if (layer.key === 'difficulty') v = 1 - v;
                    product *= v;
                }
                values[x][y] = product;
            }
        }
        // Optionally normalize so highest value is 1 and lowest is 0
        if (this.heatMapNormalize) {
            let min = Infinity, max = -Infinity;
            for (let x = 0; x < numCellsX; x++) {
                for (let y = 0; y < numCellsY; y++) {
                    const v = values[x][y];
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
            }
            const range = max - min;
            if (range > 0) {
                for (let x = 0; x < numCellsX; x++) {
                    for (let y = 0; y < numCellsY; y++) {
                        values[x][y] = (values[x][y] - min) / range;
                    }
                }
            }
        }
        return {
            gridSize,
            values,
            throwerX,
            throwerY,
            mode: layers.length > 1 ? 'combined' : layers[0].key
        };
    }

    /**
     * Returns the sum of all cell values of the combined heat map using all 4 layers,
     * combined by product (difficulty inverted to 1-v), pre-normalization (no min-max scale).
     * Used to evaluate a defender position: lower sum = better defense.
     */
    _getCombinedHeatMapSumPreNormalized() {
        const gridSize = this.heatMapGridSize;
        const numCellsX = Math.ceil(this.field.totalLength / gridSize);
        const numCellsY = Math.ceil(this.field.fieldWidth / gridSize);

        const catchLayer = this._getCatchLayer(numCellsX, numCellsY, gridSize);
        const diffLayer = this._getDifficultyLayer(numCellsX, numCellsY, gridSize);
        const markingLayer = this._getMarkingDifficultyLayer(numCellsX, numCellsY, gridSize);
        const coverageLayer = this._getCoverageLayer(numCellsX, numCellsY, gridSize);

        if (!markingLayer) return Infinity; // no thrower

        let sum = 0;
        for (let x = 0; x < numCellsX; x++) {
            for (let y = 0; y < numCellsY; y++) {
                const catchVal = catchLayer.values[x][y];
                const diffVal = diffLayer.values[x][y];
                const markVal = markingLayer.values[x][y];
                const covVal = coverageLayer.values[x][y];
                const product = catchVal * (1 - diffVal) * markVal * covVal;
                sum += product;
            }
        }
        return sum;
    }

    /**
     * Public getter for the pre-normalization combined heat map sum (all 4 layers).
     * Returns null if there is no thrower (no marking layer).
     */
    getCombinedHeatMapSumPreNormalized() {
        const sum = this._getCombinedHeatMapSumPreNormalized();
        return sum === Infinity ? null : sum;
    }

    /**
     * Finds the position for the downfield defender that minimizes the sum of the
     * combined heat map (all 4 layers, pre-normalization) within a 5 yard radius
     * of the offender (offensive player without the disc), then moves the defender there.
     */
    positionDefenderOptimal() {
        const downfieldDefender = this.players.find(p => p.isDefender && !p.isMark);
        if (!downfieldDefender) return;

        const offender = this.players.find(p => !p.isDefender && !p.hasDisc);
        if (!offender) return;

        const radiusYards = 5;
        const radiusSq = radiusYards * radiusYards;

        const gridSize = this.heatMapGridSize;
        const numCellsX = Math.ceil(this.field.totalLength / gridSize);
        const numCellsY = Math.ceil(this.field.fieldWidth / gridSize);

        let bestSum = Infinity;
        let bestX = downfieldDefender.x;
        let bestY = downfieldDefender.y;

        for (let xi = 0; xi < numCellsX; xi++) {
            for (let yi = 0; yi < numCellsY; yi++) {
                const cellCenterX = xi * gridSize + gridSize / 2;
                const cellCenterY = yi * gridSize + gridSize / 2;
                const dx = cellCenterX - offender.x;
                const dy = cellCenterY - offender.y;
                if (dx * dx + dy * dy > radiusSq) continue;

                const clampedX = Math.max(0, Math.min(this.field.totalLength, cellCenterX));
                const clampedY = Math.max(0, Math.min(this.field.fieldWidth, cellCenterY));

                this.movePlayerTo(downfieldDefender, clampedX, clampedY);
                const sum = this._getCombinedHeatMapSumPreNormalized();
                if (sum < bestSum) {
                    bestSum = sum;
                    bestX = clampedX;
                    bestY = clampedY;
                }
            }
        }

        this.movePlayerTo(downfieldDefender, bestX, bestY);
    }

    /**
     * Finds the highest value square in the combined heat map (all 4 layers)
     * and moves the offender (offensive player without disc) to that position.
     */
    positionOffenderOptimal() {
        const offender = this.players.find(p => !p.isDefender && !p.hasDisc);
        if (!offender) return;

        const gridSize = this.heatMapGridSize;
        const numCellsX = Math.ceil(this.field.totalLength / gridSize);
        const numCellsY = Math.ceil(this.field.fieldWidth / gridSize);

        // Get all 4 layers
        const catchLayer = this._getCatchLayer(numCellsX, numCellsY, gridSize);
        const diffLayer = this._getDifficultyLayer(numCellsX, numCellsY, gridSize);
        const markingLayer = this._getMarkingDifficultyLayer(numCellsX, numCellsY, gridSize);
        const coverageLayer = this._getCoverageLayer(numCellsX, numCellsY, gridSize);

        if (!markingLayer) return; // no thrower

        // Find the cell with the highest combined value
        let maxValue = -Infinity;
        let bestX = offender.x;
        let bestY = offender.y;

        for (let x = 0; x < numCellsX; x++) {
            for (let y = 0; y < numCellsY; y++) {
                const catchVal = catchLayer.values[x][y];
                const diffVal = diffLayer.values[x][y];
                const markVal = markingLayer.values[x][y];
                const covVal = coverageLayer.values[x][y];
                // Combined product (difficulty inverted like in calculateHeatMap)
                const product = catchVal * (1 - diffVal) * markVal * covVal;

                if (product > maxValue) {
                    maxValue = product;
                    bestX = x * gridSize + gridSize / 2;
                    bestY = y * gridSize + gridSize / 2;
                }
            }
        }

        // Clamp to field bounds and move the offender
        const clampedX = Math.max(0, Math.min(this.field.totalLength, bestX));
        const clampedY = Math.max(0, Math.min(this.field.fieldWidth, bestY));
        this.movePlayerTo(offender, clampedX, clampedY);
    }

    /**
     * Moves the offender to the middle of the field, 20 yards downfield from the disc (left).
     * This is a "go to stack" position.
     */
    positionOffenderStack() {
        const offender = this.players.find(p => !p.isDefender && !p.hasDisc);
        if (!offender) return;

        // Position 20 yards downfield from disc (left side = lower x coordinate)
        const stackX = this.disc.x - 20;
        // Middle of the field
        const stackY = this.field.fieldWidth / 2;

        // Clamp to field bounds and move the offender
        const clampedX = Math.max(0, Math.min(this.field.totalLength, stackX));
        const clampedY = Math.max(0, Math.min(this.field.fieldWidth, stackY));
        this.movePlayerTo(offender, clampedX, clampedY);
    }

    updateHeatMap() {
        const heatMapData = this.calculateHeatMap();
        this.field.setHeatMapData(heatMapData);
        this.field.setHeatMapVisible(this.isAnyHeatMapEnabled());
    }

    render() {
        // Update heat map if enabled
        this.updateHeatMap();

        // Render the field
        this.field.render();

        // Render players
        this.players.forEach(player => {
            let radius = player.hasDisc ? 6 : 4;
            const isSelected = this.selectedPlayer === player;

            this.field.drawPlayer(player.x, player.y, player.color, radius);
            if (isSelected) {
                this.field.drawPlayerSelectionRing(player.x, player.y, Math.max(radius + 4, 10));
            }
        });

        // Render disc (position tied to holder in update() when not in flight)
        this.field.drawDisc(this.disc.x, this.disc.y);
        if (this.disc.inFlight) {
            const targetX = this.disc.x + this.disc.vx * 2;
            const targetY = this.disc.y + this.disc.vy * 2;
            this.field.drawLine(this.disc.x, this.disc.y, targetX, targetY, '#fbbf24', 2, true);
        }
    }

    start() {
        this.isRunning = true;
        console.log('Game started');
    }

    stop() {
        this.isRunning = false;
        console.log('Game stopped');
    }

    reset() {
        this.stop();
        this.selectedPlayer = null;
        this.players = [];
        this.disc = null;
        this.team1Score = 0;
        this.team2Score = 0;
        this.initialize();
        console.log('Game reset');
    }
}
