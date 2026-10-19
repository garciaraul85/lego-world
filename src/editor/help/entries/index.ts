import { generatedEntries } from './generated';
import type { HelpEntry, ScreenGuide, ScreenId } from './types';
import { GUIDES, WRITTEN } from './written/index';

export { ACTION_HELP } from './generated';
export * from './resolve';
export * from './types';

/** The command types the engine registers (kept in step by a test against the real command bus). */
export const COMMAND_TYPES = [
  'bricks.place',
  'bricks.remove',
  'bricks.move',
  'bricks.paint',
  'bricks.update',
  'map.setEnvironment',
  'map.generate',
  'map.create',
  'map.rename',
  'map.delete',
  'map.addSpawn',
  'map.updateSpawn',
  'map.removeSpawn',
  'map.addZone',
  'map.updateZone',
  'map.removeZone',
  'map.setAudio',
  'project.update',
  'gate.connect',
  'gate.update',
  'gate.delete',
  'asset.place',
  'asset.make',
  'asset.create',
  'asset.update',
  'asset.delete',
  'instance.move',
  'instance.remove',
  'instance.setState',
  'instance.rename',
  'npc.place',
  'npc.remove',
  'progress.put',
  'dialogue.put',
  'dialogue.delete',
  'bodyplan.put',
  'bodyplan.delete',
  'effect.put',
  'effect.delete',
  'instance.unpack',
  'instance.transform',
  'character.create',
  'character.update',
  'character.delete',
  'clip.create',
  'clip.update',
  'clip.delete',
  'logic.create',
  'logic.replace',
  'logic.delete',
  'logic.addNode',
  'logic.removeNodes',
  'logic.moveNodes',
  'logic.connect',
  'logic.disconnect',
  'logic.setArgs',
  'logic.setVariable',
  'audio.setEvent',
  'audio.setMusic',
  'audio.setMusicSettings',
  'audio.setMixer',
  'item.add',
  'item.update',
  'item.remove',
  'screen.put',
  'screen.delete',
  'cinematic.put',
  'cinematic.delete',
  'art.put',
  'art.delete',
  'media.register',
  'media.remove',
  'file.put',
  'file.delete',
] as const;

let all: HelpEntry[] | null = null;
let byId: Map<string, HelpEntry> | null = null;

/** Every Help entry: written ones first (they win a tie when matching a control), then generated ones. */
export function helpEntries(): HelpEntry[] {
  all ??= [...WRITTEN, ...generatedEntries(COMMAND_TYPES)];
  return all;
}

export function helpEntry(id: string): HelpEntry | null {
  byId ??= new Map(helpEntries().map((e) => [e.id, e]));
  return byId.get(id) ?? null;
}

export function screenGuide(screen: ScreenId): ScreenGuide | null {
  return GUIDES.find((g) => g.screen === screen) ?? null;
}
export { GUIDES };
