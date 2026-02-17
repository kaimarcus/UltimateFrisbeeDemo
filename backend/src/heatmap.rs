//! Heat-map layer calculations.
//!
//! Each of the four "blank layer" functions begins with a clearly-named block
//! of constants.  Tweak the values in those blocks to reshape a layer without
//! digging into the formula code.

use crate::models::{Disc, FieldDimensions, GameState, HeatMapData, HeatMapModes, Player};

// ============================================================================
// CATCH-VALUE LAYER CONSTANTS
// How attractive is a field position as a catch target?
// ============================================================================

/// Value returned for every cell that sits inside the opponent's scoring end
/// zone (always the highest possible catch value).
const CATCH_END_ZONE_VALUE: f64 = 1.0;

/// Positional value is shifted from [0, 1] to [SCALE, 1] so that even the
/// furthest-back receivable spot still has meaningful positive value.
/// 0.5 → range becomes [0.5, 1.0].
const CATCH_POSITION_SCALE: f64 = 0.5;

/// Distance from each sideline (yards) at which the width-penalty begins.
/// Cells within this band from a sideline receive a reduced value.
const CATCH_SIDE_BOUNDARY_YARDS: f64 = 10.0;

/// Maximum linear fraction subtracted at the very sideline.
/// 0.5 → sideline value drops by up to 50 % from the linear term.
const CATCH_SIDELINE_LINEAR_PENALTY: f64 = 0.5;

/// Coefficient of the steep polynomial term at the sideline.
/// 0.7 → an extra 70 % multiplied by the polynomial.
const CATCH_SIDELINE_STEEP_COEFF: f64 = 0.7;

/// Exponent of the sideline polynomial term.  Higher → penalty only kicks in
/// very close to the sideline.
const CATCH_SIDELINE_EXPONENT: f64 = 8.0;

/// Passes shorter than this Euclidean distance (yards) from the disc have
/// near-zero catch value.  Value ramps from 0 at 0 yards up to the full
/// positional value at this distance.
const CATCH_MIN_PASS_DISTANCE_YARDS: f64 = 5.0;

/// Exponent applied to the short-pass ramp.  Higher → value stays closer to
/// zero for more of the range below MIN_PASS_DISTANCE (3 → value ≈ 0.008
/// at 1 yd, 0.22 at 3 yds, 0.51 at 4 yds before reaching 1.0 at 5 yds).
const CATCH_SHORT_PASS_EXPONENT: f64 = 3.0;

/// Throws further than this many yards behind the disc (increasing x) have
/// zero catch value.  The same polynomial curve used for the sideline penalty
/// is applied as the throwback distance approaches this limit.
const CATCH_MAX_THROWBACK_YARDS: f64 = 10.0;

// ============================================================================
// DIFFICULTY LAYER CONSTANTS
// How hard is it to throw to this spot (based on throw distance)?
// ============================================================================

/// FIX Not really an accurate description.
/// A throw of this many yards maps to a raw difficulty of 1.0.
/// Shorter throws scale linearly below this value.
const DIFFICULTY_DISTANCE_SCALE: f64 = 80.0;

/// After per-layer normalisation, every cell's difficulty is clamped to at
/// least this value (prevents nearby cells from being treated as "free").
const DIFFICULTY_POST_NORM_MIN: f64 = 0.2;

/// After the minimum clamp, values are divided by this factor to compress the
/// final range (2.0 → max normalised difficulty is 0.5 rather than 1.0).
const DIFFICULTY_POST_NORM_DIVISOR: f64 = 2.0;

// ============================================================================
// MARKING-DIFFICULTY LAYER CONSTANTS
// How hard does the mark make it to throw to a given spot?
// ============================================================================

/// Throws aimed further than this angle (radians) away from the mark's
/// forcing direction are fully uncontested (ease = 1).
/// π/4 = 45°.  Decrease to make the mark more effective over a wider cone.
const MARK_EASY_ANGLE_RADIANS: f64 = std::f64::consts::FRAC_PI_4;

/// The mark is modelled as forcing the thrower toward this field position.
/// Default (20, 40) points toward the back-left corner of the field.
const MARK_FORCE_X: f64 = 20.0;
const MARK_FORCE_Y: f64 = 40.0;

