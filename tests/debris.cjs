const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const ctx={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../game-physics.js'),'utf8')+'\nglobalThis.physics=GamePhysics;',ctx);
const P=ctx.physics,ground={id:1,x:-4,z:-4,y:0,rows:8,cols:8,turn:0,kind:'plate'},platform={id:2,x:0,z:0,y:1,rows:2,cols:2,turn:0,kind:'brick'};
const debris=(o={})=>({x:0,y:12,z:0,vx:2,vy:6,vz:-1,rx:2,ry:1,rz:1,scale:.6,age:0,...o});
function advance(d,p,seconds,dt=.05){for(let t=0;t<seconds;t+=dt)P.stepDebrisPiece(d,Math.min(dt,seconds-t),p);assert(Object.values(d).filter(v=>typeof v==='number').every(Number.isFinite));return d;}
function settled(d,floor){assert(d.sleeping,'piece must land and sleep');assert.equal(d.vx,0);assert.equal(d.vy,0);assert.equal(d.vz,0);assert.equal(d.rx,0);assert.equal(d.rz,0);assert(Math.abs(d.y-P.debrisBottom(d)-floor)<1e-6,'rendered brick bottom touches its support');}
const p=new P.Controller([ground]);
const tall=debris({y:100,age:5});const before=tall.y;advance(tall,p,.1);assert(tall.y!==before,'already old airborne debris keeps moving');advance(tall,p,15);settled(tall,.625);assert(p.contains(tall.x,tall.z,P.debrisRadius(tall)),'high fragments bounce at the world border and land inside it');
for(const scale of [.48,.6,.72])for(const rx of [0,1,Math.PI,5.7])for(const dt of [.016,.025,.05]){const d=debris({scale,rx,x:1,z:1,vx:0,vz:0});advance(d,p,12,dt);settled(d,.625);}
const overhead=new P.Controller([ground,{...platform,y:4}]),below=debris({x:1,z:1,y:.625+.36,vx:0,vz:0,vy:0,rx:0,rz:0});advance(below,overhead,2);settled(below,.625);assert(below.y<1,'an overhead surface cannot pull a loose brick upward');
const raised=new P.Controller([ground,platform]),edge=debris({x:1.99,z:1,y:1.825+.36,vx:3,vz:0,vy:0,rx:0,rz:0});advance(edge,raised,.1);assert(edge.x>2&&edge.y<2.185,'piece falls after sliding off a ledge');advance(edge,raised,8);settled(edge,edge.x<=4?.625:0);
const supported=debris({x:1,z:1,vx:0,vz:0});advance(supported,raised,8);settled(supported,1.825);raised.replace([ground]);advance(supported,raised,.1);assert(!supported.sleeping&&supported.vy<0,'removing support wakes sleeping debris');advance(supported,raised,6);settled(supported,.625);
// Compare collision bottom against the actual renderer's rotation convention.
const model={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../character-model.js'),'utf8')+'\nglobalThis.model=CharacterModel;',model);
for(const rx of [0,.5,2,5])for(const rz of [0,.7,3]){const d=debris({rx,rz}),m=model.model.matrix(0,0,0,d.ry,d.rx,d.rz,d.scale);let min=Infinity;for(const x of [-.4875,.4875])for(const y of [-.6,.825])for(const z of [-.4875,.4875])min=Math.min(min,m[1]*x+m[5]*y+m[9]*z);assert(Math.abs(-min-P.debrisBottom(d))<1e-6);}
// Exercise real smash, editor-mode simulation, reload, and exact rebuilding.
let bootSource=fs.readFileSync(path.join(__dirname,'characters.cjs'),'utf8').split('const b=boot(),call=')[0];
bootSource=bootSource.replace("split('</script>')[0],context);", "split('</script>')[0].replace(/\\}\\)\\(\\);\\s*$/, 'globalThis.debrisQA={get:()=>debris,frame:gameFrame};})();'),context);");
bootSource=bootSource.replace('return {tools,elements,buttons,buffers,stored,','return {qa:context.debrisQA,tools,elements,buttons,buffers,stored,');
const bootCtx={require,__dirname,console,AbortController,Blob,URL,setTimeout};vm.runInNewContext(bootSource+'\nglobalThis.boot=boot;',bootCtx);
const b=bootCtx.boot(),call=(name,input)=>b.tools.get(name).execute(input);
const tower=[1,4,7].map((y,i)=>({...platform,id:i+2,x:-1,z:-3,y,color:8,group:'test'})),original=[{...ground,color:3},...tower];
function load(obj){b.fire('bb-open');b.elements['#bb-data'].value=JSON.stringify(obj);b.fire('bb-load-code');assert.equal(b.elements['#bb-dialog-message'].textContent,'');}
load({format:'brick-builder',version:4,pieces:original});call('explore_lego_world',{playing:true});call('control_lego_character',{smash:true});assert(b.qa.get().length);
call('explore_lego_world',{playing:false});for(let i=0;i<300;i++)b.qa.frame(.05);assert(b.qa.get().every(d=>d.sleeping),'debris settles while outside exploration');
const saved=b.read();load(saved);assert(b.qa.get().every(d=>!d.sleeping),'reloaded debris is simulated rather than frozen in midair');for(let i=0;i<300;i++)b.qa.frame(.05);assert(b.qa.get().every(d=>d.sleeping));
call('explore_lego_world',{playing:true});call('control_lego_character',{rebuild:true,seconds:1.5});assert.equal(b.qa.get().length,0);assert.equal(b.read().broken.length,0);assert.deepEqual(JSON.parse(JSON.stringify(b.read().pieces)).sort((a,b)=>a.id-b.id),original);
console.log('PASS: old/high debris continues falling; rotated and scaled bricks settle flush; no overhead snapping; ledge falls; destroyed supports wake sleeping pieces; renderer/collision agreement; settling outside exploration and after reload; exact rebuild.');
