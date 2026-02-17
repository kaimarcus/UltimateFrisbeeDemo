//! AI positioning helpers.
//! Disc physics and throw/catch logic have been removed; the disc is a static
//! marker that follows whichever player has it.

use rand::Rng;

use crate::heatmap::{
    combined_heat_map_sum, get_catch_layer, get_coverage_layer, get_difficulty_layer,
    get_marking_difficulty_layer,
};
use crate::models::GameState;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum search radius (yards) around the offender when positioning the
/// downfield defender optimally.
const DEFENDER_SEARCH_RADIUS_YARDS: f64 = 5.0;

// ---------------------------------------------------------------------------
// AI positioning
// ---------------------------------------------------------------------------

/// Move the defender with the given label to the field cell (within
/// `DEFENDER_SEARCH_RADIUS_YARDS` of the offender with the same label) that
/// minimises the pre-normalised combined heat-map sum.  All other defenders
/// remain in place, so their coverage is included when evaluating positions.
///
/// Returns the new `(x, y)` position, or `None` when there is no defender or
/// offender with that label.
pub fn position_defender_optimal(
    gs: &mut GameState,
    grid_size: f64,
    defender_label: &str,
) -> Option<(f64, f64)> {
    let (offender_x, offender_y) = {
        let o = gs.players.iter().find(|p| {
            !p.is_defender && !p.has_disc && p.label.as_deref() == Some(defender_label)
        })?;
        (o.x, o.y)
    };

    let defender_idx = gs.players.iter().position(|p| {
        p.is_defender && !p.is_mark && p.label.as_deref() == Some(defender_label)
    })?;

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

/// Move the offender with the given label to a cell sampled from the combined
/// heat map with probability proportional to each cell's pre-normalised product
/// value — weighted-random so behaviour is not always identical.
///
/// Returns the new `(x, y)` position, or `None` when there is no offender with
/// that label or no thrower.
pub fn position_offender_optimal(
    gs: &mut GameState,
    grid_size: f64,
    offender_label: &str,
) -> Option<(f64, f64)> {
    let offender_idx = gs.players.iter().position(|p| {
        !p.is_defender && !p.has_disc && p.label.as_deref() == Some(offender_label)
    })?;

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
