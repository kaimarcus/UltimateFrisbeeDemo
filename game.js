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
        this.disc = {
            x: 80, // Match disc holder position
            y: 15, // Match disc holder position
            vx: 0,
            vy: 0,
            holder: null, // Player holding the disc
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

    calculateThrowValue(currentX, currentY, targetX, targetY) {
        // --- 1. DISTANCE GAIN COMPONENT (0 to 1) ---
        const distanceGain = currentX - targetX; // Positive = forward (toward left endzone)
        const maxRealisticGain = 70; // Extended to 70 yards for long throws

        let distanceValue;
        if (distanceGain >= 0) {
            // Positive gains are normal
            distanceValue = Math.min(1, distanceGain / maxRealisticGain);
        } else {
            // Negative throws (backwards to the right) have rapidly diminishing value
            // At -5 yards: e^(-5/2) ≈ 0.082 (very low)
            // At -10 yards: e^(-10/2) ≈ 0.007 (nearly zero)
            const decayRate = 2; // Controls how quickly value drops
            distanceValue = Math.exp(distanceGain / decayRate);
        }

        // --- 2. FIELD CENTER COMPONENT (0 to 1) ---
        const fieldCenter = 20; // Center width is 20 yards
        const distanceFromCenter = Math.abs(targetY - fieldCenter);
        const maxDistanceFromCenter = 20; // Max is at sideline
        const centerValue = 1 - (distanceFromCenter / maxDistanceFromCenter);

        // --- 3. COMPLETION PROBABILITY (0 to 1) ---
        const dx = targetX - currentX;
        const dy = targetY - currentY;
        const throwDistance = Math.sqrt(dx * dx + dy * dy);

        // Steeper exponential decay for very long throws
        const completionProb = Math.exp(-throwDistance / 40);

        // --- 4. MARK INFLUENCE (0 to 1) ---
        // Mark is always on the line from thrower to (0, 40)
        const markVector = {
            x: 0 - currentX,  // Vector from thrower to (0, 40)
            y: 40 - currentY
        };

        const throwVector = {
            x: targetX - currentX,
            y: targetY - currentY
        };

        // Normalize mark vector (from origin to thrower)
        const markLength = Math.sqrt(markVector.x * markVector.x + markVector.y * markVector.y);
        if (markLength > 0) {
            markVector.x /= markLength;
            markVector.y /= markLength;
        }

        // Normalize throw vector
        const throwLength = Math.sqrt(throwVector.x * throwVector.x + throwVector.y * throwVector.y);
        if (throwLength > 0) {
            throwVector.x /= throwLength;
            throwVector.y /= throwLength;
        }

        // Dot product gives cos(angle)
        const dotProduct = markVector.x * throwVector.x + markVector.y * throwVector.y;

        // Cross product gives direction
        const crossProduct = markVector.x * throwVector.y - markVector.y * throwVector.x;

        // Calculate angle in radians
        const angle = Math.atan2(crossProduct, dotProduct);
        const absAngle = Math.abs(angle);

        // Mark heavily influences ±45 degrees (π/4 radians)
        const highPenaltyZone = Math.PI / 4;  // 45 degrees
        const fullInfluenceZone = Math.PI / 2; // 90 degrees

        let markPenalty = 1.0;

        if (absAngle < highPenaltyZone) {
            // Within 45 degrees - SEVERE penalty (90% at center)
            const influenceFactor = 1 - (absAngle / highPenaltyZone);
            markPenalty = 1 - (0.9 * influenceFactor); // Up to 90% penalty
        } else if (absAngle < fullInfluenceZone) {
            // Between 45-90 degrees - moderate tapering penalty
            const taperingFactor = (absAngle - highPenaltyZone) / (fullInfluenceZone - highPenaltyZone);
            markPenalty = 0.1 + (0.9 * taperingFactor);
        }

        // --- 5. COMBINE ALL FACTORS ---
        const weights = {
            distance: 0.30,    // 30% - reward distance
            center: 0.10,      // 10% - reward central position
            completion: 0.40,  // 40% - heavily penalize risky throws
            mark: 0.20         // 20% - heavily penalize throwing into mark
        };

        let finalValue = (
            distanceValue * weights.distance +
            centerValue * weights.center +
            completionProb * weights.completion +
            markPenalty * weights.mark
        );

        // Apply additional penalty multiplier for negative throws
        if (distanceGain < 0) {
            // At -5 yards: e^(-5/3) ≈ 0.189
            // At -10 yards: e^(-10/3) ≈ 0.036
            const negativeMultiplier = Math.exp(distanceGain / 3);
            finalValue *= negativeMultiplier;
        }

        return Math.max(0, Math.min(1, finalValue));
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
        return 1-((1-ease) * distanceFactor);

    }

    calculateEaseAt(throwerX, throwerY, targetX, targetY) {
        const markVector = {
            x: 0 - throwerX,
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
        // Ease: 0 at 0°, 1 at 90°, then stay 1 for 90–180° (both sides are easy)
        const halfPi = Math.PI / 2;
        if (absAngle >= halfPi) return 1;
        let ease = absAngle / halfPi;
        return ease;

        
    }

    /**
     * Difficulty at (x, y): increases quadratically with Euclidean distance from the disc.
     * Returns squared distance in yards² (raw). Normalized to 0–1 in heat map by dividing by max on field.
     */
    calculateDifficultyAt(x, y) {
        const dx = x - this.disc.x;
        const dy = y - this.disc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const distSq = dist * dist;
        return Math.sqrt(distSq) / 80 // distance^4 — difficulty increases faster
    }

    /**
     * Value to offense of having the disc at (x, y): 1 = scoring end zone, 0 = own end zone,
     * in between = progress toward scoring (left = good). Includes slight center-width bonus.
     */
    calculateCatchValue(x, y) {
        const endZoneDepth = this.field.endZoneDepth;
        const fieldLength = this.field.fieldLength;
        const totalLength = this.field.totalLength;
        // Offense scores at left end zone (low x); own end zone is right (high x)
        const offenseEndZoneEnd = endZoneDepth;
        const ownEndZoneStart = endZoneDepth + fieldLength;

        if (x <= offenseEndZoneEnd) {
            return 1; // In scoring end zone: always 1
        }
        if (x >= ownEndZoneStart) {
            return 0; // In own end zone
        }
        // In field: 1 at offense end, 0 at own end
        const progress = (ownEndZoneStart - x) / fieldLength;
        let positionValue = Math.max(0, Math.min(1, progress));
        // Slight bonus for being near center width (easier to advance)
        const fieldCenterY = this.field.fieldWidth / 2;
        const distanceFromCenter = Math.abs(y - fieldCenterY);
        const centerBonus = 1 - (distanceFromCenter / (this.field.fieldWidth / 2)) * .5 - 1 * (distanceFromCenter ** 4 / (this.field.fieldWidth / 2) ** 4);
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
                    values[x][y] /= maxDifficulty;
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
            // Skip mark defenders - they will be rendered as lines
            if (player.isMark) return;

            let radius = player.hasDisc ? 6 : 4;
            const isSelected = this.selectedPlayer === player;

            this.field.drawPlayer(player.x, player.y, player.color, radius);
            if (isSelected) {
                this.field.drawPlayerSelectionRing(player.x, player.y, Math.max(radius + 4, 10));
            }
        });

        // Draw mark as perpendicular line
        const playerWithDisc = this.players.find(p => p.hasDisc);
        const markDefender = this.players.find(p => p.isMark);
        if (playerWithDisc && markDefender) {
            // Calculate vector from player with disc to (0, 40)
            const dx = 0 - playerWithDisc.x;
            const dy = 40 - playerWithDisc.y;
            const length = Math.sqrt(dx * dx + dy * dy);

            // Normalize the vector
            const normX = dx / length;
            const normY = dy / length;

            // Perpendicular vector (rotate 90 degrees)
            const perpX = -normY;
            const perpY = normX;

            // Draw line perpendicular to the player-corner line, centered at mark defender position
            const markLineLength = 3; // yards
            const x1 = markDefender.x - perpX * markLineLength / 2;
            const y1 = markDefender.y - perpY * markLineLength / 2;
            const x2 = markDefender.x + perpX * markLineLength / 2;
            const y2 = markDefender.y + perpY * markLineLength / 2;

            this.field.drawLine(x1, y1, x2, y2, markDefender.color, 3, false);
        }

        // Render disc
        if (!this.disc.holder) {
            this.field.drawDisc(this.disc.x, this.disc.y);

            // Draw disc trajectory if in flight
            if (this.disc.inFlight) {
                const targetX = this.disc.x + this.disc.vx * 2;
                const targetY = this.disc.y + this.disc.vy * 2;
                this.field.drawLine(this.disc.x, this.disc.y, targetX, targetY, '#fbbf24', 2, true);
            }
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
