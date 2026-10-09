const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
let bootstrap=fs.readFileSync(path.join(__dirname,'characters.cjs'),'utf8').split('const b=boot(),call=')[0];
bootstrap=bootstrap.replace(".split('</script>')[0],context)",".split('</script>')[0]+';globalThis.rigAPI={C:CharacterCatalog,M:CharacterModel,R:RigCollision,P:GamePhysics};',context)").replace('return {tools,elements,buttons,buffers,stored,','return {api:context.rigAPI,tools,elements,buttons,buffers,stored,');
const bootCtx={require,__dirname,console,AbortController,Blob,URL,setTimeout};vm.runInNewContext(bootstrap+';globalThis.boot=boot;',bootCtx);
const game=bootCtx.boot(),{C,M,R,P}=game.api,call=(n,v)=>game.tools.get(n).execute(v);
const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,createBuffer:()=>({}),createShader:()=>({}),createProgram:()=>({})},{get:(o,k)=>k in o?o[k]:(k.toUpperCase()===k?1:()=>{})});
const renderer=M.create(gl,'void main(){}'),ground={id:1,x:-12,z:-12,y:0,rows:24,cols:24,turn:0,kind:'plate',color:3};
const wall={id:2,x:-5,z:0,y:1,rows:2,cols:10,turn:0,kind:'brick',color:8};
function scene(profile,parts=[wall],state={x:0,y:.4,z:-2,heading:0}){const c=new P.Controller([ground,...parts]);Object.assign(c.state,state);renderer.bindCollision(profile,c);return c;}
const defaultProfile=C.validate({...C.defaults,hat:'None',held:'None'});
// An oriented narrow box must not become its much larger world-space envelope.
const a=R.box({min:[-2,-.1,-.1],max:[2,.1,.1]},M.matrix(0,1,0,Math.PI/4)),outside=R.box({min:[-.1,-.1,-.1],max:[.1,.1,.1]},M.matrix(1,1,1));assert.equal(R.contact(a,outside),null,'SAT rejects overlapping broadphase bounds without real box contact');
for(const held of ['None','Club','Mace','War hammer','Submachine gun']){
 const p=C.validate({...defaultProfile,held}),c=scene(p,[]);let previous;
 for(let frame=0;frame<12;frame++){
  Object.assign(c.state,{phase:frame*.17,moveBlend:1,runBlend:1,attack:held==='None'?0:1-frame/12,attackDuration:1});
  const pose=M.jointPose(c.state,false,p),boxes=R.boxes(c.state.rigContact,pose,c.state,p);
  for(const b of boxes){assert(b.center.every(Number.isFinite)&&b.edges.flat().every(Number.isFinite));}
  for(const [child,parent] of Object.entries(M.parents)){const anchor=M.transform(pose[parent],M.pivots[child].map((v,k)=>v-M.pivots[parent][k]));assert(anchor.every((v,k)=>Math.abs(v-pose[child][12+k])<2e-5),'connected '+held+' '+child);}
  const hand=boxes.find(b=>b.part.slot==='rightHand');assert(hand,'hand collider exists');if(previous)assert(Math.hypot(...hand.center.map((v,k)=>v-previous[k]))>0,'hand collider follows animation');previous=hand.center;
 }
}
// Close contact uses torso/feet geometry, not a sphere inflated around weapons.
for(const held of ['None','Club','Mace','War hammer','Submachine gun']){
 const p=C.validate({...defaultProfile,held}),c=scene(p);
 for(let i=0;i<30;i++)c.step({z:-1,run:true},.025,0);
 const distance=-c.state.z;assert(distance<.85,held+' can approach a wall closely: '+distance);assert(!R.coreContacts(c.state.rigContact,c.state).length,'body stays out of wall');
}
// A reaching hand encounters the wall while the torso is clear.
const c=scene(defaultProfile,[{...wall,y:4,rows:1}],{x:0,y:.4,z:-.60,heading:0,grounded:true,attack:.24,attackDuration:.52});
const raw=M.freeJointPose(c.state,false,defaultProfile);for(let i=0;i<12;i++){c.state.rigContact.clock=i/60;M.jointPose(c.state,false,defaultProfile);}const fixed=M.jointPose(c.state,false,defaultProfile),arm=p=>p.slot==='rightHand'||p.joint==='rightForearm'||p.joint==='rightArm';
const depth=pose=>R.scenery(c.state.rigContact,R.boxes(c.state.rigContact,pose,c.state,defaultProfile,arm)).reduce((v,c)=>v+c.hit.depth*c.hit.depth,0);
assert(depth(raw)>0,'fixture reaches into a brick');assert(depth(fixed)<depth(raw)*.75,'contact bends the connected arm away from the brick');assert.equal(c.state.x,0);assert.equal(c.state.z,-.60,'contact adjusts pose without moving the player position');
// Contact onset should ease in rather than flip a limb's rotation.
c.state.rigContact.corrections=new Map();let previousPose,maxContactDelta=0,maxWhere;
for(let i=0;i<=70;i++){c.state.z=-1.30+i*.01;c.state.rigContact.clock=i/60;const pose=M.jointPose(c.state,false,defaultProfile);if(previousPose)for(const key of Object.keys(pose))for(let j=0;j<16;j++){const d=Math.abs(pose[key][j]-previousPose[key][j]);if(d>maxContactDelta){maxContactDelta=d;maxWhere=[i,key,j];}}previousPose=pose;}
assert(maxContactDelta<.25,'continuous contact pose: '+maxContactDelta+' '+maxWhere);
const ceiling=scene(defaultProfile,[{...wall,y:13}],{x:0,y:.4,z:1,heading:0,grounded:true});
for(let i=0;i<20;i++)ceiling.step({jump:i===0},.025,0);
assert(Math.max(...R.core(ceiling.state.rigContact,ceiling.state).map(a=>a.max[1]))<=5.2+.001,'actual head bound cannot jump through a low ceiling');
assert(!JSON.stringify(c.state).includes('rigContact'),'collider/controller references stay out of saves');
// Real gameplay binds every NPC and the player, and remains solid at contact.
game.fire('bb-open');game.elements['#bb-data'].value=JSON.stringify({format:'brick-builder',version:4,pieces:[ground],player:{x:0,y:.4,z:-4,heading:0},npcs:[{id:1,profile:defaultProfile,state:{x:0,y:.4,z:0,heading:Math.PI}}]});game.fire('bb-load-code');call('explore_lego_world',{playing:true});call('control_lego_character',{forward:1,run:true,seconds:.8});const player=game.read().player,neighbor=call('read_lego_neighbors',{}).neighbors[0].state;
const p=scene(defaultProfile,[],player),n=scene(defaultProfile,[],neighbor);assert(!R.actorContacts(p.state.rigContact,p.state,n.state).length,'compound NPC bodies block passage');assert(player.z<neighbor.z-1,'player stays on approach side');
console.log('PASS: mesh-derived oriented joint boxes, moving hands and held weapons, connected contact IK, close wall approach, solid NPC bodies, and safe serialization.');
