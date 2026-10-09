const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ctx={Float32Array};for(const [file,name] of [['game-weapons.js','GameWeapons'],['character-catalog.js','CharacterCatalog'],['game-physics.js','GamePhysics'],['character-model.js','CharacterModel']])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../src/legacy',file),'utf8')+';globalThis.'+name+'='+name+';',ctx);
const W=ctx.GameWeapons,M=ctx.CharacterModel,C=ctx.CharacterCatalog,P=ctx.GamePhysics;
const ground={id:1,x:-16,z:-16,y:0,rows:32,cols:32,turn:0,kind:'plate',color:3};
const wall=(id,z)=>({id,x:-2,z,y:1,rows:1,cols:4,turn:0,kind:'brick',color:8,group:'wall-'+id});
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
assert.equal(W.cast([0,1,0],[0,0,-1],20,[wall(2,-4),wall(3,-9)],P.bounds).piece.id,2,'a front wall shields objects behind it');
assert.equal(W.cast([0,1,-3],[0,0,-1],10,[wall(2,-4)],P.bounds).distance,0,'shots inside a brick hit immediately');
assert.equal(W.cast([0,1,0],[1,0,0],20,[wall(2,-4)],P.bounds),null,'parallel rays outside a slab miss');
assert.equal(W.edgeDistance([0,2,0],[0,0,-1],P.worldBounds([ground])),16);
const meleeWeapons=Object.entries(W.catalog).filter(([,w])=>w.frames&&w.style!=='magic');
assert.equal(new Set(meleeWeapons.map(([,w])=>JSON.stringify(w.frames))).size,meleeWeapons.length,'every melee weapon has its own animation curve');
assert.equal(new Set(Object.values(W.catalog).filter(w=>w.style==='fire').map(w=>w.recoil)).size,7,'each firearm has its own recoil impulse');
function swingDistance(held){const w=W.get(held),ctl=new P.Controller([ground]);Object.assign(ctl.state,{attack:w.duration,attackDuration:w.duration,attackWeapon:held});const x=ctl.state.x;for(let i=0;i<8;i++)ctl.step({x:1,run:true},.025,0);return ctl.state.x-x;}
assert(swingDistance('Sledgehammer')<swingDistance('Baton')*.98,'heavy windups have more movement inertia than light strikes');
for(const [held,w] of Object.entries(W.catalog)){
 const profile=C.validate({...C.defaults,held});let prev;
 for(let i=0;i<=120;i++){
  const state={heading:.8,grounded:true,attack:w.duration*(1-i/120),attackDuration:w.duration},pose=M.jointPose(state,false,profile),rig=M.heldPose(pose,state,profile);
  for(const [name,m] of Object.entries(pose)){assert(Array.from(m).every(Number.isFinite),held+' '+name+' finite');if(prev)assert(Math.max(...Array.from(m).map((v,k)=>Math.abs(v-prev[name][k])))<.20,held+' '+name+' continuous');}
  for(const [child,parent] of Object.entries(M.parents)){const offset=M.pivots[child].map((v,k)=>v-M.pivots[parent][k]);assert(point(pose[parent],offset).every((v,k)=>Math.abs(v-pose[child][12+k])<1e-5),held+' '+child+' attached');}
  const hand=point(pose.rightForearm,[-.03,-.61,.06]),grip=point(rig,[.02,-.61,.315]);assert(hand.every((v,k)=>Math.abs(v-grip[k])<1e-5),held+' stays in the grip');prev=pose;
  if(w.twoHand&&w.frames&&w.style!=='magic'){const support=point(rig,[.02,-.61+(w.support??-.18),.315]),left=point(pose.leftForearm,[.03,-.61,.06]);assert(Math.hypot(...left.map((v,k)=>v-support[k]))<.13,held+' supporting hand stays within the toy grip radius of the shaft');}
 }
 if(w.style==='fire')for(let i=0;i<=100;i++){const state={reload:w.reload*(1-i/100),reloadDuration:w.reload},pose=M.jointPose(state,false,profile);assert(Array.from(pose.leftForearm).every(Number.isFinite));assert(Array.from(M.muzzle(profile,state)).every(Number.isFinite));}
}
const bootstrap=fs.readFileSync(path.join(__dirname,'characters.cjs'),'utf8').split('const b=boot(),call=')[0],bootCtx={require,__dirname,console,AbortController,Blob,URL,setTimeout};vm.runInNewContext(bootstrap+';globalThis.boot=boot;',bootCtx);
const b=bootCtx.boot(),call=(n,v)=>b.tools.get(n).execute(v);
const tower=z=>[1,4,7].map((y,i)=>({...wall(i+2,z),y,rows:2,cols:4,group:'tower'}));
const grounds=[[ -4,-4],[-4,-12],[4,-4],[4,-12]].map(([x,z],i)=>({...ground,id:100+i,x,z,rows:8,cols:8}));
function load(z=-3){b.fire('bb-open');b.elements['#bb-data'].value=JSON.stringify({format:'brick-builder',version:4,npcs:[{id:1,profile:C.defaults,state:{x:7,y:.4,z:-7,heading:0}}],pieces:[...grounds,...tower(z)]});b.fire('bb-load-code');assert.equal(b.elements['#bb-dialog-message'].textContent,'');call('explore_lego_world',{playing:true});}
for(const [held,w] of Object.entries(W.catalog).filter(([n,w])=>w.style!=='fire'&&w.style!=='magic')){load();call('control_lego_character',{weapon:held,smash:true,seconds:w.contact-.06});assert.equal(b.read().pieces.length,7,held+' waits for contact');call('control_lego_character',{seconds:.08});assert.equal(b.read().pieces.length,4,held+' breaks on contact');call('control_lego_character',{rebuild:true,seconds:1.5});assert.equal(b.read().pieces.length,7,held+' rebuilds exact originals');}
for(const [held,w] of meleeWeapons){
 b.fire('bb-open');b.elements['#bb-data'].value=JSON.stringify({format:'brick-builder',version:4,npcs:[{id:1,profile:C.defaults,state:{x:7,y:.4,z:-7,heading:0}}],pieces:[...grounds,...tower(-1).map(p=>({...p,x:2,cols:2}))]});b.fire('bb-load-code');call('explore_lego_world',{playing:true});
 call('control_lego_character',{weapon:held,smash:true,seconds:w.duration+.1});assert.equal(b.read().pieces.length,7,held+' misses a nearby object outside its actual swept path');
}
load();call('control_lego_character',{weapon:'Sledgehammer',smash:true,seconds:0});call('control_lego_character',{weapon:'Baton',seconds:1});assert.equal(b.read().pieces.length,7,'equipping another weapon cancels the old pending strike');
for(const [held,w] of Object.entries(W.catalog).filter(([n,w])=>w.style==='fire')){load(-10);call('control_lego_character',{weapon:held,smash:true,seconds:.18});assert.equal(b.read().pieces.length,4,held+' strikes a distant creation');assert.equal(b.elements['#bb-weapon-status'].textContent,(w.capacity-1)+' / '+w.capacity);call('control_lego_character',{reload:true,seconds:.25});assert(b.read().player.reload>0,held+' reload animation begins');const before=b.read().player.reload;call('control_lego_character',{smash:true,seconds:0});assert.equal(b.read().player.reload,before,held+' cannot shoot during reload');call('control_lego_character',{seconds:w.reload});assert.equal(b.read().player.reload,0);assert.equal(b.elements['#bb-weapon-status'].textContent,w.capacity+' / '+w.capacity);}
load();call('control_lego_character',{weapon:'Rifle'});const start=b.read().player;b.fire('bb-run','pointerdown',{pointerId:1,preventDefault(){}});b.fire('bb-jump','pointerdown',{pointerId:2,preventDefault(){}});b.fire('bb-smash','pointerdown',{pointerId:3,preventDefault(){}});call('control_lego_character',{right:.4,run:true,jump:true,seconds:.30});assert(b.read().player.y>start.y+1,'running/jumping while firing stays possible');b.fire('bb-smash','pointercancel',{pointerId:3});const ammo=b.elements['#bb-weapon-status'].textContent;call('control_lego_character',{seconds:.5});assert.equal(b.elements['#bb-weapon-status'].textContent,ammo,'pointer cancellation stops automatic fire');
load();call('control_lego_character',{weapon:'Handgun',reload:true});call('explore_lego_world',{playing:false});call('explore_lego_world',{playing:true});assert.equal(b.read().player.reload,0,'leaving play cancels reload');
load(-10);call('control_lego_character',{weapon:'Handgun',smash:true,seconds:.05});const handgunKick=b.read().player.weaponRecoil;assert(handgunKick>0);call('control_lego_character',{seconds:1});assert(Math.abs(b.read().player.weaponRecoil)<.001,'spring recoil settles after the shot');load(-10);call('control_lego_character',{weapon:'Shotgun',smash:true,seconds:.05});assert(b.read().player.weaponRecoil>handgunKick*2,'shotgun recoil is visibly stronger than handgun recoil');
console.log('PASS: 19 weapon models and continuous connected rigs, occlusion and swept hits, range edges, delayed melee contact and exact rebuilds, seven firearms with ammo/reload, held automatic fire, simultaneous run/jump/fire and cancellation.');
