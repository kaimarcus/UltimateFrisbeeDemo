//! Game-state mutation: physics update, disc throws/catches, and AI
//! positioning helpers.

use rand::Rng;

use crate::heatmap::{
    combined_heat_map_sum, get_catch_layer, get_coverage_layer, get_difficulty_layer,
    get_marking_difficulty_layer,
};
use crate::models::GameState;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Radius (yards) within which a player catches a disc in flight.
const CATCH_RADIUS_YARDS: f64 = 2.0;

/// Speed multiplier applied to disc velocity each physics step (drag).
const DISC_DRAG_FACTOR: f64 = 0.98;

/// Velocity (yards/second) below which the disc is considered to have stopped.
const DISC_STOP_THRESHOLD: f64 = 0.1;

/// Maximum search radius (yards) around the offender when positioning the
/// downfield defender optimally.
const DEFENDER_SEARCH_RADIUS_YARDS: f64 = 5.0;

// ---------------------------------------------------------------------------
// Physics update
// ---------------------------------------------------------------------------

/// Advance the game simulation by `delta_time` seconds.
/// * Moves disc if in flight and applies drag.
/// * Detects catches (any player within `CATCH_RADIUS_YARDS`).
/// * Keeps disc glued to its holder when not in flight.
pub fn update(gs: &mut GameState, delta_time: f64) {
    if gs.disc.in_flight {
        gs.disc.x += gs.disc.vx * delta_time;
        gs.disc.y += gs.disc.vy * delta_time;

        gs.disc.vx *= DISC_DRAG_FACTOR;
        gs.disc.vy *= DISC_DRAG_FACTOR;

        if gs.disc.vx.abs() < DISC_STOP_THRESHOLD && gs.disc.vy.abs() < DISC_STOP_THRESHOLD {
            gs.disc.in_flight = false;
            gs.disc.vx = 0.0;
            gs.disc.vy = 0.0;
        }

        // Check for catches
        let disc_x = gs.disc.x;
        let disc_y = gs.disc.y;
        let r2 = CATCH_RADIUS_YARDS * CATCH_RADIUS_YARDS;
        let mut catcher: Option<String> = None;

        for p in &gs.players {
            let dx = p.x - disc_x;
            let dy = p.y - disc_y;
            if dx * dx + dy * dy < r2 {
                catcher = Some(p.id.clone());
                break;
            }
        }

        if let Some(id) = catcher {
            gs.disc.in_flight = false;
            gs.disc.vx = 0.0;
            gs.disc.vy = 0.0;
            gs.disc.holder_id = Some(id.clone());
            for p in &mut gs.players {
                if p.id == id {
                    p.has_disc = true;
                }
            }
        }
    } else if let Some(ref holder_id) = gs.disc.holder_id.clone() {
        if let Some(holder) = gs.players.iter().find(|p| &p.id == holder_id) {
            gs.disc.x = holder.x;
            gs.disc.y = holder.y;
        }
    }
}

// ---------------------------------------------------------------------------
// Disc throw
// ---------------------------------------------------------------------------

/// Throw the disc from its current position toward `(target_x, target_y)` at
/// `speed` yards/second.  No-op if nobody currently holds the disc.
pub fn throw_disc(gs: &mut GameState, target_x: f64, target_y: f64, speed: f64) {
    // Find the holder's index so we can clear their flag
    let holder_idx = gs.players.iter().position(|p| p.has_disc);
    if holder_idx.is_none() && gs.disc.holder_id.is_none() {
        return;
    }

    let dx = target_x - gs.disc.x;
    let dy = target_y - gs.disc.y;
    let dist = (dx * dx + dy * dy).sqrt();
    if dist < 0.001 {
        return;
    }

    gs.disc.vx = (dx / dist) * speed;
    gs.disc.vy = (dy / dist) * speed;
    gs.disc.in_flight = true;
    gs.disc.holder_id = None;

    if let Some(idx) = holder_idx {
        gs.players[idx].has_disc = false;
    }
}

// ---------------------------------------------------------------------------
// AI positioning
// ---------------------------------------------------------------------------

