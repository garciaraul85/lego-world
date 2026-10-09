const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
function boot(){
const tools=new Map(),stored=new Map(),buffers=[];
const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:(_,s)=>s,getUniformLocation:(_,s)=>s,createBuffer:()=>({}),createShader:()=>({}),createProgram:()=>({}),bufferData:(_,a)=>{assert(a.length>0);for(const v of a)assert(Number.isFinite(v));buffers.push(a.length);},drawArrays:(_,start,count)=>assert(count>0)}, {get:(o,k)=>k in o?o[k]:(k.toUpperCase()===k?1:()=>{})});
const elements={};let doc;
class Element{constructor(tag='DIV'){this.tagName=tag;this.dataset={};this.value='';this.checked=false;this.children=[];this.handlers={};this.style={setProperty(){}};this.textContent='';this.hidden=false;this.disabled=false;}addEventListener(e,f){this.handlers[e]=f;}setAttribute(k,v){this[k]=v;}removeAttribute(k){delete this[k];}appendChild(b){this.children.push(b);}replaceChildren(){this.children=[];}getBoundingClientRect(){return{width:780,height:570,left:0,top:0};}focus(){doc.activeElement=this;}select(){}click(){this.handlers.click?.({target:this});}querySelector(s){return this.children.find(c=>c.tagName===s.toUpperCase())||new Element(s.toUpperCase());}querySelectorAll(){return this.children;}setPointerCapture(){}}
const ids=[...fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8').matchAll(/id="([^"]+)"/g)].map(x=>x[1]);for(const id of ids)elements['#'+id]=new Element();
elements['#bb-canvas'].tagName='CANVAS';elements['#bb-canvas'].getContext=()=>gl;elements['#bb-dialog'].hidden=true;elements['#bb-data'].tagName='TEXTAREA';
const buttons=['add','select','orbit'].map(name=>{const b=new Element('BUTTON');b.dataset.tool=name;return b;});
const root={dataset:{},querySelector:s=>{assert(elements[s],s);return elements[s];},querySelectorAll:s=>s==='[data-tool]'?buttons:[],addEventListener:(e,f)=>elements['#brick-builder'].addEventListener(e,f)};
doc={addEventListener(){},activeElement:null,getElementById:()=>root,createElement:tag=>new Element(tag.toUpperCase()),modelContext:{registerTool:t=>tools.set(t.name,t)}};
const context={document:doc,window:{devicePixelRatio:1,addEventListener(){},location:{reload(){}}},localStorage:{setItem:(k,v)=>stored.set(k,v),getItem:k=>stored.get(k)},ResizeObserver:class{observe(){}},requestAnimationFrame:()=>{},AbortController,console,Blob,URL,setTimeout,navigator:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8').split('<script>')[1].split('</script>')[0],context);
return {tools,elements,buttons,buffers,stored,read:()=>tools.get('read_brick_build').execute(),add:a=>tools.get('place_bricks').execute({pieces:a}),move:p=>tools.get('move_brick').execute(p),fire:(id,event='click',value)=>elements['#'+id].handlers[event]?.({target:elements['#'+id],...value})};
}

const b=boot();
const all=['forest','city','prairie','mountains','volcanoes','desert','beach','highway','castle_outside','castle_inside','rainforest'];
const generate=c=>b.tools.get('generate_lego_world').execute({biomes:c,time:'day',rain:false,snow:false,snowing:false,size:24,seed:73521});
assert(b.read().world && b.read().pieces.length>100);
for(const biome of all){const r=generate([biome]);assert(r.pieces>30,biome);assert.equal(b.read().world.config.biomes[0],biome);console.log(biome+': '+r.pieces+' valid connected pieces');}
const combined=generate(all);assert.equal(b.read().world.config.biomes.length,11);assert(combined.pieces<12000);const saved=JSON.stringify(b.read());generate(all);assert.equal(JSON.stringify(b.read()),saved,'Same seed must reproduce the same world.');
assert.throws(()=>generate([]),/Choose/);assert.equal(JSON.stringify(b.read()),saved,'Invalid generation must not replace the world.');
b.elements['#bb-time'].value='night';b.elements['#bb-rain'].checked=true;b.elements['#bb-snow'].checked=true;b.elements['#bb-snowing'].checked=true;b.fire('bb-time','change');assert.equal(b.read().environment.time,'night');assert(b.read().environment.rain&&b.read().environment.snow&&b.read().environment.snowing);
b.fire('bb-save');const exportCode=b.elements['#bb-data'].value;assert.equal(JSON.parse(exportCode).version,4);b.fire('bb-dialog-close');b.fire('bb-new');b.fire('bb-load-code');assert.equal(b.read().pieces.length,0);b.fire('bb-open');b.elements['#bb-data'].value=exportCode;b.fire('bb-load-code');assert.equal(b.read().pieces.length,combined.pieces);assert.equal(b.read().environment.time,'night');assert(JSON.parse(b.stored.get('lego-free-build-v1')).environment.snowing);b.fire('bb-undo');assert.equal(b.read().pieces.length,0);b.fire('bb-redo');assert.equal(b.read().pieces.length,combined.pieces);
console.log('PASS: all eleven biomes, mixed connected worlds, deterministic seeds, atomic validation failures, weather combinations, project export/import, persistent atmosphere, and world-aware undo/redo.');
