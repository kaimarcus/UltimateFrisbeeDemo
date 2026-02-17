/**
 * Game Logic – Thin Client
 *
 * Local state (players, disc, scores) lives here.
 * All heavy calculations (heat maps, optimal positioning) are delegated to
 * the Rust backend at `this.apiBase`.  Results are cached so the render loop
 * is never blocked by a network request.
 *
 * Start the backend before opening the page:
 *   cd backend && cargo run --release
 */

class UltimateGame {
    constructor(field) {
        this.field = field;
        this.players = [];
        this.disc = null;
        this.isRunning = false;
        this.animationFrameId = null;

        // Scores
        this.team1Score = 0;
        this.team2Score = 0;

        // Heat-map settings
        this.heatMapGridSize = 1; // 1 yard per cell
        this.heatMapModesEnabled = {
            catch: false,
            difficulty: false,
            markingDifficulty: false,
            coverage: false,
        };
        this.heatMapNormalize = true;

        // Player selection for click-to-move
        this.selectedPlayer = null;
        this.clickHitRadiusYards = 2;

        // ── Backend integration ──────────────────────────────────────────────
        this.apiBase = 'http://localhost:3000/api';

        // Cached results returned by the backend
        this._cachedHeatMap = null;      // last HeatMapData from /api/heatmap
        this._cachedHeatMapSum = null;   // last number from /api/heatmap-sum

        // Simple dirty-flag / debounce so we don't hammer the server
        this._stateVersion   = 0;        // incremented on every meaningful change
        this._fetchedVersion = -1;       // last version successfully fetched
        this._fetchTimeout   = null;     // debounce timer handle

        // Status flag shown to the caller if needed
        this.backendStatus = 'unknown';  // 'unknown' | 'ok' | 'unavailable'
        // ────────────────────────────────────────────────────────────────────

        this.initialize();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Initialisation
    // ═══════════════════════════════════════════════════════════════════════

    initialize() {
        this.createExamplePlayers();
        this.createDisc();
    }

    createExamplePlayers() {
        this.players.push({
            id: 'offense_1', team: 1, x: 80, y: 15,
            color: '#ef4444', hasDisc: true, isDefender: false, isMark: false,
        });
        this.players.push({
            id: 'mark_1', team: 2, x: 79, y: 16,
            color: '#3b82f6', hasDisc: false, isDefender: true, isMark: true,
        });
        this.players.push({
            id: 'offense_2', team: 1, x: 55, y: 15,
            color: '#ef4444', hasDisc: false, isDefender: false, isMark: false,
        });
        this.players.push({
            id: 'defender_2', team: 2, x: 55, y: 14,
            color: '#3b82f6', hasDisc: false, isDefender: true, isMark: false,
        });
    }

    createDisc() {
        const holder = this.players.find(p => p.hasDisc) || null;
        this.disc = {
            x: holder ? holder.x : 80,
            y: holder ? holder.y : 15,
            vx: 0, vy: 0,
            holder,          // local JS reference — kept in sync
            inFlight: false,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Serialisation helpers
    // ═══════════════════════════════════════════════════════════════════════

    /** Serialize current state to the shape expected by the Rust API. */
    _toApiGameState() {
        return {
            players: this.players.map(p => ({
                id:         p.id,
                team:       p.team,
                x:          p.x,
                y:          p.y,
                color:      p.color,
                hasDisc:    p.hasDisc,
                isDefender: p.isDefender,
                isMark:     p.isMark,
            })),
            disc: {
                x:        this.disc.x,
                y:        this.disc.y,
                vx:       this.disc.vx,
                vy:       this.disc.vy,
                inFlight: this.disc.inFlight,
                holderId: this.disc.holder ? this.disc.holder.id : null,
            },
            field: {
                fieldLength:   this.field.fieldLength,
                fieldWidth:    this.field.fieldWidth,
                endZoneDepth:  this.field.endZoneDepth,
                totalLength:   this.field.totalLength,
            },
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Backend fetch logic  (dirty-flag + debounce)
    // ═══════════════════════════════════════════════════════════════════════

    /** Call whenever state changes that affect heat-map output. */
    _markStateDirty() {
        this._stateVersion++;
        if (this._fetchTimeout) clearTimeout(this._fetchTimeout);
        this._fetchTimeout = setTimeout(() => this._fetchFromBackend(), 50);
    }

    /** Fire parallel requests for heat-map data and the scalar sum. */
    async _fetchFromBackend() {
        if (this._fetchedVersion === this._stateVersion) return;
        const version = this._stateVersion;

        if (!this.isAnyHeatMapEnabled()) {
            this._cachedHeatMap    = null;
            this._cachedHeatMapSum = null;
            this._fetchedVersion   = version;
            return;
        }

        const gs = this._toApiGameState();
        try {
            const [hmRes, sumRes] = await Promise.all([
                fetch(`${this.apiBase}/heatmap`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        gameState: gs,
                        modes: {
                            catch:             this.heatMapModesEnabled.catch,
                            difficulty:        this.heatMapModesEnabled.difficulty,
                            markingDifficulty: this.heatMapModesEnabled.markingDifficulty,
                            coverage:          this.heatMapModesEnabled.coverage,
                        },
                        normalize: this.heatMapNormalize,
                        gridSize:  this.heatMapGridSize,
                    }),
                }),
                fetch(`${this.apiBase}/heatmap-sum`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gameState: gs, gridSize: this.heatMapGridSize }),
                }),
            ]);

            if (!hmRes.ok || !sumRes.ok) throw new Error(`HTTP ${hmRes.status}/${sumRes.status}`);

            // Discard if a newer version was queued while we were waiting
            if (version !== this._stateVersion) return;

            const [hmData, sumData] = await Promise.all([hmRes.json(), sumRes.json()]);

            this._cachedHeatMap    = hmData;        // null when no layers enabled
            this._cachedHeatMapSum = sumData.sum;   // null when no thrower
            this._fetchedVersion   = version;
            this.backendStatus     = 'ok';

        } catch (err) {
            this.backendStatus = 'unavailable';
            console.warn('[backend] Heat-map fetch failed:', err.message);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Local physics update  (runs every frame — no network round-trip)
    // Mirrors the logic in backend/src/game.rs `update()`.
    // ═══════════════════════════════════════════════════════════════════════

    update(deltaTime) {
        if (this.disc.inFlight) {
            this.disc.x += this.disc.vx * deltaTime;
            this.disc.y += this.disc.vy * deltaTime;

            this.disc.vx *= 0.98;
            this.disc.vy *= 0.98;

            if (Math.abs(this.disc.vx) < 0.1 && Math.abs(this.disc.vy) < 0.1) {
                this.disc.inFlight = false;
                this.disc.vx = 0;
                this.disc.vy = 0;
            }

            this.checkCatch();
            this._markStateDirty(); // disc moved — refresh heat map
        } else if (this.disc.holder) {
            this.disc.x = this.disc.holder.x;
            this.disc.y = this.disc.holder.y;
        }
    }

    checkCatch() {
        if (!this.disc.inFlight) return;
        const catchRadius = 2;
        for (const player of this.players) {
            const dx = player.x - this.disc.x;
            const dy = player.y - this.disc.y;
            if (dx * dx + dy * dy < catchRadius * catchRadius) {
                this.catchDisc(player);
                break;
            }
        }
    }

    catchDisc(player) {
        this.disc.inFlight = false;
        this.disc.holder   = player;
        this.disc.vx       = 0;
        this.disc.vy       = 0;
        player.hasDisc     = true;
        console.log(`Player ${player.id} caught the disc at (${Math.round(player.x)}, ${Math.round(player.y)})`);
        this._markStateDirty();
    }

    throwDisc(targetX, targetY, speed = 30) {
        if (!this.disc.holder) return;
        const dx = targetX - this.disc.x;
        const dy = targetY - this.disc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.disc.vx           = (dx / dist) * speed;
        this.disc.vy           = (dy / dist) * speed;
        this.disc.inFlight     = true;
        this.disc.holder.hasDisc = false;
        this.disc.holder       = null;
        console.log(`Disc thrown to (${Math.round(targetX)}, ${Math.round(targetY)})`);
        this._markStateDirty();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Player interaction
    // ═══════════════════════════════════════════════════════════════════════

    getPlayerAt(fieldX, fieldY) {
        const r = this.clickHitRadiusYards;
        for (let i = this.players.length - 1; i >= 0; i--) {
            const p  = this.players[i];
            const dx = fieldX - p.x;
            const dy = fieldY - p.y;
            if (dx * dx + dy * dy <= r * r) return p;
        }
        return null;
    }

    selectPlayer(player) { this.selectedPlayer = player; }
    clearSelection()      { this.selectedPlayer = null; }

    movePlayerTo(player, fieldX, fieldY) {
        player.x = Math.max(0, Math.min(this.field.totalLength, fieldX));
        player.y = Math.max(0, Math.min(this.field.fieldWidth,  fieldY));
        if (player.hasDisc && this.disc.holder === player) {
            this.disc.x = player.x;
            this.disc.y = player.y;
        }
        this._markStateDirty();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Heat-map settings
    // ═══════════════════════════════════════════════════════════════════════

    setHeatMapModeEnabled(mode, enabled) {
        if (Object.prototype.hasOwnProperty.call(this.heatMapModesEnabled, mode)) {
            this.heatMapModesEnabled[mode] = !!enabled;
            this._markStateDirty();
        }
    }

    getHeatMapModesEnabled() { return { ...this.heatMapModesEnabled }; }

    isAnyHeatMapEnabled() {
        return Object.values(this.heatMapModesEnabled).some(Boolean);
    }

    getHeatMapNormalize()         { return this.heatMapNormalize; }
    setHeatMapNormalize(enabled)  { this.heatMapNormalize = !!enabled; this._markStateDirty(); }

    // ═══════════════════════════════════════════════════════════════════════
    // Synchronous getters for cached backend results
    // (returned values may lag one debounce cycle behind latest state)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Returns the pre-normalisation combined heat-map sum (all 4 layers)
     * as last computed by the backend, or null when unavailable.
     */
    getCombinedHeatMapSumPreNormalized() {
        return this._cachedHeatMapSum ?? null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Async positioning  (delegates to Rust backend)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Ask the backend to find the optimal defender position and move the
     * downfield defender there.
     */
    async positionDefenderOptimal() {
        try {
            const res = await fetch(`${this.apiBase}/position-defender`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameState: this._toApiGameState(),
                    gridSize:  this.heatMapGridSize,
                }),
            });
            const data = await res.json();
            if (data) {
                const defender = this.players.find(p => p.isDefender && !p.isMark);
                if (defender) {
                    defender.x = data.x;
                    defender.y = data.y;
                    this._markStateDirty();
                }
            }
        } catch (err) {
            console.warn('[backend] positionDefender failed:', err.message);
        }
    }

    /**
     * Ask the backend for an optimal (weighted-random) offender position
     * and move the offender there.
     */
    async positionOffenderOptimal() {
        try {
            const res = await fetch(`${this.apiBase}/position-offender`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameState: this._toApiGameState(),
                    gridSize:  this.heatMapGridSize,
                }),
            });
            const data = await res.json();
            if (data) {
                const offender = this.players.find(p => !p.isDefender && !p.hasDisc);
                if (offender) {
                    offender.x = data.x;
                    offender.y = data.y;
                    this._markStateDirty();
                }
            }
        } catch (err) {
            console.warn('[backend] positionOffender failed:', err.message);
        }
    }

    /**
     * Ask the backend to compute the stack position (centre-width, 20 yards
     * downfield from disc) and move the offender there.
     */
    async positionOffenderStack() {
        try {
            const res = await fetch(`${this.apiBase}/position-stack`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameState: this._toApiGameState(),
                    gridSize:  this.heatMapGridSize,
                }),
            });
            const data = await res.json();
            if (data) {
                const offender = this.players.find(p => !p.isDefender && !p.hasDisc);
                if (offender) {
                    offender.x = data.x;
                    offender.y = data.y;
                    this._markStateDirty();
                }
            }
        } catch (err) {
            console.warn('[backend] positionStack failed:', err.message);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Render
    // ═══════════════════════════════════════════════════════════════════════

    updateHeatMap() {
        // Push the latest cached data from the backend into the field renderer.
        // The backend refreshes this asynchronously whenever _markStateDirty()
        // fires, so the render loop is never blocked.
        this.field.setHeatMapData(
            this.isAnyHeatMapEnabled() ? this._cachedHeatMap : null
        );
        this.field.setHeatMapVisible(
            this.isAnyHeatMapEnabled() && this._cachedHeatMap !== null
        );
    }

    render() {
        this.updateHeatMap();
        this.field.render();

        this.players.forEach(player => {
            const radius     = player.hasDisc ? 6 : 4;
            const isSelected = this.selectedPlayer === player;
            this.field.drawPlayer(player.x, player.y, player.color, radius);
            if (isSelected) {
                this.field.drawPlayerSelectionRing(player.x, player.y, Math.max(radius + 4, 10));
            }
        });

        this.field.drawDisc(this.disc.x, this.disc.y);
        if (this.disc.inFlight) {
            const tx = this.disc.x + this.disc.vx * 2;
            const ty = this.disc.y + this.disc.vy * 2;
            this.field.drawLine(this.disc.x, this.disc.y, tx, ty, '#fbbf24', 2, true);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Lifecycle
    // ═══════════════════════════════════════════════════════════════════════

    start() { this.isRunning = true;  console.log('Game started'); }
    stop()  { this.isRunning = false; console.log('Game stopped'); }

    reset() {
        this.stop();
        this.selectedPlayer = null;
        this.players        = [];
        this.disc           = null;
        this.team1Score     = 0;
        this.team2Score     = 0;
        this._cachedHeatMap    = null;
        this._cachedHeatMapSum = null;
        this._stateVersion     = 0;
        this._fetchedVersion   = -1;
        this.initialize();
        this._markStateDirty();
        console.log('Game reset');
    }
}
