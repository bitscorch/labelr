import { getImages, getImageUrl, getAnnotation } from "./api";
import type { ImageInfo, ObbBox } from "./bindings";

interface ViewState {
  offsetX: number;
  offsetY: number;
  scale: number;
}

let images: ImageInfo[] = [];
let currentIndex = 0;
let currentImage: HTMLImageElement | null = null;
let boxes: ObbBox[] = [];
let view: ViewState = { offsetX: 0, offsetY: 0, scale: 1 };

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

let isPanning = false;
let panStartX = 0;
let panStartY = 0;

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

async function loadImageList() {
  images = await getImages();
  if (images.length > 0) {
    loadImage(0);
  }
  updateInfo();
}

async function loadImage(index: number) {
  currentIndex = index;
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

  for (const box of boxes) {
    drawObb(box);
  }

  ctx.restore();
}

function drawObb(box_: ObbBox) {
  if (!currentImage) return;

  const color = CLASS_COLORS[box_.class_id % CLASS_COLORS.length];
  const w = currentImage.width;
  const h = currentImage.height;

  // Denormalize points
  const pts = box_.points.map(([x, y]) => [x * w, y * h]);

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.closePath();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2 / view.scale;
  ctx.stroke();

  ctx.fillStyle = color + "33";
  ctx.fill();
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
    info.textContent = `${currentIndex + 1} / ${images.length} — ${images[currentIndex].filename}`;
  }
}

// Zoom centered on cursor
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
  // Middle mouse or space+left for panning
  if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
    isPanning = true;
    panStartX = e.clientX - view.offsetX;
    panStartY = e.clientY - view.offsetY;
    e.preventDefault();
  }
}

function onMouseMove(e: MouseEvent) {
  if (isPanning) {
    view.offsetX = e.clientX - panStartX;
    view.offsetY = e.clientY - panStartY;
    render();
  }
}

function onMouseUp(_e: MouseEvent) {
  isPanning = false;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "ArrowLeft") navigate(-1);
  if (e.key === "ArrowRight") navigate(1);
}

init();
