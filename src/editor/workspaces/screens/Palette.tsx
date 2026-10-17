import type { Widget } from '../../../core/schema';
import type { ScreenHost } from '../../../engine/ui/ScreenRenderer';
import { WidgetView } from '../../../engine/ui/widgets';
import { WIDGET_NAMES as NAMES, SAMPLE, WIDGET_TIPS as TIPS, template, WIDGET_TYPES } from './model';

/** Drag-and-drop type for a widget from the palette onto the canvas. */
export const WIDGET_DRAG = 'application/x-brickworlds-widget';

/**
 * P31 widget palette: every type as a small live preview. Click to add it to the selected panel, or drag it
 * onto the canvas where it should go.
 */
export function Palette({ onAdd }: { onAdd: (type: Widget['type']) => void }) {
  const host: ScreenHost = {
    lookup: (n) => SAMPLE[n],
    run: () => {},
    sound: () => {},
    touch: true,
    preview: { selected: null, select: () => {} },
  };
  return (
    <div class="sc-palette" role="group" aria-label="Add widget">
      {WIDGET_TYPES.map((t) => {
        const w = { ...template(t, 1), anchor: undefined, offset: undefined } as Widget;
        return (
          <button
            type="button"
            class="sc-pal-card"
            draggable
            aria-label={`Add ${NAMES[t]}`}
            data-tip={`${TIPS[t]}. Click to add, or drag onto the screen.`}
            onDragStart={(e) => {
              e.dataTransfer?.setData(WIDGET_DRAG, t);
              e.dataTransfer?.setData('text/plain', t);
            }}
            onClick={() => onAdd(t)}
          >
            <span class="sc-pal-preview" aria-hidden="true">
              <span class="sc-pal-inner">
                <WidgetView w={w} path={`pal.${t}`} screen="palette" host={host} />
              </span>
            </span>
            <span class="small">{NAMES[t]}</span>
          </button>
        );
      })}
    </div>
  );
}
