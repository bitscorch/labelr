import type { ImageInfo, ObbBox, AnnotationResponse } from "./bindings";

export async function getImages(): Promise<ImageInfo[]> {
  const res = await fetch("/api/images");
  return res.json();
}

export function getImageUrl(index: number): string {
  return `/api/images/${index}`;
}

export async function getAnnotation(index: number): Promise<AnnotationResponse> {
  const res = await fetch(`/api/images/${index}/annotation`);
  return res.json();
}

export async function saveAnnotation(index: number, boxes: ObbBox[]): Promise<void> {
  await fetch(`/api/images/${index}/annotation`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(boxes),
  });
}

export async function getClasses(): Promise<string[]> {
  const res = await fetch("/api/classes");
  return res.json();
}

export async function saveClasses(classes: string[]): Promise<void> {
  await fetch("/api/classes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(classes),
  });
}
