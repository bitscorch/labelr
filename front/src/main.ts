import { getImages, getImageUrl, getAnnotation, saveAnnotation } from "./api";
import type { ImageInfo, ObbBox, Point } from "./bindings";
import { obbFromEdge, cornersToObbBox, obbToCorners, perpendicularDistance, pointInPolygon } from "./obb";

interface ViewState {
  offsetX: number;
  offsetY: number;
  scale: number;
}

type DrawPhase = "idle" | "edge" | "width";

let images: ImageInfo[] = [];
let currentIndex = 0;
let currentImage: HTMLImageElement | null = null;
let boxes: ObbBox[] = [];
let selectedIndex: number | null = null;
let currentClassId = 0;
let dirty = false;

let view: ViewState = { offsetX: 0, offsetY: 0, scale: 1 };

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

// Panning
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

// Drawing state
let drawPhase: DrawPhase = "idle";
let edgeP1: Point | null = null;
let edgeP2: Point | null = null;
let mousePos: Point = { x: 0, y: 0 }; // in image pixel coords

// Grab/Rotate/Scale modes
let transformMode: "none" | "grab" | "rotate" | "scale" = "none";
let transformOrigin: Point = { x: 0, y: 0 };

const CLASS_COLORS = [
  "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231",
  "#911eb4", "#42d4f4", "#f032e6", "#bfef45", "#fabed4",
];

function init() {
  canvas = document.getElementById("canvas") as HTMLCanvasElement;
  ctx = canvas.getContext("2d")!;

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  document.getElementById("prev-btn")!.addEventListener("click", () => navigate(-1));
  document.getElementById("next-btn")!.addEventListener("click", () => navigate(1));
  document.addEventListener("keydown", onKeyDown);

  loadImageList();
}

function resizeCanvas() {
  const container = document.getElementById("canvas-container")!;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  render();
}

// Convert screen coords to image pixel coords
function screenToImage(sx: number, sy: number): Point {
  return {
    x: (sx - view.offsetX) / view.scale,
    y: (sy - view.offsetY) / view.scale,
  };
}

async function loadImageList() {
  images = await getImages();
  if (images.length > 0) {
    loadImage(0);
  }
  updateInfo();
}

async function loadImage(index: number) {
  if (dirty) {
    await saveAnnotation(currentIndex, boxes);
    dirty = false;
  }

  currentIndex = index;
  selectedIndex = null;
  drawPhase = "idle";
  edgeP1 = null;
  edgeP2 = null;
  transformMode = "none";
  updateInfo();

  const img = new Image();
  img.src = getImageUrl(index);
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
  });
  currentImage = img;

  const response = await getAnnotation(index);
  boxes = response.boxes;

  if (response.warnings.length > 0) {
    console.warn(`Warnings for ${images[index].filename}:`, response.warnings);
  }

  fitImageToCanvas();
  render();
}

function fitImageToCanvas() {
  if (!currentImage) return;

  const padding = 40;
  const scaleX = (canvas.width - padding * 2) / currentImage.width;
  const scaleY = (canvas.height - padding * 2) / currentImage.height;
  view.scale = Math.min(scaleX, scaleY);
  view.offsetX = (canvas.width - currentImage.width * view.scale) / 2;
  view.offsetY = (canvas.height - currentImage.height * view.scale) / 2;
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!currentImage) return;

  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);

  ctx.drawImage(currentImage, 0, 0);

  // Draw existing boxes
  for (let i = 0; i < boxes.length; i++) {
    drawObb(boxes[i], i === selectedIndex);
  }

  // Draw in-progress creation
  drawPreview();

  ctx.restore();
}

function drawObb(box_: ObbBox, selected: boolean) {
  if (!currentImage) return;

  const color = CLASS_COLORS[box_.class_id % CLASS_COLORS.length];
  const corners = obbToCorners(box_, currentImage.width, currentImage.height);

  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(corners[i].x, corners[i].y);
  }
  ctx.closePath();

  ctx.strokeStyle = selected ? "#ffffff" : color;
  ctx.lineWidth = (selected ? 3 : 2) / view.scale;
  ctx.stroke();

  ctx.fillStyle = color + (selected ? "55" : "33");
  ctx.fill();

  // Draw corner dots when selected
  if (selected) {
    for (const c of corners) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4 / view.scale, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  }
}

