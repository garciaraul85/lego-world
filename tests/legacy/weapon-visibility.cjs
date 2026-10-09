const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const seen=[];
const context={Float32Array,onMesh:(mesh,rig)=>seen.push({mesh,rig})};
for(const [file,name] of [['game-weapons.js','GameWeapons'],['character-catalog.js','CharacterCatalog'],['character-model.js','CharacterModel']]){
 let source=fs.readFileSync(path.join(__dirname,'../../src/legacy',file),'utf8');
 // Capture the real render submissions, after visibility filters and animation.
 if(file==='character-model.js')source=source.replace('function renderMesh(g,m,c,override=null){','function renderMesh(g,m,c,override=null){globalThis.onMesh(g,m);');
 vm.runInNewContext(source+';globalThis.'+name+'='+name,context);
}
const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,createBuffer:()=>({}),getAttribLocation:(_,s)=>s,getUniformLocation:(_,s)=>s},{get:(o,k)=>k in o?o[k]:k.toUpperCase()===k?1:()=>{}});
const {GameWeapons:W,CharacterCatalog:C,CharacterModel:M}=context;
const renderer=M.create(gl,'void main(){vec3 base=mix(vColor,vec3(0),0.0);}');
const determinant=m=>m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2]);
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
for(const [held,w] of Object.entries(W.catalog)){
 const profile=C.validate({...C.defaults,held,shirt:'Jacket'});
 const states=[{}, {attack:w.duration,attackDuration:w.duration}, {attack:w.duration-(w.contact||.10),attackDuration:w.duration}, {attack:w.duration-(w.contact||.10),attackDuration:w.duration,buildBlend:.4}, {running:true,speed:7.8,phase:1.8,moveBlend:1,runBlend:1}, {grounded:false,vy:4,airTime:.3}, {building:true,buildBlend:1,buildTime:.3}, {buildBlend:.15}, ...(w.style==='fire'?[{reload:w.reload*.5,reloadDuration:w.reload}]:[])];
 let modelVertices;
 for(const heading of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const partial of states){
  const state={x:0,y:0,z:0,heading,grounded:true,...partial};seen.length=0;renderer.draw(profile,state);
  for(const joint of ['root','head','leftArm','rightArm','leftForearm','rightForearm','leftLeg','rightLeg','leftShin','rightShin','leftFoot','rightFoot'])assert(seen.some(({mesh})=>mesh.joint===joint&&mesh.slot!=='held'),held+' retains '+joint);
  for(const slot of ['leftHand','rightHand','held'])assert(seen.some(({mesh})=>mesh.slot===slot),held+' retains '+slot+' while moving/building');
  const heldMeshes=seen.filter(({mesh})=>mesh.slot==='held'&&mesh.variant!=='reload-shell'),count=heldMeshes.reduce((v,{mesh})=>v+mesh.count,0);modelVertices??=count;assert.equal(count,modelVertices,held+' never drops weapon geometry');
  for(const {mesh,rig} of seen){assert(Array.from(rig).every(Number.isFinite),held+' finite transform');assert(determinant(rig)>.95,held+' no collapsed bone');assert(mesh.count>0);}
  for(const {mesh,rig} of seen.filter(({mesh})=>mesh.slot.endsWith('Hand')))assert(Math.abs(determinant(rig)-1)<.00001,held+' keeps hands rigid');
  if(!state.building&&(!(state.buildBlend>.02)||state.attack>0||state.reload>0)){
   const pose=M.jointPose(state,false,profile),hand=point(pose.rightForearm,[-.03,-.61,.06]),rig=M.heldPose(pose,state,profile),grip=point(rig,[.02,-.61,.315]);assert(Math.hypot(...hand.map((v,k)=>v-grip[k]))<.00001,held+' aligns tool with the actual C-hand center');
   const inverseYaw=p=>[Math.cos(heading)*p[0]-Math.sin(heading)*p[2],p[1],Math.sin(heading)*p[0]+Math.cos(heading)*p[2]];
   const h=inverseYaw(hand);assert(h[2]>.42||Math.abs(h[0])>.86,held+' keeps grip outside the torso');
  }
 }
 assert(w.action,held+' exposes the correct action');
 if(w.style==='fire')assert(w.muzzle.length===3&&w.muzzle[2]>=1,held+' has a muzzle at the enlarged barrel end');
 else assert(Math.abs(w.tip)>1||held==='Shovel',held+' has readable reach');
 // Sweep the whole stow/return transition, including the former .02 cutoff.
 let previous;
 for(let i=0;i<=160;i++){
  const state={x:0,y:0,z:0,heading:.8,grounded:true,buildBlend:i/160,building:true,buildTime:.30},pose=M.jointPose(state,false,profile),heldRig=M.heldPose(pose,state,profile),all={...pose,held:heldRig};
  for(const [name,m] of Object.entries(all)){assert(Array.from(m).every(Number.isFinite));if(previous)assert(Math.max(...Array.from(m).map((v,k)=>Math.abs(v-previous[name][k])))<.18,held+' smoothly stows '+name);}
  if(i<60){const hand=point(pose.rightForearm,[-.03,-.61,.06]),grip=point(heldRig,[.02,-.61,.315]);assert(Math.hypot(...hand.map((v,k)=>v-grip[k]))<.00001,held+' carries its weapon before releasing it');}
  for(const [child,parent] of Object.entries(M.parents)){const offset=M.pivots[child].map((v,k)=>v-M.pivots[parent][k]),end=point(pose[parent],offset);assert(Math.hypot(...end.map((v,k)=>v-pose[child][12+k]))<.00001,held+' keeps joints attached while stowing');}
  previous=all;
 }
 if(w.style==='fire'){
  const animation=[];for(const fraction of [.15,.35,.55,.75]){seen.length=0;renderer.draw(profile,{x:0,y:0,z:0,heading:0,grounded:true,reload:w.reload*(1-fraction),reloadDuration:w.reload});const part=seen.find(({mesh})=>mesh.variant===({cylinder:'cylinder',ramrod:'ramrod',shells:'reload-shell',magazine:'magazine'}[w.reloadStyle]));if(part)animation.push(Array.from(part.rig));}
  if(animation.length)assert(new Set(animation.map(m=>JSON.stringify(m))).size>1,held+' animates its reload hardware');
 }
}
console.log('PASS: all 19 weapons remain visible at four rotations during attacks/movement/reload/rebuild; connected, noncollapsed bones and rigid hands; continuous stow/return paths with carrying grips; animated firearm reload hardware.');