/// Distance (yards) at which the mark's angular difficulty reaches zero.
/// Beyond MARK_DISTANCE_SCALE * MARK_DISTANCE_STRENGTH the mark has no effect.
const MARK_DISTANCE_SCALE: f64 = 60.0;

/// Divides MARK_DISTANCE_SCALE to create an effective falloff radius.
/// distance_factor = 1 − dist / (SCALE × STRENGTH).
const MARK_DISTANCE_STRENGTH: f64 = 3.0;

// ============================================================================
// COVERAGE LAYER CONSTANTS
// Is the area around a spot open (offense near) or covered (defender near)?
// ============================================================================

/// Yards added to each defender's distance to the cell before comparison.
/// Represents the offense having a "first-step" advantage over the defender.
const COVERAGE_DEFENDER_HANDICAP_YARDS: f64 = 2.0;

/// Layer value when a defender is closer to the cell than any offense player
/// (fully covered).
const COVERAGE_FULLY_COVERED_VALUE: f64 = 0.0;

/// Layer value when a defender is within half the disc-to-cell distance
/// (semi-covered — defender can contest before the disc arrives).
const COVERAGE_SEMI_COVERED_VALUE: f64 = 0.5;

/// Layer value when the area is open.
const COVERAGE_OPEN_VALUE: f64 = 1.0;

// ============================================================================
// Per-cell helper functions
// ============================================================================

/// Positional attractiveness of catching at `(x, y)`.
///
/// Three independent multipliers are combined:
///   1. **Position value** — how far the catch advances the disc toward the
///      scoring end zone (capped to [SCALE, 1.0]).
///   2. **Width (sideline) penalty** — cells near a sideline are worth less.
///   3. **Short-pass penalty** — passes shorter than CATCH_MIN_PASS_DISTANCE_YARDS
///      ramp from ≈0 up to 1.0 using a polynomial curve.
///   4. **Backward-pass penalty** — the *same* polynomial curve used for the
///      sideline penalty is applied along the throwback axis.  Catches more
///      than CATCH_MAX_THROWBACK_YARDS behind the disc return 0.
pub fn calculate_catch_value(x: f64, y: f64, disc: &Disc, field: &FieldDimensions) -> f64 {
    let scoring_end = field.end_zone_depth; // x ≤ this is inside the scoring end zone

    if x <= scoring_end {
        return CATCH_END_ZONE_VALUE;
    }

    // ── 1. Backward-pass penalty ────────────────────────────────────────────
    // throwback: how many yards behind the disc the cell lies (0 when forward)
    let throwback = (x - disc.x).max(0.0);
    if throwback >= CATCH_MAX_THROWBACK_YARDS {
        return 0.0; // too far behind — no value
    }
    // Same curve shape as the sideline penalty; t = 0 at disc, 1 at max throwback
    let backward_factor = {
        let t = throwback / CATCH_MAX_THROWBACK_YARDS;
        1.0 - t * CATCH_SIDELINE_LINEAR_PENALTY
            - CATCH_SIDELINE_STEEP_COEFF * t.powf(CATCH_SIDELINE_EXPONENT)
    };

    // ── 2. Short-pass penalty ────────────────────────────────────────────────
    // Euclidean distance from the disc; ramps from 0 at 0 yds to 1 at MIN yds
    let dx = x - disc.x;
    let dy = y - disc.y;
    let pass_dist = (dx * dx + dy * dy).sqrt();
    let short_pass_factor = (pass_dist / CATCH_MIN_PASS_DISTANCE_YARDS)
        .min(1.0)
        .powf(CATCH_SHORT_PASS_EXPONENT);

    // ── 3. Position value ───────────────────────────────────────────────────
    // Forward progress toward the end zone, shifted into [SCALE, 1.0].
    // Cells behind the disc (throwback > 0) clamp to 0 progress → minimum 0.5.
    let raw_progress = ((disc.x - x) / field.field_length).clamp(0.0, 1.0);
    let position_value = raw_progress * CATCH_POSITION_SCALE + CATCH_POSITION_SCALE;

    // ── 4. Width (sideline) penalty ─────────────────────────────────────────
    let field_center_y = field.field_width / 2.0;
    let dist_from_center = (y - field_center_y).abs();
    let outer_band_start = field_center_y - CATCH_SIDE_BOUNDARY_YARDS;

    let center_bonus = if dist_from_center > outer_band_start {
        let dist_from_sideline = field_center_y - dist_from_center;
        let t = 1.0 - (dist_from_sideline / CATCH_SIDE_BOUNDARY_YARDS); // 0 at boundary, 1 at sideline
        1.0 - t * CATCH_SIDELINE_LINEAR_PENALTY
            - CATCH_SIDELINE_STEEP_COEFF * t.powf(CATCH_SIDELINE_EXPONENT)
    } else {
        1.0
    };

    (position_value * center_bonus * backward_factor * short_pass_factor).clamp(0.0, 1.0)
}

