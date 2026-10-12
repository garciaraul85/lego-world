const fs=require('fs');
for (const f of process.argv.slice(2)) {
  const t=fs.readFileSync('screens/'+f+'.dc.html','utf8');
  const s=t.split('data-dc-script')[1].split('>').slice(1).join('>').split('</script>')[0];
  const C=new Function('DCLogic', s+'\nreturn Component;')(class{constructor(p){this.props=p||{};} setState(o){this.state=Object.assign({},this.state,o);}});
  try{const c=new C({});const v=c.renderVals();
    // check all template keys exist
    const keys=[...t.matchAll(/\{\{\s*([a-zA-Z]+)[.}\s]/g)].map(m=>m[1]);
    const locals=new Set([...t.matchAll(/as="(\w+)"/g)].map(m=>m[1]));
    const miss=[...new Set(keys)].filter(k=>!(k in v)&&!locals.has(k)&&k!=='false'&&k!=='true');
    console.log(f,'ok',miss.length?'MISSING '+miss:'');
  }catch(e){console.log(f,'ERR',e.message)}
}
setTimeout(()=>process.exit(0),50);
