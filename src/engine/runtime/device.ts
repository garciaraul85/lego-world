import type { DeviceInfo } from '../../core/render/quality';

/** the device this runs on, as far as the browser tells (nothing outside a browser) */
export function browserDevice(): DeviceInfo {
  if (typeof navigator === 'undefined') return {};
  const n = navigator as Navigator & { deviceMemory?: number };
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return {
    ...(n.hardwareConcurrency ? { cores: n.hardwareConcurrency } : {}),
    ...(n.deviceMemory ? { memory: n.deviceMemory } : {}),
    touch,
  };
}