/// Raw throw difficulty at `(x, y)` — purely a function of distance from the
/// disc.  Normalised internally by `get_difficulty_layer`.
pub fn calculate_difficulty_at(x: f64, y: f64, disc: &Disc) -> f64 {
    let dx = x - disc.x;
    let dy = y - disc.y;
    let dist = (dx * dx + dy * dy).sqrt();
    if dist <= 0.0 {
        return 0.0;
    }
    dist / DIFFICULTY_DISTANCE_SCALE
}

/// Ease of throwing to `(target_x, target_y)` from `(thrower_x, thrower_y)`
/// given the mark's forcing direction.
/// Returns 0 (hardest) when throwing directly into the mark, 1 (easiest)
/// when the throw is ≥ MARK_EASY_ANGLE_RADIANS off the mark.
pub fn calculate_ease_at(thrower_x: f64, thrower_y: f64, target_x: f64, target_y: f64) -> f64 {
    // Direction the mark is trying to force the throw
    let (mdx, mdy) = {
        let dx = MARK_FORCE_X - thrower_x;
        let dy = MARK_FORCE_Y - thrower_y;
        let len = (dx * dx + dy * dy).sqrt();
        if len < 0.001 {
            return 1.0; // degenerate mark position → unconstrained
        }
        (dx / len, dy / len)
    };

    // Direction of the candidate throw
    let (tdx, tdy) = {
        let dx = target_x - thrower_x;
        let dy = target_y - thrower_y;
        let len = (dx * dx + dy * dy).sqrt();
        if len < 0.001 {
            return 0.0; // same cell as thrower → treat as hardest
        }
        (dx / len, dy / len)
    };

    let dot = mdx * tdx + mdy * tdy;
    let cross = mdx * tdy - mdy * tdx;
    let abs_angle = cross.atan2(dot).abs();

    if abs_angle >= MARK_EASY_ANGLE_RADIANS {
        1.0
    } else {
        abs_angle / MARK_EASY_ANGLE_RADIANS
    }
}

/// Combined marking-difficulty value at `(target_x, target_y)`.
/// Incorporates both the angular mark constraint and a distance falloff so
/// the mark only matters for throws within a realistic range.
pub fn calculate_marking_difficulty_at(
    thrower_x: f64,
    thrower_y: f64,
    target_x: f64,
    target_y: f64,
    disc: &Disc,
) -> f64 {
    let ease = calculate_ease_at(thrower_x, thrower_y, target_x, target_y);
    let dx = target_x - disc.x;
    let dy = target_y - disc.y;
    let dist = (dx * dx + dy * dy).sqrt();
    let distance_factor = (1.0 - dist / (MARK_DISTANCE_SCALE * MARK_DISTANCE_STRENGTH)).max(0.0);
    1.0 - (1.0 - ease) * distance_factor
}

// ============================================================================
// Layer builders — fill a 2-D grid for the whole field
// ============================================================================

/// Catch-value layer: `values[x][y]` in [0, 1].
pub fn get_catch_layer(
    num_cells_x: usize,
    num_cells_y: usize,
    grid_size: f64,
    disc: &Disc,
    field: &FieldDimensions,
) -> Vec<Vec<f64>> {
    let mut values = vec![vec![0.0_f64; num_cells_y]; num_cells_x];
    for x in 0..num_cells_x {
        for y in 0..num_cells_y {
            let cx = x as f64 * grid_size + grid_size / 2.0;
            let cy = y as f64 * grid_size + grid_size / 2.0;
            values[x][y] = calculate_catch_value(cx, cy, disc, field);
        }
    }
    values
}