/// Move the downfield defender to the field cell (within
/// `DEFENDER_SEARCH_RADIUS_YARDS` of the offender) that minimises the
/// pre-normalised combined heat-map sum.
///
/// Returns the new `(x, y)` position, or `None` when there is no suitable
/// defender or offender.
pub fn position_defender_optimal(gs: &mut GameState, grid_size: f64) -> Option<(f64, f64)> {
    let (offender_x, offender_y) = {
        let o = gs.players.iter().find(|p| !p.is_defender && !p.has_disc)?;
        (o.x, o.y)
    };

    let defender_idx = gs.players.iter().position(|p| p.is_defender && !p.is_mark)?;

    let field = gs.field.clone();
    let r2 = DEFENDER_SEARCH_RADIUS_YARDS * DEFENDER_SEARCH_RADIUS_YARDS;

    let num_cells_x = (field.total_length / grid_size).ceil() as usize;
    let num_cells_y = (field.field_width / grid_size).ceil() as usize;

    let mut best_sum = f64::INFINITY;
    let mut best_x = gs.players[defender_idx].x;
    let mut best_y = gs.players[defender_idx].y;

    for xi in 0..num_cells_x {
        for yi in 0..num_cells_y {
            let cx = xi as f64 * grid_size + grid_size / 2.0;
            let cy = yi as f64 * grid_size + grid_size / 2.0;
            let dx = cx - offender_x;
            let dy = cy - offender_y;
            if dx * dx + dy * dy > r2 {
                continue;
            }

            let clamped_x = cx.clamp(0.0, field.total_length);
            let clamped_y = cy.clamp(0.0, field.field_width);

            gs.players[defender_idx].x = clamped_x;
            gs.players[defender_idx].y = clamped_y;

            if let Some(s) = combined_heat_map_sum(gs, grid_size) {
                if s < best_sum {
                    best_sum = s;
                    best_x = clamped_x;
                    best_y = clamped_y;
                }
            }
        }
    }

    gs.players[defender_idx].x = best_x;
    gs.players[defender_idx].y = best_y;
    Some((best_x, best_y))
}

/// Move the offender (player without disc, not a defender) to a cell sampled
/// from the combined heat map with probability proportional to each cell's
/// pre-normalised product value — weighted-random so behaviour is not always
/// identical.
///
/// Returns the new `(x, y)` position, or `None` when there is no offender or
/// no thrower.
pub fn position_offender_optimal(gs: &mut GameState, grid_size: f64) -> Option<(f64, f64)> {
    let offender_idx = gs
        .players
        .iter()
        .position(|p| !p.is_defender && !p.has_disc)?;

    let field = gs.field.clone();
    let disc = &gs.disc;
    let players = &gs.players;

    let num_cells_x = (field.total_length / grid_size).ceil() as usize;
    let num_cells_y = (field.field_width / grid_size).ceil() as usize;

    let catch = get_catch_layer(num_cells_x, num_cells_y, grid_size, disc, &field);
    let diff = get_difficulty_layer(num_cells_x, num_cells_y, grid_size, disc);
    let (mark, _, _) =
        get_marking_difficulty_layer(num_cells_x, num_cells_y, grid_size, players, disc)?;
    let cov = get_coverage_layer(num_cells_x, num_cells_y, grid_size, players, disc);

    // Build weighted candidates
    let mut squares: Vec<(f64, f64, f64)> = Vec::with_capacity(num_cells_x * num_cells_y);
    let mut total = 0.0_f64;
    for x in 0..num_cells_x {
        for y in 0..num_cells_y {
            let val = catch[x][y] * (1.0 - diff[x][y]) * mark[x][y] * cov[x][y];
            let cx = x as f64 * grid_size + grid_size / 2.0;
            let cy = y as f64 * grid_size + grid_size / 2.0;
            squares.push((cx, cy, val));
            total += val;
        }
    }

    if total <= 0.0 {
        return None;
    }

    // Weighted-random pick
    let threshold = rand::thread_rng().gen::<f64>() * total;
    let mut cumul = 0.0_f64;
    let mut best_x = gs.players[offender_idx].x;
    let mut best_y = gs.players[offender_idx].y;
    for (cx, cy, val) in &squares {
        cumul += val;
        if cumul >= threshold {
            best_x = *cx;
            best_y = *cy;
            break;
        }
    }

    best_x = best_x.clamp(0.0, field.total_length);
    best_y = best_y.clamp(0.0, field.field_width);

    gs.players[offender_idx].x = best_x;
    gs.players[offender_idx].y = best_y;
    Some((best_x, best_y))
}

/// Move the offender to the "stack" position: centre-width, 20 yards
/// downfield (lower x) from the current disc position.
pub fn position_offender_stack(gs: &mut GameState) -> Option<(f64, f64)> {
    let offender_idx = gs
        .players
        .iter()
        .position(|p| !p.is_defender && !p.has_disc)?;
    let field = gs.field.clone();

    let stack_x = (gs.disc.x - 20.0).clamp(0.0, field.total_length);
    let stack_y = field.field_width / 2.0;

    gs.players[offender_idx].x = stack_x;
    gs.players[offender_idx].y = stack_y;
    Some((stack_x, stack_y))
}
