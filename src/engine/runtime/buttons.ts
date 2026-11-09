import {
  ACTION_PRIORITY,
  type ActionKind,
  type ActionOffer,
  type Bindable,
  BUTTON_NAME,
  type Controls,
  controlsOf,
  ITEM_BUTTONS,
  keyName,
  PAD_NAME,
  pickAction,
} from '../../core/controls/controls';

/**
 * Step 11b part 1: the game's buttons at play. Each step the game offers what the Action button could do here
 * (a neighbour to talk to, a chest to open, a sign to read, deep water to dive into, a jump) and the button does
 * the most important one, its label shown on the HUD. Item buttons use whatever item the player put in them.
 * Buttons know nothing about keys: Play turns keys, gamepad buttons and touches into presses through the bindings.
 */
export type ButtonHost = {
  /** what can be done here now (each part of the game adds its own) */
  offers(): ActionOffer[];
  /** do it */
  act(o: ActionOffer, down: boolean): void;
  /** the other buttons */
  attack(down: boolean): void;
  jump(): void;
  guard(down: boolean): void;
  roll(): void;
  lock(): void;
  move(dir: 'forward' | 'back' | 'left' | 'right' | 'run', down: boolean): void;
  /** an item button pressed with this item in it (null: empty) */
  useItem(item: string | null, slot: number): void;
  /** the item menu (pick what goes in each item button) */
  itemMenu(): void;
  count(item: string): number;
  /** Milestone 3b (B7b): may this button work now (controls off, a PlayerInput's canPress)? */
  canPress?(b: Bindable): boolean;
  /** Milestone 3b (B7b): a button went down or up (held: seconds it was down) — logic hears it */
  pressed?(b: Bindable, down: boolean, held: number): void;
};

/** Milestone 3b (B7b): the pointer era's item button opens the item wheel when held this long */
export const HOLD_FOR_WHEEL = 0.35;

export class GameButtons {
  readonly c: ReturnType<typeof controlsOf>;
  /** what the Action button does now */
  now: ActionOffer | null = null;
  /** an action label logic set (Set action label): offered while set */
  custom: string | null = null;
  /** the item in each item button */
  slots: (string | null)[] = [null, null, null, null];
  /** the offer a held Action press started (released with it) */
  private held: ActionOffer | null = null;
  /** Milestone 3b (B7b): the buttons down now, and for how long (seconds) */
  readonly down = new Map<Bindable, number>();
  /** the pointer era: the item wheel opened by holding the item button (its press is not a use) */
  private wheelByHold = false;
  /** a player's own keys and gamepad buttons (on this device) */
  playerKeys: Partial<Record<Bindable, string[]>> = {};
  playerPad: Partial<Record<Bindable, number[]>> = {};

  constructor(
    controls: Controls | undefined,
    private host: ButtonHost,
  ) {
    this.c = controlsOf(controls);
  }

  /** picks what the Action button does (call every step) */
  update(dt = 1 / 60) {
    for (const [b, t] of this.down) this.down.set(b, t + dt);
    // the pointer era: holding the item button opens the item wheel
    if (this.c.layout === 'pointer' && !this.wheelByHold && (this.down.get('item1') ?? 0) >= HOLD_FOR_WHEEL) {
      this.wheelByHold = true;
      this.host.itemMenu();
    }
    const offers = this.host.offers();
    if (this.custom) offers.push({ kind: 'custom', label: this.custom, priority: ACTION_PRIORITY.custom });
    if (this.c.jump === 'action') offers.push({ kind: 'jump', label: 'Jump', priority: ACTION_PRIORITY.jump });
    this.now = pickAction(offers);
  }

  press(b: Bindable) {
    const h = this.host;
    if (this.down.has(b)) return;
    if (h.canPress && !h.canPress(b)) return;
    this.down.set(b, 0);
    h.pressed?.(b, true, 0);
    // the pointer era: the item button is used when let go quickly (held: the wheel opens)
    if (this.c.layout === 'pointer' && b === 'item1') return;
    switch (b) {
      case 'action':
        if (!this.now) return;
        this.held = this.now;
        h.act(this.now, true);
        return;
      case 'attack':
        return h.attack(true);
      case 'jump':
        return h.jump();
      case 'guard':
        return h.guard(true);
      case 'roll':
        return h.roll();
      case 'lock':
        return h.lock();
      case 'wheel':
      case 'menu':
        return h.itemMenu();
      case 'up':
        return h.move('forward', true);
      case 'down':
        return h.move('back', true);
      case 'left':
      case 'right':
        return h.move(b, true);
      case 'run':
        return h.move('run', true);
      default: {
        const i = ITEM_BUTTONS.indexOf(b);
        if (i >= 0 && i < this.c.items) h.useItem(this.slots[i] ?? null, i + 1);
      }
    }
  }

  release(b: Bindable) {
    const h = this.host;
    const held = this.down.get(b);
    if (held === undefined) return;
    this.down.delete(b);
    h.pressed?.(b, false, held);
    if (this.c.layout === 'pointer' && b === 'item1') {
      if (!this.wheelByHold) h.useItem(this.slots[0] ?? null, 1);
      this.wheelByHold = false;
      return;
    }
    switch (b) {
      case 'action':
        if (this.held) h.act(this.held, false);
        this.held = null;
        return;
      case 'attack':
        return h.attack(false);
      case 'guard':
        return h.guard(false);
      case 'up':
        return h.move('forward', false);
      case 'down':
        return h.move('back', false);
      case 'left':
      case 'right':
        return h.move(b, false);
      case 'run':
        return h.move('run', false);
    }
  }

  /** puts an item in an item button (1–4); the same item leaves the button it was in */
  equip(slot: number, item: string | null) {
    if (slot < 1 || slot > 4) return;
    if (item) this.slots = this.slots.map((x) => (x === item ? null : x));
    this.slots[slot - 1] = item;
  }

  /** the first key (or gamepad button) a button has, for labels: "E", "Space", "A" */
  keyOf(b: Bindable, pad = false): string {
    if (pad) {
      const p = (this.playerPad[b] ?? this.c.pad[b])[0];
      return p === undefined ? '' : (PAD_NAME[p] ?? `Button ${p}`);
    }
    const k = (this.playerKeys[b] ?? this.c.keys[b])[0];
    return k ? keyName(k) : '';
  }

  /** values screens show: {action} "Open", {action.key} "E", {slot1} "Bow", {slot1.count} 12, {slot1.key} "J" */
  lookup(name: string): unknown {
    if (name === 'action') return this.now?.label ?? '';
    if (name === 'action.kind') return this.now?.kind ?? '';
    if (name === 'action.key') return this.keyOf('action');
    const m = /^slot([1-4])(\.count|\.key)?$/.exec(name);
    if (m) {
      const i = Number(m[1]) - 1;
      if (i >= this.c.items) return '';
      const item = this.slots[i] ?? null;
      if (m[2] === '.key') return this.keyOf(ITEM_BUTTONS[i]!);
      if (m[2] === '.count') return item ? this.host.count(item) : '';
      return item ?? '';
    }
    const b = /^button\.([a-z0-9]+)$/.exec(name);
    if (b) return this.keyOf(b[1] as Bindable);
    return undefined;
  }

  /** a label for the button and what it does now: "E · Open" */
  prompt(): string {
    if (!this.now) return '';
    // something to hold (rebuilding) says so
    if (this.now.kind === 'rebuild') return `Hold ${this.keyOf('action')} · ${this.now.label}`;
    return `${this.keyOf('action')} · ${this.now.label}`;
  }
}

export const describeButton = (b: Bindable) => BUTTON_NAME[b];
export type { ActionKind };
