const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const ctx={};for(const name of ['game-physics','character-model','character-catalog','npc-world']){const key={'game-physics':'GamePhysics','character-model':'CharacterModel','character-catalog':'CharacterCatalog','npc-world':'NPCWorld'}[name];vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../'+name+'.js'),'utf8')+';globalThis.'+key+'='+key+';',ctx);}
const P=ctx.GamePhysics,M=ctx.CharacterModel,N=ctx.NPCWorld;
const ground={id:1,x:-8,z:-8,y:0,rows:8,cols:8,turn:0,kind:'plate',color:3},plates=[ground,{...ground,id:2,x:0},{...ground,id:3,z:0},{...ground,id:4,x:0,z:0}],world={width:16,depth:16,config:{seed:21,biomes:['prairie']},regions:[]};
function inBounds(c,s,r=P.characterMargin*P.scaleOf(s)){assert(c.contains(s.x,s.z,r),'the entire footprint stays inside the world');assert(Number.isFinite(s.y));}
for(const yaw of [0,.7,Math.PI/2,Math.PI,4.2])for(const dt of [1/120,1/60,.05]){
 const c=new P.Controller(plates,world);
 for(let i=0;i<180;i++){c.step({x:1,z:1,run:true,jump:i%35===0},dt,yaw);inBounds(c,c.state);}
 const before={...c.state};c.step({x:-1,run:true},dt,yaw);inBounds(c,c.state);assert(Math.hypot(c.state.x-before.x,c.state.z-before.z)<=7.8*dt+.001,'edge motion stays continuous');
}
const edge=new P.Controller(plates,world);Object.assign(edge.state,{x:6.4,z:0});for(let i=0;i<100;i++)edge.step({x:1,z:-1,run:true},.025,0);assert.equal(edge.state.x,6.4);assert(edge.state.z>5,'the character slides along an edge rather than sticking');inBounds(edge,edge.state);
Object.assign(edge.state,{x:90,z:-90,y:-5});edge.repairPosition();inBounds(edge,edge.state);assert(edge.state.y>=.4,'old off-map positions recover on supported ground');
const area=JSON.stringify(edge.area);edge.replace([...plates,{...ground,id:9,x:200,z:200,y:3}],world);assert.equal(JSON.stringify(edge.area),area,'high pieces and off-map edits do not enlarge a generated world');edge.replace(plates.slice(0,1),world);assert.equal(JSON.stringify(edge.area),area,'smashed scenery does not shrink a generated border');
const custom=new P.Controller([{...ground,x:40,z:-30}]);assert.equal(custom.area.x0,40);assert.equal(custom.area.z0,-30);inBounds(custom,custom.state);
const debris=(x,z)=>({x,z,y:30,vx:x>0?90:-90,vz:z>0?90:-90,vy:8,rx:2,ry:3,rz:1,scale:.72,age:0});
for(const [x,z] of [[7.9,7.9],[-7.9,7.9],[7.9,-7.9],[-7.9,-7.9],[90,-90]]){
 const d=debris(x,z),c=new P.Controller(plates,world);for(let i=0;i<500;i++){P.stepDebrisPiece(d,.025,c);inBounds(c,d,P.debrisRadius(d));}assert(d.sleeping,'edge fragments bounce and settle');assert(Math.abs(d.y-P.debrisBottom(d)-.625)<.00001);
}
const player={x:0,y:.4,z:0},npcs=N.populate(plates,world,player);assert(npcs.length);
for(let i=0;i<2400;i++){N.step(npcs,1/60,player);for(const n of npcs)inBounds(n.controller,n.state);}
const saved=N.serialize(npcs);saved[0].state.x=100;saved[0].state.z=-100;const restored=N.restore(saved,plates,world);for(const n of restored)inBounds(n.controller,n.state);assert(restored[0].state.y>=.4,'off-map saved NPCs recover before rendering');
restored[0].state.x=90;N.sync(restored,plates,world);for(const n of restored)inBounds(n.controller,n.state);
// Starts, run/walk changes, and stops blend continuously while phase persists.
const runner=new P.Controller([{...ground,x:-64,z:-64,cols:128,rows:128}]),localPose=()=>M.jointPose({...runner.state,x:0,y:0,z:0});let previous=localPose(),maxDelta=0;
for(let i=0;i<240;i++){
 const input=i<60?{z:1}:i<180?{z:1,run:true}:{};runner.step(input,1/120,0);const pose=localPose();
 for(const name of Object.keys(pose))for(let k=0;k<16;k++)maxDelta=Math.max(maxDelta,Math.abs(pose[name][k]-previous[name][k]));previous=pose;
 if(i===60)assert(runner.state.runBlend>0&&runner.state.runBlend<.2,'run does not switch all joints in a single frame');
 if(i===180)assert(runner.state.moveBlend>.8,'release blends out of the last stride');
}
assert(maxDelta<.22,'adjacent running poses have no missing-frame jump');assert(runner.state.moveBlend<.003,'the gait settles back to idle');
// Drive the real RAF loop, not a duplicate scheduler, at three refresh rates.
let boot=fs.readFileSync(path.join(__dirname,'characters.cjs'),'utf8').split('const b=boot(),call=')[0];
boot=boot.replace('const elements={};let doc;','let renders=0;gl.viewport=()=>{renders++;};const elements={};let doc;');
boot=boot.replace("split('</script>')[0],context);", "split('</script>')[0].replace(/\\}\\)\\(\\);\\s*$/, 'globalThis.motionQA={tick:frame,clock:()=>clock,hold:()=>heldKeys.add(\"w\")};})();'),context);");
boot=boot.replace('return {tools,elements,buttons,buffers,stored,','return {qa:context.motionQA,renders:()=>renders,doc,tools,elements,buttons,buffers,stored,');
const bootCtx={require,__dirname,console,AbortController,Blob,URL,setTimeout};vm.runInNewContext(boot+'globalThis.boot=boot;',bootCtx);
for(const fps of [60,90,120]){const b=bootCtx.boot();b.tools.get('explore_lego_world').execute({playing:true});b.qa.hold();b.qa.tick(2000);const draws=b.renders(),time=b.qa.clock();for(let i=1;i<=fps;i++)b.qa.tick(2000+i*1000/fps);assert.equal(b.renders()-draws,fps,'every display refresh draws a running frame');assert(Math.abs(b.qa.clock()-time-1)<1e-8,'animation time tracks elapsed time');b.doc.hidden=true;b.qa.tick(10000);assert(Math.abs(b.qa.clock()-time-1)<1e-8,'hidden tabs do not advance the game');b.doc.hidden=false;b.qa.tick(10000+1000/fps);assert(b.qa.clock()-time<1.02,'returning from a hidden tab does not fast-forward');}
console.log('PASS: continuous walk/run/stop poses; every 60/90/120 Hz refresh renders; stable elapsed time and tab recovery; running, diagonal motion and jumps respect borders; edge sliding; old player/NPC recovery; NPC wandering; full tumbling fragment containment and settling; fixed generated and custom world extents.');
