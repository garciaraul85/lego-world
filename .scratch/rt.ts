import { parseCode } from '../src/core/logic/code/parse';
import { printGraph } from '../src/core/logic/code/print';
const code = process.argv[2]!;
const r = parseCode(code) as any;
if (r.error || r.errors) { console.log('ERR', JSON.stringify(r.error ?? r.errors)); process.exit(0); }
console.log(JSON.stringify(r.nodes?.map((n: any) => [n.id, n.type, n.args])));
console.log((printGraph({ nodes: r.nodes, edges: r.edges }) as any).text);
