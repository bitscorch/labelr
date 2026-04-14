use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::dataset::Dataset;

#[derive(Serialize, Deserialize, Debug, PartialEq, TS)]
#[ts(export, export_to = "../front/src/bindings.ts")]
pub struct ObbBox {
    pub class_id: usize,
    pub points: [[f64; 2]; 4],
}

pub type Annotation = Vec<ObbBox>;
pub type Warnings = Vec<String>;

#[derive(Serialize, TS)]
#[ts(export, export_to = "../front/src/bindings.ts")]
pub struct AnnotationResponse {
    pub boxes: Annotation,
    pub warnings: Warnings,
}

pub async fn get_annotation(
    State(dataset): State<Arc<Dataset>>,
    Path(index): Path<usize>,
) -> Response {
    let Some(filename) = dataset.image_files.get(index) else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let label_path = dataset.label_path(filename);

    if !label_path.exists() {
        return Json(AnnotationResponse { boxes: vec![], warnings: vec![] }).into_response();
    }

    match std::fs::read_to_string(&label_path) {
        Ok(content) => {
            let (boxes, warnings) = parse_yolo_obb(&content);
            Json(AnnotationResponse { boxes, warnings }).into_response()
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn put_annotation(
    State(dataset): State<Arc<Dataset>>,
    Path(index): Path<usize>,
    Json(annotation): Json<Annotation>,
) -> Response {
    let Some(filename) = dataset.image_files.get(index) else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let label_path = dataset.label_path(filename);
    let content = serialize_yolo_obb(&annotation);

    match std::fs::write(&label_path, content) {
        Ok(_) => StatusCode::OK.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn get_classes(State(dataset): State<Arc<Dataset>>) -> Json<Vec<String>> {
    let classes_path = dataset.labels_dir.join("classes.txt");

    let classes = std::fs::read_to_string(&classes_path)
        .unwrap_or_default()
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.to_string())
        .collect();

    Json(classes)
}

pub async fn put_classes(
    State(dataset): State<Arc<Dataset>>,
    Json(classes): Json<Vec<String>>,
) -> Response {
    let classes_path = dataset.labels_dir.join("classes.txt");
    let content = classes.join("\n") + "\n";

    match std::fs::write(&classes_path, content) {
        Ok(_) => StatusCode::OK.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

fn parse_yolo_obb(content: &str) -> (Annotation, Warnings) {
    let mut boxes = Vec::new();
    let mut warnings = Vec::new();

    for (i, line) in content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() != 9 {
            warnings.push(format!("line {}: expected 9 fields, got {}", i + 1, parts.len()));
            continue;
        }

        let class_id: usize = match parts[0].parse() {
            Ok(id) => id,
            Err(_) => {
                warnings.push(format!("line {}: invalid class id '{}'", i + 1, parts[0]));
                continue;
            }
        };

        let coords: Result<Vec<f64>, _> = parts[1..].iter().map(|p| p.parse()).collect();
        match coords {
            Ok(coords) => {
                boxes.push(ObbBox {
                    class_id,
                    points: [
                        [coords[0], coords[1]],
                        [coords[2], coords[3]],
                        [coords[4], coords[5]],
                        [coords[6], coords[7]],
                    ],
                });
            }
            Err(_) => {
                warnings.push(format!("line {}: contains non-numeric coordinates", i + 1));
            }
        }
    }

    (boxes, warnings)
}

fn serialize_yolo_obb(boxes: &Annotation) -> String {
    boxes
        .iter()
        .map(|b| {
            format!(
                "{} {} {} {} {} {} {} {} {}",
                b.class_id,
                b.points[0][0],
                b.points[0][1],
                b.points[1][0],
                b.points[1][1],
                b.points[2][0],
                b.points[2][1],
                b.points[3][0],
                b.points[3][1],
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_single_box() {
        let (boxes, warnings) = parse_yolo_obb("0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8\n");
        assert_eq!(
            boxes,
            vec![ObbBox {
                class_id: 0,
                points: [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8]],
            }],
        );
        assert!(warnings.is_empty());
    }

    #[test]
    fn parse_multiple_boxes() {
        let (boxes, warnings) = parse_yolo_obb(
            "0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8\n2 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9\n",
        );
        assert_eq!(
            boxes,
            vec![
                ObbBox {
                    class_id: 0,
                    points: [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8]],
                },
                ObbBox {
                    class_id: 2,
                    points: [[0.2, 0.3], [0.4, 0.5], [0.6, 0.7], [0.8, 0.9]],
                },
            ],
        );
        assert!(warnings.is_empty());
    }

    #[test]
    fn parse_empty() {
        assert_eq!(
            parse_yolo_obb(""),
            (vec![] as Annotation, vec![] as Warnings),
        );
    }

    #[test]
    fn parse_wrong_field_count() {
        assert_eq!(
            parse_yolo_obb("0 0.1 0.2\n"),
            (vec![], vec!["line 1: expected 9 fields, got 3".to_string()]),
        );
    }

    #[test]
    fn parse_invalid_class_id() {
        assert_eq!(
            parse_yolo_obb("abc 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8\n"),
            (vec![], vec!["line 1: invalid class id 'abc'".to_string()]),
        );
    }

    #[test]
    fn parse_non_numeric_coords() {
        assert_eq!(
            parse_yolo_obb("0 0.1 foo 0.3 0.4 0.5 0.6 0.7 0.8\n"),
            (
                vec![],
                vec!["line 1: contains non-numeric coordinates".to_string()],
            ),
        );
    }

    #[test]
    fn parse_out_of_bounds_coords_are_valid() {
        assert_eq!(
            parse_yolo_obb("0 -0.1 1.2 0.3 0.4 0.5 0.6 0.7 0.8\n"),
            (
                vec![ObbBox {
                    class_id: 0,
                    points: [[-0.1, 1.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8]],
                }],
                vec![],
            ),
        );
    }

    #[test]
    fn parse_mixed_valid_and_invalid() {
        assert_eq!(
            parse_yolo_obb(
                "0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8\ngarbage\n1 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8\n",
            ),
            (
                vec![
                    ObbBox {
                        class_id: 0,
                        points: [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8]],
                    },
                    ObbBox {
                        class_id: 1,
                        points: [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8]],
                    },
                ],
                vec!["line 2: expected 9 fields, got 1".to_string()],
            ),
        );
    }

    #[test]
    fn round_trip() {
        let original = vec![ObbBox {
            class_id: 0,
            points: [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8]],
        }];
        let serialized = serialize_yolo_obb(&original);
        let (reparsed, warnings) = parse_yolo_obb(&serialized);
        assert_eq!(reparsed, original);
        assert!(warnings.is_empty());
    }
}
