use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Serialize;

use crate::dataset::Dataset;

#[derive(Serialize)]
pub struct ImageInfo {
    pub index: usize,
    pub filename: String,
    pub has_annotation: bool,
}

pub async fn list(State(dataset): State<Arc<Dataset>>) -> Json<Vec<ImageInfo>> {
    let images: Vec<ImageInfo> = dataset
        .image_files
        .iter()
        .enumerate()
        .map(|(i, filename)| ImageInfo {
            index: i,
            filename: filename.clone(),
            has_annotation: dataset.label_path(filename).exists(),
        })
        .collect();

    Json(images)
}

pub async fn serve(
    State(dataset): State<Arc<Dataset>>,
    Path(index): Path<usize>,
) -> Response {
    let Some(filename) = dataset.image_files.get(index) else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let path = dataset.images_dir.join(filename);

    match std::fs::read(&path) {
        Ok(bytes) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            (
                [(header::CONTENT_TYPE, mime.as_ref())],
                bytes,
            )
                .into_response()
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}
