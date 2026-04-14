# OBB Drawing Techniques

Techniques for creating oriented bounding boxes in annotation tools.

- [x] **Edge-first (3-click)** — Click to place first edge corner, click to place second corner (sets angle + length of one side), move perpendicular + click to set width. Three clicks, no drag-holding. Default method. Used by CVAT, roLabelImg.
- [ ] **Axis + cross** — Same 3-click flow but draws through the centerline instead of along an edge.
- [ ] **Axis-aligned + rotate** — Click-drag a regular box, then rotate with hotkey.
- [ ] **Center + drag out** — Click center, drag to set size and rotation.
- [ ] **Three clicks (corners)** — Click corner 1, click corner 2 (one edge), click to set width.
- [ ] **Four corner snap** — Click 4 rough corners, tool fits nearest valid rectangle. Good for trapezoid-shaped objects.
- [ ] **Lasso-to-OBB** — Draw rough polygon, auto-fit minimum area bounding rectangle.
- [ ] **Angle-snapped drag** — Like edge-first but shift snaps to angle increments (0, 15, 30, 45 deg).
