import { signal } from '@preact/signals';

/**
 * P31 drag and drop: what is being dragged from a library into the 3D view. Browser drag events cannot read
 * their data during dragover, so the payload lives here while the drag is on.
 */
export type DragPayload =
  | { kind: 'asset'; asset: string; rot: number }
  | { kind: 'brick'; type: string; color: string; rot: number }
  /** step 11, 4a: a character from the starter pack (or the game), put on the map as a neighbour */
  | { kind: 'character'; character: string; name: string }
  /** Milestone 3b (B2): a behaviour from the dock's Behaviours tab, attached to the copy it is dropped on */
  | { kind: 'behaviour'; use: string; name: string }
  | MediaDrag;

/** step 11 (P24 part 3): an imported file dragged from the Media library */
export type MediaDrag = {
  kind: 'media';
  ref: string;
  media: 'image' | 'video' | 'audio' | 'model' | 'font';
  name: string;
};

export const dragPayload = signal<DragPayload | null>(null);

export const DRAG_MIME = 'application/x-brickworlds';

export function startDrag(e: DragEvent, p: DragPayload) {
  dragPayload.value = p;
  e.dataTransfer?.setData(DRAG_MIME, JSON.stringify(p));
  e.dataTransfer?.setData(
    'text/plain',
    p.kind === 'asset'
      ? p.asset
      : p.kind === 'media' || p.kind === 'character' || p.kind === 'behaviour'
        ? p.name
        : p.type,
  );
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
}

export function endDrag() {
  dragPayload.value = null;
}

/** What the pointer is over in the 3D view, for the name tip (P31 hover). */
export const sceneHover = signal<{ name: string; x: number; y: number } | null>(null);
