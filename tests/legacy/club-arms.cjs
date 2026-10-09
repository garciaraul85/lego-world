const weaponName=process.argv[2]||'Club';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const seen=[],ctx={Float32Array,onMesh:(mesh,rig)=>seen.push({mesh,rig})};
for(const [file,name]of [['game-weapons.js','GameWeapons'],['character-catalog.js','CharacterCatalog'],['character-model.js','CharacterModel']]){const source=fs.readFileSync(path.join(__dirname,'../../src/legacy',file),'utf8').replace('function renderMesh(g,m,c,override=null){','function renderMesh(g,m,c,override=null){globalThis.onMesh(g,m);');vm.runInNewContext(source+';globalThis.'+name+'='+name,ctx);}
const M=ctx.CharacterModel,C=ctx.CharacterCatalog,w=ctx.GameWeapons.get(weaponName),point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]),local=(m,p)=>[0,1,2].map(k=>[0,1,2].reduce((v,j)=>v+m[k*4+j]*(p[j]-m[12+j]),0));
const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,createBuffer:()=>({}),getAttribLocation:(_,s)=>s,getUniformLocation:(_,s)=>s},{get:(o,k)=>k in o?o[k]:k.toUpperCase()===k?1:()=>{}}),renderer=M.create(gl,'void main(){vec3 base=mix(vColor,vec3(0),0.0);}');
let vertices=0;
for(const config of [{},{gender:'Female',breastSize:100},{outfit:'Armor'},{cape:'Poncho'},{gender:'Female',breastSize:100,outfit:'Armor',cape:'Poncho'}]){
 const p=C.validate({...C.defaults,...config,held:weaponName}),heights=[],directions=[];
 for(const action of ['swing','run','run-swing','jump-swing','run-hit','jump-hit']){const carryingHeights=[];
 for(let i=0;i<=60;i++){
  const state={grounded:!action.startsWith('jump'),airTime:.30*i/60,vy:4,moveBlend:action.startsWith('run')?1:0,runBlend:1,phase:i/60*Math.PI*2,attack:action==='run'?0:w.duration*(1-i/60),attackDuration:w.duration,...(action.endsWith('hit')?{attackImpact:w.contact/w.duration}:{})},pose=M.jointPose(state,false,p);
  const elbow=local(pose.root,point(pose.rightForearm,[0,0,0])),shoulder=local(pose.root,point(pose.rightArm,[0,0,0]));if(action==='swing'){heights.push(elbow[1]);directions.push(elbow.map((v,k)=>v-shoulder[k]));}carryingHeights.push(local(pose.root,point(pose.rightForearm,[-.03,-.61,.06]))[1]);
  const lengths=['left','right'].map(side=>Math.hypot(...point(pose[side+'Forearm'],[0,0,0]).map((v,k)=>v-pose[side+'Arm'][12+k])));
  assert(Math.abs(lengths[0]-lengths[1])<.00001,'Both upper arms have equal proportions');
  seen.length=0;renderer.draw(p,state);
  if(w.handDriven){const hand=seen.find(({mesh})=>mesh.slot==='rightHand').rig,tool=M.heldPose(pose,state,p),bore=hand.slice(8,11),shaft=tool.slice(4,7);
   assert(bore.reduce((v,x,k)=>v+x*shaft[k],0)>.99999,'Rendered C-hand bore follows the mace shaft');
   for(let k=0;k<3;k++){assert(Math.abs(tool[k]-hand[k])<.00001,'Weapon shares the hand roll');assert(Math.abs(tool[8+k]+hand[4+k])<.00001,'Weapon has a fixed angle relative to the palm');}
   assert(Math.hypot(...point(hand,[-.03,-.61,.06]).map((v,k)=>v-point(tool,[.02,-.61,.315])[k]))<.00001,'Mace stays centered in the rendered grip');
   if(w.forearmRollFrames){
    const forearm=pose.rightForearm,axis=[-.03,-.61,.06],direction=m=>[0,1,2].map(k=>m[k]*axis[0]+m[k+4]*axis[1]+m[k+8]*axis[2]),a=direction(forearm),b=direction(hand),cos=a.reduce((v,x,k)=>v+x*b[k],0)/(Math.hypot(...a)*Math.hypot(...b));
    assert(Math.acos(Math.min(1,Math.max(-1,cos)))<=w.wristLimit+.00001,'Rendered mace hand bends at most 35 degrees relative to the forearm');
    assert(Math.hypot(...point(forearm,axis).map((v,k)=>v-point(hand,axis)[k]))<.00001,'Forearm and hand meet at the same wrist joint');
   }
  }
  const caps=seen.filter(({mesh})=>mesh.locked&&['leftArm','rightArm'].includes(mesh.joint));
  assert(caps.length>=4,'Both elbow hinges are present in rendered meshes');const radii=[[],[]];
  for(const {mesh,rig}of caps){const side=mesh.joint==='leftArm'?0:1,child=side?'rightForearm':'leftForearm',center=point(pose[child],[0,0,0]);for(let a=0;a<3;a++)assert(Math.abs(Math.hypot(...rig.slice(a*4,a*4+3))-1)<.00001,'Both elbow caps remain unscaled');for(let j=0;j<mesh.surface.vertices.length;j+=3)radii[side].push(Math.hypot(...point(rig,mesh.surface.vertices.slice(j,j+3)).map((v,k)=>v-center[k])));}
  assert(Math.abs(Math.max(...radii[0])-Math.max(...radii[1]))<.00001,'Rendered elbow caps have identical size');
  for(const {mesh,rig}of seen.filter(({mesh})=>['leftHand','rightHand'].includes(mesh.slot)))for(let j=0;j<mesh.surface.vertices.length;j+=3){
   const a=local(pose.root,point(rig,mesh.surface.vertices.slice(j,j+3))),y=a[1],width=p.outfit==='Armor'?.90:.81,front=(p.cape==='Poncho'?.54:p.outfit==='Armor'?.48:.44)+(p.gender==='Female'?p.breastSize/100*.32:0)*Math.exp(-1.6*(((Math.abs(a[0])-.34)/.35)**2+((y-2.72)/.35)**2));
   assert(Math.min(width-Math.abs(a[0]),y-1.92,3.16-y,front-a[2],a[2]+.54)<.003,'Actual '+mesh.slot+' remains clear of torso at '+i/60+' '+action+' '+JSON.stringify(config));vertices++;
  }
 }
 if(action==='run')assert(Math.max(...carryingHeights)-Math.min(...carryingHeights)>.08,'Club arm moves with the stride');
 }
 assert(Math.max(...heights)-Math.min(...heights)>.45,'Right elbow visibly rises and drops through the swing');
 const ready=directions[0],raised=directions[12],cos=ready.reduce((v,x,k)=>v+x*raised[k],0)/(Math.hypot(...ready)*Math.hypot(...raised));assert(cos<.85,'Right upper arm rotates through the shoulder windup');
}
const p=C.validate({...C.defaults,held:weaponName});
if(w.fullBodyRig){
 const s={heading:.7,grounded:false,airTime:.3,attack:w.duration*.60,attackDuration:w.duration},before=M.jointPose(s,false,p),beforeTool=M.heldPose(before,s,p),frames=w.frames;
 w.frames=frames.map(f=>f.map((v,k)=>k===7?v+.15:v));const after=M.jointPose(s,false,p),afterTool=M.heldPose(after,s,p);w.frames=frames;
 const relative=(parent,child)=>[...local(parent,child.slice(12,15)),...[0,1,2].flatMap(c=>[0,1,2].map(r=>[0,1,2].reduce((v,k)=>v+parent[r*4+k]*child[c*4+k],0)))];
 assert(Math.max(...after.root.map((v,k)=>Math.abs(v-before.root[k])))>.10,'Hip rotation visibly carries the torso');
 for(const joint of ['root','leftArm','leftForearm','rightArm','rightForearm']){const a=relative(before.hips,before[joint]),b=relative(after.hips,after[joint]);assert(Math.max(...a.map((v,k)=>Math.abs(v-b[k])))<.00002,'Pelvis carries '+joint+' through the connected rig');}
 const a=relative(before.hips,beforeTool),b=relative(after.hips,afterTool);assert(Math.max(...a.map((v,k)=>Math.abs(v-b[k])))<.00002,'Pelvis carries the attached club through the hand');
 for(const pose of [before,after])for(const side of ['left','right']){assert(Math.hypot(...point(pose.root,M.pivots[side+'Arm']).map((v,k)=>v-pose[side+'Arm'][12+k]))<.00001,'Shoulder stays attached to the torso');assert(Math.hypot(...point(pose.hips,[side==='left'?-.39:.39,0,0]).map((v,k)=>v-pose[side+'Leg'][12+k]))<.00001,'Leg stays attached to the pelvis');}
}
if(w.handDriven){
 const s={heading:.7,grounded:true,attack:w.duration*.55,attackDuration:w.duration},pose=M.jointPose(s,false,p),before=M.heldPose(pose,s,p),frames=w.frames;
 w.frames=frames.map(f=>f.map((v,k)=>k>=4&&k<=6?v+.6:v));
 assert.deepEqual(Array.from(M.heldPose(pose,s,p)),Array.from(before),'Weapon cannot rotate independently of an unchanged hand pose');w.frames=frames;
 const moved={...pose,rightForearm:new Float32Array(pose.rightForearm)};moved.rightForearm[5]+=.20;moved.rightForearm[6]-=.15;
 assert(Math.max(...M.heldPose(moved,s,p).slice(0,12).map((v,k)=>Math.abs(v-before[k])))>.02,'Changing the forearm angle changes the mace angle');
}
const start=M.jointPose({grounded:false,airTime:0,vy:4},false,p),next=M.jointPose({grounded:false,airTime:.001,vy:4},false,p);
for(const joint of ['leftArm','leftForearm','rightArm','rightForearm'])assert(Math.max(...next[joint].map((v,k)=>Math.abs(v-start[joint][k])))<.005,'Club guard eases into takeoff');
console.log('PASS '+weaponName+': moving right upper arm and elbow; equal arm proportions and rendered elbow sizes; '+vertices+' actual hand vertices clear the torso through stationary/running/airborne strikes; smooth takeoff and carrying stride across five body/outfit shapes.');
