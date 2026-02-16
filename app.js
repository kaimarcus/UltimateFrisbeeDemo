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
    console.log('Press H or click heat map buttons to visualize catch/difficulty/marking');
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
    
    // Heat map toggles: each button turns that layer on/off; multiple = combined (multiplied)
    const heatMapCatchBtn = document.getElementById('heatMapCatchBtn');
    const heatMapDifficultyBtn = document.getElementById('heatMapDifficultyBtn');
    const heatMapMarkingDifficultyBtn = document.getElementById('heatMapMarkingDifficultyBtn');

    const updateHeatMapButtonStates = () => {
        const enabled = game.getHeatMapModesEnabled();
        heatMapCatchBtn.classList.toggle('active', enabled.catch);
        heatMapCatchBtn.textContent = enabled.catch ? 'Catch On' : 'Catch';
        heatMapDifficultyBtn.classList.toggle('active', enabled.difficulty);
        heatMapDifficultyBtn.textContent = enabled.difficulty ? 'Difficulty On' : 'Difficulty';
        heatMapMarkingDifficultyBtn.classList.toggle('active', enabled.markingDifficulty);
        heatMapMarkingDifficultyBtn.textContent = enabled.markingDifficulty ? 'Marking On' : 'Marking';
        field.setHeatMapVisible(game.isAnyHeatMapEnabled());
    };

    heatMapCatchBtn.addEventListener('click', () => {
        game.setHeatMapModeEnabled('catch', !game.getHeatMapModesEnabled().catch);
        updateHeatMapButtonStates();
    });
    heatMapDifficultyBtn.addEventListener('click', () => {
        game.setHeatMapModeEnabled('difficulty', !game.getHeatMapModesEnabled().difficulty);
        updateHeatMapButtonStates();
    });
    heatMapMarkingDifficultyBtn.addEventListener('click', () => {
        game.setHeatMapModeEnabled('markingDifficulty', !game.getHeatMapModesEnabled().markingDifficulty);
        updateHeatMapButtonStates();
    });
    
    // Canvas click - set target for player to run to
    field.canvas.addEventListener('click', (e) => {
        const rect = field.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const fieldCoords = field.canvasToField(x, y);
        
        // Set the target for the movable offensive player (offense_2)
        if (game.players.length > 0) {
            const player = game.players.find(p => p.id === 'offense_2');
            if (player) {
                player.targetX = fieldCoords.x;
                player.targetY = fieldCoords.y;
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
        
        // Get the square value from heat map data
        let squareValueText = '-';
        if (field.showHeatMap && field.heatMapData && fieldCoords.x >= 0 && fieldCoords.y >= 0) {
            const gridSize = field.heatMapData.gridSize;
            const gridX = Math.floor(fieldCoords.x / gridSize);
            const gridY = Math.floor(fieldCoords.y / gridSize);
            const mode = field.heatMapData.mode || 'catch';
            if (field.heatMapData.values[gridX] && 
                field.heatMapData.values[gridX][gridY] !== undefined) {
                const value = field.heatMapData.values[gridX][gridY];
                squareValueText = `${value.toFixed(3)} (${mode})`;
            }
        }
        document.getElementById('squareValue').textContent = squareValueText;
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
            case 'h': // H - turn all heat maps off
                game.setHeatMapModeEnabled('catch', false);
                game.setHeatMapModeEnabled('difficulty', false);
                game.setHeatMapModeEnabled('markingDifficulty', false);
                updateHeatMapButtonStates();
                break;
        }
    });
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
