use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Core field / entity types.  All fields use camelCase in JSON so the
// frontend JavaScript can pass objects without any key transformation.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldDimensions {
    pub field_length: f64,   // 70 yards
    pub field_width: f64,    // 40 yards
    pub end_zone_depth: f64, // 20 yards
    pub total_length: f64,   // 110 yards (fieldLength + 2*endZoneDepth)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    pub id: String,
    pub team: u32,
    pub x: f64,
    pub y: f64,
    pub color: String,
    pub has_disc: bool,
    pub is_defender: bool,
    pub is_mark: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Disc {
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub in_flight: bool,
    pub holder_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameState {
    pub players: Vec<Player>,
    pub disc: Disc,
    pub field: FieldDimensions,
}

// ---------------------------------------------------------------------------
// Heat-map request / response types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatMapModes {
    pub catch: bool,
    pub difficulty: bool,
    pub marking_difficulty: bool,
    pub coverage: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatMapRequest {
    pub game_state: GameState,
    pub modes: HeatMapModes,
    pub normalize: bool,
    pub grid_size: f64,
}

/// `values[x][y]` — outer index is the x (yard-line) axis, inner is the y
/// (width) axis, matching the JavaScript convention.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatMapData {
    pub grid_size: f64,
    pub values: Vec<Vec<f64>>,
    pub thrower_x: f64,
    pub thrower_y: f64,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatMapSumRequest {
    pub game_state: GameState,
    pub grid_size: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatMapSumResponse {
    pub sum: Option<f64>,
}

// ---------------------------------------------------------------------------
// Positioning request / response types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionRequest {
    pub game_state: GameState,
    pub grid_size: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionResponse {
    pub x: f64,
    pub y: f64,
}

// ---------------------------------------------------------------------------
// Game-update request / response types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRequest {
    pub game_state: GameState,
    pub delta_time: f64,
}