function drawPreview() {
  if (drawPhase === "edge" && edgeP1) {
    // Draw line from first click to cursor
    ctx.beginPath();
    ctx.moveTo(edgeP1.x, edgeP1.y);
    ctx.lineTo(mousePos.x, mousePos.y);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 / view.scale;
    ctx.setLineDash([6 / view.scale, 4 / view.scale]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw dots at both points
    for (const p of [edgeP1, mousePos]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 / view.scale, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  }

  if (drawPhase === "width" && edgeP1 && edgeP2) {
    const width = perpendicularDistance(mousePos, edgeP1, edgeP2);
    const corners = obbFromEdge(edgeP1, edgeP2, width);

    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 / view.scale;
    ctx.setLineDash([6 / view.scale, 4 / view.scale]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = CLASS_COLORS[currentClassId % CLASS_COLORS.length] + "33";
    ctx.fill();
  }
}

function hitTest(p: Point): number | null {
  if (!currentImage) return null;

  // Test in reverse order (topmost first)
  for (let i = boxes.length - 1; i >= 0; i--) {
    const corners = obbToCorners(boxes[i], currentImage.width, currentImage.height);
    if (pointInPolygon(p, corners)) {
      return i;
    }
  }
  return null;
}

function navigate(delta: number) {
  const newIndex = currentIndex + delta;
  if (newIndex >= 0 && newIndex < images.length) {
    loadImage(newIndex);
  }
}

function updateInfo() {
  const info = document.getElementById("image-info")!;
  if (images.length === 0) {
    info.textContent = "no images";
  } else {
    const dirtyMark = dirty ? " *" : "";
    info.textContent = `${currentIndex + 1} / ${images.length} — ${images[currentIndex].filename}${dirtyMark}`;
  }
}

// --- Event handlers ---

function onWheel(e: WheelEvent) {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const mouseX = e.offsetX;
  const mouseY = e.offsetY;

  view.offsetX = mouseX - (mouseX - view.offsetX) * zoomFactor;
  view.offsetY = mouseY - (mouseY - view.offsetY) * zoomFactor;
  view.scale *= zoomFactor;

  render();
}

function onMouseDown(e: MouseEvent) {
  const imgPos = screenToImage(e.offsetX, e.offsetY);

  // Right click = pan
  if (e.button === 2) {
    isPanning = true;
    panStartX = e.clientX - view.offsetX;
    panStartY = e.clientY - view.offsetY;
    return;
  }

  if (e.button !== 0) return;

  // If in a transform mode, left click confirms
  if (transformMode !== "none") {
    transformMode = "none";
    dirty = true;
    updateInfo();
    render();
    return;
  }

  // Drawing flow
  if (drawPhase === "idle") {
    // Try to select an existing box first
    const hit = hitTest(imgPos);
    if (hit !== null) {
      selectedIndex = hit;
      render();
      return;
    }
    // Start drawing — first edge point
    edgeP1 = imgPos;
    drawPhase = "edge";
    selectedIndex = null;
    render();
    return;
  }

  if (drawPhase === "edge") {
    // Second click — complete the edge
    edgeP2 = imgPos;
    drawPhase = "width";
    render();
    return;
  }

  if (drawPhase === "width" && edgeP1 && edgeP2 && currentImage) {
    // Third click — create the box
    const width = perpendicularDistance(imgPos, edgeP1, edgeP2);
    const corners = obbFromEdge(edgeP1, edgeP2, width);
    const box = cornersToObbBox(corners, currentImage.width, currentImage.height, currentClassId);
    boxes.push(box);
    selectedIndex = boxes.length - 1;
    dirty = true;

    drawPhase = "idle";
    edgeP1 = null;
    edgeP2 = null;
    updateInfo();
    render();
    return;
  }
}

function onMouseMove(e: MouseEvent) {
  mousePos = screenToImage(e.offsetX, e.offsetY);

  if (isPanning) {
    view.offsetX = e.clientX - panStartX;
    view.offsetY = e.clientY - panStartY;
    render();
    return;
  }

  // Transform modes (G/R/S)
  if (transformMode !== "none" && selectedIndex !== null && currentImage) {
    const box = boxes[selectedIndex];
    const corners = obbToCorners(box, currentImage.width, currentImage.height);

    if (transformMode === "grab") {
      const dx = mousePos.x - transformOrigin.x;
      const dy = mousePos.y - transformOrigin.y;
      for (const c of corners) {
        c.x += dx;
        c.y += dy;
      }
      transformOrigin = { ...mousePos };
      boxes[selectedIndex] = cornersToObbBox(corners, currentImage.width, currentImage.height, box.class_id);
    }

    if (transformMode === "rotate") {
      const cx = (corners[0].x + corners[2].x) / 2;
      const cy = (corners[0].y + corners[2].y) / 2;
      const prevAngle = Math.atan2(transformOrigin.y - cy, transformOrigin.x - cx);
      const currAngle = Math.atan2(mousePos.y - cy, mousePos.x - cx);
      const delta = currAngle - prevAngle;

      const rotated = corners.map((c) => {
        const rx = (c.x - cx) * Math.cos(delta) - (c.y - cy) * Math.sin(delta) + cx;
        const ry = (c.x - cx) * Math.sin(delta) + (c.y - cy) * Math.cos(delta) + cy;
        return { x: rx, y: ry };
      }) as [Point, Point, Point, Point];

      transformOrigin = { ...mousePos };
      boxes[selectedIndex] = cornersToObbBox(rotated, currentImage.width, currentImage.height, box.class_id);
    }

    if (transformMode === "scale") {
      const cx = (corners[0].x + corners[2].x) / 2;
      const cy = (corners[0].y + corners[2].y) / 2;
      const prevDist = Math.sqrt((transformOrigin.x - cx) ** 2 + (transformOrigin.y - cy) ** 2);
      const currDist = Math.sqrt((mousePos.x - cx) ** 2 + (mousePos.y - cy) ** 2);
      const factor = prevDist > 0 ? currDist / prevDist : 1;

      const scaled = corners.map((c) => ({
        x: cx + (c.x - cx) * factor,
        y: cy + (c.y - cy) * factor,
      })) as [Point, Point, Point, Point];

      transformOrigin = { ...mousePos };
      boxes[selectedIndex] = cornersToObbBox(scaled, currentImage.width, currentImage.height, box.class_id);
    }

    render();
    return;
  }

  // Preview during drawing
  if (drawPhase !== "idle") {
    render();
  }
}

function onMouseUp(e: MouseEvent) {
  if (e.button === 2) {
    isPanning = false;
  }
}

function onKeyDown(e: KeyboardEvent) {
  // Cancel
  if (e.key === "Escape") {
    if (drawPhase !== "idle") {
      drawPhase = "idle";
      edgeP1 = null;
      edgeP2 = null;
    } else if (transformMode !== "none") {
      transformMode = "none";
      // TODO: revert transform
    } else {
      selectedIndex = null;
    }
    render();
    return;
  }

  // Delete selected box
  if ((e.key === "Delete" || e.key === "x") && selectedIndex !== null) {
    boxes.splice(selectedIndex, 1);
    selectedIndex = null;
    dirty = true;
    updateInfo();
    render();
    return;
  }

  // Grab
  if (e.key === "g" && selectedIndex !== null) {
    transformMode = "grab";
    transformOrigin = { ...mousePos };
    return;
  }

  // Rotate
  if (e.key === "r" && selectedIndex !== null) {
    transformMode = "rotate";
    transformOrigin = { ...mousePos };
    return;
  }

  // Scale
  if (e.key === "s" && selectedIndex !== null && !e.ctrlKey) {
    transformMode = "scale";
    transformOrigin = { ...mousePos };
    return;
  }

  // Tab — cycle selection
  if (e.key === "Tab" && boxes.length > 0) {
    e.preventDefault();
    if (selectedIndex === null) {
      selectedIndex = 0;
    } else {
      selectedIndex = (selectedIndex + 1) % boxes.length;
    }
    render();
    return;
  }

  // Number keys — assign class
  if (e.key >= "1" && e.key <= "9") {
    const classId = parseInt(e.key) - 1;
    if (selectedIndex !== null) {
      boxes[selectedIndex] = { ...boxes[selectedIndex], class_id: classId };
      dirty = true;
      updateInfo();
      render();
    } else {
      currentClassId = classId;
    }
    return;
  }

  // Save
  if (e.key === "s" && e.ctrlKey) {
    e.preventDefault();
    saveAnnotation(currentIndex, boxes);
    dirty = false;
    updateInfo();
    return;
  }

  // Navigate
  if (e.key === "ArrowLeft") navigate(-1);
  if (e.key === "ArrowRight") navigate(1);
}

init();
