mod api;
mod dataset;
mod model;

use std::path::PathBuf;
use std::sync::Arc;

use axum::{
    Router,
    extract::Path,
    http::{StatusCode, header},
    response::{Html, IntoResponse, Response},
    routing::get,
};
use clap::Parser;
use rust_embed::Embed;

use dataset::Dataset;

#[derive(Embed)]
#[folder = "front/dist/"]
struct Assets;

#[derive(Parser)]
#[command(name = "labelr", about = "OBB annotation tool")]
struct Cli {
    /// Path to images directory
    #[arg(short, long)]
    images: PathBuf,

    /// Path to labels directory (defaults to sibling "labels" folder)
    #[arg(short, long)]
    labels: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    let dataset = Dataset::scan(&cli.images, cli.labels.as_deref())?;
    println!("labels dir: {}", dataset.labels_dir.display());

    let dataset = Arc::new(dataset);

    let app = Router::new()
        .route("/", get(index))
        .route("/assets/{*path}", get(static_file))
        .route("/api/images", get(api::images::list))
        .route("/api/images/{index}", get(api::images::serve))
        .route("/api/images/{index}/annotation", get(api::yolo_obb::get_annotation).put(api::yolo_obb::put_annotation))
        .route("/api/classes", get(api::yolo_obb::get_classes).put(api::yolo_obb::put_classes))
        .with_state(dataset);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await?;
    println!("listening on http://127.0.0.1:3000");
    axum::serve(listener, app).await?;

    Ok(())
}

async fn index() -> impl IntoResponse {
    match Assets::get("index.html") {
        Some(content) => Html(content.data.to_vec()).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn static_file(Path(path): Path<String>) -> Response {
    match Assets::get(&path) {
        Some(content) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            (
                [(header::CONTENT_TYPE, mime.as_ref())],
                content.data.to_vec(),
            )
                .into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