/// Difficulty layer: `values[x][y]` in [0, 0.5] after normalisation.
/// Raw distances are normalised so the hardest throw on the current field
/// maps to 1.0, then clamped and halved (see constants above).
pub fn get_difficulty_layer(
    num_cells_x: usize,
    num_cells_y: usize,
    grid_size: f64,
    disc: &Disc,
) -> Vec<Vec<f64>> {
    let mut values = vec![vec![0.0_f64; num_cells_y]; num_cells_x];
    let mut max_difficulty = 0.0_f64;

    for x in 0..num_cells_x {
        for y in 0..num_cells_y {
            let cx = x as f64 * grid_size + grid_size / 2.0;
            let cy = y as f64 * grid_size + grid_size / 2.0;
            let d = calculate_difficulty_at(cx, cy, disc);
            values[x][y] = d;
            if d > max_difficulty {
                max_difficulty = d;
            }
        }
    }

    if max_difficulty > 0.0 {
        for x in 0..num_cells_x {
            for y in 0..num_cells_y {
                values[x][y] = (values[x][y] / max_difficulty).max(DIFFICULTY_POST_NORM_MIN)
                    / DIFFICULTY_POST_NORM_DIVISOR;
            }
        }
    }
    values
}

/// Marking-difficulty layer: `values[x][y]` in [0, 1].
/// Returns `None` when no player currently holds the disc.
/// Also returns the thrower's field coordinates for downstream use.
pub fn get_marking_difficulty_layer(
    num_cells_x: usize,
    num_cells_y: usize,
    grid_size: f64,
    players: &[Player],
    disc: &Disc,
) -> Option<(Vec<Vec<f64>>, f64, f64)> {
    let thrower = players.iter().find(|p| p.has_disc)?;
    let (tx, ty) = (thrower.x, thrower.y);

    let mut values = vec![vec![0.0_f64; num_cells_y]; num_cells_x];
    for x in 0..num_cells_x {
        for y in 0..num_cells_y {
            let cx = x as f64 * grid_size + grid_size / 2.0;
            let cy = y as f64 * grid_size + grid_size / 2.0;
            values[x][y] = calculate_marking_difficulty_at(tx, ty, cx, cy, disc);
        }
    }
    Some((values, tx, ty))
}

/// Coverage layer: `values[x][y]` in {0.0, 0.5, 1.0}.
/// Excludes the disc-holder (thrower) and the mark from both sides so the
/// layer reflects downfield open/covered areas only.
pub fn get_coverage_layer(
    num_cells_x: usize,
    num_cells_y: usize,
    grid_size: f64,
    players: &[Player],
    disc: &Disc,
) -> Vec<Vec<f64>> {
    let offense: Vec<&Player> = players
        .iter()
        .filter(|p| !p.is_defender && !p.has_disc)
        .collect();
    let defense: Vec<&Player> = players
        .iter()
        .filter(|p| p.is_defender && !p.is_mark)
        .collect();

    let mut values = vec![vec![0.0_f64; num_cells_y]; num_cells_x];

    for x in 0..num_cells_x {
        for y in 0..num_cells_y {
            let cx = x as f64 * grid_size + grid_size / 2.0;
            let cy = y as f64 * grid_size + grid_size / 2.0;

            let disc_to_sq = ((cx - disc.x).powi(2) + (cy - disc.y).powi(2)).sqrt();

            let min_off = offense
                .iter()
                .map(|p| ((cx - p.x).powi(2) + (cy - p.y).powi(2)).sqrt())
                .fold(f64::INFINITY, f64::min);

            // Handicap: defender must close from further back
            let min_def = defense
                .iter()
                .map(|p| ((cx - p.x).powi(2) + (cy - p.y).powi(2)).sqrt())
                .fold(f64::INFINITY, f64::min)
                + COVERAGE_DEFENDER_HANDICAP_YARDS;

            let from_closer = if min_off >= min_def {
                COVERAGE_FULLY_COVERED_VALUE
            } else {
                COVERAGE_OPEN_VALUE
            };
            let from_half = if min_def < disc_to_sq / 2.0 {
                COVERAGE_SEMI_COVERED_VALUE
            } else {
                COVERAGE_OPEN_VALUE
            };

            values[x][y] = from_closer.min(from_half);
        }
    }
    values
}

// ============================================================================
// Combined heat map
// ============================================================================

