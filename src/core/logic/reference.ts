import { CATALOG, type NodeDef, type PinDef } from './catalog';
import { BINARY, eventName } from './code/print';

const pin = (p: PinDef) => `${p.label ?? p.name} (${p.type})`;

const SPECIAL: Record<string, string> = {
  'flow.branch': 'if (cond) { … } else { … }',
  'flow.sequence': '(no keyword: the a chain is written first, then the b chain)',
  'flow.wait': 'await wait(seconds);',
  'flow.once': 'once(() => { … });',
  'flow.forEachInZone': 'forEachInZone("zone", (who) => { … });',
  'flow.gate': 'gate("name", startOpen, () => { … }); gate.open("name"); gate.close("name");',
  'var.get': 'vars.name',
  'var.set': 'vars.name = value;',
  'var.add': 'vars.name += amount;',
  'math.random': 'random(min, max)',
  'compare.not': '!a',
};

/** How the node reads in the Code view (mirrors core/logic/code/print.ts). */
function codeForm(d: NodeDef): string {
  if (SPECIAL[d.type]) return SPECIAL[d.type]!;
  if (BINARY[d.type]) return `(a ${BINARY[d.type]} b)`;
  const args = [...(d.args ?? []).map((a) => a.name), ...d.inputs.filter((p) => p.type !== 'exec').map((p) => p.name)];
  if (d.kind === 'event') {
    const obj = d.args?.length ? `{ ${d.args.map((a) => `${a.name}: …`).join(', ')} }, ` : '';
    return `on("${eventName(d.type)}", ${obj}(e) => { … });`;
  }
  return `${d.code.name}(${args.join(', ')})${d.kind === 'pure' ? '' : ';'}`;
}

/**
 * The logic API reference as Markdown (P7.5), generated from the node catalog so it never drifts:
 * the Help guide shows it and `scripts/gen-logic-reference.mjs` writes it to docs/logic-reference.md.
 */
export function logicReferenceMarkdown(catalog: readonly NodeDef[] = CATALOG): string {
  const out: string[] = [
    '# Logic reference',
    '',
    `Every logic node (${catalog.length} in all), grouped as in the Logic workspace palette. Each entry shows the node's title, its type name, what it does, its pins and inline settings, and how it reads in the Code view.`,
    '',
  ];
  const cats = [...new Set(catalog.map((d) => d.category))];
  for (const cat of cats) {
    out.push(`## ${cat}`, '');
    for (const d of catalog.filter((x) => x.category === cat)) {
      out.push(`### ${d.title}`, '', `\`${d.type}\` · ${d.kind}`, '', d.doc, '');
      const ins = d.inputs.filter((p) => p.type !== 'exec');
      const outs = d.outputs.filter((p) => p.type !== 'exec');
      if (d.args?.length)
        out.push(
          `- Settings: ${d.args.map((a) => `${a.label} (${a.kind}${a.optional ? ', optional' : ''})`).join(', ')}`,
        );
      if (ins.length) out.push(`- Inputs: ${ins.map(pin).join(', ')}`);
      if (outs.length) out.push(`- Outputs: ${outs.map(pin).join(', ')}`);
      const flows = d.outputs.filter((p) => p.type === 'exec').map((p) => p.label ?? p.name);
      if (flows.length > 1) out.push(`- Flow outputs: ${flows.join(', ')}`);
      if (d.kind !== 'note') out.push(`- Code: \`${codeForm(d)}\``);
      out.push('');
    }
  }
  return out.join('\n');
}

/** A compact cheat sheet of the code dialect for the AI builder's instructions (one line per node). */
export function logicCheatSheet(catalog: readonly NodeDef[] = CATALOG): string {
  return catalog
    .filter((d) => d.kind !== 'note')
    .map((d) => {
      const args = d.args?.length ? ` [settings: ${d.args.map((a) => `${a.name}:${a.kind}`).join(', ')}]` : '';
      const outs = d.outputs.filter((p) => p.type !== 'exec').map((p) => p.name);
      return `${codeForm(d)} — ${d.title}: ${d.doc}${args}${outs.length ? ` → ${outs.join(', ')}` : ''}`;
    })
    .join('\n');
}
