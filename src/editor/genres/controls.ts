import type { ControlTags, Feature, Level } from '../../core/genres/types';

/**
 * P18: the feature tags and level of every control the editor shows, by kind. A genre view shows a control
 * when the genre uses one of its features (or it is `core`) and its level is within the genre's level
 * (`showsControl`). Tests fail when a control has no entry here, so every new control is tagged as it is made.
 */
const t = (level: Level, ...tags: Feature[]): ControlTags => ({ tags, level });
const S = (...tags: Feature[]) => t('simple', ...tags);
const A = (...tags: Feature[]) => t('advanced', ...tags);

/** Workspace tabs (shell). */
export const TAB_TAGS: Record<string, ControlTags> = {
  Scene: S('core'),
  'World graph': S('world'),
  Logic: S('logic'),
  Characters: S('characters'),
  Assets: S('assets'),
  Screens: S('screens'),
  Cinematics: S('cinematics'),
  Audio: S('audio'),
};

/** Scene tools (toolbar). */
export const TOOL_TAGS: Record<string, ControlTags> = {
  select: S('core'),
  move: S('core'),
  rotate: S('core'),
  resize: S('build'),
  place: S('build'),
  asset: S('build'),
  erase: S('build'),
  spawn: S('build'),
  zone: S('logic'),
  sound: S('audio'),
  ui: S('screens'),
};

/** Menu, palette and shortcut actions (src/editor/actions/registry.ts). */
export const ACTION_TAGS: Record<string, ControlTags> = {
  'file.hub': S('core'),
  'file.new': S('core'),
  'file.open': S('core'),
  'file.save': S('core'),
  'file.import': S('core'),
  'file.exportProject': S('core'),
  'file.exportLegacy': A('v68'),
  'file.exportGame': S('core'),
  'edit.undo': S('core'),
  'edit.redo': S('core'),
  'edit.delete': S('core'),
  'edit.duplicate': S('core'),
  'edit.rotate': S('core'),
  'edit.selectNone': S('core'),
  'edit.selectGroup': S('core'),
  'edit.left': S('core'),
  'edit.right': S('core'),
  'edit.forward': S('core'),
  'edit.back': S('core'),
  'edit.up': S('core'),
  'edit.down': S('core'),
  'tool.select': S('core'),
  'tool.move': S('core'),
  'tool.rotate': S('core'),
  'tool.resize': S('build'),
  'tool.place': S('build'),
  'tool.asset': S('build'),
  'tool.paint': S('assets'),
  'tool.erase': S('build'),
  'tool.spawn': S('build'),
  'tool.zone': S('logic'),
  'tool.sound': S('audio'),
  'tool.ui': S('screens'),
  'brush.rotate': S('build'),
  'view.frame': S('core'),
  'view.zoomIn': S('core'),
  'view.zoomOut': S('core'),
  'view.orbitLeft': S('core'),
  'view.orbitRight': S('core'),
  'view.orbitUp': S('core'),
  'view.orbitDown': S('core'),
  'view.fullscreen': S('core'),
  'view.fit': S('core'),
  'view.top': S('core'),
  'view.palette': S('core'),
  'world.addMap': S('world'),
  'world.trainingYard': S('combat'),
  'world.generate': S('build'),
  'world.graph': S('world'),
  'world.validate': S('world'),
  'world.connected': A('v68'),
  'play.start': S('core'),
  'play.here': S('core'),
  'play.map': S('core'),
  'play.entry': S('screens'),
  'play.saveNow': S('core'),
  'play.settingsMenu': S('core'),
  'world.checkPlayable': S('core'),
  'play.pause': S('core'),
  'play.stop': S('core'),
  'play.v68': A('v68'),
  'play.legacy': A('v68'),
  'window.1': S('core'),
  'window.2': S('world'),
  'window.3': S('logic'),
  'window.4': S('characters'),
  'window.5': S('assets'),
  'window.6': S('screens'),
  'window.7': S('cinematics'),
  'window.8': S('audio'),
  'help.shortcuts': S('core'),
  'help.about': S('core'),
  'help.tutorial': S('core'),
  'help.coding': S('logic'),
  'help.combat': S('combat'),
  'help.saving': S('core'),
  'help.guide': S('core'),
  'help.here': S('core'),
  'help.build': S('core'),
  'help.ai': S('ai'),
  'assets.open': S('assets'),
  'assets.new': S('assets'),
  'assets.resetBuiltins': A('assets'),
  // P18: the genre picker and Show everything
  'genre.open': S('core'),
  'genre.pick': S('core'),
};

