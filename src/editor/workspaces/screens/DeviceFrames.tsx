import { useEffect, useRef, useState } from 'preact/hooks';
import type { Screen } from '../../../core/schema';
import { screenScale } from '../../../engine/ui/layout';
import { type ScreenHost, ScreenView } from '../../../engine/ui/ScreenRenderer';
import type { DEVICES } from './model';

export type Device = (typeof DEVICES)[number];

/** A device-shaped frame that fits the available space, with the screen laid out inside (safe areas shaded). */
export function DeviceFrame({
  device,
  screen,
  host,
  under,
}: {
  device: Device;
  screen: Screen;
  host: ScreenHost;
  under?: Screen[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 640, h: 360 });
  useEffect(() => {
    const el = ref.current!;
    const resize = () => {
      const k = Math.min((el.clientWidth - 24) / device.w, (el.clientHeight - 24) / device.h);
      setBox({ w: Math.max(80, device.w * k), h: Math.max(45, device.h * k) });
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    return () => ro.disconnect();
  }, [device.id]);
  const k = box.w / device.w;
  const safe = {
    top: device.safe.top * k,
    right: device.safe.right * k,
    bottom: device.safe.bottom * k,
    left: device.safe.left * k,
  };
  const scale = screenScale(box.w, box.h, safe);
  return (
    <div ref={ref} class="sc-stage">
      <div
        class={`sc-device sc-${device.id}`}
        style={{ width: `${box.w}px`, height: `${box.h}px` }}
        data-device={device.id}
      >
        <div class="sc-game-bg" aria-hidden="true" />
        {(under ?? []).map((u) => (
          <div class="sc-under">
            <ScreenView screen={u} host={{ ...host, preview: { selected: null, select: () => {} } }} scale={scale} />
          </div>
        ))}
        <ScreenView screen={screen} host={host} scale={scale} />
        {safe.left > 0 && <div class="sc-safe" style={{ left: 0, top: 0, bottom: 0, width: `${safe.left}px` }} />}
        {safe.right > 0 && <div class="sc-safe" style={{ right: 0, top: 0, bottom: 0, width: `${safe.right}px` }} />}
        {safe.top > 0 && <div class="sc-safe" style={{ left: 0, right: 0, top: 0, height: `${safe.top}px` }} />}
        {safe.bottom > 0 && (
          <div class="sc-safe" style={{ left: 0, right: 0, bottom: 0, height: `${safe.bottom}px` }} />
        )}
      </div>
    </div>
  );
}
