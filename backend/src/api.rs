//! Axum route handlers — one function per API endpoint.

use axum::Json;

use crate::game::{position_defender_optimal, position_offender_optimal, position_offender_stack};
use crate::heatmap::{calculate_heat_map, combined_heat_map_sum};
use crate::models::{
    HeatMapData, HeatMapRequest, HeatMapSumRequest, HeatMapSumResponse, PositionDefenderRequest,
    PositionOffenderRequest, PositionRequest, PositionResponse,
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
/// Body must include `defenderLabel` (e.g. "1", "2").  Moves that defender to
/// the cell within 5 yards of the offender with the same label that minimises
/// the combined heat-map sum (other defenders' coverage is included).
/// Returns `null` when no matching defender or offender exists.
pub async fn position_defender_handler(
    Json(req): Json<PositionDefenderRequest>,
) -> Json<Option<PositionResponse>> {
    let mut gs = req.game_state;
    let result = position_defender_optimal(&mut gs, req.grid_size, &req.defender_label);
    Json(result.map(|(x, y)| PositionResponse { x, y }))
}

/// `POST /api/position-offender`
///
/// Body must include `offenderLabel` (e.g. "1", "2").  Moves that offender to
/// a cell sampled from the combined heat map.  Returns `null` when no thrower
/// or matching offender is present.
pub async fn position_offender_handler(
    Json(req): Json<PositionOffenderRequest>,
) -> Json<Option<PositionResponse>> {
    let mut gs = req.game_state;
    let result = position_offender_optimal(&mut gs, req.grid_size, &req.offender_label);
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
