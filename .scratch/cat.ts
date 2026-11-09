import { CATALOG } from '../src/core/logic/catalog';
for (const d of CATALOG) console.log(d.kind.padEnd(8), d.type.padEnd(28), (d.code ? d.code.name + ' ' + (d.code.style ?? '') : '').padEnd(34), d.inputs.filter((i: any) => i.type !== 'exec').map((i: any) => i.name + ':' + i.type).join(', '));
