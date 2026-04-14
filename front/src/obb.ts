import type { ObbBox, Point } from "./bindings";

// Build OBB corners from edge-first 3-click method
// p1, p2 = the two edge corners, width = perpendicular extent
export function obbFromEdge(p1: Point, p2: Point, width: number): [Point, Point, Point, Point] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [p1, p1, p1, p1];

  // Unit perpendicular vector (rotated 90 degrees)
  const nx = -dy / len;
  const ny = dx / len;

  const ox = nx * width;
  const oy = ny * width;

  return [
    { x: p1.x, y: p1.y },
    { x: p2.x, y: p2.y },
    { x: p2.x + ox, y: p2.y + oy },
    { x: p1.x + ox, y: p1.y + oy },
  ];
}

// Convert 4 pixel-space corners to normalized ObbBox
export function cornersToObbBox(corners: [Point, Point, Point, Point], imgW: number, imgH: number, classId: number): ObbBox {
  return {
    class_id: classId,
    points: [
      { x: corners[0].x / imgW, y: corners[0].y / imgH },
      { x: corners[1].x / imgW, y: corners[1].y / imgH },
      { x: corners[2].x / imgW, y: corners[2].y / imgH },
      { x: corners[3].x / imgW, y: corners[3].y / imgH },
    ],
  };
}

// Denormalize ObbBox points to pixel space
export function obbToCorners(box: ObbBox, imgW: number, imgH: number): [Point, Point, Point, Point] {
  return box.points.map((p) => ({ x: p.x * imgW, y: p.y * imgH })) as [Point, Point, Point, Point];
}

// Signed perpendicular distance from a point to the line defined by p1->p2
export function perpendicularDistance(p: Point, p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return 0;
  return ((p.x - p1.x) * (-dy / len) + (p.y - p1.y) * (dx / len));
}

// Point-in-polygon test (for hit testing boxes)
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
