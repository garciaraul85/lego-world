import { signal } from '@preact/signals';

/**
 * P31 drag and drop: what is being dragged from a library into the 3D view. Browser drag events cannot read
 * their data during dragover, so the payload lives here while the drag is on.
 */
export type DragPayload =
  | { kind: 'asset'; asset: string; rot: number }
  | { kind: 'brick'; type: string; color: string; rot: number };

export const dragPayload = signal<DragPayload | null>(null);

export const DRAG_MIME = 'application/x-brickworlds';

export function startDrag(e: DragEvent, p: DragPayload) {
  dragPayload.value = p;
  e.dataTransfer?.setData(DRAG_MIME, JSON.stringify(p));
  e.dataTransfer?.setData('text/plain', p.kind === 'asset' ? p.asset : p.type);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
}

export function endDrag() {
  dragPayload.value = null;
}

/** What the pointer is over in the 3D view, for the name tip (P31 hover). */
export const sceneHover = signal<{ name: string; x: number; y: number } | null>(null);
