use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone, Copy, TS)]
#[ts(export, export_to = "../front/src/bindings.ts")]
pub struct Point {
    pub x: f64,
    pub y: f64,
}
