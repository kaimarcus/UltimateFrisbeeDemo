/**
 * Main Application Entry Point
 * Handles UI interactions and game loop
 */

let field;
let game;
let lastTime = 0;

// Initialize the application
function init() {
    const canvas = document.getElementById('fieldCanvas');
    
    // Create the field
    field = new UltimateField(canvas, {
        showGrid: true,
        scale: 8,
        padding: 40
    });
    
    // Create the game
    game = new UltimateGame(field);
    
    // Setup event listeners
    setupEventListeners();
    
    // Start animation loop
    requestAnimationFrame(gameLoop);
    
    console.log('Ultimate Frisbee Simulation initialized');
    console.log('Click on the field to move the player!');
}

function setupEventListeners() {
    // Reset button
    document.getElementById('resetBtn').addEventListener('click', () => {
        game.reset();
        game.render();
    });
    
    // Toggle grid button
    document.getElementById('toggleGridBtn').addEventListener('click', () => {
        field.toggleGrid();
    });
    
    // Training mode button
    document.getElementById('trainingModeBtn').addEventListener('click', () => {
        const isTraining = game.toggleTrainingMode();
        document.getElementById('trainingModeBtn').textContent = isTraining ? 'Exit Training' : 'Training Mode';
        document.getElementById('trainingModeBtn').style.backgroundColor = isTraining ? '#f59e0b' : '';
        document.getElementById('recordExampleBtn').disabled = !isTraining;
        document.getElementById('trainingStatus').textContent = isTraining ? 'ON' : 'OFF';
        document.getElementById('trainingInstructions').style.display = isTraining ? 'block' : 'none';
        updateExampleCount();
    });
    
    // Record example button
    document.getElementById('recordExampleBtn').addEventListener('click', () => {
        if (game.recordTrainingExample()) {
            updateExampleCount();
            // Flash button to show it worked
            const btn = document.getElementById('recordExampleBtn');
            btn.style.backgroundColor = '#10b981';
            setTimeout(() => btn.style.backgroundColor = '', 300);
        }
    });
    
    // Clear examples button
    document.getElementById('clearExamplesBtn').addEventListener('click', () => {
        if (confirm('Clear all training examples?')) {
            game.clearTrainingExamples();
            updateExampleCount();
            game.render();
        }
    });
    
    // Toggle learned behavior button
    document.getElementById('toggleLearnedBtn').addEventListener('click', () => {
        const isLearned = game.toggleLearnedBehavior();
        document.getElementById('toggleLearnedBtn').textContent = isLearned ? 'Disable Learned AI' : 'Use Learned AI';
        document.getElementById('toggleLearnedBtn').style.backgroundColor = isLearned ? '#10b981' : '';
        document.getElementById('learnedStatus').textContent = isLearned ? 'ON' : 'OFF';
    });
    
    // Export button
    document.getElementById('exportBtn').addEventListener('click', () => {
        const data = game.exportTrainingData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'defense-training-data.json';
        a.click();
        URL.revokeObjectURL(url);
        console.log('Exported training data');
    });
    
    // Import button
    document.getElementById('importBtn').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (game.importTrainingData(event.target.result)) {
                        updateExampleCount();
                        game.render();
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    });
    
    // Canvas click - set target for player to run to OR select/move player in training mode
    field.canvas.addEventListener('click', (e) => {
        const rect = field.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const fieldCoords = field.canvasToField(x, y);
        
        if (game.trainingMode) {
            // Try to select a player first
            const selected = game.selectPlayer(fieldCoords.x, fieldCoords.y);
            if (!selected && game.selectedPlayer) {
                // No player clicked, move the selected player
                if (game.moveSelectedPlayer(fieldCoords.x, fieldCoords.y)) {
                    game.render();
                }
            } else if (selected) {
                game.render();
            }
            updateSelectedPlayer();
        } else {
            // Normal mode - set the target for the player to run to (only the offensive player)
            if (game.players.length > 0) {
                const player = game.players.find(p => !p.isDefender);
                if (player) {
                    player.targetX = fieldCoords.x;
                    player.targetY = fieldCoords.y;
                }
            }
        }
    });
    
    // Mouse move - show coordinates
    field.canvas.addEventListener('mousemove', (e) => {
        const rect = field.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const fieldCoords = field.canvasToField(x, y);
        
        document.getElementById('mousePos').textContent = 
            `(${Math.round(x)}, ${Math.round(y)})px`;
        document.getElementById('fieldCoords').textContent = 
            `(${fieldCoords.x.toFixed(1)}, ${fieldCoords.y.toFixed(1)}) yards`;
    });
    
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        switch(e.key) {
            case ' ': // Space - start/stop
                if (game.isRunning) {
                    game.stop();
                } else {
                    game.start();
                }
                break;
            case 'r': // R - reset
                game.reset();
                game.render();
                break;
            case 'g': // G - toggle grid
                field.toggleGrid();
                break;
            case 't': // T - toggle training mode
                document.getElementById('trainingModeBtn').click();
                break;
            case 'e': // E - record example (when in training mode)
                if (game.trainingMode) {
                    document.getElementById('recordExampleBtn').click();
                }
                break;
            case 'Escape': // Escape - deselect player in training mode
                if (game.trainingMode && game.selectedPlayer) {
                    game.selectedPlayer = null;
                    updateSelectedPlayer();
                    game.render();
                }
                break;
        }
    });
}

function updateExampleCount() {
    const count = game.trainingExamples.length;
    document.getElementById('examplesCount').textContent = `Examples: ${count}`;
    document.getElementById('toggleLearnedBtn').disabled = count < 3;
}

function updateSelectedPlayer() {
    if (game.selectedPlayer) {
        const type = game.selectedPlayer.isDefender ? 'Defender' : 'Offense';
        document.getElementById('selectedPlayer').textContent = type;
    } else {
        document.getElementById('selectedPlayer').textContent = 'None';
    }
}

function gameLoop(currentTime) {
    const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
    lastTime = currentTime;
    
    // Update game state
    game.update(deltaTime);
    
    // Render everything
    game.render();
    
    // Continue the loop
    requestAnimationFrame(gameLoop);
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Example: Simple AI behavior (uncomment to enable)
// setInterval(() => {
//     if (game.isRunning) {
//         // Move players toward disc
//         game.players.forEach(player => {
//             if (!player.hasDisc) {
//                 game.movePlayerToward(player, game.disc.x, game.disc.y, 3);
//             }
//         });
//     }
// }, 100);
