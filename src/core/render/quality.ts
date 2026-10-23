/**
 * P27 part 4: quality levels. One table says what each level draws; the game picks a level from the player's
 * setting, else the maker's default, and "auto" picks one from the device (and steps down while frames are slow).
 * The numbers are budgets for a mid-range PC at High; they are estimates until measured on real devices.
 */
export const QUALITY_LEVELS = ['low', 'medium', 'high'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];
export const QUALITY_CHOICES = ['auto', ...QUALITY_LEVELS] as const;
export type QualityChoice = (typeof QUALITY_CHOICES)[number];

export type QualitySpec = {
  label: string;
  /** point lights drawn at once (the nearest and brightest) */
  lights: number;
  /** the first shadow-casting light draws shadows */
  shadows: boolean;
  /** shadow map size (pixels per side) */
  shadowSize: number;
  /** particles alive at once */
  particles: number;
  /** a big map's view distance × this (the maker's setting is for High) */
  viewScale: number;
  /** distance to which bricks show their studs × this */
  detailScale: number;
  /** most screen pixels per CSS pixel (sharpness on high-density screens) */
  pixelRatio: number;
  /** ground fog layer (the fog itself stays: it hides where the map ends) */
  groundFog: boolean;
};

export const QUALITY: Record<QualityLevel, QualitySpec> = {
  low: {
    label: 'Low',
    lights: 2,
    shadows: false,
    shadowSize: 128,
    particles: 600,
    viewScale: 0.5,
    detailScale: 0.5,
    pixelRatio: 1,
    groundFog: false,
  },
  medium: {
    label: 'Medium',
    lights: 4,
    shadows: true,
    shadowSize: 256,
    particles: 1200,
    viewScale: 0.75,
    detailScale: 0.75,
    pixelRatio: 1.5,
    groundFog: true,
  },
  high: {
    label: 'High',
    lights: 8,
    shadows: true,
    shadowSize: 512,
    particles: 2000,
    viewScale: 1,
    detailScale: 1,
    pixelRatio: 2,
    groundFog: true,
  },
};

export const QUALITY_CHOICE_LABEL: Record<QualityChoice, string> = {
  auto: 'Auto',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** what the game knows about the device (all optional: browsers tell different things) */
export type DeviceInfo = {
  /** logical processors (navigator.hardwareConcurrency) */
  cores?: number;
  /** memory in GB, rounded (navigator.deviceMemory; Chrome only) */
  memory?: number;
  /** a touch screen is the main pointer (phones and tablets) */
  touch?: boolean;
};

/**
 * The level Auto starts at: phones and small devices Low, mid-range Medium, strong desktops High. A device that
 * says little starts at Medium; Auto steps down while frames are slow.
 */
export function autoQuality(d: DeviceInfo): QualityLevel {
  const cores = d.cores ?? 4;
  const memory = d.memory ?? 8;
  if (d.touch) return cores >= 8 && memory >= 6 ? 'medium' : 'low';
  if (cores <= 2 || memory <= 2) return 'low';
  if (cores >= 8 && memory >= 8) return 'high';
  return 'medium';
}

/** the level to play at: the player's choice, else the maker's default; Auto asks the device */
export function resolveQuality(
  player: QualityChoice | undefined,
  maker: QualityChoice | undefined,
  device: DeviceInfo,
): QualityLevel {
  const choice = player && player !== 'auto' ? player : (maker ?? 'auto');
  return choice === 'auto' ? autoQuality(device) : choice;
}

/** one level lower (Low stays Low) */
export const lowerQuality = (l: QualityLevel): QualityLevel => (l === 'high' ? 'medium' : 'low');

/** frames slower than this (ms, on average) make Auto step down */
export const SLOW_FRAME_MS = 40;
/** seconds of slow frames before Auto steps down (and between steps) */
export const SLOW_FOR = 4;

/**
 * P27 part 4: Auto steps down a level when frames stay slow. Feed it each frame's time; it says when to step
 * down. It never steps up again in a play (a level that was too slow once will be again).
 */
export class AutoQuality {
  private slow = 0;
  private sum = 0;
  private n = 0;
  private window = 0;

  /** a frame took `ms`; true when the level should go down now */
  frame(ms: number): boolean {
    this.sum += ms;
    this.n++;
    this.window += ms / 1000;
    if (this.window < 1) return false;
    const avg = this.sum / this.n;
    this.slow = avg > SLOW_FRAME_MS ? this.slow + this.window : 0;
    this.sum = 0;
    this.n = 0;
    this.window = 0;
    if (this.slow < SLOW_FOR) return false;
    this.slow = 0;
    return true;
  }
}
