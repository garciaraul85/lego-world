import { useState } from 'preact/hooks';
import type { Screen } from '../../../core/schema';
import type { ScreenHost } from '../../../engine/ui/ScreenRenderer';
import { resolveScreen, screenOfKind } from '../../../engine/ui/screens';
import type { EditorState } from '../../state';
import { DeviceFrame } from './DeviceFrames';
import { DEVICES, SAMPLE } from './model';

/** The screen canvas (board 6): device frames, sample values or raw {bindings}, click to select a widget. */
export function ScreenCanvas({ ed, screen, onPlay }: { ed: EditorState; screen: Screen; onPlay: () => void }) {
  const [device, setDevice] = useState<(typeof DEVICES)[number]['id']>('desktop');
  const [sample, setSample] = useState(true);
  const [overHud, setOverHud] = useState(screen.kind === 'pause' || screen.kind === 'dialogue');
  const host: ScreenHost = {
    lookup: (n) => (sample ? SAMPLE[n] : `{${n}}`),
    run: () => {},
    sound: (id) => ed.audio.previewEvent(id),
    media: (ref) => ed.media?.url(ref),
    touch: device !== 'desktop',
    preview: { selected: ed.widgetPath.value, select: (p) => (ed.widgetPath.value = p) },
  };
  const hud = screenOfKind(ed.store, 'hud');
  const under = overHud && hud && hud.id !== screen.id ? [resolveScreen(ed.store, hud.id)!] : [];
  const dev = DEVICES.find((d) => d.id === device)!;
  return (
    <>
      <div class="studio-tools" role="toolbar" aria-label="Screen canvas">
        <span class="group" role="radiogroup" aria-label="Device">
          {DEVICES.map((d) => (
            <button
              type="button"
              role="radio"
              aria-checked={device === d.id}
              class={`btn ${device === d.id ? 'on' : ''}`}
              onClick={() => setDevice(d.id)}
            >
              {d.name}
            </button>
          ))}
        </span>
        <span class="sep" />
        <label class="row small">
          <input type="checkbox" checked={sample} onChange={(e) => setSample((e.target as HTMLInputElement).checked)} />
          Sample values
        </label>
        <label class="row small">
          <input
            type="checkbox"
            checked={overHud}
            onChange={(e) => setOverHud((e.target as HTMLInputElement).checked)}
          />
          Over the HUD
        </label>
        <span class="sep" />
        <button type="button" class="btn go" onClick={onPlay} title="Play the game from its first screen (Ctrl F5)">
          ▶ Play from first screen
        </button>
      </div>
      <div
        class="sc-canvas"
        role="presentation"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) ed.widgetPath.value = '';
        }}
      >
        <DeviceFrame device={dev} screen={screen} host={host} under={under} />
      </div>
      <div class="studio-foot muted small">
        Laid out at 1280×720 and scaled to fit · anchors keep widgets on their edge on any screen · {dev.name}
      </div>
    </>
  );
}
