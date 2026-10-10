import type { PatchStep } from '../../core/ai/patch';
import type { ActionCtx } from '../actions/registry';

const slug = (w: string) => `ws-${w.toLowerCase().replace(/ /g, '-')}`;
export const tabSelector = (workspace: string) => `[data-tour="${slug(workspace)}"]`;

/**
 * Shows the user where a step happens (P8.3 walkthrough): opens its workspace and selects what the
 * step changes — the map it edits, the logic graph, the screen, the scene, the character, the asset
 * or the sound — the same places a person would go to make that change by hand.
 */
export function focusStep(c: ActionCtx, step: PatchStep) {
  const { ed, ui } = c;
  if (ed.session.value) ui.stopPlay();
  ui.workspace(step.workspace);
  for (const cmd of step.commands) {
    const p = cmd.payload as Record<string, unknown>;
    const map = typeof p.map === 'string' ? p.map : null;
    switch (cmd.type.split('.')[0]) {
      case 'logic': {
        const g = (p.graph as { id?: string } | string | undefined) ?? null;
        const id = typeof g === 'string' ? g : g?.id;
        if (id && cmd.type !== 'logic.delete') ed.logicGraph.value = id;
        break;
      }
      case 'screen':
        if (cmd.type === 'screen.put') {
          ed.screenId.value = (p.screen as { id: string }).id;
          ed.widgetPath.value = '';
        }
        break;
      case 'cinematic':
        if (cmd.type === 'cinematic.put') ed.cinematicId.value = (p.cinematic as { id: string }).id;
        break;
      case 'character':
        if (cmd.type !== 'character.delete') ed.studioCharacter.value = (p.character as { id: string }).id;
        break;
      case 'asset':
        if (cmd.type === 'asset.create' || cmd.type === 'asset.update')
          ed.studioAsset.value = (p.asset as { id: string }).id;
        break;
      case 'audio':
        if (cmd.type === 'audio.setEvent') ed.audioSel.value = { kind: 'event', id: String(p.id) };
        else if (cmd.type === 'audio.setMusic') ed.audioSel.value = { kind: 'music', id: String(p.id) };
        else if (cmd.type === 'audio.setMixer') ed.audioSel.value = { kind: 'mixer', id: null };
        break;
      default:
        break;
    }
    if (cmd.type === 'map.create' && typeof p.id === 'string' && step.workspace === 'Scene') ed.openMap(p.id);
    else if (map && map !== ed.mapId.value && ed.store.has(`maps/${map}/map.json`)) ed.openMap(map);
    if (cmd.type === 'map.setEnvironment' || cmd.type === 'map.setAudio') ed.right.value = 'map';
    if (cmd.type === 'project.update') ed.right.value = 'project';
  }
  // logic the AI wrote as script opens in Split view: the code it wrote and the graph it became
  if (step.helperNote?.includes('logic.code')) ed.logicView.value = 'split';
  if (step.workspace === 'Scene') setTimeout(() => ui.fit(), 80);
}
