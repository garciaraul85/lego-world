import type { Command } from '../../core/commands';

/**
 * P32: a sideways move lands where it can stand. When the spot at the same height is refused (floating with
 * no studs under it, or cutting into something), the move goes down onto what is below, else up until it
 * fits. Only the final spot is checked, so a chest on a tower can be dragged straight to the tower's door.
 * `check` returns why a command would be refused, or null (CommandBus.check).
 */
export function settleMove(
  cmd: Command,
  check: (c: Command) => string | null,
  down = 60,
  up = 36,
): { cmd: Command; dy: number } {
  if (cmd.type !== 'bricks.move') return { cmd, dy: 0 };
  const p = cmd.payload as { dx: number; dy: number; dz: number };
  if ((!p.dx && !p.dz) || !check(cmd)) return { cmd, dy: 0 };
  const at = (dy: number): Command => ({ ...cmd, payload: { ...p, dy: p.dy + dy } });
  for (let k = 1; k <= Math.max(down, up); k++) {
    if (k <= down && !check(at(-k))) return { cmd: at(-k), dy: -k };
    if (k <= up && !check(at(k))) return { cmd: at(k), dy: k };
  }
  return { cmd, dy: 0 };
}
