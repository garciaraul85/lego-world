const fs=require('fs');
global.window={location:{href:''},addEventListener(){} };
global.navigator={clipboard:{writeText(){}}};
global.FileReader=class{readAsDataURL(){}};
const el={getBoundingClientRect:()=>({left:0,top:0,width:900,height:700}),parentElement:null,querySelector:()=>el,offsetWidth:100,offsetHeight:40,focus(){}};
el.closest=()=>el; el.parentElement=el;
const ev=()=>({button:0,clientX:300,clientY:200,preventDefault(){},stopPropagation(){},currentTarget:el,target:{value:'5',files:[]},key:'ArrowUp',dataTransfer:{getData:()=>'',setData(){},files:[]}});
const errs={};
for (const f of process.argv.slice(2)) {
  const t=fs.readFileSync('screens/'+f+'.dc.html','utf8');
  const s=t.split('data-dc-script')[1].split('>').slice(1).join('>').split('</script>')[0];
  const C=new Function('DCLogic', s+'\nreturn Component;')(class{constructor(p){this.props=p||{};} setState(o){this.state=Object.assign({},this.state,typeof o==='function'?o(this.state):o);}});
  const c=new C({}); let n=0, bad=[];
  const walk=(v,path,depth)=>{ if(depth>3||v==null) return;
    if(typeof v==='function'){ try{v(ev()); n++; c.renderVals();}catch(e){bad.push(path+': '+e.message);} return; }
    if(Array.isArray(v)) v.slice(0,3).forEach((x,i)=>walk(x,path+'['+i+']',depth+1));
    else if(typeof v==='object') Object.keys(v).forEach(k=>walk(v[k],path+'.'+k,depth+1)); };
  for(let round=0;round<2;round++){ try{ walk(c.renderVals(),'',0);}catch(e){bad.push('render: '+e.message);} }
  console.log(f, n+' handlers', bad.length? 'ERRORS\n  '+[...new Set(bad)].slice(0,8).join('\n  '):'ok');
}
setTimeout(()=>process.exit(0),100);
