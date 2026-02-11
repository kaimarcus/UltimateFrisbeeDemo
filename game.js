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
        
        // Training mode for learning defensive positioning
        this.trainingMode = false;
        this.trainingExamples = []; // Array of {offenseX, offenseY, defenseX, defenseY}
        this.useLearnedBehavior = false;
        this.selectedPlayer = null; // For manual positioning in training mode
        
        this.initialize();
    }
    
    initialize() {
        // Initialize with some example players
        this.createExamplePlayers();
        this.createDisc();
    }
    
    createExamplePlayers() {
        // Single player at center of field
        this.players.push({
            id: 'player_1',
            team: 1,
            x: 55, // Center of field
            y: 20, // Center width
            vx: 0,
            vy: 0,
            targetX: null,
            targetY: null,
            previousTargetX: null,
            previousTargetY: null,
            speed: 7, // yards per second (normal running speed)
            acceleration: 7 / 3 * 2, // Reach top speed in 3 yards: a = v²/(2d) = 49/(2*3) ≈ 4.67 yards/s²
            deceleration: 7 / 2 * 2, // Stop in 2 yards: a = v²/(2d) = 49/(2*2) = 12.25 yards/s²
            currentSpeed: 0, // Current actual speed
            isDecelerating: false, // Flag to track if currently decelerating for direction change
            color: '#ef4444',
            hasDisc: true,
            isDefender: false
        });
        
        // Add a defender
        this.players.push({
            id: 'defender_1',
            team: 2,
            x: 55, // Same horizontal position as offense
            y: 19, // 1 yard up/toward sideline
            vx: 0,
            vy: 0,
            targetX: null,
            targetY: null,
            previousTargetX: null,
            previousTargetY: null,
            speed: 7, // Same speed as offensive player
            acceleration: 7 / 3 * 2, // Reach top speed in 3 yards
            deceleration: 7 / 2, // Stop in 2 seconds from full speed: 7 yards/sec / 2 sec = 3.5 yards/s²
            currentSpeed: 0, // Current actual speed
            isDecelerating: false, // Flag to track if currently decelerating for direction change
            color: '#3b82f6',
            hasDisc: false,
            isDefender: true
        });
    }
    
    createDisc() {
        this.disc = {
            x: 55, // Center of field
            y: 20, // Center width
            vx: 0,
            vy: 0,
            holder: null, // Player holding the disc
            inFlight: false
        };
    }
    
    update(deltaTime) {
        // Update player positions (even when not running, for smooth movement)
        this.players.forEach(player => {
            // Check if player has a target to move toward
            if (player.targetX !== null && player.targetY !== null) {
                const dx = player.targetX - player.x;
                const dy = player.targetY - player.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Check if target has changed (new click/direction)
                const targetChanged = player.previousTargetX !== player.targetX || player.previousTargetY !== player.targetY;
                if (targetChanged && player.currentSpeed > 1) {
                    // Calculate desired direction for new target
                    const dirX = dx / distance;
                    const dirY = dy / distance;
                    
                    // Calculate current direction of movement
                    const currentMagnitude = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
                    if (currentMagnitude > 0.01) {
                        const currentDirX = player.vx / currentMagnitude;
                        const currentDirY = player.vy / currentMagnitude;
                        
                        // Check if we're changing direction (dot product tells us alignment)
                        const dotProduct = currentDirX * dirX + currentDirY * dirY;
                        
                        // If changing direction significantly, mark for deceleration
                        if (dotProduct < 0.7) {
                            player.isDecelerating = true;
                        }
                    }
                    
                    // Update previous target
                    player.previousTargetX = player.targetX;
                    player.previousTargetY = player.targetY;
                }
                
                // If close enough to target, stop
                if (distance < 0.5) {
                    player.x = player.targetX;
                    player.y = player.targetY;
                    player.vx = 0;
                    player.vy = 0;
                    player.currentSpeed = 0;
                    player.isDecelerating = false;
                    player.targetX = null;
                    player.targetY = null;
                } else if (distance > 0.1) {
                    // Calculate desired direction
                    const dirX = dx / distance;
                    const dirY = dy / distance;
                    
                    // If we're in forced deceleration mode due to direction change
                    if (player.isDecelerating) {
                        // Decelerate
                        player.currentSpeed = Math.max(0, player.currentSpeed - player.deceleration * deltaTime);
                        
                        // Keep moving in current direction while decelerating
                        const currentMagnitude = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
                        if (currentMagnitude > 0.01) {
                            const currentDirX = player.vx / currentMagnitude;
                            const currentDirY = player.vy / currentMagnitude;
                            player.vx = currentDirX * player.currentSpeed;
                            player.vy = currentDirY * player.currentSpeed;
                        }
                        
                        // Once speed is low enough, switch to new direction
                        if (player.currentSpeed < 2) {
                            player.isDecelerating = false;
                        }
                    } else {
                        // Normal movement - calculate target speed based on distance
                        const decelerationDistance = (player.currentSpeed * player.currentSpeed) / (2 * player.deceleration);
                        let targetSpeed;
                        
                        if (distance < decelerationDistance) {
                            // Need to start slowing down to stop at target
                            targetSpeed = Math.sqrt(2 * player.deceleration * distance);
                        } else {
                            targetSpeed = player.speed;
                        }
                        
                        // Apply acceleration or deceleration
                        if (player.currentSpeed < targetSpeed) {
                            // Accelerate
                            player.currentSpeed = Math.min(targetSpeed, player.currentSpeed + player.acceleration * deltaTime);
                        } else if (player.currentSpeed > targetSpeed) {
                            // Decelerate
                            player.currentSpeed = Math.max(targetSpeed, player.currentSpeed - player.deceleration * deltaTime);
                        }
                        
                        // Update velocity with current speed in desired direction
                        player.vx = dirX * player.currentSpeed;
                        player.vy = dirY * player.currentSpeed;
                    }
                } else {
                    player.vx = 0;
                    player.vy = 0;
                    player.currentSpeed = 0;
                    player.isDecelerating = false;
                }
            } else {
                // No target - apply deceleration (momentum continues for 2 yards)
                if (player.currentSpeed > 0.1) {
                    player.currentSpeed = Math.max(0, player.currentSpeed - player.deceleration * deltaTime);
                    
                    // Maintain direction but reduce speed
                    const currentMagnitude = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
                    if (currentMagnitude > 0.01) {
                        const dirX = player.vx / currentMagnitude;
                        const dirY = player.vy / currentMagnitude;
                        player.vx = dirX * player.currentSpeed;
                        player.vy = dirY * player.currentSpeed;
                    }
                } else {
                    player.vx = 0;
                    player.vy = 0;
                    player.currentSpeed = 0;
                }
                player.isDecelerating = false;
            }
            
            // Update position based on velocity
            player.x += player.vx * deltaTime;
            player.y += player.vy * deltaTime;
            
            // Keep players within field bounds
            player.x = Math.max(0, Math.min(this.field.totalLength, player.x));
            player.y = Math.max(0, Math.min(this.field.fieldWidth, player.y));
        });
        
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
    
    render() {
        // Render the field
        this.field.render();
        
        // Render training examples as small dots
        if (this.trainingMode && this.trainingExamples.length > 0) {
            this.trainingExamples.forEach(example => {
                // Draw small markers for training positions
                this.field.drawPlayer(example.offenseX, example.offenseY, '#ef444480', 2);
                this.field.drawPlayer(example.defenseX, example.defenseY, '#3b82f680', 2);
                // Draw line connecting them
                this.field.drawLine(example.offenseX, example.offenseY, 
                                   example.defenseX, example.defenseY, 
                                   '#ffffff40', 1, true);
            });
        }
        
        // Draw mark lines (defender marking offensive player with disc)
        const playerWithDisc = this.players.find(p => p.hasDisc);
        if (playerWithDisc) {
            const defenders = this.players.filter(p => p.isDefender);
            defenders.forEach(defender => {
                // Draw line from defender to player with disc
                this.field.drawLine(
                    defender.x, defender.y,
                    playerWithDisc.x, playerWithDisc.y,
                    '#ffffff',
                    2,
                    false
                );
            });
        }
        
        // Render players
        this.players.forEach(player => {
            let radius = player.hasDisc ? 6 : 4;
            
            // Highlight selected player in training mode
            if (this.trainingMode && this.selectedPlayer === player) {
                radius += 2;
                // Draw selection circle
                const pos = this.field.fieldToCanvas(player.x, player.y);
                this.field.ctx.beginPath();
                this.field.ctx.arc(pos.x, pos.y, radius + 4, 0, Math.PI * 2);
                this.field.ctx.strokeStyle = '#fbbf24';
                this.field.ctx.lineWidth = 2;
                this.field.ctx.stroke();
            }
            
            this.field.drawPlayer(player.x, player.y, player.color, radius);
            
            // Draw velocity vector if moving (not in training mode)
            if (!this.trainingMode && (Math.abs(player.vx) > 0.1 || Math.abs(player.vy) > 0.1)) {
                const targetX = player.x + player.vx * 2;
                const targetY = player.y + player.vy * 2;
                this.field.drawLine(player.x, player.y, targetX, targetY, player.color, 1, true);
            }
        });
        
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
        this.players = [];
        this.disc = null;
        this.team1Score = 0;
        this.team2Score = 0;
        this.initialize();
        console.log('Game reset');
    }
    
    // Example AI movement - you can expand this
    movePlayerToward(player, targetX, targetY, speed = 5) {
        const dx = targetX - player.x;
        const dy = targetY - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 1) {
            player.vx = (dx / distance) * speed;
            player.vy = (dy / distance) * speed;
        } else {
            player.vx = 0;
            player.vy = 0;
        }
    }
    
    // Training mode methods
    toggleTrainingMode() {
        this.trainingMode = !this.trainingMode;
        this.selectedPlayer = null;
        
        if (this.trainingMode) {
            // Stop players from moving in training mode
            this.players.forEach(p => {
                p.targetX = null;
                p.targetY = null;
                p.vx = 0;
                p.vy = 0;
                p.currentSpeed = 0;
            });
            console.log('Training mode enabled. Click players to select, then click field to position them.');
        } else {
            console.log('Training mode disabled.');
        }
        
        return this.trainingMode;
    }
    
    selectPlayer(x, y) {
        if (!this.trainingMode) return null;
        
        const clickRadius = 2; // yards
        
        for (let player of this.players) {
            const dx = player.x - x;
            const dy = player.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < clickRadius) {
                this.selectedPlayer = player;
                console.log(`Selected ${player.isDefender ? 'defender' : 'offensive player'}`);
                return player;
            }
        }
        
        // Don't deselect here - return null to indicate no player was clicked
        return null;
    }
    
    moveSelectedPlayer(x, y) {
        if (!this.trainingMode || !this.selectedPlayer) return false;
        
        this.selectedPlayer.x = x;
        this.selectedPlayer.y = y;
        console.log(`Moved ${this.selectedPlayer.isDefender ? 'defender' : 'offensive player'} to (${x.toFixed(1)}, ${y.toFixed(1)})`);
        return true;
    }
    
    recordTrainingExample() {
        if (!this.trainingMode) return false;
        
        const offensivePlayer = this.players.find(p => !p.isDefender);
        const defender = this.players.find(p => p.isDefender);
        
        if (!offensivePlayer || !defender) {
            console.log('Need both offensive and defensive players');
            return false;
        }
        
        const example = {
            offenseX: offensivePlayer.x,
            offenseY: offensivePlayer.y,
            defenseX: defender.x,
            defenseY: defender.y
        };
        
        this.trainingExamples.push(example);
        console.log(`Recorded example ${this.trainingExamples.length}:`, example);
        console.log(`Total examples: ${this.trainingExamples.length}`);
        
        return true;
    }
    
    clearTrainingExamples() {
        this.trainingExamples = [];
        console.log('Cleared all training examples');
    }
    
    toggleLearnedBehavior() {
        if (this.trainingExamples.length < 3) {
            console.log('Need at least 3 training examples to use learned behavior');
            return false;
        }
        
        this.useLearnedBehavior = !this.useLearnedBehavior;
        console.log(`Learned behavior ${this.useLearnedBehavior ? 'enabled' : 'disabled'}`);
        
        return this.useLearnedBehavior;
    }
    
    // Predict defensive position using k-nearest neighbors weighted average
    predictDefensivePosition(offenseX, offenseY) {
        if (this.trainingExamples.length === 0) {
            return { x: offenseX, y: offenseY - 1 }; // Default fallback
        }
        
        // Calculate distances to all training examples
        const distances = this.trainingExamples.map(example => {
            const dx = example.offenseX - offenseX;
            const dy = example.offenseY - offenseY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return { example, distance };
        });
        
        // Sort by distance
        distances.sort((a, b) => a.distance - b.distance);
        
        // Use k nearest neighbors (k = min(5, number of examples))
        const k = Math.min(5, distances.length);
        const nearest = distances.slice(0, k);
        
        // Weighted average based on inverse distance
        let totalWeight = 0;
        let weightedX = 0;
        let weightedY = 0;
        
        nearest.forEach(({ example, distance }) => {
            // Use inverse distance for weight (add small epsilon to avoid division by zero)
            const weight = 1 / (distance + 0.1);
            totalWeight += weight;
            weightedX += example.defenseX * weight;
            weightedY += example.defenseY * weight;
        });
        
        return {
            x: weightedX / totalWeight,
            y: weightedY / totalWeight
        };
    }
    
    exportTrainingData() {
        return JSON.stringify(this.trainingExamples, null, 2);
    }
    
    importTrainingData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (Array.isArray(data)) {
                this.trainingExamples = data;
                console.log(`Imported ${this.trainingExamples.length} training examples`);
                return true;
            }
        } catch (e) {
            console.error('Failed to import training data:', e);
        }
        return false;
    }
}