/// Compute the product-combined heat map from whichever layers are enabled.
/// Difficulty is inverted (1 − v) before multiplying so green = good for
/// the offence on all layers.
/// Returns `None` when no layers are enabled or there is no disc holder for
/// the marking layer.
pub fn calculate_heat_map(
    game_state: &GameState,
    modes: &HeatMapModes,
    normalize: bool,
    grid_size: f64,
) -> Option<HeatMapData> {
    let field = &game_state.field;
    let disc = &game_state.disc;
    let players = &game_state.players;

    let num_cells_x = (field.total_length / grid_size).ceil() as usize;
    let num_cells_y = (field.field_width / grid_size).ceil() as usize;

    struct Layer {
        key: &'static str,
        values: Vec<Vec<f64>>,
    }

    let mut layers: Vec<Layer> = Vec::new();
    let mut thrower_x = disc.x;
    let mut thrower_y = disc.y;

    if modes.catch {
        layers.push(Layer {
            key: "catch",
            values: get_catch_layer(num_cells_x, num_cells_y, grid_size, disc, field),
        });
    }
    if modes.difficulty {
        layers.push(Layer {
            key: "difficulty",
            values: get_difficulty_layer(num_cells_x, num_cells_y, grid_size, disc),
        });
    }
    if modes.marking_difficulty {
        if let Some((vals, tx, ty)) =
            get_marking_difficulty_layer(num_cells_x, num_cells_y, grid_size, players, disc)
        {
            thrower_x = tx;
            thrower_y = ty;
            layers.push(Layer {
                key: "markingDifficulty",
                values: vals,
            });
        }
    }
    if modes.coverage {
        layers.push(Layer {
            key: "coverage",
            values: get_coverage_layer(num_cells_x, num_cells_y, grid_size, players, disc),
        });
    }

    if layers.is_empty() {
        return None;
    }

    // Multiply all layers (difficulty inverted)
    let mut values = vec![vec![0.0_f64; num_cells_y]; num_cells_x];
    for x in 0..num_cells_x {
        for y in 0..num_cells_y {
            let mut product = 1.0_f64;
            for layer in &layers {
                let v = layer.values[x][y];
                let v = if layer.key == "difficulty" {
                    1.0 - v
                } else {
                    v
                };
                product *= v;
            }
            values[x][y] = product;
        }
    }

    // Optional min-max normalisation so the colour range is always used fully
    if normalize {
        let mut min = f64::INFINITY;
        let mut max = f64::NEG_INFINITY;
        for row in &values {
            for &v in row {
                if v < min {
                    min = v;
                }
                if v > max {
                    max = v;
                }
            }
        }
        let range = max - min;
        if range > 0.0 {
            for row in &mut values {
                for v in row {
                    *v = (*v - min) / range;
                }
            }
        }
    }

    let mode = if layers.len() > 1 {
        "combined".to_string()
    } else {
        layers[0].key.to_string()
    };

    Some(HeatMapData {
        grid_size,
        values,
        thrower_x,
        thrower_y,
        mode,
    })
}

/// Sum all cell values of the product-combined map (all 4 layers, no
/// min-max normalisation).  Lower = better defence; higher = better offence.
/// Returns `None` when there is no disc holder (marking layer unavailable).
pub fn combined_heat_map_sum(game_state: &GameState, grid_size: f64) -> Option<f64> {
    let field = &game_state.field;
    let disc = &game_state.disc;
    let players = &game_state.players;

    let num_cells_x = (field.total_length / grid_size).ceil() as usize;
    let num_cells_y = (field.field_width / grid_size).ceil() as usize;

    let catch = get_catch_layer(num_cells_x, num_cells_y, grid_size, disc, field);
    let diff = get_difficulty_layer(num_cells_x, num_cells_y, grid_size, disc);
    let (mark, _, _) =
        get_marking_difficulty_layer(num_cells_x, num_cells_y, grid_size, players, disc)?;
    let cov = get_coverage_layer(num_cells_x, num_cells_y, grid_size, players, disc);

    let mut sum = 0.0_f64;
    for x in 0..num_cells_x {
        for y in 0..num_cells_y {
            sum += catch[x][y] * (1.0 - diff[x][y]) * mark[x][y] * cov[x][y];
        }
    }
    Some(sum)
}
