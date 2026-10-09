const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
let bootstrap=fs.readFileSync(path.join(__dirname,'characters.cjs'),'utf8').split('const b=boot(),call=')[0];
bootstrap=bootstrap.replace(".split('</script>')[0],context)",".split('</script>')[0]+';globalThis.scaleAPI={C:CharacterCatalog,M:CharacterModel,R:RigCollision,P:GamePhysics,G:WorldGenerator};',context)").replace('return {tools,elements,buttons,buffers,stored,','return {api:context.scaleAPI,tools,elements,buttons,buffers,stored,');
const ctx={require,__dirname,console,AbortController,Blob,URL,setTimeout};vm.runInNewContext(bootstrap+';globalThis.boot=boot;',ctx);
const game=ctx.boot(),{C,M,R,P,G}=game.api,call=(n,v)=>game.tools.get(n).execute(v);
const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,createBuffer:()=>({}),createShader:()=>({}),createProgram:()=>({})},{get:(o,k)=>k in o?o[k]:(k.toUpperCase()===k?1:()=>{})});
const renderer=M.create(gl,'void main(){}'),ground={id:1,x:-12,z:-12,y:0,rows:24,cols:24,turn:0,kind:'plate',color:3};
const profile=height=>C.validate({...C.defaults,height,held:'None',hat:'None',hair:'Bald'});
const actor=(p,parts=[ground],state={x:3,y:.4,z:4,heading:.7})=>{const c=new P.Controller(parts);Object.assign(c.state,state);renderer.bindCollision(p,c);return c;};
const extent=boxes=>({min:[0,1,2].map(k=>Math.min(...boxes.map(b=>b.min[k]))),max:[0,1,2].map(k=>Math.max(...boxes.map(b=>b.max[k])))});
const heightInput=game.elements['#bb-appearance-fields'].children.map(label=>label.children[0]).find(input=>input.id==='bb-character-height');
assert(heightInput,'height picker is visible in Appearance');assert.deepEqual(heightInput.children.map(o=>o.value),C.choices.height);
assert.equal(C.validate({}).height,'Regular','legacy characters default to regular');
assert.equal(new Set(C.choices.height).size,5);assert.throws(()=>C.validate({...C.defaults,height:'Giant'}),/height/);
const base=actor(profile('Regular')),baseBoxes=R.core(base.state.rigContact,base.state),baseSize=extent(baseBoxes);let last=0;
for(const height of C.choices.height){
 const p=profile(height),factor=C.heightScale(p),c=actor(p),boxes=R.core(c.state.rigContact,c.state),size=extent(boxes);
 assert(size.max[1]>last,'five visibly distinct heights');last=size.max[1];
 for(let k=0;k<3;k++)for(const key of ['min','max'])assert(Math.abs(size[key][k]-(c.state[['x','y','z'][k]]+(baseSize[key][k]-base.state[['x','y','z'][k]])*factor))<1e-5,'mesh colliders scale about the feet, including translation');
 assert(size.min[1]>=.4-.001&&size.min[1]<.4+.16*factor,'feet retain their sole clearance: '+size.min[1]);
 const regular=M.effectPose({...c.state,rigContact:null},profile('Regular')),scaled=M.effectPose({...c.state,rigContact:null},p);
 for(const bone of Object.keys(regular))for(let k=0;k<3;k++)assert(Math.abs(scaled[bone][12+k]-(c.state[['x','y','z'][k]]+(regular[bone][12+k]-c.state[['x','y','z'][k]])*factor))<1e-5,'effect bones follow height');
 const gun={...p,held:'Handgun'},normalMuzzle=M.muzzle({...gun,height:'Regular'},{...c.state,rigContact:null}),muzzle=M.muzzle(gun,{...c.state,rigContact:null});
 for(let k=0;k<3;k++)assert(Math.abs(muzzle[k]-(c.state[['x','y','z'][k]]+(normalMuzzle[k]-c.state[['x','y','z'][k]])*factor))<1e-5,'projectiles leave the scaled weapon');
 const wall={id:2,x:-5,z:0,y:1,rows:1,cols:10,turn:0,kind:'brick',color:8},contact=actor(p,[ground,wall],{x:0,y:.4,z:-2,heading:0});
 for(let i=0;i<35;i++)contact.step({z:-1,run:true},.025,0);
 assert(contact.state.z<0&&-contact.state.z<1,'each height can touch a wall closely');assert(!R.coreContacts(contact.state.rigContact,contact.state).length);
 const other=actor(profile(height==='Tall'?'Very short':'Tall'),[ground],{x:0,y:.4,z:0,heading:0});
 contact.replace([ground]);Object.assign(contact.state,{x:0,y:.4,z:-3});contact.setActors([other.state]);
 for(let i=0;i<25;i++)contact.step({z:-1,run:true},.025,0);
 assert(contact.state.z<0&&!R.actorContacts(contact.state.rigContact,contact.state,other.state).length,'different sized NPCs stay solid');
 for(let i=0;i<180;i++)c.step({x:1,z:1,run:true},.025,0);
 for(const b of R.core(c.state.rigContact,c.state))assert(b.min[0]>=-12&&b.max[0]<=12&&b.min[2]>=-12&&b.max[2]<=12,'whole character remains inside the world');
 heightInput.value=height;heightInput.handlers.change({target:heightInput});assert.equal(game.read().characters.items[0].profile.height,height);
 assert.equal(JSON.parse(game.stored.get('lego-free-build-v1')).characters.items[0].profile.height,height,'height saves immediately');
}
const lowRoof={id:2,x:-2,z:-2,y:10,rows:4,cols:4,turn:0,kind:'plate',color:8};
for(const height of ['Very short','Tall']){const c=actor(profile(height),[ground,lowRoof],{x:0,y:.4,z:0,heading:0});assert.equal(c.clear(0,.4,0),height==='Very short','height determines ceiling clearance');}
const config={biomes:['city'],time:'day',rain:false,snow:false,snowing:false,size:24,seed:73521};
const city=G.generate(config),groups=new Map();for(const p of city.pieces)if(p.group){if(!groups.has(p.group))groups.set(p.group,[]);groups.get(p.group).push(p);}
assert.equal(city.layoutVersion,2);assert.equal(city.width,48);
for(const type of ['house','skyscraper']){
 const ps=[...groups].find(([key])=>key.startsWith(type+'-'))[1],bs=ps.map(P.bounds),b={x0:Math.min(...bs.map(b=>b.x0)),x1:Math.max(...bs.map(b=>b.x1)),z0:Math.min(...bs.map(b=>b.z0)),z1:Math.max(...bs.map(b=>b.z1)),y1:Math.max(...bs.map(b=>b.y1))};
 assert(b.x1-b.x0>=8&&b.z1-b.z0>=8,'buildings have usable floor area');assert(b.y1>=(type==='house'?10:45),'buildings tower over regular figures');
 const walls=ps.filter(p=>p.y===1),front=Math.max(...walls.map(p=>P.bounds(p).z0)),doorX=(b.x0+b.x1)/2;
 for(const height of C.choices.height){
  const c=actor(profile(height),city.pieces,{x:doorX,y:.4,z:front+2.8,heading:Math.PI});
  for(let i=0;i<45;i++)c.step({z:1},.025,0);
  assert(c.state.z<front-1.4,height+' walks through the '+type+' door');assert(!R.coreContacts(c.state.rigContact,c.state).length,'no interior overlap');
  for(let i=0;i<45;i++)c.step({x:1,run:true},.025,0);
  assert(c.state.x<b.x1-.8,'side wall stops the character');assert(!R.coreContacts(c.state.rigContact,c.state).length);
 }
}
// Large mixed worlds must still fit the editable piece budget and save bounds.
const all=G.biomes.map(b=>b[0]);for(const size of [16,24,32])for(const seed of [0,73521,99999999]){
 const world=G.generate({...config,biomes:all,size,seed});assert(world.pieces.length<12000,'large mixed world stays editable');
 for(const p of world.pieces){const b=P.bounds(p);assert(b.x0>=-world.width/2&&b.x1<=world.width/2&&b.z0>=-world.depth/2&&b.z1<=world.depth/2&&p.y+(p.kind==='brick'?3:1)<=300,'generated brick inside build limits');}
}
const generated=call('generate_lego_world',config),snapshot=JSON.stringify(game.read());call('generate_lego_world',config);assert.equal(JSON.stringify(game.read()),snapshot,'new city stays deterministic');
const load=obj=>{game.fire('bb-open');game.elements['#bb-data'].value=JSON.stringify(obj);game.fire('bb-load-code');assert.equal(game.elements['#bb-dialog-message'].textContent,'');};
load(JSON.parse(snapshot));assert.equal(game.read().world.width,48);assert.equal(game.read().world.layoutVersion,2);
const savedGround={...ground,x:-4,z:-4,rows:8,cols:8};
const legacy={format:'brick-builder',version:4,pieces:[savedGround],world:{config},characters:game.read().characters};load(legacy);assert.equal(game.read().world.width,24,'old saved cities keep their real footprint');assert.equal(game.read().world.layoutVersion,1);assert.equal(game.read().characters.items[0].profile.height,'Tall','character height survives import');
call('configure_lego_character',{profile:{height:'Very short'}});
const roofSupports=[1,4,7].map((y,i)=>({id:i+3,x:-2,z:-2,y,rows:1,cols:1,turn:0,kind:'brick',color:8}));
load({...legacy,pieces:[savedGround,{...savedGround,id:6,x:4},lowRoof,...roofSupports],player:{x:0,y:.4,z:0,heading:0},characters:game.read().characters});
call('explore_lego_world',{playing:true});assert.equal(game.read().player.x,0);assert.equal(game.read().player.z,0,'short character restores under a ceiling');
call('configure_lego_character',{profile:{height:'Tall'}});call('explore_lego_world',{playing:true});
const saved=game.read().player,tall=actor(profile('Tall'),[ground,lowRoof],saved);assert(!R.coreContacts(tall.state.rigContact,tall.state).length,'growing under a ceiling enters play at a safe position');
console.log('PASS: five persisted heights; matching rig, collision and muzzle scales; walls, NPCs, ceilings and borders; walkable houses/skyscrapers; seeded large worlds; legacy footprints and safe height changes.');
