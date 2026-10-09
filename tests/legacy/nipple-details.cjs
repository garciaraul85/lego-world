const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const bootstrap=fs.readFileSync(path.join(__dirname,'superheroes.cjs'),'utf8').split('const ground=[]')[0];
const context={require,__dirname,console,Buffer,AbortController,Blob,URL,setTimeout};
vm.runInNewContext(bootstrap+';globalThis.nippleTest={C,M,b,call};',context);
const {C,M,b,call}=context.nippleTest;
const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,createBuffer:()=>({}),createShader:()=>({}),createProgram:()=>({})},{get:(o,k)=>k in o?o[k]:(k.toUpperCase()===k?1:()=>{})}),renderer=M.create(gl,'void main(){}');
const view=p=>Buffer.from(renderer.appearanceAtlas(C.validate(p),'torso').data).toString('base64');
assert.equal(C.validate({gender:'Female'}).nippleStyle,'None','existing saves keep their appearance');
for(const gender of ['Male','Female'])for(const breastMode of C.choices.breastMode){
 const base={...C.defaults,gender,breastMode,breastSize:gender==='Female'?70:0,outfit:'Separates',shirt:'Bare torso',neckline:'Closed',pattern:'Plain'},views=[];
 for(const nippleStyle of C.choices.nippleStyle){const p=C.validate({...base,nippleStyle,nippleSize:70});views.push(view(p));assert(renderer.collisionParts(p).parts.every(g=>g.localBounds.min.concat(g.localBounds.max).every(Number.isFinite)),'finite contact geometry');}
 assert.equal(new Set(views).size,C.choices.nippleStyle.length,gender+' '+breastMode+' styles visibly differ');
 assert.equal(view({...base,nippleStyle:'Round',nippleSize:0}),view({...base,nippleStyle:'None'}),'zero size hides detail');
 const sizes=[10,35,70,100].map(nippleSize=>view({...base,nippleStyle:'Round',nippleSize}));assert.equal(new Set(sizes).size,4,'size visibly changes each detail');
 const covered={...base,shirt:'T-shirt',nippleStyle:'Raised'};assert.equal(view(covered),view({...covered,nippleStyle:'None'}),'shirt covers anatomy');
}
const female={...C.defaults,gender:'Female',breastSize:150,outfit:'Separates',shirt:'Bare torso',nippleStyle:'Round',nippleSize:70};
for(const breastShape of C.choices.breastShape){const parts=renderer.inspect(C.validate({...female,breastShape})).filter(g=>g.slot==='torso'&&g.surface.color===female.nippleColor);assert(parts.length,'detail remains present on '+breastShape);assert(parts.some(g=>g.localBounds.max[2]+M.pivots[g.joint][2]>.45),'detail follows the sculpted surface');}
for(const outfit of ['Underwear','Lingerie','Bikini','Swimsuit','Superhero','Dress','Armor'])assert.equal(view({...female,outfit}),view({...female,outfit,nippleStyle:'None'}),'covered '+outfit+' hides details');
const p=call('configure_lego_character',{profile:{...female,nippleStyle:'Oval',nippleSize:81,nippleColor:'#b84672'}}).character;
assert.equal(p.nippleSize,81);assert.equal(p.nippleStyle,'Oval');assert.equal(p.nippleColor,'#b84672');
const saved=JSON.parse(b.stored.get('lego-free-build-v1')).characters.items[0].profile;assert.equal(saved.nippleSize,81);assert.equal(saved.nippleStyle,'Oval');
const fields=b.elements['#bb-appearance-fields'].children;for(const key of ['nippleStyle','nippleSize','nippleColor'])assert(fields.some(l=>l.htmlFor==='bb-character-'+key),'Appearance contains '+key);
assert.throws(()=>C.validate({...female,nippleSize:101}));assert.throws(()=>C.validate({...female,nippleSize:-1}));assert.throws(()=>C.validate({...female,nippleSize:1.5}));assert.throws(()=>C.validate({...female,nippleStyle:'Unknown'}));
console.log('PASS: male/female nipple styles and sizes, all chest modes/shapes, garment coverage, finite collision meshes, UI controls, and persisted settings.');