/** Bottom dock tabs. */
export const DOCK_TAGS: Record<string, ControlTags> = {
  assets: S('build'),
  console: S('debug'),
  timeline: A('debug'),
  profiler: A('debug'),
  problems: S('core'),
  debug: S('debug'),
  audio: S('audio'),
};

/** The asset dock's kind filters. */
export const ASSET_FILTER_TAGS: Record<string, ControlTags> = {
  all: S('build'),
  mine: S('assets'),
  building: S('build'),
  nature: S('build'),
  prop: S('build'),
  structure: S('build'),
  vehicle: S('build'),
  decoration: S('build'),
  generated: A('build'),
};

/** Logic nodes, by type (src/core/logic/catalog). */
export const NODE_TAGS: Record<string, ControlTags> = {
  'event.onStart': S('logic'),
  'event.onEnterZone': S('logic'),
  'event.onExitZone': S('logic'),
  'event.onInteract': S('logic', 'collect'),
  'event.onSmash': S('logic'),
  'event.onRebuildFinished': A('logic'),
  'event.onVarChanged': S('logic'),
  'event.onTimer': S('logic'),
  'event.onCinematicDone': S('cinematics'),
  'event.onScreenButton': S('screens'),
  'event.onCustom': S('logic'),
  'flow.branch': S('logic'),
  'flow.sequence': A('logic'),
  'flow.wait': S('logic'),
  'flow.once': S('logic'),
  'flow.forEachInZone': A('logic'),
  'flow.gate': A('logic'),
  'var.get': S('logic'),
  'var.set': S('logic'),
  'var.add': S('logic', 'collect'),
  'math.add': S('logic'),
  'math.sub': S('logic'),
  'math.mul': A('logic'),
  'math.random': S('logic'),
  'compare.gte': S('logic'),
  'compare.lte': S('logic'),
  'compare.eq': S('logic'),
  'compare.and': A('logic'),
  'compare.or': A('logic'),
  'compare.not': A('logic'),
  'world.spawn': S('logic'),
  'world.spawnNear': S('logic', 'collect'),
  'world.despawn': S('logic'),
  'world.setState': S('logic'),
  'world.teleport': S('logic'),
  'world.travel': S('logic', 'world'),
  'world.give': S('logic', 'collect'),
  'audio.playSound': S('audio'),
  'audio.setMusic': S('audio'),
  'audio.stopMusic': S('audio'),
  'screen.show': S('screens'),
  'screen.hide': S('screens'),
  'screen.setText': S('screens'),
  'cinematic.play': S('cinematics'),
  'cinematic.stop': S('cinematics'),
  'misc.log': A('debug'),
  'misc.emit': S('logic'),
  'note.comment': S('logic'),
  'note.group': S('logic'),
  // P9a: health
  'event.onDamaged': S('combat'),
  'event.onDefeated': S('combat'),
  'event.onLockedOn': S('combat'),
  'health.damage': S('combat'),
  'health.heal': S('combat'),
  'health.setInvulnerable': A('combat'),
  // P26: saving
  'game.save': S('logic'),
  'game.load': S('logic'),
  'game.setCheckpoint': S('logic'),
  'game.unlockAchievement': S('logic'),
  'game.finish': S('logic'),
  'event.onAchievement': S('logic'),
};

/** P9a: sections of the studios that belong to a feature */
export const SECTION_TAGS: Record<string, ControlTags> = {
  'asset.health': S('collect', 'combat'),
  'character.harm': S('combat'),
  'character.enemy': S('combat'),
  'object.script': S('logic'),
  'game.saving': S('core'),
  'game.progress': S('core'),
  'asset.checkpoint': S('build'),
};

export type ControlKind = 'tab' | 'tool' | 'action' | 'dock' | 'assetFilter' | 'node' | 'section';
export const CONTROL_TAGS: Record<ControlKind, Record<string, ControlTags>> = {
  tab: TAB_TAGS,
  tool: TOOL_TAGS,
  action: ACTION_TAGS,
  dock: DOCK_TAGS,
  assetFilter: ASSET_FILTER_TAGS,
  node: NODE_TAGS,
  section: SECTION_TAGS,
};

/** A control's tags (an untagged one counts as advanced and core-less: only Open shows it). */
export function tagsOf(kind: ControlKind, id: string): ControlTags {
  return CONTROL_TAGS[kind][id] ?? { tags: [], level: 'advanced' };
}

/** Readable names of the kinds, for the hidden-features list and Help. */
export const KIND_NAMES: Record<ControlKind, string> = {
  tab: 'screen',
  tool: 'tool',
  action: 'menu item',
  dock: 'dock tab',
  assetFilter: 'asset filter',
  node: 'logic node',
  section: 'section',
};
