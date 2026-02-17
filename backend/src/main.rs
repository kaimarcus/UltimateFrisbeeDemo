mod api;
mod game;
mod heatmap;
mod models;

use axum::{routing::post, Router};
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() {
    // Allow any origin so the static HTML file can be opened directly from
    // the file-system (file://) or a local dev server on any port.
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        // Heat-map data
        .route("/api/heatmap",     post(api::heatmap_handler))
        .route("/api/heatmap-sum", post(api::heatmap_sum_handler))
        // Positioning helpers
        .route("/api/position-defender", post(api::position_defender_handler))
        .route("/api/position-offender", post(api::position_offender_handler))
        .route("/api/position-stack",    post(api::position_stack_handler))
        .layer(cors);

    let addr = "0.0.0.0:3000";
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();

    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("  Ultimate Frisbee backend  →  http://localhost:3000");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("  POST /api/heatmap");
    println!("  POST /api/heatmap-sum");
    println!("  POST /api/position-defender");
    println!("  POST /api/position-offender");
    println!("  POST /api/position-stack");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    axum::serve(listener, app).await.unwrap();
}
