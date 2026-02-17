//! Axum route handlers — one function per API endpoint.

use axum::Json;

use crate::game::{position_defender_optimal, position_offender_optimal, position_offender_stack};
use crate::heatmap::{calculate_heat_map, combined_heat_map_sum};
use crate::models::{
    HeatMapData, HeatMapRequest, HeatMapSumRequest, HeatMapSumResponse, PositionRequest,
    PositionResponse,
};

// ---------------------------------------------------------------------------
// Heat-map endpoints
// ---------------------------------------------------------------------------

/// `POST /api/heatmap`
///
/// Compute the (optionally normalised) combined heat map from whichever
/// layers are enabled in `modes`.  Returns `null` when no layers are on or
/// there is no thrower for the marking layer.
pub async fn heatmap_handler(Json(req): Json<HeatMapRequest>) -> Json<Option<HeatMapData>> {
    let data = calculate_heat_map(&req.game_state, &req.modes, req.normalize, req.grid_size);
    Json(data)
}

/// `POST /api/heatmap-sum`
///
/// Return the scalar sum of all cells in the pre-normalised, product-combined
/// heat map (all 4 layers active).  Returns `null` when there is no thrower.
pub async fn heatmap_sum_handler(Json(req): Json<HeatMapSumRequest>) -> Json<HeatMapSumResponse> {
    let sum = combined_heat_map_sum(&req.game_state, req.grid_size);
    Json(HeatMapSumResponse { sum })
}

// ---------------------------------------------------------------------------
// Positioning endpoints
// ---------------------------------------------------------------------------

/// `POST /api/position-defender`
///
/// Find the grid cell within 5 yards of the offender that minimises the
/// combined heat-map sum and return it.  Returns `null` when the operation
/// cannot be performed (no suitable defender / offender / thrower).
pub async fn position_defender_handler(
    Json(req): Json<PositionRequest>,
) -> Json<Option<PositionResponse>> {
    let mut gs = req.game_state;
    let result = position_defender_optimal(&mut gs, req.grid_size);
    Json(result.map(|(x, y)| PositionResponse { x, y }))
}

/// `POST /api/position-offender`
///
/// Sample a position from the combined heat map with probability proportional
/// to each cell's value and return it.  Returns `null` when no thrower or
/// offender is present.
pub async fn position_offender_handler(
    Json(req): Json<PositionRequest>,
) -> Json<Option<PositionResponse>> {
    let mut gs = req.game_state;
    let result = position_offender_optimal(&mut gs, req.grid_size);
    Json(result.map(|(x, y)| PositionResponse { x, y }))
}

/// `POST /api/position-stack`
///
/// Return the stack position (centre of field, 20 yards downfield from disc).
/// Returns `null` when no offender (non-disc, non-defender) is found.
pub async fn position_stack_handler(
    Json(req): Json<PositionRequest>,
) -> Json<Option<PositionResponse>> {
    let mut gs = req.game_state;
    let result = position_offender_stack(&mut gs);
    Json(result.map(|(x, y)| PositionResponse { x, y }))
}
