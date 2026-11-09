import { SCRIPT_TEMPLATES } from '../src/builtin/templates/scripts';
import { parseCode } from '../src/core/logic/code/parse';
import { printGraph } from '../src/core/logic/code/print';
for (const t of SCRIPT_TEMPLATES) {
  const a: Record<string, string | number> = {};
  for (const f of t.fields) a[f.key] = f.default === '' ? (f.kind === 'zone' ? 'Pond' : 'Arrival') : f.default;
  const code = t.code(a, (x) => x);
  const r = parseCode(code) as any;
  if (r.error) { console.log('✗', t.id, JSON.stringify(r.error)); console.log(code.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')); continue; }
  let printed = '';
  try { printed = (printGraph(r) as any).code; } catch (e) { printed = 'PRINT ERR ' + (e as Error).message; }
  console.log('✓', t.id, r.nodes.length, 'nodes', printed.startsWith('PRINT ERR') ? printed : '');
}
