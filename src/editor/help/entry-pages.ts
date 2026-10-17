import { keysFor, MAC_KEYS } from '../platform';
import { GUIDES, type HelpEntry, helpEntries, helpEntry, KIND_LABEL, SCREENS, type ScreenGuide } from './entries';
import type { HelpPage } from './search';

/**
 * P32: Help pages made from the entries — one per element, one guide per screen, and an index of every
 * control. They are ordinary Help pages, so search, links and the AI read them like the written ones.
 */

const screenName = (id: string) => SCREENS.find((s) => s.id === id)?.name ?? id;
export const entryPageId = (id: string) => `e/${id}`;
export const guidePageId = (screen: string) => `guide/${screen}`;

/** A link to another entry, a guide or a page, as Help markdown. */
function linkTo(ref: string): string {
  if (ref.startsWith('help:')) return `[${ref.slice(5).split('#')[0]!.replace(/-/g, ' ')}](${ref})`;
  if (ref.startsWith('guide:')) return `[${screenName(ref.slice(6))} screen guide](help:${guidePageId(ref.slice(6))})`;
  const e = helpEntry(ref);
  return e ? `[${e.name}](help:${entryPageId(e.id)})` : ref;
}

export function entryMarkdown(e: HelpEntry): string {
  const out = [`# ${e.name}`, '', `*${KIND_LABEL[e.kind]} · ${screenName(e.screen)}*`, '', e.purpose, ''];
  if (e.match?.length) out.push(`!shot ${e.id}`, '', `[Show me where it is](show:${e.id})`, '');
  if (e.steps?.length) out.push('## How to use it', '', ...e.steps.map((s, i) => `${i + 1}. ${s}`), '');
  if (e.options?.length)
    out.push(
      '## Options',
      '',
      '| Choice | What it does |',
      '|---|---|',
      ...e.options.map(([a, b]) => `| ${a} | ${b} |`),
      '',
    );
  if (e.key)
    out.push(
      '## Shortcut',
      '',
      `\`${e.key}\`${MAC_KEYS[e.key] ? ` · on a Mac \`${keysFor(MAC_KEYS[e.key]!, true)}\` (works everywhere)` : ''}`,
      '',
    );
  if (e.tips?.length) out.push('## Tips', '', ...e.tips.map((t) => `> ${t}`), '');
  if (e.commands?.length)
    out.push(
      '## What it changes',
      '',
      `Runs the engine command${e.commands.length > 1 ? 's' : ''} ${e.commands.map((c) => `[\`${c}\`](help:${entryPageId(`command.${c}`)})`).join(', ')}; each change is one undo step, and the AI builder can do the same.`,
      '',
    );
  if (e.related?.length) out.push('## Related', '', ...e.related.map((r) => `- ${linkTo(r)}`), '');
  return out.join('\n');
}

export function guideMarkdown(g: ScreenGuide): string {
  const name = screenName(g.screen);
  const out = [
    `# ${name}: screen guide`,
    '',
    g.intro,
    '',
    `!shot guide:${g.screen}`,
    '',
    '## What each area is for',
    '',
  ];
  g.areas.forEach((id, i) => {
    const e = helpEntry(id)!;
    out.push(`${i + 1}. **[${e.name}](help:${entryPageId(id)})**: ${e.purpose}`);
  });
  out.push('', '## The 5 things people do here most', '');
  for (const [task, id] of g.top) out.push(`- [${task}](help:${entryPageId(id)})`);
  const ws = SCREENS.find((s) => s.id === g.screen)?.workspace;
  if (ws) out.push('', `[Open ${ws}](open:${ws}) · [Take the ${name} course](course:${g.screen})`);
  const all = helpEntries().filter((e) => e.screen === g.screen && e.kind !== 'screen' && !g.areas.includes(e.id));
  if (all.length)
    out.push('', '## Everything on this screen', '', ...all.map((e) => `- [${e.name}](help:${entryPageId(e.id)})`));
  return out.join('\n');
}

/** Every control, by screen: the A–Z of the editor. */
export function indexMarkdown(): string {
  const out = [
    '# Every control',
    '',
    'Every workspace, area, tool, button, field and menu item of the editor, by screen. Press F1 while pointing at any control to open its page directly.',
    '',
  ];
  for (const s of SCREENS) {
    const list = helpEntries()
      .filter((e) => e.screen === s.id && !['command', 'node', 'menu', 'shortcut'].includes(e.kind))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) continue;
    out.push(
      `## ${s.name}`,
      '',
      ...list.map((e) => `- [${e.name}](help:${entryPageId(e.id)}) · ${KIND_LABEL[e.kind]}`),
      '',
    );
  }
  out.push('## Menus and shortcuts', '');
  for (const e of helpEntries().filter((x) => x.kind === 'menu' || x.kind === 'shortcut'))
    out.push(`- [${e.name}](help:${entryPageId(e.id)})${e.key ? ` · \`${e.key}\`` : ''}`);
  out.push('', '## Engine commands', '', 'What every change in the editor (and the AI builder) is made of.', '');
  for (const e of helpEntries().filter((x) => x.kind === 'command'))
    out.push(`- [\`${e.name}\`](help:${entryPageId(e.id)}): ${e.purpose}`);
  return out.join('\n');
}

export function guidePages(): HelpPage[] {
  return GUIDES.map((g) => ({
    id: guidePageId(g.screen),
    title: `${screenName(g.screen)} guide`,
    md: guideMarkdown(g),
    rank: 0.85,
  }));
}

/** Entry pages (searchable, not listed in the side bar). */
export function entryPages(): HelpPage[] {
  return helpEntries().map((e) => ({
    id: entryPageId(e.id),
    title: e.name,
    md: entryMarkdown(e),
    keywords: e.also?.join(' '),
    rank:
      e.kind === 'command' ? 0.5 : e.kind === 'node' ? 0.75 : e.kind === 'menu' || e.kind === 'shortcut' ? 0.7 : 0.95,
  }));
}
