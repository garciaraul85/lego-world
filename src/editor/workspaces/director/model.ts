import type { Cinematic, Track } from '../../../core/schema';
import type { CinematicPlayer } from '../../../engine/cinematic/CinematicPlayer';

export type RowKind = Track['kind'];
export type Row = { key: string; kind: RowKind; role?: string; label: string };
export type Item = Track['items'][number];
/** a selected item: its track index in cin.tracks and its index in that track's items */
export type Sel = { track: number; item: number } | { mark: string } | null;

export const ROW_COLOR: Record<RowKind, string> = {
  actor: '#4fd1c5',
  camera: '#f2b632',
  music: '#8b74ff',
  sfx: '#c792ea',
  post: '#8fb7ff',
  event: '#ff8a7a',
};

/** Timeline rows: one per cast role, then camera, music, sound, post and events. */
export function rowsOf(cin: Cinematic): Row[] {
  return [
    ...cin.cast.map((m) => ({ key: `actor:${m.role}`, kind: 'actor' as const, role: m.role, label: m.role })),
    { key: 'camera', kind: 'camera', label: 'Camera' },
    { key: 'music', kind: 'music', label: 'Music' },
    { key: 'sfx', kind: 'sfx', label: 'Sound' },
    { key: 'post', kind: 'post', label: 'Post' },
    { key: 'event', kind: 'event', label: 'Events' },
  ];
}

export function trackIndex(cin: Cinematic, row: Row): number {
  return cin.tracks.findIndex(
    (t) => t.kind === row.kind && (row.kind !== 'actor' || (t.kind === 'actor' && t.role === row.role)),
  );
}

/** A copy with `item` added to the row's track (creating the track when missing). */
export function addItem(cin: Cinematic, row: Row, item: Item): { cin: Cinematic; sel: Sel } {
  const tracks = [...cin.tracks];
  let ti = trackIndex(cin, row);
  if (ti < 0) {
    tracks.push(
      (row.kind === 'actor' ? { kind: 'actor', role: row.role!, items: [] } : { kind: row.kind, items: [] }) as Track,
    );
    ti = tracks.length - 1;
  }
  const tr = tracks[ti]!;
  tracks[ti] = { ...tr, items: [...tr.items, item] } as Track;
  return { cin: { ...cin, tracks }, sel: { track: ti, item: tr.items.length } };
}

export function setItem(cin: Cinematic, track: number, item: number, next: Item | null): Cinematic {
  const tracks = cin.tracks.map((t, i) => {
    if (i !== track) return t;
    const items = [...t.items] as Item[];
    if (next) items[item] = next;
    else items.splice(item, 1);
    return { ...t, items } as Track;
  });
  return { ...cin, tracks };
}

export function itemAt(cin: Cinematic, sel: Sel): Item | null {
  if (!sel || !('track' in sel)) return null;
  return (cin.tracks[sel.track]?.items[sel.item] as Item | undefined) ?? null;
}

/** How long an item lasts on the timeline (for drawing and edge snapping). */
export function spanOf(cin: Cinematic, track: Track, it: Item, player: CinematicPlayer | null): number {
  const end = (t: number) => Math.max(0.25, Math.min(cin.length, t) - it.t);
  if ('dur' in it && typeof it.dur === 'number') return Math.max(0.2, it.dur);
  if (track.kind === 'camera') {
    const next = [...track.items]
      .map((x) => x.t)
      .filter((t) => t > it.t)
      .sort((a, b) => a - b)[0];
    return end(next ?? cin.length);
  }
  if (track.kind === 'actor' && 'do' in it) {
    if (it.do === 'moveTo' && player) {
      const stop = player.tracks.get(track.role)?.moveEndAt(it.t);
      return Math.max(0.25, Math.min(cin.length, stop ?? it.t) - it.t);
    }
    if (it.do === 'play' || it.do === 'emote') return 1.5;
  }
  if (track.kind === 'music') return end(cin.length);
  return 0.25;
}

/** Snap to 0.1 s and to other items' starts / ends within 0.15 s. */
export function snapTime(t: number, edges: number[], length: number): number {
  let best = Math.round(t * 10) / 10;
  let bestD = 0.15;
  for (const e of edges) {
    const d = Math.abs(e - t);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return Math.max(0, Math.min(length, Math.round(best * 1000) / 1000));
}

export function itemLabel(kind: RowKind, it: Item): string {
  if ('do' in it) {
    switch (it.do) {
      case 'moveTo':
        return `${it.speed === 'teleport' ? 'Jump' : it.speed === 'run' ? 'Run' : 'Walk'} → ${it.mark}`;
      case 'face':
        return `Face ${it.target ?? `${Math.round(((it.yaw ?? 0) * 180) / Math.PI)}°`}`;
      case 'say':
        return `“${it.text}”`;
      case 'play':
        return `Clip`;
      case 'emote':
        return `Emote ${it.kind}`;
      case 'equip':
        return `Equip ${it.item}`;
      case 'hide':
        return 'Hide';
      case 'show':
        return 'Show';
    }
  }
  if (kind === 'camera' && 'shot' in it) return `🎥 ${it.shot}${(it.blend ?? 0) > 0 ? ' (blend)' : ''}`;
  if (kind === 'music' && 'fade' in it && !('dur' in it)) {
    const m = it as { music?: string; stop?: boolean };
    return m.stop ? '■ Stop music' : `♪ ${m.music ?? ''}`;
  }
  if (kind === 'sfx' && 'event' in it) return `♫ ${it.event}`;
  if ('fade' in it) return `Fade ${it.fade}`;
  if ('letterbox' in it) return `Letterbox ${it.letterbox ? 'on' : 'off'}`;
  if ('title' in it) return `Title “${it.title}”`;
  if ('slowmo' in it) return `Slow ×${it.slowmo}`;
  if ('emit' in it) return `Send ${it.emit}`;
  if ('setVar' in it) return `${it.setVar} = ${JSON.stringify(it.value)}`;
  return '•';
}

/** A new item of the row's kind at time t. */
export function newItem(row: Row, t: number, cin: Cinematic, defaults: { sound: string; music: string }): Item {
  const r = Math.round(t * 10) / 10;
  switch (row.kind) {
    case 'actor':
      return cin.marks[0]
        ? { t: r, do: 'moveTo', mark: cin.marks[0].id, speed: 'walk' }
        : { t: r, do: 'say', text: 'Hello!', dur: 2 };
    case 'camera':
      return {
        t: r,
        shot: `Shot ${(cin.tracks.find((x) => x.kind === 'camera')?.items.length ?? 0) + 1}`,
        follow: cin.cast[0]?.role ?? 'hero',
        offset: [1.5, 2.4, -5],
        look: cin.cast[0]?.role ?? 'hero',
        fov: 50,
        blend: 0,
      };
    case 'music':
      return { t: r, music: defaults.music as never, fade: 1 };
    case 'sfx':
      return { t: r, event: defaults.sound as never };
    case 'post':
      return { t: r, fade: 'in', dur: 1 };
    case 'event':
      return { t: r, emit: 'scene-event' };
  }
}
