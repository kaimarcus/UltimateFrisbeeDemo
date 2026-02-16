# Ultimate Frisbee Field Simulation

A web-based ultimate frisbee field visualization and game simulation framework.

## Features

- **Accurate Field Rendering**: Standard 70x40 yard field with 20-yard end zones
- **Interactive Canvas**: Click to move players and control the simulation
- **AI Training Mode**: Record offensive/defensive positions to train AI behavior
- **Learned Defensive AI**: Machine learning approach using k-nearest neighbors
- **Game Framework**: Built-in player and disc physics with realistic movement
- **Responsive Controls**: Keyboard shortcuts and UI buttons
- **Extensible Architecture**: Clean separation between field rendering and game logic
- **Export/Import**: Save and load training data for AI behavior

## Getting Started

1. Open `index.html` in a web browser
2. The field will render with an offensive player (red) and defender (blue)
3. Click anywhere on the field to move the offensive player
4. The defender will automatically track using rule-based AI
5. Use Training Mode to teach the AI custom defensive positioning

## Training Mode

### How to Use Training Mode

1. Click the **"Training Mode"** button (or press `T`)
2. Click on a player to select them (yellow circle appears)
3. Click on the field to move the selected player
4. Position players to demonstrate good defensive positioning
5. Click **"Record Example"** (or press `E`) to save the positions
6. Repeat for different scenarios (minimum 3 examples recommended)
7. Click **"Use Learned AI"** to enable AI based on your examples
8. Exit training mode to test the learned behavior

### Training Tips

- Create examples for different field positions (sideline, endzone, center)
- Show where the defender should position based on offense location
- The AI uses k-nearest neighbors to interpolate between your examples
- More examples = better AI behavior
- Use **Export Data** to save your training set
- Use **Import Data** to load previously saved training sets

## File Structure

- `index.html` - Main HTML structure
- `styles.css` - Styling and layout
- `field.js` - UltimateField class for rendering the field
- `game.js` - UltimateGame class for game logic and state
- `app.js` - Main application and event handling

## Field Dimensions

- **Total Length**: 110 yards (including end zones)
- **Playing Field**: 70 yards
- **Width**: 40 yards
- **End Zones**: 20 yards each
- **Brick Marks**: 20 yards from goal lines

## Extending the Simulation

### Adding Custom Game Logic

Edit `game.js` to add your own game rules:

```javascript
// Example: Add custom player behavior (e.g. read positions, update game state)
game.players.forEach(player => {
    if (player.team === 1) {
        // Use player.x, player.y for position
    }
});
```

### Drawing Custom Objects

Use the field's drawing methods:

```javascript
// Draw a player
field.drawPlayer(x, y, color, radius);

// Draw the disc
field.drawDisc(x, y, radius);

// Draw a line (for passes, movements, etc.)
field.drawLine(x1, y1, x2, y2, color, width, dashed);
```

### Coordinate System

- Origin (0, 0) is at the top-left corner
- X-axis runs the length of the field (0-110 yards)
- Y-axis runs the width of the field (0-40 yards)
- Use `field.fieldToCanvas(x, y)` and `field.canvasToField(x, y)` to convert coordinates

## Controls

### Mouse
- **Click (Normal Mode)**: Move offensive player to clicked position
- **Click (Training Mode)**: Select player or move selected player
- **Hover**: View coordinates

### Keyboard
- **Space**: Start/Stop simulation
- **R**: Reset game
- **G**: Toggle grid
- **T**: Toggle training mode
- **E**: Record example (in training mode)
- **Escape**: Deselect player (in training mode)

### Buttons
- **Reset Field**: Reset all players and disc
- **Toggle Grid**: Show/hide yard grid
- **Training Mode**: Enter/exit training mode for AI learning
- **Record Example**: Save current player positions as training data
- **Clear Examples**: Delete all training examples
- **Use Learned AI**: Toggle between rule-based and learned AI
- **Export Data**: Download training data as JSON file
- **Import Data**: Load training data from JSON file

## Future Ideas

- ~~Add player AI with offensive/defensive strategies~~ ✓ (Implemented with training mode!)
- Implement stall count and turnovers
- Add score tracking and game clock
- Create play designer with route drawing
- Add replay system
- Implement wind effects on disc flight
- Add formations and set plays
- Multiplayer controls
- Multiple defenders and offensive players
- Advanced AI training with neural networks

## AI Implementation Details

The defensive AI uses two modes:

### Rule-Based AI (Default)
- Maintains strategic position near the 15-yard line
- Avoids pursuing into endzones
- Stays within 15 yards of center field
- Uses reaction delay (300ms) for realism

### Learned AI (Training Mode)
- Uses k-Nearest Neighbors algorithm
- Predicts defensive position based on offensive position
- Weighted average of 5 nearest training examples
- Requires minimum 3 examples to activate
- Inverse distance weighting for better interpolation

## Technical Details

- Pure vanilla JavaScript (no dependencies)
- HTML5 Canvas for rendering
- Object-oriented architecture
- 60 FPS animation loop
- Responsive design

## License

Free to use and modify for your own projects!
