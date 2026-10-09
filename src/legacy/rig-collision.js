// Compound joint boxes. The renderer supplies local mesh bounds and the exact
// draw matrices, including rigid palms and weapon attachments. No global radius
// is expanded to cover a swinging hand or a long held object.
const RigCollision=(()=>{
 'use strict';
 const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((v,n,k)=>v+n*b[k],0),scale=(a,n)=>a.map(v=>v*n),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>scale(a,1/Math.max(1e-9,Math.hypot(...a)));
 function vertexBounds(v){if(!v.length)return null;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<v.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],v[i+k]);max[k]=Math.max(max[k],v[i+k]);}return {min,max};}
 function box(bounds,m,part=null){
  const local=bounds.min.map((v,k)=>(v+bounds.max[k])/2),half=bounds.min.map((v,k)=>(bounds.max[k]-v)/2),center=local.map((_,k)=>m[12+k]+local.reduce((v,n,j)=>v+n*m[j*4+k],0)),edges=half.map((h,j)=>[m[j*4],m[j*4+1],m[j*4+2]].map(v=>v*h));
  const extent=[0,1,2].map(k=>edges.reduce((v,e)=>v+Math.abs(e[k]),0));return {center,edges,part,min:center.map((v,k)=>v-extent[k]),max:center.map((v,k)=>v+extent[k])};
 }
 function brick(b){return {center:[(b.x0+b.x1)/2,(b.y0+b.y1)/2,(b.z0+b.z1)/2],edges:[[(b.x1-b.x0)/2,0,0],[0,(b.y1-b.y0)/2,0],[0,0,(b.z1-b.z0)/2]],min:[b.x0,b.y0,b.z0],max:[b.x1,b.y1,b.z1]};}
 function contact(a,b,horizontal=false){
  if(a.min.some((v,k)=>v>=b.max[k]-.00001||a.max[k]<=b.min[k]+.00001))return null;
  // Face normals and edge cross-products handle stretched bone transforms too.
  const axes=[...a.edges.map((_,i)=>cross(a.edges[(i+1)%3],a.edges[(i+2)%3])),...b.edges.map((_,i)=>cross(b.edges[(i+1)%3],b.edges[(i+2)%3])),...a.edges.flatMap(e=>b.edges.map(f=>cross(e,f)))],delta=sub(a.center,b.center);let best=null;
  for(const axis of axes){if(Math.hypot(...axis)<1e-9)continue;let n=unit(axis),distance=dot(delta,n),depth=a.edges.reduce((v,e)=>v+Math.abs(dot(e,n)),0)+b.edges.reduce((v,e)=>v+Math.abs(dot(e,n)),0)-Math.abs(distance);if(depth<=.00001)return null;if(distance<0)n=scale(n,-1);
   if(horizontal){const l=Math.hypot(n[0],n[2]);if(l<.001)continue;depth/=l;n=[n[0]/l,0,n[2]/l];}
   if(!best||depth<best.depth)best={normal:n,depth,shift:scale(n,depth+.002)};
  }return best;
 }
 function boxes(rig,pose,s,profile,filter=()=>true){
  const C=CharacterModel,w=!(s.heroAction||s.flying||s.climbing)&&typeof GameWeapons!=='undefined'?GameWeapons.catalog[profile.held]:null,build=C.weaponBuild(s),held=C.heldPose(pose,s,profile),motion=w?C.combatMotion(s,w):null;
  // Only normal pieces are colliders; transient reload props and face printing
  // cannot change the locomotion silhouette.
  return rig.parts.filter(filter).map(p=>box(p.localBounds,rig.matrix(p,pose,held,s,profile,false,w,build,motion),p));
 }
 const corePart=p=>p.slot==='torso'||p.joint==='head'||p.joint==='hips'||p.slot.endsWith('Leg')||p.slot.endsWith('Foot');
 function core(rig,s){
  const cached=rig.coreSnapshot;if(cached&&cached.x===s.x&&cached.y===s.y&&cached.z===s.z&&cached.heading===(s.heading||0))return cached.boxes;
  // A stable compound body hull handles locomotion; articulated extensions are
  // constrained separately. Cache its local boxes instead of running weapon IK
  // for every collision probe and every nearby NPC.
  if(!rig.coreLocal){const p={...rig.profile,held:'None'},state={x:0,y:0,z:0,heading:0,grounded:true,attack:0},pose=CharacterModel.freeJointPose(state,true,p);rig.coreLocal=boxes(rig,pose,state,p,corePart);}
  const cy=Math.cos(s.heading||0),sy=Math.sin(s.heading||0),rotate=v=>[cy*v[0]+sy*v[2],v[1],-sy*v[0]+cy*v[2]];
  const result=rig.coreLocal.map(a=>{const center=add(rotate(a.center),[s.x,s.y,s.z]),edges=a.edges.map(rotate),extent=[0,1,2].map(k=>edges.reduce((v,e)=>v+Math.abs(e[k]),0));return {center,edges,part:a.part,min:center.map((v,k)=>v-extent[k]),max:center.map((v,k)=>v+extent[k])};});rig.coreSnapshot={x:s.x,y:s.y,z:s.z,heading:s.heading||0,boxes:result};return result;
 }
 function nearby(rig,a){const found=new Set(),out=[];for(let x=Math.floor(a.min[0]/4);x<=Math.floor(a.max[0]/4);x++)for(let z=Math.floor(a.min[2]/4);z<=Math.floor(a.max[2]/4);z++)for(const item of rig.controller.bins.get(x+','+z)||[]){if(!found.has(item.b)){found.add(item.b);out.push(item);}}return out;}
 function scenery(rig,boxes,horizontal=false){const out=[];for(const a of boxes)for(const {b,p} of nearby(rig,a)){const hit=contact(a,brick(b),horizontal);if(hit)out.push({b,brick:p,part:a.part,hit,p:{nx:hit.normal[0],nz:hit.normal[2],depth:hit.depth}});}return out;}
 function solidContacts(rig,parts){const contacts=scenery(rig,parts);for(const actor of rig.controller.actors||[]){if(actor===rig.controller.state||!actor.rigContact)continue;const body=core(actor.rigContact,actor);for(const a of parts)for(const b of body){const hit=contact(a,b);if(hit)contacts.push({b:actor,actor:true,part:a.part,hit});}}return contacts;}
 function coreContacts(rig,s){return scenery(rig,core(rig,s),true);}
 function actorContacts(rig,s,actor){if(!actor.rigContact)return null;const out=[],a=core(rig,s),b=core(actor.rigContact,actor);for(const boxA of a)for(const boxB of b){const hit=contact(boxA,boxB,true);if(hit)out.push({b:actor,actor:true,part:boxA.part,hit,p:{nx:hit.normal[0],nz:hit.normal[2],depth:hit.depth}});}return out;}
 function constrain(pose,s,profile,rig){
  const C=CharacterModel,world=C.matrix(s.x,s.y,s.z,s.heading),right=[world[0],world[1],world[2]],front=[world[8],world[9],world[10]],w=!(s.heroAction||s.flying||s.climbing)&&typeof GameWeapons!=='undefined'?GameWeapons.catalog[profile.held]:null;
  // Remove just the amount of torso lean/twist that would enter a solid.
  // Descendants follow the corrected spine, so contact never detaches a shoulder.
  const trunk=p=>p.slot==='torso'||p.joint==='head'||p.joint==='hips',hitBody=q=>solidContacts(rig,boxes(rig,q,s,profile,trunk)).length;
  if(hitBody(pose)){
   const neutral=C.freeJointPose({...s,attack:0,buildBlend:0},true,{...profile,held:'None'}),original={...pose},candidate=t=>({...pose,root:C.blendBone(original.root,neutral.root,t),hips:C.blendBone(original.hips,neutral.hips,t),head:C.blendBone(original.head,neutral.head,t)});
   if(!hitBody(candidate(1))){let lo=0,hi=1;for(let i=0;i<8;i++){const mid=(lo+hi)/2;if(hitBody(candidate(mid)))lo=mid;else hi=mid;}const q=candidate(hi);
    for(const name of Object.keys(pose)){if(['root','hips','head'].includes(name))pose[name]=q[name];else if(name.includes('Arm')||name.includes('Forearm'))pose[name]=C.mul(q.root,C.relativeTransform(original.root,original[name]));}
    for(const side of [-1,1]){const upper=side<0?'leftLeg':'rightLeg',lower=side<0?'leftShin':'rightShin',foot=side<0?'leftFoot':'rightFoot',origin=C.transform(pose.hips,[side*.39,0,0]),rest=sub(C.pivots[lower],C.pivots[upper]),endRest=sub(C.pivots[foot],C.pivots[lower]),bones=C.solveLimb(origin,Array.from(original[foot].slice(12,15)),rest,endRest,front,right);pose[upper]=bones[0];pose[lower]=bones[1];pose[foot]=new Float32Array(original[foot]);pose[foot].set(C.transform(bones[1],endRest),12);}
   }
  }
  const smoothAim=(old,next,rest,key)=>{
   const a=unit(sub(C.transform(old,rest),Array.from(old.slice(12,15)))),b=unit(sub(C.transform(next,rest),Array.from(next.slice(12,15)))),cy=Math.cos(s.heading||0),sy=Math.sin(s.heading||0),local=v=>[cy*v[0]-sy*v[2],v[1],sy*v[0]+cy*v[2]],world=v=>[cy*v[0]+sy*v[2],v[1],-sy*v[0]+cy*v[2]],desired=local(sub(b,a)),clock=rig.clock||0;
   rig.corrections=rig.corrections||new Map();let cached=rig.corrections.get(key);
   if(!cached){cached={value:[0,0,0],time:clock-1/60};rig.corrections.set(key,cached);}
   if(s===rig.controller.state&&clock>cached.time){const alpha=1-Math.exp(-Math.min(.05,clock-cached.time)*18);cached.value=cached.value.map((v,k)=>v+(desired[k]-v)*alpha);cached.time=clock;}
   return C.aimBone(old,rest,add(a,world(cached.value)));
  };
  const selfBody=boxes(rig,pose,s,profile,p=>p.slot==='torso'||p.joint==='head'||p.joint==='hips');
  // Keep a touched limb connected at its shoulder/hip. Project the desired end
  // effector out of solids, then solve both bones with their original lengths.
  for(const side of [1,-1])for(const limb of ['Arm','Leg']){
   const prefix=side<0?'left':'right',upper=prefix+limb,lower=prefix+(limb==='Arm'?'Forearm':'Shin'),foot=prefix+'Foot',hand=prefix+'Hand',arm=limb==='Arm',rest=C.pivots[lower].map((v,k)=>v-C.pivots[upper][k]),endRest=arm?C.handGrip(side):C.pivots[foot].map((v,k)=>v-C.pivots[lower][k]),lengths=arm&&w?C.weaponArmLengths(w,profile,side).map(v=>1+(v-1)*(1-C.weaponBuild(s))):[1,1],origin=Array.from(pose[upper].slice(12,15)),start=C.transform(pose[lower],endRest),originalUpper=pose[upper],originalLower=pose[lower],originalFoot=arm?null:pose[foot],bend=sub(Array.from(originalLower.slice(12,15)),origin);let target=start;
   const selected=p=>p.slot==='held'?arm&&side>0&&!(s.attack>0):p.joint===upper||p.joint===lower||p.slot===(arm?hand:foot);
   let initial=null,best=Infinity,bestPose=null;
   for(let pass=0;pass<7;pass++){
    const parts=boxes(rig,pose,s,profile,selected),contacts=solidContacts(rig,parts);
    if(arm&&pass>0)for(const a of parts.filter(a=>a.part.joint===lower||a.part.slot===hand||a.part.slot==='held'))for(const b of selfBody){const hit=contact(a,b);if(hit)contacts.push({self:true,part:a.part,hit});}
    // Standing feet may rest on studs. Horizontal contact still folds a stride
    // at a wall, without lifting the entire character off the ground.
    const useful=contacts.filter(c=>arm||c.actor||c.self||c.hit.normal[1]<.5||c.brick.y*.4>s.y+.05),score=useful.reduce((v,c)=>v+c.hit.depth*c.hit.depth,0);
    if(initial===null)initial=score;if(score<best){best=score;bestPose=[pose[upper],pose[lower],arm?null:pose[foot]];}if(!useful.length)break;
    const deepest=useful.reduce((a,b)=>a.hit.depth>b.hit.depth?a:b),shift=deepest.hit.shift;
    target=add(target,scale(shift,Math.min(1,.28/Math.max(.001,Math.hypot(...shift)))/CharacterCatalog.heightScale(profile)));
    const bones=C.solveLimb(origin,target,rest,endRest,bend,right,false,lengths);
    pose[upper]=C.aimBone(originalUpper,rest,sub(Array.from(bones[1].slice(12,15)),origin));
    pose[lower]=C.aimBone(originalLower,endRest,sub(C.transform(bones[1],endRest),Array.from(bones[1].slice(12,15))));pose[lower].set(C.transform(pose[upper],rest),12);
    if(!arm){pose[foot]=new Float32Array(originalFoot);pose[foot].set(C.transform(pose[lower],endRest),12);}
   }
   if(bestPose&&best<initial-1e-8){const amount=Math.min(1,Math.sqrt(initial)/.10),weight=amount*amount*(3-2*amount);const blendAim=(old,next,rest)=>{const a=sub(C.transform(old,rest),Array.from(old.slice(12,15))),b=sub(C.transform(next,rest),Array.from(next.slice(12,15)));return C.aimBone(old,rest,a.map((v,k)=>v+(b[k]-v)*weight));};pose[upper]=blendAim(originalUpper,bestPose[0],rest);pose[lower]=blendAim(originalLower,bestPose[1],endRest);pose[lower].set(C.transform(pose[upper],rest),12);if(!arm){pose[foot]=C.blendBone(originalFoot,bestPose[2],weight);pose[foot].set(C.transform(pose[lower],endRest),12);}}else{pose[upper]=originalUpper;pose[lower]=originalLower;if(!arm)pose[foot]=originalFoot;}
   pose[upper]=smoothAim(originalUpper,pose[upper],rest,upper);pose[lower]=smoothAim(originalLower,pose[lower],endRest,lower);pose[lower].set(C.transform(pose[upper],rest),12);if(!arm)pose[foot].set(C.transform(pose[lower],endRest),12);
  }
  return pose;
 }
 return {vertexBounds,box,brick,contact,boxes,core,nearby,scenery,coreContacts,actorContacts,constrain};
})();
