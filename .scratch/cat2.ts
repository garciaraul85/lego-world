import { CATALOG } from '../src/core/logic/catalog';
for (const d of CATALOG) {
  const s = (d as any).args ?? [];
  if (s.length) console.log(d.type.padEnd(28), s.map((x: any) => x.name + ':' + (x.kind ?? x.type)).join(', '));
}
