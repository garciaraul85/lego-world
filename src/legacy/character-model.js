const CharacterModel=(()=>{
'use strict';
const I=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
function matrix(x=0,y=0,z=0,ry=0,rx=0,rz=0,scale=1){const cy=Math.cos(ry),sy=Math.sin(ry),cx=Math.cos(rx),sx=Math.sin(rx),cz=Math.cos(rz),sz=Math.sin(rz);const t=I();t[12]=x;t[13]=y;t[14]=z;const Y=new Float32Array([cy,0,-sy,0,0,1,0,0,sy,0,cy,0,0,0,0,1]),X=new Float32Array([1,0,0,0,0,cx,sx,0,0,-sx,cx,0,0,0,0,1]),Z=new Float32Array([cz,sz,0,0,-sz,cz,0,0,0,0,1,0,0,0,0,1]);const o=mul(mul(mul(t,Y),X),Z);for(let c=0;c<3;c++)for(let r=0;r<3;r++)o[c*4+r]*=scale;return o;}
const norm=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);},rgb=hex=>[1,3,5].map(i=>Math.pow(parseInt(hex.slice(i,i+2),16)/255,1.5));
const pivots={root:[0,0,0],hips:[0,1.78,0],head:[0,3.23,0],leftLeg:[-.39,1.78,0],rightLeg:[.39,1.78,0],leftShin:[-.39,1.035,0],rightShin:[.39,1.035,0],leftFoot:[-.39,.50,0],rightFoot:[.39,.50,0],leftArm:[-.95,2.88,0],rightArm:[.95,2.88,0],leftForearm:[-1.08,2.55,.025],rightForearm:[1.08,2.55,.025]};
const parents={leftShin:'leftLeg',rightShin:'rightLeg',leftFoot:'leftShin',rightFoot:'rightShin',leftForearm:'leftArm',rightForearm:'rightArm'};
const clamp01=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp01(v);return v*v*(3-2*v);};
// Arm and tool timing. The body sequence and limb solver below keep the
// knuckles on the aim line while the hips and torso turn underneath.
const hitKeys=[
 [0,0,0,0,0,-.12,0,0,-.12,0,0],
 [.22,0,0,.40,0,-1.80,-.35,0,-1.00,.02,-.15],
 [.35,0,.02,-1.28,0,-.03,-.35,0,-1.00,.02,1.10],
 [.50,0,.02,-1.31,0,-.025,-.35,0,-1.00,.02,1.45],
 [.70,0,0,.10,0,-1.60,-.25,0,-.85,.01,.60],
 [1,0,0,0,0,-.12,0,0,-.12,0,0]
];
const attackWeight=t=>smooth(t/.10)*(1-smooth((t-.70)/.30));
function hitPose(progress){let a=hitKeys[0],b=hitKeys[1];for(let i=1;i<hitKeys.length;i++)if(progress<=hitKeys[i][0]){a=hitKeys[i-1];b=hitKeys[i];break;}const t=smooth((progress-a[0])/(b[0]-a[0]));return a.slice(1).map((v,i)=>v+(b[i+1]-v)*t);}
// Toe/hip/shoulder sequence from USA Boxing's straight-right reference. The
// pelvis leads the chest; the fist extends on its own line rather than swinging
// sideways with the chest. Contact remains at .18 seconds of the .52s action.
const bodyKeys=[
 [0,0,0,0,0,0,0,0],
 [.16,.10,.035,0,-.02,.07,0,0],
 [.22,.04,.12,0,-.015,.08,0,0],
 [.30,-.24,-.10,-.07,.07,.13,.16,.70],
 [.35,-.30,-.22,-.08,.08,.13,.22,1],
 [.50,-.28,-.25,-.08,.08,.13,.22,1],
 [.70,-.08,-.02,-.02,.02,.07,.06,.10],
 [1,0,0,0,0,0,0,0]
];
function bodyPose(t){let a=bodyKeys[0],b=bodyKeys[1];for(let i=1;i<bodyKeys.length;i++)if(t<=bodyKeys[i][0]){a=bodyKeys[i-1];b=bodyKeys[i];break;}const w=smooth((t-a[0])/(b[0]-a[0]));return a.slice(1).map((v,i)=>v+(b[i+1]-v)*w);}
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((v,x,k)=>v+x*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],scale=(a,s)=>a.map(v=>v*s);
const transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
// Scale the complete articulated figure about its feet. The same transform
// is used for rendered skin, held equipment, effects and compound colliders.
function scaledMatrix(m,s={},p=null){const factor=typeof CharacterCatalog==='undefined'?1:CharacterCatalog.heightScale(p||s.rigContact?.profile);if(factor===1)return m;const out=new Float32Array(m),origin=[s.x||0,s.y||0,s.z||0];for(let k=0;k<3;k++){for(let c=0;c<3;c++)out[c*4+k]*=factor;out[12+k]=origin[k]+(out[12+k]-origin[k])*factor;}return out;}
function effectPose(s={},p=null){p=p||s.rigContact?.profile;const pose=jointPose(s,false,p);return Object.fromEntries(Object.entries(pose).map(([key,m])=>[key,scaledMatrix(m,s,p)]));}
const localPoint=(m,p)=>[0,1,2].map(k=>[0,1,2].reduce((v,j)=>v+m[k*4+j]*(p[j]-m[12+j]),0));
// A pole parallel to a limb used to produce a zero-width bone frame. Select
// a stable perpendicular axis in that case, so no arm/leg can collapse away.
function perpendicular(axis,hint){let v=sub(hint,scale(axis,dot(hint,axis)));if(Math.hypot(...v)<.00001){const k=[0,1,2].sort((a,b)=>Math.abs(axis[a])-Math.abs(axis[b]))[0],fallback=[0,0,0];fallback[k]=1;v=sub(fallback,scale(axis,dot(fallback,axis)));}return norm(v);}
function boneMatrix(origin,rest,direction,right){
 const frame=(d,r)=>{const y=scale(norm(d),-1),x=perpendicular(y,r);return [x,y,cross(x,y)];},a=frame(rest,[1,0,0]),b=frame(direction,right),m=matrix(...origin);
 for(let c=0;c<3;c++)for(let r=0;r<3;r++)m[c*4+r]=b.reduce((v,axis,k)=>v+axis[r]*a[k][c],0);
 return m;
}
function solveLimb(origin,target,upperRest,lowerRest,bend,right,plane=false,lengths=[1,1]){
 const l1=Math.hypot(...upperRest)*lengths[0],l2=Math.hypot(...lowerRest)*lengths[1],delta=sub(target,origin),direction=Math.hypot(...delta)<.00001?norm(add(upperRest,lowerRest)):norm(delta),distance=Math.max(Math.abs(l1-l2)+.0001,Math.min(l1+l2-.0001,Math.hypot(...delta))),along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along)),perp=perpendicular(direction,bend),hinge=add(origin,add(scale(direction,along),scale(perp,height))),end=add(origin,scale(direction,distance));
 const frameRight=plane?norm(cross(direction,perp)):right;
 return [upperRest,lowerRest].map((rest,i)=>{const m=boneMatrix(i?hinge:origin,rest,i?sub(end,hinge):sub(hinge,origin),frameRight),axis=norm(rest),stretch=matrix();for(let c=0;c<3;c++)for(let r=0;r<3;r++)stretch[c*4+r]+=(lengths[i]-1)*axis[c]*axis[r];return mul(m,stretch);});
}
function rotationQuaternion(m){
 const trace=m[0]+m[5]+m[10];let x,y,z,w;
 if(trace>0){const s=Math.sqrt(trace+1)*2;w=s/4;x=(m[6]-m[9])/s;y=(m[8]-m[2])/s;z=(m[1]-m[4])/s;}
 else if(m[0]>m[5]&&m[0]>m[10]){const s=Math.sqrt(1+m[0]-m[5]-m[10])*2;w=(m[6]-m[9])/s;x=s/4;y=(m[4]+m[1])/s;z=(m[8]+m[2])/s;}
 else if(m[5]>m[10]){const s=Math.sqrt(1+m[5]-m[0]-m[10])*2;w=(m[8]-m[2])/s;x=(m[4]+m[1])/s;y=s/4;z=(m[9]+m[6])/s;}
 else{const s=Math.sqrt(1+m[10]-m[0]-m[5])*2;w=(m[1]-m[4])/s;x=(m[8]+m[2])/s;y=(m[9]+m[6])/s;z=s/4;}
 return [x,y,z,w];
}
function blendBone(a,b,t){
 const qa=rotationQuaternion(a),qb=rotationQuaternion(b),sign=dot(qa,qb)<0?-1:1,[x,y,z,w]=norm(qa.map((v,k)=>v*(1-t)+qb[k]*t*sign)),m=matrix(...[12,13,14].map(k=>a[k]*(1-t)+b[k]*t));
 m.set([1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w),0,2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w),0,2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y),0]);return m;
}
// Redirect a bone without choosing a new roll angle. This avoids a half-turn
// quaternion flip when the carrying arm passes from front to back.
function aimBone(bone,rest,direction){
 const a=norm(sub(transform(bone,rest),transform(bone,[0,0,0]))),b=norm(direction),v=cross(a,b),c=dot(a,b),rotation=matrix();
 if(c<-.999999){const axis=perpendicular(a,[1,0,0]);for(let j=0;j<3;j++)for(let i=0;i<3;i++)rotation[j*4+i]=2*axis[i]*axis[j]-(i===j?1:0);}
 else{const k=new Float32Array([0,v[2],-v[1],0,-v[2],0,v[0],0,v[1],-v[0],0,0,0,0,0,0]),kk=mul(k,k);for(let j=0;j<3;j++)for(let i=0;i<3;i++)rotation[j*4+i]+=k[j*4+i]+kk[j*4+i]/(1+c);}
 const out=mul(rotation,bone);out.set(bone.slice(12,15),12);return out;
}
function freeJointPose(state={},neutral=false,profile=null){
 const s={x:0,y:0,z:0,heading:0,speed:0,phase:0,grounded:true,attack:0,vy:0,airTime:0,landing:0,...state};
 const wave=Math.sin(s.phase),motion=neutral?0:clamp01(s.moveBlend??(s.speed>.01?1:0)),run=clamp01(s.runBlend??(s.running?1:0)),swing=wave*(.55+.31*run)*motion;
 // Blended gait weights and rounded knee lifts avoid snaps on start/stop and
 // at each half-stride. The phase continues through walk/run transitions.
 const liftL=Math.max(0,wave)**2,liftR=Math.max(0,-wave)**2;
 const angles={leftLeg:swing,rightLeg:-swing,leftArm:-swing,rightArm:swing,leftShin:neutral?0:.035+motion*(.045+liftL*(.65+.50*run)),rightShin:neutral?0:.035+motion*(.045+liftR*(.65+.50*run)),leftForearm:neutral?0:-.12-motion*(.18+.55*run+liftR*.12),rightForearm:neutral?0:-.12-motion*(.18+.55*run+liftL*.12)};
 let lean=motion*run*.07,twist=0,leftSpread=0,rightSpread=0,attack=null;
 if(!neutral&&!s.grounded){
  const lift=smooth(s.airTime/.12),fall=smooth(-s.vy/9.5),apex=1-Math.min(1,Math.abs(s.vy)/9.5);
  angles.leftLeg=(-.22-.38*apex)*(1-fall*.85)*lift;
  angles.rightLeg=(-.10-.28*apex)*(1-fall*.85)*lift;
  angles.leftShin=(.35+.9*apex)*(1-fall*.80)*lift;
  angles.rightShin=(.28+.72*apex)*(1-fall*.80)*lift;
  angles.leftArm=(-1.65+.75*fall)*lift;angles.rightArm=(-1.50+.60*fall)*lift;
  angles.leftForearm=(-.68+.30*fall)*lift;angles.rightForearm=(-.75+.35*fall)*lift;
  lean=(-.10+.22*fall)*lift;leftSpread=-.22*lift;rightSpread=.22*lift;
 }else if(!neutral&&s.landing>0){
  const squash=Math.sin(clamp01(1-s.landing/.24)*Math.PI),blend=.75*squash;
  for(const key of ['leftLeg','rightLeg'])angles[key]=angles[key]*(1-blend)-.98*squash;
  for(const key of ['leftShin','rightShin'])angles[key]=angles[key]*(1-blend)+1.06*squash;
  angles.leftArm-=.38*squash;angles.rightArm-=.38*squash;lean+=.08*squash;
 }
 // Traveling flight replaces the jump tuck with trailing, softly bent legs.
 // The smoothed cruise weight preserves the original vertical/hover pose.
 if(!neutral&&s.flying){const cruise=clamp01(s.flightCruise||0);for(const [joint,angle] of Object.entries({leftLeg:.06,rightLeg:-.04,leftShin:.07,rightShin:.10}))angles[joint]=angles[joint]*(1-cruise)+angle*cruise;lean*=1-cruise;}
 const weapon=profile&&typeof GameWeapons!=='undefined'?GameWeapons.catalog[profile.held]:null;
 if(!neutral&&s.attack>0&&!weapon){
  const t=clamp01(1-s.attack/.52),a=hitPose(t),blend=attackWeight(t);
  attack={t,blend,body:bodyPose(t)};
  [twist,lean]=[a[0]*blend,lean*(1-blend)+a[1]*blend];
  angles.rightArm=angles.rightArm*(1-blend)+a[2]*blend;rightSpread=rightSpread*(1-blend)+a[3]*blend;angles.rightForearm=angles.rightForearm*(1-blend)+a[4]*blend;
  angles.leftArm=angles.leftArm*(1-blend)+a[5]*blend;leftSpread=leftSpread*(1-blend)+a[6]*blend;angles.leftForearm=angles.leftForearm*(1-blend)+a[7]*blend;
  if(s.grounded){angles.leftLeg-=a[8]*.5*blend;angles.rightLeg-=a[8]*.5*blend;angles.leftShin+=a[8]*blend;angles.rightShin+=a[8]*blend;}
 }
 const build=!neutral&&!attack&&s.grounded?clamp01(s.buildBlend||0):0,workPhase=(s.buildTime||0)*Math.PI*5;
 const world=matrix(s.x,s.y,s.z,s.heading),body=attack?attack.body.map(v=>v*attack.blend):Array(7).fill(0);
 body[0]+=.045*Math.sin(workPhase)*build;body[1]+=.075*Math.sin(workPhase)*build;body[4]+=.12*build;lean=lean*(1-build)+(.20+.025*Math.cos(workPhase*2))*build;
 const [hipTurn,chestTurn,shiftX,shiftZ,crouch,heel,extension]=body;
 const pelvis=mul(matrix(shiftX,1.78-crouch,shiftZ),mul(matrix(-.39,0,0,hipTurn),matrix(.39,0,0))),hips=mul(world,pelvis),bodyBase=mul(pelvis,matrix(0,-1.78,0));
 const root=mul(world,mul(bodyBase,mul(matrix(0,1.92,0,chestTurn+twist,lean),matrix(0,-1.92,0)))),pose={root,hips,head:mul(root,matrix(...pivots.head,-(hipTurn+chestTurn)*.8))};
 for(const name of ['leftLeg','rightLeg','leftArm','rightArm'])pose[name]=mul(name.endsWith('Leg')?mul(hips,matrix(0,-1.78,0)):root,matrix(...pivots[name],0,angles[name],name==='leftArm'?leftSpread:name==='rightArm'?rightSpread:0));
 for(const [name,parent] of Object.entries(parents)){const offset=pivots[name].map((v,k)=>v-pivots[parent][k]);pose[name]=mul(pose[parent],matrix(...offset,0,angles[name]));}
 if(attack&&attack.blend>0){
  const {blend}=attack,right=[world[0],world[1],world[2]],front=[world[8],world[9],world[10]];
  if(s.grounded)for(const side of [-1,1]){
   const leg=side<0?'leftLeg':'rightLeg',shin=side<0?'leftShin':'rightShin',foot=side<0?'leftFoot':'rightFoot',old=pose[foot],ankle=transform(old,[0,0,0]);
   const plantedLocal=matrix(0,0,0,side>0?hipTurn:0,side>0?heel:0),toe=transform(plantedLocal,[0,-.50,.55]);
   plantedLocal[12]=side*(.39+.04*blend)-toe[0];plantedLocal[13]=-toe[1];plantedLocal[14]=-side*.15*blend+.55-toe[2];const planted=mul(world,plantedLocal);
   const target=ankle.map((v,k)=>v*(1-blend)+planted[12+k]*blend),origin=transform(pose[leg],[0,0,0]);
   const solved=solveLimb(origin,target,sub(pivots[shin],pivots[leg]),sub(pivots[foot],pivots[shin]),front,right);
   pose[leg]=blendBone(pose[leg],solved[0],blend);pose[shin]=blendBone(pose[shin],solved[1],blend);
   pose[shin].set(transform(pose[leg],sub(pivots[shin],pivots[leg])),12);
   const actual=transform(pose[shin],sub(pivots[foot],pivots[shin]));
   pose[foot]=blendBone(old,planted,blend);pose[foot].set(actual,12);
  }
  const shoulder=transform(root,pivots.rightArm),aim=transform(world,[1.10-.06*extension,2.72+.09*extension-crouch,.38+1.19*extension]),solved=solveLimb(shoulder,aim,sub(pivots.rightForearm,pivots.rightArm),[.02,-.61,.06],[0,-1,0],right);
  pose.rightArm=blendBone(pose.rightArm,solved[0],blend);pose.rightForearm=blendBone(pose.rightForearm,solved[1],blend);
  pose.rightForearm.set(transform(pose.rightArm,sub(pivots.rightForearm,pivots.rightArm)),12);
  const guardShoulder=transform(root,pivots.leftArm),guard=transform(world,[-.88,3.13-crouch*.2,.45]),guardBones=solveLimb(guardShoulder,guard,sub(pivots.leftForearm,pivots.leftArm),[-.02,-.61,.06],[0,-1,0],right);
  const guardBlend=smooth(attack.t/.18)*(1-smooth((attack.t-.70)/.30));
  pose.leftArm=blendBone(pose.leftArm,guardBones[0],guardBlend);pose.leftForearm=blendBone(pose.leftForearm,guardBones[1],guardBlend);
  pose.leftForearm.set(transform(pose.leftArm,sub(pivots.leftForearm,pivots.leftArm)),12);
 }
 if(build>0){
  const right=[world[0],world[1],world[2]],front=[world[8],world[9],world[10]];
  for(const side of [-1,1]){
   const leg=side<0?'leftLeg':'rightLeg',shin=side<0?'leftShin':'rightShin',foot=side<0?'leftFoot':'rightFoot',planted=mul(world,matrix(...pivots[foot]));
   const legs=solveLimb(transform(pose[leg],[0,0,0]),transform(planted,[0,0,0]),sub(pivots[shin],pivots[leg]),sub(pivots[foot],pivots[shin]),front,right);
   pose[leg]=blendBone(pose[leg],legs[0],build);pose[shin]=blendBone(pose[shin],legs[1],build);pose[shin].set(transform(pose[leg],sub(pivots[shin],pivots[leg])),12);
   pose[foot]=blendBone(pose[foot],planted,build);pose[foot].set(transform(pose[shin],sub(pivots[foot],pivots[shin])),12);
   // Alternating scoop, reach and press; bend the elbows instead of flapping
   // rigid arms. Work in front of the waist, with the torso following each hand.
   const arm=side<0?'leftArm':'rightArm',forearm=side<0?'leftForearm':'rightForearm',cycle=workPhase+(side>0?Math.PI:0),grip=[side*.02,-.61,.06],target=transform(world,[side*(.78+.06*Math.cos(cycle)),2.24+.17*Math.sin(cycle),.70+.19*Math.cos(cycle)]),arms=solveLimb(transform(root,pivots[arm]),target,sub(pivots[forearm],pivots[arm]),grip,[0,-1,0],right);
   pose[arm]=blendBone(pose[arm],arms[0],build);pose[forearm]=blendBone(pose[forearm],arms[1],build);pose[forearm].set(transform(pose[arm],sub(pivots[forearm],pivots[arm])),12);
  }
  pose.head=mul(root,matrix(...pivots.head,-(hipTurn+chestTurn)*.8,.10*build));
 }
 if(s.grounded&&!neutral){let floor=Infinity;for(const name of ['leftFoot','rightFoot'])for(const z of [-.36,.55]){const m=pose[name];floor=Math.min(floor,m[5]*(-pivots[name][1])+m[9]*z+m[13]);}const correction=floor-s.y;for(const m of Object.values(pose))m[13]-=correction;}
 if(weapon?.bodyClearance&&neutral){
  const equipped=combatPose(Object.fromEntries(Object.entries(pose).map(([k,m])=>[k,new Float32Array(m)])),{...s,attack:0,buildBlend:0},weapon,profile);
  for(const joint of ['rightArm','rightForearm','leftArm','leftForearm'])pose[joint]=equipped[joint];return pose;
 }
 if(!weapon||neutral)return pose;
 const buildWeight=weaponBuild(s);if(buildWeight>=1)return pose;
 const base=pose,combat=combatPose(Object.fromEntries(Object.entries(pose).map(([k,m])=>[k,new Float32Array(m)])),s,weapon,profile);
 if(buildWeight===0)return combat;
 const factors=weaponArmLengths(weapon,profile),mix=1-buildWeight;
 for(const joint of Object.keys(base)){const side=joint.startsWith('left')?-1:1,arm=joint.endsWith('Arm'),forearm=joint.endsWith('Forearm'),rest=arm?sub(pivots[side<0?'leftForearm':'rightForearm'],pivots[joint]):forearm?handGrip(side):null;
  const sideFactors=weaponArmLengths(weapon,profile,side),sideLength=arm?sideFactors[0]:forearm?sideFactors[1]:1;
  const unscaled=rest?mul(combat[joint],stretchBone(rest,1/sideLength)):combat[joint];
  base[joint]=blendBone(base[joint],unscaled,mix);if(rest)base[joint]=mul(base[joint],stretchBone(rest,1+(sideLength-1)*mix));
 }
 for(const [child,parent] of Object.entries(parents))base[child].set(transform(base[parent],sub(pivots[child],pivots[parent])),12);
 const follow=.30*smooth(buildWeight/.08)*(1-smooth((buildWeight-.35)/.30)),path=stowPath(s,weapon,base.root,buildWeight,profile),grip=transform(path,weaponGrip),existing=transform(base.rightForearm,handGrip(1)),target=existing.map((v,k)=>v+(grip[k]-v)*follow),lengths=factors.map(v=>1+(v-1)*mix),origin=transform(base.rightArm,[0,0,0]),down=sub(transform(world,[0,-1,0]),[s.x,s.y,s.z]),bend=down,right=[world[0],world[1],world[2]],bones=solveLimb(origin,target,sub(pivots.rightForearm,pivots.rightArm),handGrip(1),bend,right,true,lengths);
 for(const [i,joint] of ['rightArm','rightForearm'].entries()){const rest=i?handGrip(1):sub(pivots.rightForearm,pivots.rightArm),old=norm(sub(transform(base[joint],rest),transform(base[joint],[0,0,0]))),aim=norm(i?sub(transform(bones[1],handGrip(1)),transform(bones[1],[0,0,0])):sub(transform(bones[1],[0,0,0]),origin));base[joint]=aimBone(base[joint],rest,old.map((v,k)=>v+(aim[k]-v)*follow));}
 base.rightForearm.set(transform(base.rightArm,sub(pivots.rightForearm,pivots.rightArm)),12);
 return base;
}
function jointPose(s={},neutral=false,profile=null){
 if(!neutral&&s.studioPose&&!s.rigContact&&typeof StudioMotion!=='undefined')return StudioMotion.pose(s,profile);
 profile=profile||s.rigContact?.profile||null;
 const powered=!neutral&&(s.heroAction||s.flying||s.climbing),pose=freeJointPose(s,neutral,powered?{...profile,held:'None'}:profile);
 if(powered&&(s.heroAction!=='Claws'||s.flying))heroJointPose(pose,s);
 if(!neutral&&s.rigContact)RigCollision.constrain(pose,s,powered?{...profile,held:'None'}:profile,s.rigContact);
 return pose;
}
// Connected IK poses layer over movement and are constrained by the same rig.
function heroJointPose(pose,s){
 const world=matrix(s.x,s.y,s.z,s.heading),right=[world[0],world[1],world[2]],front=[world[8],world[9],world[10]],t=1-(s.heroTime||0)/(s.heroDuration||1),weight=s.heroAction&&!s.flying?Math.sin(Math.PI*Math.min(1,t))**2:1;
 const cruise=s.flying?clamp01(s.flightCruise||0):0;
 let lean=s.flying?.28+1.04*cruise-(s.flightTilt||0)*.7:s.climbing?.10:s.heroAction==='Strength'?.20*weight:s.heroAction==='Claws'?.13*weight:0;
 const turn=s.heroAction==='Claws'?.24*Math.sin(t*Math.PI*2):s.heroAction==='Strength'?-.12*weight:0;
 // Use an exact inverse of the world transform; translations rotate too.
 const inv=matrix(0,0,0,-s.heading);inv[12]=-dot([inv[0],inv[4],inv[8]],[s.x,s.y,s.z]);inv[13]=-s.y;inv[14]=-dot([inv[2],inv[6],inv[10]],[s.x,s.y,s.z]);
 const crouch=s.heroAction==='Strength'&&s.grounded?.50*weight:0,body=mul(world,mul(matrix(0,1.92-crouch,0,turn,lean),mul(matrix(0,-1.92,0),inv)));
 for(const joint of Object.keys(pose))pose[joint]=mul(body,pose[joint]);
 if(s.flying)pose.head=mul(pose.head,matrix(0,0,0,0,-.85*cruise));
 for(const side of [-1,1]){
  const arm=side<0?'leftArm':'rightArm',forearm=side<0?'leftForearm':'rightForearm';let local=null,bend=[side*.5,-1,-.3];
  if(s.flying)local=side>0?[1.08,3.6,1.05]:[-1.08,2.15,-.2];
  else if(s.climbing){const phase=s.phase*1.7+(side>0?Math.PI:0);local=[side*.95,3.10+.55*Math.sin(phase),.85];bend=[side*.8,-.3,0];}
  else if(s.heroAction==='Strength')local=[side*.93,2.45+1.4*Math.cos(Math.min(1,t/.62)*Math.PI),.7+.20*Math.sin(t*Math.PI)];
  else if(s.heroAction==='Claws'){const progress=Math.max(0,Math.min(1,(t-(side<0?.15:0))/.55));local=[side*(1.1-.2*Math.sin(progress*Math.PI)),2.6+.45*Math.sin(progress*Math.PI),.35+1.25*Math.sin(progress*Math.PI)];}
  else if(s.heroAction==='Read minds')local=side>0?[.78,3.85,.15]:[-1.06,2.3,.25];
  else if(['Telekinesis','Energy constructs'].includes(s.heroAction))local=[side*1.08,3.25,.75];
  if(local){let target=transform(world,local),pole=sub(transform(world,bend),[s.x,s.y,s.z]),armRight=right;
   if(s.flying){
    // Travel targets share the torso frame, so the hand leads the body instead
    // of staying pinned above a horizontal shoulder in world space.
    const travelLocal=side>0?[1.06,3.82,.28]:[-1.08,2.02,-.10],travelTarget=transform(pose.root,travelLocal);
    target=target.map((v,k)=>v+(travelTarget[k]-v)*cruise);
    const travelPole=sub(transform(pose.root,[side*.5,-1,-.3]),transform(pose.root,[0,0,0]));pole=pole.map((v,k)=>v+(travelPole[k]-v)*cruise);armRight=norm(right.map((v,k)=>v+(pose.root[k]-v)*cruise));
   }
   if(s.flying&&s.attack>0&&(!s.attackWeapon||s.attackWeapon==='None'||s.heroAction==='Claws')){
    const progress=clamp01(1-s.attack/.52),strike=attackWeight(progress),extension=bodyPose(progress)[6],aim=transform(world,side>0?[1.10,2.48,.52+1.62*extension]:[-1.05,2.65,.72]);
    target=target.map((v,k)=>v+(aim[k]-v)*strike);const guardPole=sub(transform(world,[side*.45,-1,-.25]),[s.x,s.y,s.z]);pole=pole.map((v,k)=>v+(guardPole[k]-v)*strike);
   }
   const solved=solveLimb(transform(pose.root,pivots[arm]),target,sub(pivots[forearm],pivots[arm]),handGrip(side),pole,armRight);pose[arm]=blendBone(pose[arm],solved[0],weight);pose[forearm]=blendBone(pose[forearm],solved[1],weight);pose[forearm].set(transform(pose[arm],sub(pivots[forearm],pivots[arm])),12);}
 }
 if(crouch>0)for(const side of [-1,1]){const leg=side<0?'leftLeg':'rightLeg',shin=side<0?'leftShin':'rightShin',foot=side<0?'leftFoot':'rightFoot',planted=mul(world,matrix(...pivots[foot])),solved=solveLimb(transform(pose[leg],[0,0,0]),transform(planted,[0,0,0]),sub(pivots[shin],pivots[leg]),sub(pivots[foot],pivots[shin]),front,right);pose[leg]=solved[0];pose[shin]=solved[1];pose[shin].set(transform(pose[leg],sub(pivots[shin],pivots[leg])),12);pose[foot]=planted;pose[foot].set(transform(pose[shin],sub(pivots[foot],pivots[shin])),12);}
 if(s.climbing)for(const side of [-1,1]){const leg=side<0?'leftLeg':'rightLeg',shin=side<0?'leftShin':'rightShin',foot=side<0?'leftFoot':'rightFoot',phase=s.phase*1.7+(side>0?0:Math.PI),target=transform(world,[side*.39,.6+.45*(1+Math.sin(phase)),.25]),solved=solveLimb(transform(pose[leg],[0,0,0]),target,sub(pivots[shin],pivots[leg]),sub(pivots[foot],pivots[shin]),front,right);pose[leg]=solved[0];pose[shin]=solved[1];pose[shin].set(transform(pose[leg],sub(pivots[shin],pivots[leg])),12);pose[foot]=mul(world,matrix());pose[foot].set(transform(pose[shin],sub(pivots[foot],pivots[shin])),12);}
 return pose;
}
// Continuous windup / contact / follow-through curves, driven by the same
// duration as collision. IK preserves connected elbows and keeps both grips on
// long weapons. Movement and jump poses remain underneath the action.
function combatMotion(s,w){
 const t=clamp01(1-(s.attack||0)/(s.attackDuration||w.duration)),active=s.attack>0;
 const reload=s.reload>0?clamp01(1-s.reload/s.reloadDuration):0,load=s.reload>0?Math.sin(Math.PI*reload)**2:0;
 if(w.style!=='fire'){
  const v=GameWeapons.motion(w,active?t:1),swing=active?smooth(t/.12)*(1-smooth((t-.78)/.22)):0;
  const since=s.attackImpact===undefined?0:Math.max(0,t-s.attackImpact),bounce=active&&s.attackImpact!==undefined?Math.sin(Math.min(1,since/.15)*Math.PI)*Math.exp(-since*9)*Math.min(.17,w.mass*.04):0;
  if(w.impactResponse){
   const r=w.impactResponse,u=clamp01(since*w.duration/r.duration),response=active&&s.attackImpact!==undefined?Math.sin(Math.PI*u)**2*(1-u):0;
   // Zero velocity at either end prevents a jerk when contact is registered
   // or the recoil ends. The whole body absorbs the hit, not just the wrist.
   v[1]+=r.lift*response;v[2]-=r.retract*response;v[4]-=r.pitch*response;
   v[6]+=r.hip*response;v[7]+=r.chest*response;v[8]+=r.lean*response;v[9]+=r.crouch*response;
   return {t,swing,grip:v.slice(0,3),yaw:v[3],pitch:v[4],roll:v[5],hip:v[6],chest:v[7],lean:v[8],crouch:v[9],recoil:0,load,reload};
  }
  return {t,swing,grip:v.slice(0,3),yaw:v[3],pitch:v[4]-bounce,roll:v[5],hip:v[6],chest:v[7],lean:v[8],crouch:v[9],recoil:0,load,reload};
 }
 const recoil=s.weaponRecoil===undefined?(active?Math.sin(Math.PI*clamp01(t/.34))*(1-smooth((t-.34)/.66)):0):Math.max(0,s.weaponRecoil)*8;
 const dip={magazine:.55,cylinder:.35,shells:.20,ramrod:-.90,powder:-.30}[w.reloadStyle]??.55,roll={magazine:-.06,cylinder:-.24,shells:.16,ramrod:-.08,powder:-.18}[w.reloadStyle]??-.06;
 return {t,swing:0,recoil,load,reload,yaw:0,pitch:-recoil*(.11+(1-w.brace)*.09)+dip*load,roll:roll*load};
}
const weaponGrip=[.02,-.61,.315];
const handGrip=side=>[-side*.03,-.61,.06];
const weaponBuild=s=>s.attack>0||s.reload>0?0:smooth(s.buildBlend??(s.building?1:0));
function weaponArmLengths(w,profile=null,side=1){
 if(w.armLengths){const wide=profile?.cape==='Poncho'||profile?.outfit==='Dress'&&['Ball gown','Wedding'].includes(profile.dress),chest=profile?.gender==='Female'&&!['Printed','Comic'].includes(profile.breastMode)?(profile.breastSize||0)/100:0;return w.armLengths.map((v,k)=>v+(wide?.20:0)+chest*(k?.25:.35));}
 if(w.style==='fire')return [2.35+(profile?.gender==='Female'&&!['Printed','Comic'].includes(profile.breastMode)?(profile.breastSize||0)/100*.45:0),1.60+(profile?.gender==='Female'&&!['Printed','Comic'].includes(profile.breastMode)?(profile.breastSize||0)/100*.18:0)];
 return w.twoHand?[1.50,1.55]:[1.15,1.12];
}
function stretchBone(rest,length){const axis=norm(rest),m=matrix();for(let c=0;c<3;c++)for(let r=0;r<3;r++)m[c*4+r]+=(length-1)*axis[c]*axis[r];return m;}
function stowPath(s,w,root,b,profile=null){
 const free={...s,building:false,buildBlend:0},name=Object.keys(GameWeapons.catalog).find(k=>GameWeapons.catalog[k]===w),combat=jointPose(free,false,profile||{held:name});
 const held=w.handDriven?handDrivenTool(combat,s,w,profile):toolMatrix(transform(combat.rightForearm,handGrip(1)),s,w,combatMotion(s,w)),long=w.long||w.twoHand||Math.abs(w.tip||0)>1.5,fire=w.style==='fire',wide=profile?.cape==='Poncho'||profile?.outfit==='Dress'&&['Ball gown','Wedding'].includes(profile.dress),location=w.bodyClearance?[wide?1.80:1.50,2.15,-.65]:long?[.52,fire?2.90:2.18,-.92]:[.94,1.98,-.50],stored=mul(mul(root,matrix(...location,fire?.10:long?0:Math.PI/2,fire?Math.PI/2:long?0:.25,long?-.25:Math.PI)),matrix(...weaponGrip.map(v=>-v))),path=blendBone(held,stored,b),arc=Math.sin(Math.PI*b);
 const outward=transform(matrix(0,0,0,s.heading),[(w.stowArc??.80)*arc,.35*arc,0]);for(let k=0;k<3;k++)path[12+k]+=outward[k];return path;
}
function rigidAttachment(bone,anchor,rest,length){const axis=norm(rest),undo=matrix();for(let c=0;c<3;c++)for(let r=0;r<3;r++)undo[c*4+r]+=(1/length-1)*axis[c]*axis[r];return mul(bone,mul(matrix(...anchor),mul(undo,matrix(...anchor.map(v=>-v)))));}
function rigidHand(bone,side,length){return rigidAttachment(bone,handGrip(side),handGrip(side),length);}
function relativeTransform(parent,child){const out=matrix(...localPoint(parent,Array.from(child.slice(12,15))));for(let c=0;c<3;c++)for(let r=0;r<3;r++)out[c*4+r]=[0,1,2].reduce((v,k)=>v+parent[r*4+k]*child[c*4+k],0);return out;}
function axisRotation(axis,angle){const out=matrix(),c=Math.cos(angle),s=Math.sin(angle);for(let j=0;j<3;j++){const v=[0,0,0];v[j]=1;out.set(add(add(scale(v,c),scale(cross(axis,v),s)),scale(axis,dot(axis,v)*(1-c))),j*4);}return out;}
function alignForearm(pose,s,w,profile,t){
 const bone=pose.rightForearm,origin=Array.from(bone.slice(12,15)),base=rigidHand(bone,1,weaponArmLengths(w,profile)[1]),axis=norm(sub(transform(base,handGrip(1)),origin)),right=Array.from(pose.root.slice(0,3)),a=perpendicular(axis,Array.from(base.slice(8,11))),b=perpendicular(axis,cross(right,scale(axis,-1))),neutral=Math.atan2(dot(axis,cross(a,b)),dot(a,b)),roll=GameWeapons.motion({frames:w.forearmRollFrames,continuous:true},t)[0];
 pose.rightForearm=mul(matrix(...origin),mul(axisRotation(axis,neutral+roll),mul(matrix(...origin.map(v=>-v)),bone)));
}
function weaponHandMatrix(pose,s,w,profile){
 const bone=pose.rightForearm,anchor=handGrip(1),length=w.forearmRollFrames?Math.hypot(...sub(transform(bone,anchor),Array.from(bone.slice(12,15))))/Math.hypot(...anchor):weaponArmLengths(w,profile)[1],base=rigidHand(bone,1,length),center=transform(base,anchor),y=norm(Array.from(base.slice(4,7))),right=w.fullBodyRig?Array.from(pose.root.slice(0,3)):transform(matrix(0,0,0,s.heading||0),[1,0,0]),x=perpendicular(y,right),z=cross(x,y),frame=matrix(...center);
 frame.set(x,0);frame.set(y,4);frame.set(z,8);
 const t=s.attack>0?clamp01(1-s.attack/(s.attackDuration||w.duration)):1,value=GameWeapons.motion({frames:w.wristFrames,continuous:true},t)[0],wrist=w.wristLimit?Math.max(-w.wristLimit,Math.min(w.wristLimit,value)):value;
 if(w.forearmRollFrames)return mul(base,mul(matrix(...handGrip(1)),mul(matrix(0,0,0,0,wrist),matrix(...handGrip(1).map(v=>-v)))));
 return mul(frame,mul(matrix(0,0,0,0,wrist),matrix(...handGrip(1).map(v=>-v))));
}
function handDrivenTool(pose,s,w,profile){return mul(weaponHandMatrix(pose,s,w,profile),mul(matrix(...handGrip(1),0,Math.PI/2),matrix(...weaponGrip.map(v=>-v))));}
function toolMatrix(hand,s,w,m){return mul(matrix(...hand,(s.heading||0)+m.yaw,m.pitch,m.roll),matrix(...[1.10,1.94,.34].map((v,k)=>pivots.rightForearm[k]-v)));}
function combatPose(pose,s,w,profile=null){
 const m=combatMotion(s,w),world=matrix(s.x,s.y,s.z,s.heading),fire=w.style==='fire',twoHand=w.twoHand||fire&&w.long,turn=twoHand?Math.max(-.25,Math.min(.25,fire?.25:m.hip+m.chest)):fire?-.10:m.hip+m.chest,crouch=fire?m.recoil*.016:m.crouch;
 const oldHips=pose.hips,spine=w.fullBodyRig?relativeTransform(oldHips,pose.root):null;
 pose.hips=mul(oldHips,matrix(0,-crouch,0,fire?-.04:m.hip));
 // Pelvis -> spine -> shoulders -> articulated arms -> wrist -> held object.
 // Turning the pelvis now carries every upper-body descendant with it.
 const root=w.fullBodyRig?mul(pose.hips,mul(spine,mul(matrix(0,2.45,0,m.chest,m.lean),matrix(0,-2.45,0)))):mul(pose.root,mul(matrix(0,2.0,0,turn,fire?m.recoil*(.03+w.brace*.025):m.lean),matrix(0,-2.0-crouch,0)));
 pose.root=root;pose.head=mul(root,matrix(...pivots.head,-turn,.025*m.load));
 if(w.bodyClearance&&s.grounded){const toe=[0,-pivots.rightFoot[1],.55],pivot=matrix(...toe,m.hip*.65,.15*m.swing);pose.rightFoot=mul(pose.rightFoot,mul(pivot,matrix(...toe.map(v=>-v))));}
 const right=[world[0],world[1],world[2]],front=[world[8],world[9],world[10]];
 for(const side of [-1,1]){const leg=side<0?'leftLeg':'rightLeg',shin=side<0?'leftShin':'rightShin',foot=side<0?'leftFoot':'rightFoot',origin=transform(pose.hips,[side*.39,0,0]),target=[pose[foot][12],pose[foot][13],pose[foot][14]],bones=solveLimb(origin,target,sub(pivots[shin],pivots[leg]),sub(pivots[foot],pivots[shin]),front,right);pose[leg]=bones[0];pose[shin]=bones[1];pose[shin].set(transform(pose[leg],sub(pivots[shin],pivots[leg])),12);pose[foot].set(transform(pose[shin],sub(pivots[foot],pivots[shin])),12);}
 const chest=profile?.gender==='Female'&&!['Printed','Comic'].includes(profile.breastMode)?(profile.breastSize||0)/100*.32:0;
 const carry=clamp01(s.moveBlend??(s.speed>.01?1:0))*(1-m.swing),stridePhase=s.phase||0,airLift=s.grounded?smooth((s.landing||0)/.24):smooth((s.airTime||0)/.12);
 const rightLocal=fire?[(w.long?.08:w.twoHand?.10:.79)*(1-m.load)+.25*m.load,2.64-m.load*.30-crouch,(w.long?.90:w.twoHand?.92:.89)+chest+.18*m.load-m.recoil*(.06+w.brace*.05)]:m.grip.map((v,k)=>k===1?v-crouch:k===2&&twoHand?Math.max(.69,v):v);
 // Let the carrying arm absorb each stride and ease into the airborne guard.
 if(w.bodyClearance){rightLocal[1]+=.06*Math.sin(stridePhase)*carry+.10*airLift;}
 let hand=transform(fire||w.bodyClearance?root:world,rightLocal);
 const support=fire?(w.long?[0,.10,.40]:[-.10,-.04,-.03]):[0,w.support??-.18,0];
 // Open the articulated arms along their length without widening them. The
 // original short toy arms cannot meet in front of the chest with two grips.
 // Hands keep a rigid transform below, so the C grips never stretch.
 const armLengths=weaponArmLengths(w,profile);
 const rotation=w.fullBodyRig?mul(root,matrix(0,0,0,m.yaw,m.pitch,m.roll)):matrix(0,0,0,(s.heading||0)+m.yaw,m.pitch,m.roll);rotation[12]=rotation[13]=rotation[14]=0;const shoulders=[transform(root,pivots.rightArm),transform(root,pivots.leftArm)],length=Math.hypot(...sub(pivots.rightForearm,pivots.rightArm))*armLengths[0]+Math.hypot(...handGrip(1))*armLengths[1]-.07;
 if(w.bodyClearance){
  // Keep the weapon head and handle clear along the authored diagonal.
  // Move forward only where the club overlaps a body volume; forcing every
  // frame outside the body's side used to turn the strike into an arm flap.
  const p=localPoint(root,hand);p[2]+=chest+(profile?.cape==='Poncho'?.10:0);p[2]=Math.max(p[2],.83+chest+.04*(1+Math.cos(stridePhase))*carry);const axis=localPoint(root,add(transform(root,[0,0,0]),transform(rotation,[0,1,0]))),wide=profile?.outfit==='Dress'&&['Ball gown','Wedding'].includes(profile.dress),armor=profile?.outfit==='Armor',poncho=profile?.cape==='Poncho';let forward=0;
  for(const [along,radius] of (w.clearanceSamples||[[ -.30,.17],[0,.16],[.20,.16],[.40,.20],[.64,.31],[.80,.41],[1.04,.34],[w.tip,.41]])){
   // A broad hammer head is a box, not a sphere. Project its half extents
   // into the body frame so its wide sides do not inflate its vertical reach.
   const extents=Array.isArray(radius)?[0,1,2].map(k=>radius.reduce((v,r,j)=>v+r*Math.abs([0,1,2].reduce((d,i)=>d+root[k*4+i]*rotation[j*4+i],0)),0)):[radius,radius,radius];
   const a=add(p,scale(axis,along)),volumes=[[1.92,3.16,poncho?1.04:armor?.90:.81,(poncho?.54:armor?.48:.44)+chest],[3.23,4.39,.64,.64],[.0,1.92,.79,.57]];
   if(profile?.outfit==='Dress')volumes.push([.30,1.95,wide?1.25:.88,wide?.78:.51]);
   for(const [bottom,top,width,depth] of volumes){const weight=smooth((width+extents[0]+.04-Math.abs(a[0]))/.14)*smooth((a[1]-bottom+extents[1]+.06)/.14)*(1-smooth((a[1]-top-extents[1]-.02)/.14));forward=Math.max(forward,(depth+extents[2]+.06-a[2])*weight);}
  }
  p[2]+=Math.max(0,forward);hand=transform(root,p);
 }
 let supportOffset=transform(rotation,support);
 const cycle=Math.sin(m.reload*Math.PI*6)*m.load,reloadOffset=w.reloadStyle==='ramrod'?[-.16,.54+.20*cycle,.66]:w.reloadStyle==='shells'?[-.12,-.18-.18*cycle,.37]:w.reloadStyle==='cylinder'?[-.22,.22,.21]:w.reloadStyle==='powder'?[-.20,.32,.34]:[0,-.10*m.load-.10,.20];
 if(fire&&s.reload>0&&twoHand){const work=transform(rotation,reloadOffset);supportOffset=supportOffset.map((v,k)=>v+(work[k]-v)*m.load);}
 // Keep grips in front of the actual torso, rather than solving a reachable
 // hand position through the shirt. The fade at the side/top preserves swings.
 const clearTorso=target=>{const p=localPoint(root,target),edge=profile?.outfit==='Armor'?.90:.81,weight=smooth((edge+.24-Math.abs(p[0]))/.20)*smooth((p[1]-1.60)/.20)*(1-smooth((p[1]-3.16)/.20)),depth=.72+chest,shift=Math.max(0,depth-p[2])*weight;return add(target,scale([root[8],root[9],root[10]],shift));};
 // Project the desired grip into both arms' reach, then solve the elbows.
 // The second hand follows the actual handle, even at the top of a swing.
 if(fire||twoHand)for(let i=0;i<48;i++){
  if(fire)hand=clearTorso(hand);if(fire&&twoHand)hand=sub(clearTorso(add(hand,supportOffset)),supportOffset);
  for(const center of twoHand?[sub(shoulders[1],supportOffset),shoulders[0]]:[shoulders[0]]){const delta=sub(hand,center),distance=Math.hypot(...delta);if(distance>length)hand=add(center,scale(delta,length/distance));}
 }
 // A lifted, outward elbow coils with the shoulder; it drops as the grip
 // crosses the target. A rearward pole avoids flips near the forward grip.
 const elbowGuide=w.elbowFrames?GameWeapons.motion({frames:w.elbowFrames,continuous:true},s.attack>0?m.t:1):null;
 if(elbowGuide)elbowGuide[1]+=.045*Math.sin(stridePhase-.7)*carry+.10*airLift;
 const solveArm=(side,target)=>{const arm=side<0?'leftArm':'rightArm',forearm=side<0?'leftForearm':'rightForearm',solved=solveLimb(transform(root,pivots[arm]),target,sub(pivots[forearm],pivots[arm]),handGrip(side),fire?sub(transform(root,[side*1.2,-.45,2.1]),transform(root,[0,0,0])):w.bodyClearance?sub(transform(root,side>0?sub(elbowGuide,pivots.rightArm):[-.65,-1,-.20]),transform(root,[0,0,0])):sub(transform(side<0&&!twoHand?world:root,[side*.75,-.35,-.35]),transform(side<0&&!twoHand?world:root,[0,0,0])),right,true,weaponArmLengths(w,profile,side));pose[arm]=solved[0];pose[forearm]=solved[1];pose[forearm].set(transform(pose[arm],sub(pivots[forearm],pivots[arm])),12);};
 {const delta=sub(hand,shoulders[0]),d=Math.hypot(...delta),r=Math.max(.56,Math.min(length,d));hand=add(shoulders[0],scale(delta,r/Math.max(.001,d)));}
 solveArm(1,hand);hand=transform(pose.rightForearm,handGrip(1));
 let leftTarget;
 if(twoHand)leftTarget=add(hand,supportOffset);
 else if(w.guardFrames){const guard=GameWeapons.motion({frames:w.guardFrames,continuous:true},s.attack>0?m.t:1),stride=carry,phase=stridePhase;guard[1]+=.045*Math.sin(phase)*stride+.08*airLift;guard[2]+=chest+.25+.07*Math.cos(phase)*stride;leftTarget=transform(root,guard);}
 else leftTarget=transform(fire?root:world,fire?[-.82,2.65,.78+chest]:[-.84,2.18-crouch,.92]);
 if(fire&&s.reload>0&&!twoHand){
  const work=add(hand,transform(rotation,reloadOffset));leftTarget=leftTarget.map((v,k)=>v+(work[k]-v)*m.load);
 }
 if(fire)for(let i=0;i<12;i++){leftTarget=clearTorso(leftTarget);const delta=sub(leftTarget,shoulders[1]),d=Math.hypot(...delta);if(d>length)leftTarget=add(shoulders[1],scale(delta,length/d));}
 {const leftLengths=weaponArmLengths(w,profile,-1),leftReach=Math.hypot(...sub(pivots.leftForearm,pivots.leftArm))*leftLengths[0]+Math.hypot(...handGrip(-1))*leftLengths[1]-.07,delta=sub(leftTarget,shoulders[1]),d=Math.hypot(...delta),r=Math.max(.56,Math.min(leftReach,d));leftTarget=add(shoulders[1],scale(delta,r/Math.max(.001,d)));}
 solveArm(-1,leftTarget);
 if(w.forearmRollFrames)alignForearm(pose,s,w,profile,s.attack>0?m.t:1);
 return pose;
}
function heldPose(pose,state,profile,neutral=false){
 const weapon=typeof GameWeapons!=='undefined'?GameWeapons.catalog[profile.held]:null;
 const build=weaponBuild(state);
 if(weapon&&!neutral&&build>0){
  const s={x:0,y:0,z:0,heading:0,...state},path=stowPath(s,weapon,pose.root,build,profile),carry=1-smooth((build-.35)/.30),grip=transform(path,weaponGrip),hand=transform(pose.rightForearm,handGrip(1));
  for(let k=0;k<3;k++)path[12+k]+=(hand[k]-grip[k])*carry;return weapon.handDriven?blendBone(handDrivenTool(pose,state,weapon,profile),path,1-carry):path;
 }
 if(weapon?.handDriven)return handDrivenTool(pose,state,weapon,profile);
 if(weapon&&!neutral){const m=combatMotion(state,weapon);return toolMatrix(transform(pose.rightForearm,handGrip(1)),state,weapon,m);}
 if(weapon&&neutral)return weapon.bodyClearance?toolMatrix(transform(pose.rightForearm,handGrip(1)),state,weapon,combatMotion({...state,attack:0},weapon)):mul(pose.rightForearm,matrix(...sub(handGrip(1),weaponGrip)));
 const arm=pose.rightForearm;if(neutral||!state.attack||!['Hammer','Sword','Wrench','Shovel','Wand'].includes(profile.held))return arm;
 const t=clamp01(1-state.attack/.52),a=hitPose(t),root=pose.root;
 const armY=[arm[4],arm[5],arm[6]],up=armY.reduce((v,x,k)=>v+x*root[4+k],0),forward=armY.reduce((v,x,k)=>v+x*root[8+k],0);
 const tilt=Math.atan2(forward,up),wrist=(a[9]-tilt)*attackWeight(t),grip=[1.10,1.94,.34].map((v,k)=>v-pivots.rightForearm[k]);
 return mul(arm,mul(matrix(...grip,0,wrist),matrix(...grip.map(v=>-v))));
}
function strikePoints(profile,state){const w=GameWeapons.get(profile.held),pose=jointPose(state,false,profile),held=scaledMatrix(heldPose(pose,state,profile),state,profile);return [w.tip*(w.edge?.24:.65),w.tip].map(y=>transform(held,[.02,-.61+y,.315]));}
function create(gl,fragment,onDirty=()=>{}){
 const vertex='attribute vec3 aPosition;attribute vec3 aNormal;attribute vec2 aUV;varying vec2 vUV;uniform mat4 uMVP;uniform mat4 uModel;uniform vec3 uColor;varying vec3 vNormal;varying vec3 vPosition;varying vec3 vColor;void main(){vUV=aUV;vPosition=(uModel*vec4(aPosition,1.0)).xyz;vNormal=mat3(uModel)*aNormal;vColor=uColor;gl_Position=uMVP*vec4(vPosition,1.0);}';
 function shader(type,s){const h=gl.createShader(type);gl.shaderSource(h,s);gl.compileShader(h);if(!gl.getShaderParameter(h,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(h));return h;}
 const paintedFragment=fragment.replace('void main(){','varying vec2 vUV;uniform sampler2D uTexture;uniform float uPaint;void main(){').replace('vec3 base=mix(vColor,','vec4 decal=texture2D(uTexture,vUV);vec3 material=mix(vColor,pow(decal.rgb,vec3(1.5)),decal.a*uPaint);vec3 base=mix(material,')
  .replace('65.0','48.0').replace('spec*0.38','spec*0.23*(1.0-decal.a*uPaint*0.55)').replace('d2*0.15','d2*0.20');
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,paintedFragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Character shader failed.');
 const U={};for(const key of ['MVP','Model','Color','Eye','Alpha','Floor','Flat','Light','Ambient','Fog','FogRange','Snow','Night','Particle','Texture','Paint'])U[key]=gl.getUniformLocation(program,'u'+key);const P=gl.getAttribLocation(program,'aPosition'),N=gl.getAttribLocation(program,'aNormal'),A=gl.getAttribLocation(program,'aUV');
 let geometry=new Map(),current=null,compiled=[],signature='',v=[],n=[],headShape='Classic',paintSlot='torso',profile=null;const cache=new Map(),profileCache=new WeakMap(),textureCache=new Map();
 const fallback=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,fallback);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,0]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
 let livePaint=null,liveTexture=null;
 function uploadCanvas(canvas,t=null){t=t||gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);const pixels=canvas.getContext('2d').getImageData(0,0,384,256).data;gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,384,256,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.NEAREST);for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);return t;}
 function setLivePaint(slot,canvas=null){livePaint=slot&&canvas?{slot,canvas,dirty:true}:null;onDirty();}
 function cachePaint(data,canvas){if(!data)return;const old=textureCache.get(data);if(old&&old!==fallback)gl.deleteTexture(old);textureCache.set(data,uploadCanvas(canvas));if(textureCache.size>80){const key=textureCache.keys().next().value,t=textureCache.get(key);textureCache.delete(key);if(t!==fallback)gl.deleteTexture(t);}}
 function part(joint,color,locked=false,variant='normal'){if(joint==='root'&&['head','hair','hat','glasses'].includes(paintSlot))joint='head';const key=variant+'|'+joint+'|'+color+'|'+paintSlot+'|'+locked;if(!geometry.has(key))geometry.set(key,{joint,color,slot:paintSlot,locked,variant,v:[],n:[],uvNormals:[]});current=geometry.get(key);v=current.v;n=current.n;}
 function jointColor(color){return '#'+[1,3,5].map(i=>Math.round(parseInt(color.slice(i,i+2),16)*.86).toString(16).padStart(2,'0')).join('');}
 // Split every clothing/print triangle at the hinge, keeping its original UV face.
 // Lower arms and legs then follow their parent bone instead of rotating as one stick.
 function rigGeometry(){const result=new Map(),children={leftLeg:'leftShin',rightLeg:'rightShin',leftArm:'leftForearm',rightArm:'rightForearm'};const emit=(g,joint,polygon,uvNormal)=>{const key=g.variant+'|'+joint+'|'+g.color+'|'+g.slot+'|'+g.locked;if(!result.has(key))result.set(key,{...g,joint,v:[],n:[],uvNormals:[]});const out=result.get(key),pivot=pivots[joint];for(let i=1;i<polygon.length-1;i++){for(const point of [polygon[0],polygon[i],polygon[i+1]]){out.v.push(...point.p.map((v,k)=>v-pivot[k]));out.n.push(...point.n);}out.uvNormals.push(uvNormal);}};const clip=(polygon,y,upper)=>{const output=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],inside=v=>upper?v.p[1]>=y:v.p[1]<=y,ai=inside(a),bi=inside(b);if(ai)output.push(a);if(ai!==bi){const t=(y-a.p[1])/(b.p[1]-a.p[1]);output.push({p:a.p.map((v,k)=>v+(b.p[k]-v)*t),n:norm(a.n.map((v,k)=>v+(b.n[k]-v)*t))});}}return output;};for(const g of geometry.values()){const child=children[g.joint],pivot=pivots[g.joint];for(let i=0;i<g.v.length;i+=9){const polygon=[0,1,2].map(j=>({p:g.v.slice(i+j*3,i+j*3+3).map((v,k)=>v+pivot[k]),n:g.n.slice(i+j*3,i+j*3+3)})),uvNormal=g.uvNormals[i/9];if(!child||g.locked){emit(g,g.joint,polygon,uvNormal);continue;}if(g.slot==='held'||g.slot.endsWith('Hand')||g.slot.endsWith('Foot')){emit(g,g.slot.endsWith('Foot')?g.slot:child,polygon,uvNormal);continue;}const y=pivots[child][1],ys=polygon.map(v=>v.p[1]);if(Math.min(...ys)>=y)emit(g,g.joint,polygon,uvNormal);else if(Math.max(...ys)<=y)emit(g,child,polygon,uvNormal);else{emit(g,g.joint,clip(polygon,y,true),uvNormal);emit(g,child,clip(polygon,y,false),uvNormal);}}}geometry=result;}
 function bustRelief(p,x,y,printed=false){
  if(p?.gender!=='Female'||p.breastSize<=0)return 0;
  const shape=p.breastShape,cy={Natural:2.70,Teardrop:2.65,Compact:2.79,Perky:2.86,Pointy:2.77}[shape]||2.75,cx={Wide:.39,Compact:.30,Perky:.33,Pointy:.35}[shape]||.34;
  if(printed){const spread=.38+.62*Math.sqrt(p.breastSize/150);x=Math.sign(x)*(cx+(Math.abs(x)-cx)/spread);y=cy+(y-cy)/spread;}
  if(y<=2.22||y>=3.10)return 0;
  const size=p.breastSize/100*.32,dy=(y-cy)/({Teardrop:.39,Compact:.28,Perky:.27,Pointy:.30}[shape]||.35),dx=(Math.abs(x)-cx)/({Wide:.42,Compact:.28,Perky:.30,Pointy:.32}[shape]||.35),r=dx*dx+dy*dy,edge=Math.max(0,Math.min(1,(y-2.22)/.15,(3.10-y)/.15));
  return size*edge*(shape==='Pointy'?Math.max(0,1-Math.sqrt(r))**1.15:shape==='Angular'?Math.max(0,1-Math.abs(dx)*.7-Math.abs(dy)*.65):Math.max(0,Math.exp(-r*(shape==='Perky'?2.2:1.6))-.06));
 }
 // Flat ink contours and discrete shadow shapes, drawn independently of 3D relief.
 function comicChest(p,x,y){
  if(p?.gender!=='Female'||!p.breastSize)return null;
  const shape=p.breastShape,spread=.30+.70*Math.sqrt(p.breastSize/150),dims={Rounded:[.34,2.77,.29,.25],Natural:[.34,2.72,.30,.28],Angular:[.35,2.76,.30,.26],Teardrop:[.34,2.68,.28,.30],Wide:[.39,2.75,.33,.23],Compact:[.30,2.79,.23,.21],Perky:[.33,2.86,.26,.21],Pointy:[.35,2.77,.29,.24]}[shape]||[.34,2.77,.29,.25],cx=dims[0],cy=dims[1],ry=dims[3]*spread,dy=(y-cy)/ry,rx=dims[2]*spread*(shape==='Teardrop'?1-.18*Math.max(-1,Math.min(1,dy)):1),dx=(Math.abs(x)-cx)/rx;
  if(Math.abs(dy)>1.2||Math.abs(dx)>1.3)return null;
  const r=shape==='Angular'?Math.abs(dx)*.80+Math.abs(dy)*.90:shape==='Pointy'?Math.hypot(dx,dy+.24*Math.abs(dx)):Math.hypot(dx,dy+(shape==='Natural'?.10*dx:0)),line=.018/Math.min(rx,ry);
  // Leave the upper edge open, as in hand-drawn costume illustrations.
  if(Math.abs(r-1)<line&&(dy<.12||dx>.55)||dx<-.72&&dx>-.72-line*1.4&&dy>.13&&dy<.61)return 'ink';
  if(r<.90&&dy<-.28&&dx>-.25)return 'shadow';
  if(r<.66&&dy>.24&&dx<-.12)return 'highlight';
  return null;
 }
 function warped(a){const out=[...a];if(paintSlot==='hair'&&profile?.hat!=='None'&&out[1]>4.28)out[1]=4.28+(out[1]-4.28)*.18;if(!['Printed','Comic'].includes(profile?.breastMode)&&paintSlot==='torso'&&a[2]>=.395)out[2]+=bustRelief(profile,a[0],a[1]);return out;}

 function pushTri(a,b,c,na,nb,nc){const original=current,raw=[a,b,c];
  if(profile?.breastMode==='Printed'&&paintSlot==='torso'&&Math.min(a[2],b[2],c[2])>=.395){
   const x=(a[0]+b[0]+c[0])/3,y=(a[1]+b[1]+c[1])/3,e=.006,h=bustRelief(profile,x,y,true);
   if(h>0){const dx=(bustRelief(profile,x+e,y,true)-bustRelief(profile,x-e,y,true))/(2*e),dy=(bustRelief(profile,x,y+e,true)-bustRelief(profile,x,y-e,true))/(2*e),normal=norm([-dx,-dy,1]),light=norm([-.35,.65,1]),brightness=Math.round(Math.max(.55,Math.min(1.15,.76+.38*dot(normal,light)))*16)/16,color='#'+[1,3,5].map(i=>Math.max(0,Math.min(255,Math.round(parseInt(original.color.slice(i,i+2),16)*brightness))).toString(16).padStart(2,'0')).join('');part(original.joint,color,original.locked,original.variant);}
  }
  if(profile?.breastMode==='Comic'&&paintSlot==='torso'&&Math.min(a[2],b[2],c[2])>=.395){
   const tone=comicChest(profile,(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3);
   if(tone){const color=tone==='ink'?'#20202a':'#'+[1,3,5].map(i=>{const base=parseInt(original.color.slice(i,i+2),16);return Math.round(tone==='shadow'?base*.60:base+(255-base)*.28).toString(16).padStart(2,'0');}).join('');part(original.joint,color,original.locked,original.variant);}
  }
  const ru=b.map((v,k)=>v-a[k]),rv=c.map((v,k)=>v-a[k]);current.uvNormals.push(norm([ru[1]*rv[2]-ru[2]*rv[1],ru[2]*rv[0]-ru[0]*rv[2],ru[0]*rv[1]-ru[1]*rv[0]]));a=warped(a);b=warped(b);c=warped(c);if(!na){const u=b.map((x,i)=>x-a[i]),w=c.map((x,i)=>x-a[i]);na=norm([u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]]);nb=nc=na;}if(!['Printed','Comic'].includes(profile?.breastMode)&&paintSlot==='torso'&&profile?.gender==='Female'&&profile.breastSize>0&&Math.min(...raw.map(v=>v[2]))>=.395){const nn=p=>{const e=.004,x0=warped([p[0]-e,p[1],p[2]]),x1=warped([p[0]+e,p[1],p[2]]),y0=warped([p[0],p[1]-e,p[2]]),y1=warped([p[0],p[1]+e,p[2]]);return norm([-(x1[2]-x0[2])/(2*e),-(y1[2]-y0[2])/(2*e),1]);};[na,nb,nc]=raw.map(nn);}const p=pivots[current.joint];for(const a0 of [a,b,c])v.push(a0[0]-p[0],a0[1]-p[1],a0[2]-p[2]);n.push(...na,...nb,...nc);current=original;v=current.v;n=current.n;}
 let surfaceBands=null,bandClipping=false;
 function tri(a,b,c,na,nb,nc){
  if(surfaceBands&&!bandClipping){
   const original=current,clip=(poly,y,above)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ai=above?a[1]>=y:a[1]<=y,bi=above?b[1]>=y:b[1]<=y;if(ai)out.push(a);if(ai!==bi){const t=(y-a[1])/(b[1]-a[1]);out.push(a.map((v,k)=>v+(b[k]-v)*t));}}return out;};
   bandClipping=true;try{for(const [low,high,color] of surfaceBands){const poly=clip(clip([a,b,c],low,true),high,false);part(original.joint,color,original.locked,original.variant);for(let i=1;i<poly.length-1;i++)tri(poly[0],poly[i],poly[i+1]);}}finally{bandClipping=false;current=original;v=current.v;n=current.n;}return;
  }
if(paintSlot==='torso'&&profile?.gender==='Female'&&profile.breastSize>0&&Math.min(a[2],b[2],c[2])>=.395&&Math.max(a[1],b[1],c[1])>2.22&&Math.min(a[1],b[1],c[1])<3.10){const comic=profile.breastMode==='Comic',fabric=['Lingerie','Underwear'].includes(profile.outfit)&&!['Printed','Comic'].includes(profile.breastMode),N=Math.min(comic||fabric?64:18,Math.max(1,Math.ceil(Math.max(Math.hypot(...a.map((v,i)=>v-b[i])),Math.hypot(...a.map((v,i)=>v-c[i])),Math.hypot(...b.map((v,i)=>v-c[i])))/(comic?.023:fabric?.035:.095))));const pt=(i,j)=>a.map((v,k)=>v+(b[k]-v)*i/N+(c[k]-v)*j/N);for(let i=0;i<N;i++)for(let j=0;j<N-i;j++){pushTri(pt(i,j),pt(i+1,j),pt(i,j+1));if(i+j<N-1)pushTri(pt(i+1,j),pt(i+1,j+1),pt(i,j+1));}}else pushTri(a,b,c,na,nb,nc);}
 function quad(a,b,c,d){tri(a,b,c);tri(a,c,d);}
 function sheet(a,b,c,d,thickness=.026){const u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),n=norm([u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]),front=[a,b,c,d].map(p=>p.map((v,k)=>v+n[k]*thickness/2)),back=[a,b,c,d].map(p=>p.map((v,k)=>v-n[k]*thickness/2));quad(...front);quad(back[3],back[2],back[1],back[0]);for(let i=0;i<4;i++){const j=(i+1)%4;quad(front[j],front[i],back[i],back[j]);}}
 // Chamfered molded edges keep the same print coordinates as the part.
 function moldedBox(x,y,z,w,h,d,bevel=.035,taper=1){const H=[w/2,h/2,d/2],b=Math.min(bevel,...H.map(v=>v*.30)),center=[x,y,z];const transform=a=>a.map((v,k)=>center[k]+(k===0?v*(1+(taper-1)*(a[1]+H[1])/h):v));const polygon=(points,outward)=>{let a=points.map(transform);const u=a[1].map((v,k)=>v-a[0][k]),v=a[2].map((v,k)=>v-a[0][k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];if(n.reduce((s,v,k)=>s+v*outward[k],0)<0)a.reverse();for(let i=1;i<a.length-1;i++)tri(a[0],a[i],a[i+1]);};for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const u=(axis+1)%3,v=(axis+2)%3,outline=[[-H[u]+b,-H[v]],[H[u]-b,-H[v]],[H[u],-H[v]+b],[H[u],H[v]-b],[H[u]-b,H[v]],[-H[u]+b,H[v]],[-H[u],H[v]-b],[-H[u],-H[v]+b]],out=[0,0,0];out[axis]=sign;polygon(outline.map(([a,c])=>{const p=[0,0,0];p[axis]=sign*H[axis];p[u]=a;p[v]=c;return p;}),out);}for(let a=0;a<3;a++)for(let c=a+1;c<3;c++){const k=3-a-c;for(const sa of [-1,1])for(const sc of [-1,1]){const out=[0,0,0];out[a]=sa;out[c]=sc;polygon([[-1,0],[1,0],[1,1],[-1,1]].map(([sk,edge])=>{const p=[0,0,0];p[a]=sa*(H[a]-(edge?b:0));p[c]=sc*(H[c]-(edge?0:b));p[k]=sk*(H[k]-b);return p;}),out);}}for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){const signs=[sx,sy,sz];polygon([0,1,2].map(axis=>H.map((v,k)=>signs[k]*(v-(k===axis?0:b)))),signs);}}
 function limb(a,b,r0,r1){const axis=norm(b.map((v,k)=>v-a[k])),u=norm(Math.abs(axis[2])>.9?[0,1,0]:[axis[1],-axis[0],0]),v=[axis[1]*u[2]-axis[2]*u[1],axis[2]*u[0]-axis[0]*u[2],axis[0]*u[1]-axis[1]*u[0]],pt=(p,r,t)=>p.map((n,k)=>n+r*(u[k]*Math.cos(t)+v[k]*Math.sin(t))),normal=t=>norm(u.map((n,k)=>n*Math.cos(t)+v[k]*Math.sin(t)));for(let i=0;i<24;i++){const t=i/24*Math.PI*2,s=(i+1)/24*Math.PI*2;tri(pt(a,r0,t),pt(a,r0,s),pt(b,r1,s),normal(t),normal(s),normal(s));tri(pt(a,r0,t),pt(b,r1,s),pt(b,r1,t),normal(t),normal(s),normal(t));tri(a,pt(a,r0,s),pt(a,r0,t));tri(b,pt(b,r1,t),pt(b,r1,s));}}
 function box(x,y,z,w,h,d){if(Math.min(w,h,d)>.12)return moldedBox(x,y,z,w,h,d);const a=x-w/2,b=x+w/2,c=y-h/2,e=y+h/2,f=z-d/2,g=z+d/2;quad([a,c,g],[b,c,g],[b,e,g],[a,e,g]);quad([b,c,f],[a,c,f],[a,e,f],[b,e,f]);quad([a,c,f],[a,c,g],[a,e,g],[a,e,f]);quad([b,c,g],[b,c,f],[b,e,f],[b,e,g]);quad([a,e,g],[b,e,g],[b,e,f],[a,e,f]);quad([a,c,f],[b,c,f],[b,c,g],[a,c,g]);}
 function lathe(x,z,profile,segments=24){for(let k=0;k<profile.length-1;k++){const [r0,y0]=profile[k],[r1,y1]=profile[k+1],l=Math.hypot(y1-y0,r1-r0)||1;for(let i=0;i<segments;i++){const a=i/segments*6.2831853,b=(i+1)/segments*6.2831853,pt=(r,y,t)=>[x+r*Math.cos(t),y,z+r*Math.sin(t)],nn=t=>[(y1-y0)/l*Math.cos(t),(r0-r1)/l,(y1-y0)/l*Math.sin(t)];tri(pt(r0,y0,a),pt(r0,y0,b),pt(r1,y1,b),nn(a),nn(b),nn(b));tri(pt(r0,y0,a),pt(r1,y1,b),pt(r1,y1,a),nn(a),nn(b),nn(a));}}}
 function cyl(x,y,z,r,h){lathe(x,z,[[0,y-h/2],[r*.94,y-h/2],[r,y-h/2+.035],[r,y+h/2-.035],[r*.94,y+h/2],[0,y+h/2]]);}
 function sphere(x,y,z,rx,ry=rx,rz=rx){const N0=24,M=14;for(let j=0;j<M;j++)for(let i=0;i<N0;i++){const pt=(a,b)=>[x+rx*Math.sin(b)*Math.cos(a),y+ry*Math.cos(b),z+rz*Math.sin(b)*Math.sin(a)],nn=(a,b)=>norm([Math.sin(b)*Math.cos(a)/rx,Math.cos(b)/ry,Math.sin(b)*Math.sin(a)/rz]);const a=i/N0*6.2831853,b=(i+1)/N0*6.2831853,c=j/M*Math.PI,d=(j+1)/M*Math.PI;tri(pt(a,c),pt(a,d),pt(b,d),nn(a,c),nn(a,d),nn(b,d));tri(pt(a,c),pt(b,d),pt(b,c),nn(a,c),nn(b,d),nn(b,c));}}
 // Rear garment hems split the molded contour into fabric and skin rather
 // than coloring the whole surface as a solid pair of shorts.
 function rearShape(p,side){const size=p.buttSize/100,a={Rounded:[.32,.27,.15,1.64,.39],Athletic:[.30,.24,.12,1.70,.37],Wide:[.36,.25,.14,1.65,.41],Compact:[.28,.22,.10,1.71,.35],Pear:[.33,.31,.16,1.60,.39]}[p.buttShape]||[.32,.27,.15,1.64,.39];return {x:side*a[4],y:a[3],z:-.27,rx:a[0]+.08*size,ry:a[1]+.04*size,rz:a[2]+.27*size};}
 function rearDepth(p,x,y){let z=-.39;if(p.buttSize>0)for(const side of [-1,1]){const a=rearShape(p,side),r=((x-a.x)/a.rx)**2+((y-a.y)/a.ry)**2;if(r<1)z=Math.min(z,a.z-a.rz*Math.sqrt(1-r));}return z;}
 function rearWidth(p,y){let x=.74;if(p.buttSize>0){const a=rearShape(p,1),r=((y-a.y)/a.ry)**2;if(r<1)x=Math.max(x,a.x+a.rx*Math.sqrt(1-r));}return x+.025;}
 function rearContour(p,joint,side,color,hem=null){
  const a=rearShape(p,side),N=32,M=18,point=(u,v)=>({p:[a.x+a.rx*Math.sin(v)*Math.cos(u),a.y+a.ry*Math.cos(v),a.z+a.rz*Math.sin(v)*Math.sin(u)],n:norm([Math.sin(v)*Math.cos(u)/a.rx,Math.cos(v)/a.ry,Math.sin(v)*Math.sin(u)/a.rz])});
  const clip=(poly,upper)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ai=upper?a.p[1]>=hem:a.p[1]<=hem,bi=upper?b.p[1]>=hem:b.p[1]<=hem;if(ai)out.push(a);if(ai!==bi){const t=(hem-a.p[1])/(b.p[1]-a.p[1]);out.push({p:a.p.map((v,k)=>v+(b.p[k]-v)*t),n:norm(a.n.map((v,k)=>v+(b.n[k]-v)*t))});}}return out;};
  const emit=(poly,c)=>{part(joint,c);for(let i=1;i<poly.length-1;i++)tri(poly[0].p,poly[i].p,poly[i+1].p,poly[0].n,poly[i].n,poly[i+1].n);};
  for(let j=0;j<M;j++)for(let i=0;i<N;i++){const u=i/N*Math.PI*2,v=(i+1)/N*Math.PI*2,c=j/M*Math.PI,d=(j+1)/M*Math.PI;for(const poly of [[point(u,c),point(u,d),point(v,d)],[point(u,c),point(v,d),point(v,c)]])if(hem===null)emit(poly,color);else{emit(clip(poly,true),color);emit(clip(poly,false),p.skinColor);}}
 }
 function thongBand(p){
  paintSlot='torso';part('hips',p.pantsColor,true);const bottom=1.855,top=1.925,N=48;
  // Full front and rear ribbons meet side ribbons at exactly the same edge.
  for(const back of [false,true])for(let j=0;j<8;j++)for(let i=0;i<N;i++){const y0=bottom+(top-bottom)*j/8,y1=bottom+(top-bottom)*(j+1)/8,point=(u,y)=>{const x=(u*2-1)*rearWidth(p,y);return [x,y,back?rearDepth(p,x,y)-.025:.417];},points=[point(i/N,y0),point((i+1)/N,y0),point((i+1)/N,y1),point(i/N,y1)];quad(...(back?points.reverse():points));}
  for(const side of [-1,1])for(let j=0;j<8;j++){const y0=bottom+(top-bottom)*j/8,y1=bottom+(top-bottom)*(j+1)/8,point=(u,y)=>{const x=side*rearWidth(p,y);return [x,y,.417+(rearDepth(p,x,y)-.025-.417)*u];},points=[point(0,y0),point(1,y0),point(1,y1),point(0,y1)];quad(...(side>0?points:points.reverse()));}
  // The center back strap conforms to the rear surface instead of sinking in.
  for(let i=0;i<24;i++){const point=(x,u)=>{const y=1.585+(top-1.585)*u;return [x,y,rearDepth(p,x,y)-.026];};quad(point(-.045,i/24),point(-.045,(i+1)/24),point(.045,(i+1)/24),point(.045,i/24));}
 }
 function torso(y0,y1,bottom,top,d=.80){moldedBox(0,(y0+y1)/2,0,bottom,y1-y0,d,.035,top/bottom);}
 function clothedTorso(p,low,high,waist=0){
  const edges=[1.92,...[low,high,waist].filter(y=>y>1.92&&y<3.16),3.16].sort((a,b)=>a-b);
  surfaceBands=edges.slice(0,-1).map((y,i)=>{const end=edges[i+1],mid=(y+end)/2;return [y,end,mid<waist?p.pantsColor:mid>=low&&mid<=high?p.shirtColor:p.skinColor];});
  try{part('root',p.skinColor);torso(1.92,3.16,1.52,1.42);}finally{surfaceBands=null;}
 }
 function facePoint(x,y,z=.012){return [x,y,(headShape==='Square'?.516:Math.sqrt(Math.max(.005,.57*.57-x*x)))+z];}
 function disc(x,y,rx,ry=rx,offset=.015){const C=facePoint(x,y,offset);for(let i=0;i<28;i++){const a=i/28*6.2831853,b=(i+1)/28*6.2831853;tri(C,facePoint(x+rx*Math.cos(a),y+ry*Math.sin(a),offset),facePoint(x+rx*Math.cos(b),y+ry*Math.sin(b),offset),[0,0,1],[0,0,1],[0,0,1]);}}
 function path(points,width=.025,offset=.02){for(let i=0;i<points.length-1;i++){const [x,y]=points[i],[a,b]=points[i+1],l=Math.hypot(a-x,b-y)||1,dx=-(b-y)/l*width/2,dy=(a-x)/l*width/2;quad(facePoint(x-dx,y-dy,offset),facePoint(a-dx,b-dy,offset),facePoint(a+dx,b+dy,offset),facePoint(x+dx,y+dy,offset));}}
 function printRect(x,y,w,h,z=.416){box(x,y,z,w,h,.008);}
 function nippleDetails(p){
  if(p.nippleStyle==='None'||p.nippleSize<=0||p.outfit!=='Separates'||p.shirt!=='Bare torso')return;
  const female=p.gender==='Female',shape=p.breastShape,cx=female?({Wide:.39,Compact:.30,Perky:.33,Pointy:.35}[shape]||.34):.36,cy=female?({Natural:2.70,Teardrop:2.65,Compact:2.79,Perky:2.86,Pointy:2.77}[shape]||2.75):2.75,r=.018+.10*p.nippleSize/100,oval=p.nippleStyle==='Oval',rx=r*(oval?1.22:1),ry=r*(oval?.72:1),dark=jointColor(p.nippleColor),light='#'+[1,3,5].map(i=>Math.round(parseInt(p.nippleColor.slice(i,i+2),16)*.72+255*.28).toString(16).padStart(2,'0')).join(''),flat=['Printed','Comic'].includes(p.breastMode),z=.413;
  const mark=(x,y,ax,ay,depth=z)=>{for(let i=0;i<40;i++){const a=i/40*Math.PI*2,b=(i+1)/40*Math.PI*2;tri([x,y,depth],[x+Math.cos(a)*ax,y+Math.sin(a)*ay,depth],[x+Math.cos(b)*ax,y+Math.sin(b)*ay,depth]);}};
  for(const side of [-1,1]){const x=side*cx;part('root',p.nippleColor);
   if(p.nippleStyle==='Dot'){mark(x,cy,r*.42,r*.42);continue;}
   mark(x,cy,rx,ry);
   if(p.nippleStyle==='Flat')continue;
   if(p.nippleStyle==='Raised'&&!flat){
    const radius=r*.40,height=.018+.024*p.nippleSize/100;
    for(let j=0;j<5;j++){const a=j/5*Math.PI/2,b=(j+1)/5*Math.PI/2,point=(angle,t)=>[x+radius*Math.cos(t)*Math.cos(angle),cy+radius*Math.cos(t)*Math.sin(angle),z+.003+height*Math.sin(t)];part('root',j>=3?light:j>=1?p.nippleColor:dark);for(let i=0;i<32;i++){const u=i/32*Math.PI*2,v=(i+1)/32*Math.PI*2;quad(point(u,a),point(v,a),point(v,b),point(u,b));}}
   }else{part('root',dark);mark(x,cy,rx*.42,ry*.42,z+.003);if(p.nippleStyle==='Raised'){part('root',light);mark(x-r*.10,cy+r*.10,r*.12,r*.12,z+.006);}}
  }
 }

 function ring(x,y,rx,ry,width=.028){const points=[];for(let i=0;i<=32;i++)points.push([x+rx*Math.cos(i/32*6.2831853),y+ry*Math.sin(i/32*6.2831853)]);path(points,width,.054);}
 function build(p){
  const known=profileCache.get(p);if(known&&cache.has(known)){compiled=cache.get(known);signature=known;profile=p;return;}const s=JSON.stringify(p);if(cache.has(s)){compiled=cache.get(s);signature=s;profile=p;profileCache.set(p,s);return;}headShape=p.head;profile=p;paintSlot='torso';compiled=[];geometry=new Map();signature=s;
  const skin=p.skinColor,hair=p.hairColor,ink='#171d27',white='#f8f5e9',accent=p.accentColor,access=p.accessoryColor;const separated=p.outfit==='Separates',dress=p.outfit==='Dress',hero=p.outfit==='Superhero',heroCut=hero?p.heroCut:'Full suit',lightHero=hero&&!['Full suit','Cutout suit'].includes(heroCut),bikini=p.outfit==='Bikini',under=p.outfit==='Underwear',modernUnder=under&&['High waist briefs','Bralette and boyshorts','Balcony set','Triangle bra set','Sport bra and micro shorts','Longline bra and briefs'].includes(p.underwear),lingerie=p.outfit==='Lingerie',thong=separated&&p.pants==='Thong'||lingerie&&['Bra and thong','Camisole and thong'].includes(p.lingerie),swim=p.outfit==='Swimsuit',armor=p.outfit==='Armor';
  const shirtSkin=(separated&&p.shirt==='Bare torso')||bikini,shirtColor=shirtSkin?skin:dress?p.dressColor:p.shirtColor;const pantsBare=p.pants==='Bare legs'&&separated;
  part('root',shirtColor);
  if(hero&&['Crop top and shorts','Two piece'].includes(heroCut)){part('root',skin);torso(1.92,2.34,1.52,1.486);part('root',shirtColor);torso(2.34,3.16,1.486,1.42);if(heroCut==='Two piece'){part('root',p.pantsColor);torso(1.92,2.08,1.52,1.507);}}
  else if(modernUnder){const top=p.underwear==='Longline bra and briefs'?2.31:p.underwear==='Bralette and boyshorts'?2.42:2.51;clothedTorso(p,top,p.underwear==='Balcony set'?2.93:3.01,p.underwear==='High waist briefs'?2.28:0);}
  else if(lingerie){const top=['Bodysuit','Lace bodysuit'].includes(p.lingerie)?1.92:['Bustier','Corset and briefs'].includes(p.lingerie)?1.99:p.lingerie==='Longline lace set'?2.32:p.lingerie==='Camisole and thong'?2.18:2.50;clothedTorso(p,top,p.lingerie==='Satin set'?3.04:3.0,p.lingerie==='High waist set'?2.27:0);}
  else if(under&&p.underwear!=='Thermal set')clothedTorso(p,p.underwear==='Sports set'?2.48:2.12,3.16);
  else torso(1.92,3.16,p.gender==='Female'?1.52:1.60,1.42);
  paintSlot='head';part('root',skin);cyl(0,3.23,0,.24,.20);
  if(p.head==='Square'){box(0,3.77,0,1.10,1.02,1.02);}else lathe(0,0,[[0,3.28],[.50,3.28],[.56,3.34],[.57,3.43],[.57,4.15],[.55,4.22],[.48,4.25],[0,4.25]],p.head==='Rounded'?64:48);
  lathe(0,0,[[0,4.21],[.22,4.21],[.235,4.24],[.235,4.36],[.21,4.39],[.14,4.39],[.14,4.28],[0,4.28]],32);
  paintSlot='torso';part('hips',pantsBare||thong?skin:dress?p.dressColor:p.pantsColor);box(0,1.82,0,1.48,.28,.78);
  for(const side of [-1,1]){
   const joint=side<0?'leftLeg':'rightLeg',x=side*.39;paintSlot=joint;const short=lingerie||lightHero||swim&&!['Wetsuit','Rash guard'].includes(p.swimwear)||bikini||under&&p.underwear!=='Thermal set'||separated&&['Shorts','Micro shorts','Sports shorts','Swim trunks','Briefs','Boxers','Bikini bottom','Thong','Skirt','Mini skirt','Long skirt'].includes(p.pants);
   const legColor=pantsBare?skin:dress?p.dressColor:p.pantsColor;part(joint,short?skin:legColor);moldedBox(x,1.34,0,.67,.55,.70,.04);moldedBox(x,.70,0,.65,.62,.68,.04);limb([x-.335,1.46,0],[x+.335,1.46,0],.335,.335);part(joint,jointColor(short?skin:legColor),true);limb([x-.343,1.035,0],[x+.343,1.035,0],.25,.25);if(short&&!thong){part(joint,legColor);const micro=separated&&p.pants==='Micro shorts'||modernUnder&&p.underwear==='Sport bra and micro shorts',boyshorts=modernUnder&&p.underwear==='Bralette and boyshorts',briefs=modernUnder&&!boyshorts||lingerie||lightHero&&heroCut!=='Crop top and shorts'||bikini||separated&&['Briefs','Bikini bottom'].includes(p.pants)||under&&['Vest and briefs','Sports set'].includes(p.underwear);box(x,micro?1.64:boyshorts?1.60:briefs?1.68:1.52,0,.68,micro?.22:boyshorts?.30:briefs?.16:.44,.72);if(micro){part(joint,accent);box(x,1.535,.37,.65,.025,.015);}}
   if(p.buttSize>0){const micro=separated&&p.pants==='Micro shorts'||modernUnder&&p.underwear==='Sport bra and micro shorts',briefs=modernUnder&&p.underwear!=='Bralette and boyshorts'||lingerie||bikini||lightHero&&heroCut!=='Crop top and shorts'||separated&&['Briefs','Bikini bottom'].includes(p.pants)||under&&['Vest and briefs','Sports set'].includes(p.underwear),shape=rearShape(p,side),hem=thong||pantsBare?null:micro?shape.y-.035:briefs?shape.y-.085:null;rearContour(p,joint,side,thong||pantsBare?skin:legColor,hem);}

   if(separated&&p.pants==='Cargo pants'){part(joint,accent);box(x+side*.34,1.12,0,.05,.31,.44);}
   if(separated&&p.pants==='Jeans'){part(joint,accent);box(x,1.30,.362,.36,.025,.01);box(x,1.44,-.36,.29,.19,.012);}
   paintSlot=side<0?'leftFoot':'rightFoot';const foot=p.shoes==='Bare feet'?skin:p.shoeColor;part(joint,foot);if(p.shoes==='Heels'){box(x,.28,.28,.70,.22,.55);box(x,.38,-.14,.68,.17,.52);}else box(x,.25,.09,.70,.48,.91);if(['Boots','Armored boots'].includes(p.shoes))box(x,.60,0,.71,.50,.73);if(p.shoes==='Trainers'){part(joint,white);box(x,.075,.1,.71,.09,.92);for(let i=0;i<3;i++)box(x,.48,.19+i*.12,.34,.025,.04);}if(p.shoes==='Sandals'){part(joint,skin);box(x,.28,.08,.65,.33,.80);part(joint,p.shoeColor);box(x,.47,.18,.65,.03,.15);}if(p.shoes==='Armored boots'){part(joint,accent);box(x,.61,.382,.54,.31,.025);box(x,.22,.55,.61,.20,.04);}if(p.shoes==='Loafers'){part(joint,accent);box(x,.50,.23,.44,.025,.08);}if(p.shoes==='Heels'){part(joint,foot);box(x,.15,-.31,.29,.3,.2);}
  }
  const longSleeve=hero&&['Full suit','Long sleeve leotard','Cutout suit'].includes(heroCut)||armor||under&&p.underwear==='Thermal set'||swim&&['Wetsuit','Rash guard'].includes(p.swimwear)||separated&&['Hoodie','Sweater','Jacket','Suit','Long coat','Uniform','Blouse','Tunic','Raincoat','Leather jacket','Button-up'].includes(p.shirt);const bareArm=lingerie||lightHero||dress&&['Sundress','Evening','Ball gown','Wedding','Party'].includes(p.dress)||bikini||swim&&!['Wetsuit','Rash guard'].includes(p.swimwear)||under&&p.underwear!=='Thermal set'||separated&&['Bare torso','Vest','Tank top','Crop top'].includes(p.shirt);
  for(const side of [-1,1]){const joint=side<0?'leftArm':'rightArm',x=side*.95,armSleeve=longSleeve||hero&&heroCut==='One shoulder'&&side<0,armBare=bareArm&&!armSleeve;paintSlot=joint;part(joint,armSleeve?shirtColor:skin);sphere(x,2.88,0,.265);limb([x,2.89,0],[x+side*.13,2.60,.025],.253,.23);limb([x+side*.13,2.50,.025],[x+side*.10,2.23,.04],.23,.19);part(joint,jointColor(armSleeve?shirtColor:skin),true);limb([x+side*.13-.23,2.55,.025],[x+side*.13+.23,2.55,.025],.211,.211);part(joint,armSleeve?shirtColor:skin,true);limb([x+side*.13+side*.23,2.55,.025],[x+side*.13+side*.242,2.55,.025],.118,.118);if(!armBare&&!armSleeve){part(joint,shirtColor);sphere(x,2.88,0,.272);limb([x,2.89,0],[x+side*.12,2.63,.020],.260,.245);}paintSlot=side<0?'leftHand':'rightHand';part(joint,p.gloves==='None'?skin:p.gloveColor);cyl(x+side*.10,2.10,.04,.19,.20);
   // The real hand has a solid C grip, beveled walls, rounded finger tips, and a narrower wrist peg.
   const cx=x+side*.10,cy=1.94,cz=.085,R=.26,r=.145,start=-Math.PI/2+.48,span=Math.PI*2-.96;const profileRing=[[R-.025,cz-.15],[R,cz-.125],[R,cz+.125],[R-.025,cz+.15],[r+.015,cz+.15],[r,cz+.125],[r,cz-.125],[r+.015,cz-.15],[R-.025,cz-.15]];
   for(let i=0;i<32;i++){const a=start+i/32*span,b=start+(i+1)/32*span,pt=(r,t,z)=>[cx+r*Math.cos(t),cy+r*Math.sin(t),z];for(let j=0;j<profileRing.length-1;j++){const [r0,z0]=profileRing[j],[r1,z1]=profileRing[j+1];quad(pt(r0,a,z0),pt(r0,b,z0),pt(r1,b,z1),pt(r1,a,z1));}}
   for(const a of [start,start+span])sphere(cx+(R+r)/2*Math.cos(a),cy+(R+r)/2*Math.sin(a),cz,(R-r)/2,(R-r)/2,.147);sphere(cx,2.13,cz-.04,.16,.13,.14);
   if(p.gloves==='Mittens')sphere(cx,1.92,cz,.29,.27,.17);if(p.gloves==='Armor'){part(joint,p.gloveColor);box(cx,2.09,cz+.16,.42,.11,.06);}if(p.gloves==='Leather'){part(joint,accent);box(cx,2.13,cz+.18,.28,.025,.014);}
   // Close the toy grip for an unarmed punch; the knuckle face is the
   // lower end of the hand, so extension presents knuckles rather than a palm.
   part(joint,p.gloves==='None'?skin:p.gloveColor,false,'fist');
   cyl(cx,2.10,.04,.18,.20);moldedBox(cx,1.94,cz,.46,.39,.40,.04);
   for(const dx of [-.15,-.05,.05,.15])moldedBox(cx+dx,1.735,cz,.087,.055,.31,.022);
   sphere(cx+side*.215,1.98,cz+.05,.065,.12,.10);
   if(p.power==='Claws'){part(joint,'#cbd9e6',false,'claws');for(const dx of [-.14,0,.14]){box(cx+dx,1.65,cz+.13,.055,.60,.07);tri([cx+dx-.028,1.35,cz+.165],[cx+dx+.028,1.35,cz+.165],[cx+dx,1.20,cz+.165]);}}
   if(p.wrist!=='None'){paintSlot=joint;part(joint,p.wrist==='Watch'?ink:access);cyl(cx,2.20,.04,.235,.10);if(p.wrist==='Watch'){part(joint,accent);box(cx,2.22,.30,.22,.17,.04);}}
  }
  if(thong){paintSlot='torso';part('hips',p.pantsColor);tri([-.50,1.94,.409],[.50,1.94,.409],[0,1.61,.409]);thongBand(p);part('hips',accent);box(0,1.93,.423,.15,.045,.014);}
  paintSlot='torso';part('root',shirtColor);
  if(dress||separated&&p.pants.includes('skirt')||separated&&p.pants.includes('Skirt')){paintSlot='dress';const long=dress?['Evening','Ball gown','Medieval','Wedding','Kimono'].includes(p.dress):p.pants==='Long skirt',wide=dress&&['Ball gown','Wedding'].includes(p.dress);part('root',dress?p.dressColor:p.pantsColor);torso(long?.30:1.10,1.95,wide?2.40:1.70,1.36,wide?1.5:.96);if(dress&&p.dress==='Kimono'){part('root',accent);printRect(0,2.10,1.35,.16);printRect(-.15,2.67,.08,.70);}}
  if(heroCut==='Battle skirt'){paintSlot='dress';part('root',p.pantsColor);torso(1.20,1.96,1.94,1.48,1.01);part('root',accent);for(const side of [-1,1])box(side*.63,1.50,.51,.065,.48,.025);}
  paintSlot='torso';if(separated&&['Long coat','Raincoat','Tunic'].includes(p.shirt)){part('root',shirtColor);torso(1.16,1.94,1.58,1.35,.86);part('root',accent);printRect(0,1.56,.025,.72,.441);}
  if(separated&&p.shirt==='Crop top'){part('root',skin);torso(1.93,2.35,1.28,1.45,.81);}
  if(bikini){part('root',p.shirtColor);const z=.415;quad([-.64,2.62,z],[-.05,2.62,z],[-.34,3.08,z],[-.35,3.08,z]);quad([.05,2.62,z],[.64,2.62,z],[.35,3.08,z],[.34,3.08,z]);printRect(0,2.62,1.40,.06);printRect(-.43,3.10,.07,.15);printRect(.43,3.10,.07,.15);printRect(0,2.65,.16,.07);part('root',skin);torso(1.94,2.42,1.28,1.42,.81);}
  if(swim){part('root',skin);if(p.swimwear!=='Wetsuit'){quad([-.81,3.17,.415],[-.48,2.83,.415],[-.35,3.17,.415],[-.81,3.17,.415]);quad([.81,3.17,.415],[.35,3.17,.415],[.48,2.83,.415],[.81,3.17,.415]);}part('root',accent);if(p.swimwear==='Sport')printRect(0,2.52,.16,1.05);if(p.swimwear==='Retro'||p.swimwear==='High waist')for(let y=2.1;y<3.1;y+=.18)printRect(0,y,1.3,.07);if(p.swimwear==='Halter'){part('root',skin);printRect(0,3.02,.54,.24);}}
  if(p.outfit==='Superhero'){
   const emblem=typeof SuperPowers==='undefined'?'star':SuperPowers.costumes[p.costume]?.emblem||'star',z=.433;
   paintSlot='torso';part('root',accent);
   printRect(-.60,lightHero?2.72:2.48,.075,lightHero?.48:.82,z);printRect(.60,lightHero?2.72:2.48,.075,lightHero?.48:.82,z);if(!['Crop top and shorts','Two piece'].includes(heroCut))printRect(0,2.08,1.32,.09,z);
   if(heroCut==='One shoulder'){part('root',skin);tri([.10,3.17,z],[.71,3.17,z],[.70,2.82,z]);part('root',accent);}
   if(heroCut==='Cutout suit'){part('root',skin);for(const side of [-1,1])quad([side*.71,2.10,z],[side*.71,2.48,z],[side*.43,2.36,z],[side*.51,2.15,z]);part('root',accent);}
   if(heroCut==='High cut'){part('root',skin);for(const side of [-1,1])tri([side*.76,1.95,z],[side*.60,2.34,z],[side*.36,1.95,z]);part('root',accent);}
   if(['sun','core','ring','eye'].includes(emblem)){sphere(0,2.68,z,.30,.30,.024);part('root',shirtColor);sphere(0,2.68,z+.025,.18,.18,.014);part('root',accent);if(emblem==='sun')for(let i=0;i<8;i++){const a=i*Math.PI/4;printRect(Math.sin(a)*.37,2.68+Math.cos(a)*.37,.075,.075,z);}if(emblem==='core'){sphere(0,2.68,z+.04,.12,.12,.012);}if(emblem==='ring'){printRect(0,2.94,.37,.075,z);printRect(0,2.42,.37,.075,z);}if(emblem==='eye'){printRect(-.34,2.68,.12,.055,z);printRect(.34,2.68,.12,.055,z);sphere(0,2.68,z+.04,.075,.10,.01);}}
   else if(emblem==='bolt'){quad([.12,3.02,z],[-.27,2.62,z],[.02,2.64,z],[-.14,2.30,z]);quad([.02,2.64,z],[.30,2.70,z],[-.14,2.30,z],[-.04,2.60,z]);}
   else if(emblem==='wings'){for(const side of [-1,1]){tri([0,2.70,z],[side*.48,2.91,z],[side*.33,2.53,z]);tri([side*.33,2.53,z],[side*.17,2.62,z],[0,2.44,z]);}}
   else if(emblem==='ice'){printRect(0,2.68,.065,.7,z);printRect(0,2.68,.7,.065,z);for(const side of [-1,1]){quad([-.24,2.68+side*.28,z],[-.28,2.68+side*.24,z],[.24,2.68-side*.28,z],[.28,2.68-side*.24,z]);}}
   else if(emblem==='claw'){for(const x of [-.22,0,.22])quad([x-.045,2.98,z],[x+.035,2.98,z],[x-.12,2.36,z],[x-.17,2.40,z]);}
   else if(emblem==='arrow'){tri([-.33,2.65,z],[.33,2.65,z],[0,3.0,z]);printRect(0,2.48,.13,.34,z);}
   else if(emblem==='diamond'){tri([0,3.02,z],[-.36,2.7,z],[0,2.36,z]);tri([0,3.02,z],[0,2.36,z],[.36,2.7,z]);}
   else{const points=[];for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,r=i%2?.14:.34;points.push([Math.cos(a)*r,2.68+Math.sin(a)*r,z]);}for(let i=0;i<10;i++)tri([0,2.68,z],points[i],points[(i+1)%10]);}
   for(const side of [-1,1]){paintSlot=side<0?'leftArm':'rightArm';part(paintSlot,accent);box(side*1.05,2.28,.045,.42,.13,.45);paintSlot=side<0?'leftLeg':'rightLeg';part(paintSlot,accent);box(side*.39,.72,.35,.54,.25,.04);}
  }
  const zprint=.422;
  if(separated&&['Polo','Button-up','Suit','Uniform','Blouse','Jacket','Leather jacket'].includes(p.shirt)){part('root',accent);quad([-.45,3.16,zprint],[-.06,2.91,zprint],[-.04,3.16,zprint],[-.45,3.16,zprint]);quad([.45,3.16,zprint],[.04,3.16,zprint],[.06,2.91,zprint],[.45,3.16,zprint]);for(let y=2.1;y<2.96;y+=.18)printRect(0,y,.05,.06);if(['Jacket','Leather jacket'].includes(p.shirt))printRect(0,2.53,.03,1.13);}
  if(separated&&p.shirt==='Hoodie'){part('root',shirtColor);sphere(0,3.02,-.39,.49,.28,.19);part('root',accent);printRect(-.20,2.90,.025,.38);printRect(.20,2.90,.025,.38);printRect(0,2.27,.72,.20);}
  if(separated&&p.shirt==='Vest'){part('root',accent);printRect(0,2.6,.29,.94);printRect(-.48,2.25,.25,.22);printRect(.48,2.25,.25,.22);}
  if(armor){part('root',accent);torso(2.05,3.12,1.43,1.78,.92);for(const side of [-1,1]){part(side<0?'leftArm':'rightArm',p.shirtColor);sphere(side*1.02,2.99,0,.38,.24,.36);}part('root',ink);printRect(0,2.48,.08,.52,.472);printRect(0,2.68,.49,.07,.472);}
  if(p.pattern!=='Plain'||separated&&p.shirt==='Striped shirt'||separated&&p.shirt==='Graphic tee'){
   part('root',accent);const pat=separated&&p.shirt==='Striped shirt'&&p.pattern==='Plain'?'Stripes':separated&&p.shirt==='Graphic tee'&&p.pattern==='Plain'?'Star':p.pattern;
   if(pat==='Stripes')for(let y=2.08;y<3.08;y+=.20)printRect(0,y,1.24,.07);
   if(pat==='Dots'||pat==='Flowers'||pat==='Checkered')for(let i=0;i<4;i++)for(let j=0;j<4;j++){if(pat==='Checkered'&&(i+j)%2)continue;printRect(-.43+i*.28,2.15+j*.24,pat==='Checkered'?.14:.055,pat==='Checkered'?.12:.055);if(pat==='Flowers'){printRect(-.43+i*.28,2.15+j*.24,.03,.14);printRect(-.43+i*.28,2.15+j*.24,.14,.03);}}
   if(pat==='Star'){const points=[];for(let i=0;i<10;i++){const a=i/10*6.2831853+Math.PI/2,r=i%2?.16:.34;points.push([Math.cos(a)*r,2.61+Math.sin(a)*r,zprint]);}for(let i=0;i<10;i++)tri([0,2.61,zprint],points[i],points[(i+1)%10]);}
   if(pat==='Lightning')quad([.06,2.98,zprint],[-.22,2.59,zprint],[.02,2.63,zprint],[-.08,2.22,zprint]);
   if(pat==='Heart'){sphere(-.13,2.76,.419,.17,.16,.012);sphere(.13,2.76,.419,.17,.16,.012);tri([-.27,2.73,zprint],[.27,2.73,zprint],[0,2.36,zprint]);}
   if(pat==='Number 7'){printRect(0,2.86,.48,.10);quad([.18,2.85,zprint],[.29,2.85,zprint],[-.09,2.31,zprint],[-.2,2.31,zprint]);}
   if(pat==='Pocket'){printRect(-.38,2.72,.29,.27);part('root',shirtColor);printRect(-.38,2.75,.24,.16,.43);}
  }

  if(dress){part('root',accent);if(['Casual','Uniform','Party'].includes(p.dress)){printRect(0,2.06,1.28,.11);if(p.dress==='Uniform')for(let y=2.2;y<3.1;y+=.18)printRect(0,y,.05,.06);if(p.dress==='Party')for(const x of [-.40,0,.40])printRect(x,1.52,.055,.60,.50);}if(p.dress==='Sundress'){part('root',skin);printRect(0,3.05,.80,.23);part('root',p.dressColor);printRect(-.51,3.09,.10,.20);printRect(.51,3.09,.10,.20);}if(p.dress==='Evening'){part('root',skin);tri([-.28,3.16,.426],[.28,3.16,.426],[0,2.86,.426]);part('root',accent);printRect(0,2.02,1.31,.07);}if(['Ball gown','Wedding'].includes(p.dress)){box(0,.50,.77,2.25,.09,.04);box(0,1.08,.63,1.95,.065,.04);if(p.dress==='Wedding'){box(0,3.10,.44,1.57,.09,.06);}}if(p.dress==='Medieval'){printRect(0,2.58,.27,.93);for(const y of [2.34,2.52,2.70,2.88])printRect(0,y,.42,.025);}}
  if(separated){part('root',accent);if(p.shirt==='Sweater')for(const y of [2.12,2.18,2.24])printRect(0,y,1.26,.025);if(p.shirt==='Jersey')for(const x of [-.56,.56])printRect(x,2.67,.10,.70);if(p.shirt==='Raincoat'){printRect(0,2.11,1.31,.08);printRect(-.5,2.66,.09,.64);printRect(.5,2.66,.09,.64);}if(p.shirt==='Tank top'){part('root',skin);printRect(0,3.06,.65,.20);}if(p.shirt==='Suit'){part('root',ink);tri([-.08,3.02,.434],[.08,3.02,.434],[0,2.55,.434]);}if(p.shirt==='Blouse'){part('root',accent);printRect(0,3.03,.24,.10);}for(const side of [-1,1]){const joint=side<0?'leftLeg':'rightLeg';paintSlot=joint;part(joint,accent);if(['Joggers','Leggings'].includes(p.pants))box(side*.72,1.03,0,.035,1.22,.18);if(p.pants==='Joggers')box(side*.39,.62,0,.69,.10,.73);if(p.pants==='Leggings')box(side*.67,1.07,.30,.025,1.19,.04);if(p.pants==='Boxers')for(const y of [1.40,1.53,1.66])box(side*.39,y,.371,.56,.028,.009);if(p.pants==='Bikini bottom')box(side*.63,1.76,.40,.09,.07,.01);if(p.pants==='Sports shorts')box(side*.72,1.50,0,.035,.36,.31);if(p.pants==='Swim trunks')for(const y of [1.38,1.53,1.68])box(side*.39,y,.37,.58,.035,.012);if(p.pants==='Suit pants')box(side*.39,1.02,.358,.012,1.17,.012);}}
  if(modernUnder){paintSlot='torso';part('root',p.shirtColor);for(const side of [-1,1])printRect(side*.44,3.08,.075,.17,.444);part('root',accent);const style=p.underwear;
   if(style==='High waist briefs'){for(const y of [2.03,2.13,2.23])printRect(0,y,1.30,.026,.44);printRect(0,2.55,1.35,.035,.44);}
   if(style==='Bralette and boyshorts'){for(const x of [-.52,0,.52])printRect(x,2.75,.024,.42,.44);printRect(0,2.44,1.38,.06,.44);}
   if(style==='Balcony set'){for(const side of [-1,1])for(let i=0;i<8;i++){const x=side*(.10+i*.07);printRect(x,2.88-.045*Math.sin(i/7*Math.PI),.045,.055,.443);}}
   if(style==='Triangle bra set'){for(const side of [-1,1])quad([side*.07,2.53,.443],[side*.60,2.53,.443],[side*.35,3.01,.443],[side*.30,3.01,.443]);}
   if(style==='Sport bra and micro shorts'){printRect(0,2.54,1.36,.095,.44);for(const side of [-1,1])printRect(side*.50,2.78,.07,.32,.44);}
   if(style==='Longline bra and briefs'){for(const x of [-.44,-.16,.16,.44])printRect(x,2.56,.025,.44,.44);printRect(0,2.33,1.39,.06,.44);}
  }
  if(lingerie){
   paintSlot='torso';part('root',p.shirtColor);for(const side of [-1,1]){printRect(side*.45,3.08,.075,.18,.435);box(side*.45,3.08,-.419,.075,.18,.012);}part('root',accent);
   if(p.lingerie==='Lace set'){for(const y of [2.54,2.95])for(let i=0;i<11;i++){const x=-.6+i*.12;quad([x-.045,y,.443],[x,y+.035,.443],[x+.045,y,.443],[x,y-.035,.443]);}}
   if(p.lingerie==='Satin set'){printRect(0,2.55,1.4,.07,.44);for(const side of [-1,1])printRect(side*.53,2.78,.028,.31,.44);}
   if(p.lingerie==='Bustier'){for(const x of [-.48,-.22,.22,.48])printRect(x,2.48,.025,.91,.44);for(let i=0;i<6;i++){const y=2.16+i*.12;quad([-.10,y,.446],[-.08,y+.018,.446],[.10,y+.10,.446],[.08,y+.08,.446]);quad([.10,y,.446],[.08,y+.018,.446],[-.10,y+.10,.446],[-.08,y+.08,.446]);}}
   if(p.lingerie==='Bodysuit'){printRect(0,2.05,1.36,.045,.44);for(const side of [-1,1])printRect(side*.54,2.5,.038,.90,.44);}
   if(p.lingerie==='Camisole and thong'){for(let i=0;i<10;i++)printRect(-.56+i*.125,2.20,.06,.045,.44);printRect(0,2.92,.16,.065,.44);}
   if(['Lace bodysuit','Longline lace set'].includes(p.lingerie)){const start=p.lingerie==='Lace bodysuit'?2.07:2.38;for(let y=start;y<2.98;y+=.14)for(let x=-.56;x<.60;x+=.14)quad([x-.035,y,.445],[x,y+.035,.445],[x+.035,y,.445],[x,y-.035,.445]);}
   if(p.lingerie==='Corset and briefs'){for(const x of [-.48,-.24,0,.24,.48])printRect(x,2.50,.025,.88,.445);for(let y=2.16;y<2.95;y+=.15)printRect(0,y,.23,.028,.447);}
   if(p.lingerie==='Halter lingerie'){part('root',p.shirtColor);quad([-.40,3.0,.445],[.40,3.0,.445],[.13,3.16,.445],[-.13,3.16,.445]);part('root',accent);printRect(0,2.65,.025,.49,.447);}
   if(p.lingerie==='Ribbon set'){for(const side of [-1,1])tri([0,2.59,.449],[side*.18,2.70,.449],[side*.16,2.49,.449]);printRect(0,2.45,.032,.18,.449);}
   if(p.lingerie==='High waist set'){for(const x of [-.50,-.25,0,.25,.50])printRect(x,2.15,.026,.21,.446);printRect(0,2.26,1.34,.04,.446);}
   if(p.lingerie==='Bra and thong'){printRect(0,2.53,1.40,.04,.44);quad([-.13,2.61,.447],[0,2.55,.447],[.13,2.61,.447],[0,2.65,.447]);}
  }
  paintSlot='torso';if(under){part('root',accent);if(p.underwear==='Vest and briefs'){printRect(-.39,3.09,.09,.20);printRect(.39,3.09,.09,.20);}if(p.underwear==='Camisole and shorts'){printRect(-.49,3.10,.07,.18);printRect(.49,3.10,.07,.18);printRect(0,2.14,1.29,.08);}if(p.underwear==='Boxers and undershirt')printRect(0,2.40,.56,.10);if(p.underwear==='Thermal set')for(let y=2.17;y<3.0;y+=.13)printRect(0,y,.03,.05);}
  if(bikini){const style=p.swimwear;part('root',p.shirtColor);if(style==='Sport'||style==='Rash guard'){printRect(0,2.82,1.43,style==='Sport'?.30:.64);if(style==='Rash guard')for(const side of [-1,1]){paintSlot=side<0?'leftArm':'rightArm';part(paintSlot,p.shirtColor);box(side*1.03,2.59,.03,.48,.63,.51);}paintSlot='torso';}if(style==='Retro'){part('root',accent);for(const side of [-1,1])printRect(side*.31,2.83,.07,.21);}if(style==='Halter'){part('root',p.shirtColor);quad([-.34,3.06,.429],[.34,3.06,.429],[.12,3.17,.429],[-.12,3.17,.429]);}if(style==='High waist'){part('root',p.pantsColor);torso(1.93,2.33,1.30,1.41,.818);}if(style==='Wetsuit'){part('root',p.shirtColor);torso(1.93,3.16,1.35,1.63,.823);for(const side of [-1,1]){paintSlot=side<0?'leftLeg':'rightLeg';part(paintSlot,p.pantsColor);box(side*.39,1.07,0,.69,1.33,.72);}paintSlot='torso';part('root',accent);printRect(0,2.62,.03,.98,.434);}}
  if(swim&&p.swimwear==='High waist'){part('root',p.pantsColor);printRect(0,2.20,1.30,.27);}if(swim&&p.swimwear==='Rash guard'){part('root',accent);for(const x of [-.58,.58])printRect(x,2.56,.08,.90);}if(p.eyes==='Sleepy'){/* Eye shape gets its own upper-lid geometry below. */}
  paintSlot='torso';if(separated){part('root',accent);if(p.shirt==='Uniform'){printRect(-.39,2.71,.24,.20);printRect(.41,2.93,.18,.09);}if(p.shirt==='Leather jacket'){quad([-.57,3.06,.432],[-.19,2.73,.432],[-.30,3.06,.432],[-.57,3.06,.432]);printRect(.26,2.41,.36,.03);}if(p.shirt==='Tunic'){printRect(0,2.10,1.29,.09);for(let y=2.72;y<3.08;y+=.1)printRect(0,y,.23,.024);}}
  if(p.gender==='Female'&&p.neckline!=='Closed'&&!(separated&&p.shirt==='Bare torso')){
   paintSlot='torso';part('root',skin);const depth=.08+.72*p.necklineDepth/100,width=.10+.48*p.necklineWidth/100,z=armor?.491:.486;
   const edge=t=>{const y=3.16-depth*t,half=p.neckline==='V-neck'?width*(1-t):p.neckline==='Scoop'?width*Math.sqrt(Math.max(0,1-t*t)):p.neckline==='Sweetheart'?width*Math.sqrt(Math.max(0,1-t))*(.76+.24*Math.sin(t*Math.PI)):p.neckline==='Keyhole'?width*(.25+.75*Math.sin(t*Math.PI))*(1-t*.20):width*(1-t*.65),center=p.neckline==='Asymmetric'?.18*(1-t):0;return [[center-half,y,z],[center+half,y,z]];};
   for(let i=0;i<32;i++){const [a,b]=edge(i/32),[c,d]=edge((i+1)/32);quad(a,c,d,b);}
  }
  paintSlot='torso';nippleDetails(p);
  paintSlot='head';
  // Eyes, brows, and expressive mouth prints follow the head's curved surface.
  const ey=3.85,eyeR=p.eyes==='Wide'?.115:p.eyes==='Cartoon'?.13:.075;
  for(const side of [-1,1]){const x=side*.225,closed=p.eyes==='Closed'||p.eyes==='Wink'&&side===1||p.expression==='Sleepy'||p.expression==='Peaceful';part('root',ink);if(closed){path([[x-.10,ey],[x,ey-.035],[x+.10,ey]],.035);}else{
   if(p.eyes==='Almond'){disc(x,ey,.12,.056);}else if(p.eyes==='Sleepy'){disc(x,ey,.10,.052);}else disc(x,ey,eyeR,p.eyes==='Oval'?eyeR*1.3:eyeR);
   part('root',p.eyeColor);disc(x,ey,eyeR*.65,p.eyes==='Almond'||p.eyes==='Sleepy'?eyeR*.38:eyeR*.7,.025);part('root',ink);disc(x,ey,.028,.038,.031);part('root',white);disc(x-.021,ey+.030,.020,.022,.034);
  }part('root',hair);let a=4.01,b=4.04;if(['Angry','Determined'].includes(p.expression)){a=side===-1?4.055:3.995;b=side===-1?3.995:4.055;}if(['Sad','Scared'].includes(p.expression)){a=side===-1?3.995:4.06;b=side===-1?4.06:3.995;}path([[x-.105,a],[x+.10,b]],.025);}
  part('root',ink);const mouth=[];if(['Smile','Big grin','Laughing','Peaceful','Smirk'].includes(p.expression)){for(let i=0;i<=16;i++){const x=-.22+i/16*.44;mouth.push([x,3.54-.095*(1-Math.pow(x/.22,2))+(p.expression==='Smirk'?x*.18:0)]);}path(mouth,p.expression==='Big grin'||p.expression==='Laughing'?.12:.035);if(p.expression==='Big grin'){part('root',white);path(mouth,.063,.03);}if(p.expression==='Laughing'){part('root','#b94352');disc(0,3.43,.07,.025,.031);}}
  else if(['Surprised','Scared'].includes(p.expression)){disc(0,3.48,.09,.12);}else if(p.expression==='Sad'){for(let i=0;i<=14;i++){const x=-.20+i/14*.40;mouth.push([x,3.42+.09*(1-Math.pow(x/.20,2))]);}path(mouth,.035);}else path([[-.18,3.48],[.17,3.48+(p.expression==='Determined'?.025:0)]],.035);
  if(p.face.includes('Freckles')){part('root','#a56233');for(const side of [-1,1])for(const [x,y] of [[.31,3.69],[.40,3.73],[.38,3.64]])disc(x*side,y,.015);}
  if(p.face.toLowerCase().includes('blush')||p.face==='Makeup'){part('root','#d97c77');disc(-.38,3.66,.08,.045);disc(.38,3.66,.08,.045);}if(p.face==='Makeup'){part('root','#a92a59');path([[-.13,3.49],[0,3.46],[.13,3.49]],.04);part('root',ink);for(const side of [-1,1]){path([[side*.28,3.9],[side*.35,3.95]],.025);path([[side*.3,3.88],[side*.38,3.9]],.025);}}
  if(p.face==='Scar'){part('root','#b26448');path([[.38,4.03],[.25,3.65]],.027);}if(p.face==='Beauty mark'){part('root',ink);disc(.33,3.52,.019);}if(p.face==='Robot'){part('root','#737e90');path([[-.43,4.09],[-.43,3.61],[-.1,3.54]],.03);path([[.08,4.12],[.08,3.98],[.39,3.98]],.025);}if(p.face==='Tiger paint'){part('root','#e68426');disc(0,3.7,.11,.045);part('root',ink);for(const side of [-1,1])for(let i=0;i<3;i++)path([[side*.48,3.62+i*.11],[side*.34,3.65+i*.11]],.035);}if(p.face==='Superhero mask'){part('root',access);for(const side of [-1,1])ring(side*.225,ey,.145,.105,.085);path([[-.1,3.88],[.1,3.88]],.06);}
  if(p.facialHair!=='None'){part('root',hair);if(p.facialHair==='Stubble'){for(let i=0;i<8;i++)for(let j=0;j<3;j++)disc(-.29+i*.08,3.31+j*.06,.008);}else if(p.facialHair==='Moustache'){path([[-.27,3.59],[-.10,3.62],[0,3.59],[.10,3.62],[.27,3.59]],.066);}else if(p.facialHair==='Goatee'){disc(0,3.31,.095,.07);path([[-.14,3.59],[.14,3.59]],.04);}else {lathe(0,.10,[[.1,p.facialHair==='Long beard'?2.79:3.27],[.35,3.38],[.47,3.58],[.46,3.64]],24);}}
  if(p.glasses!=='None'){paintSlot='glasses';part('root',p.glassesColor);const rect=p.glasses==='Square',shade=['Sunglasses','Goggles','Visor','Eye patch'].includes(p.glasses);for(const side of [-1,1]){if(p.glasses==='Monocle'&&side===-1||p.glasses==='Eye patch'&&side===-1)continue;const x=side*.225;if(shade){disc(x,ey,.17,.108,.053);if(p.glasses!=='Eye patch'){part('root','#567887');path([[x-.09,ey+.04],[x+.07,ey+.07]],.018,.062);part('root',p.glassesColor);}}else if(rect){path([[x-.155,ey-.095],[x+.155,ey-.095],[x+.155,ey+.095],[x-.155,ey+.095],[x-.155,ey-.095]],.029,.055);}else ring(x,ey,.15,p.glasses==='Aviator'?.115:.13);box(side*.48,ey,.25,.04,.04,.52);}path([[-.08,ey+.02],[.08,ey+.02]],.027,.055);if(p.glasses==='Goggles'){ring(-.225,ey,.18,.13,.038);ring(.225,ey,.18,.13,.038);box(0,ey,-.57,1.14,.08,.045);}if(p.glasses==='Visor'){path([[-.44,ey],[.44,ey]],.14,.059);}}
  paintSlot='hair';
  // Molded hair: caps, waves, spikes, and individual tied or braided sections.
  if(p.hair!=='Bald'){part('root',hair);const tall=['Afro','Curly'].includes(p.hair),cropped=['Short','Side part','Swept','Pixie','Quiff'].includes(p.hair);lathe(0,-.025,[[.57,cropped?4.19:4.04],[.62,cropped?4.23:4.12],[.63,cropped?4.32:4.29],[.50,tall?4.62:4.47],[.18,tall?4.70:4.53],[0,tall?4.72:4.54]],32);
   if(['Short','Buzz cut','Side part','Pixie','Swept','Quiff'].includes(p.hair)){if(p.hair!=='Buzz cut'){const left=p.hair==='Side part'?4.08:p.hair==='Swept'?4.18:p.hair==='Pixie'?4.19:4.12,right=p.hair==='Side part'?4.18:p.hair==='Swept'?4.06:p.hair==='Pixie'?4.13:4.12;const points=[[-.46,left],[-.21,left+.025],[.02,(left+right)/2-.025],[.23,right+.015],[.46,right]];for(let i=0;i<points.length-1;i++){const [x,y]=points[i],[a,b]=points[i+1];quad(facePoint(x,y,.075),facePoint(a,b,.075),facePoint(a,4.29,.075),facePoint(x,4.29,.075));}}if(p.hair==='Quiff')sphere(-.12,4.46,.34,.38,.24,.28);}
   if(['Spiky','Mohawk'].includes(p.hair)){if(p.hair==='Mohawk')for(let i=0;i<5;i++)lathe(0,-.4+i*.2,[[.15,4.4],[.13,4.78],[0,4.98]],12);else for(let x=-.35;x<.4;x+=.23)for(let z=-.35;z<.4;z+=.23)lathe(x,z,[[.16,4.38],[.10,4.66],[0,4.82]],10);}
   if(tall)for(let i=0;i<18;i++){const a=i/18*6.2831853;sphere(Math.cos(a)*.48,4.34+(i%3)*.08,Math.sin(a)*.48,.21,tall&&p.hair==='Afro'?.27:.18,.21);}
   if(['Bob','Long','Ponytail','Pigtails','Bun','Braid','Dreadlocks'].includes(p.hair)){for(const side of [-1,1])box(side*.53,p.hair==='Long'?3.68:3.89,-.14,.23,p.hair==='Long'?1.01:.57,.64);if(['Long','Bob','Dreadlocks'].includes(p.hair)){box(0,p.hair==='Bob'?3.90:3.60,-.50,1.08,p.hair==='Bob'?.52:1.1,.23);if(p.hair==='Dreadlocks')for(let i=0;i<6;i++)cyl(-.48+i*.19,3.67,-.56,.085,1.23);}if(p.hair==='Ponytail')sphere(0,3.99,-.83,.24,.65,.24);if(p.hair==='Bun')sphere(0,4.52,-.45,.33);if(p.hair==='Pigtails')for(const side of [-1,1])sphere(side*.80,3.95,-.32,.23,.47,.23);if(p.hair==='Braid')for(let i=0;i<7;i++)sphere(Math.sin(i*2)*.055,4.1-i*.17,-.68,.14,.14,.14);}
  }
  paintSlot='hat';if(p.hat!=='None'){part('root',p.hatColor);const y=4.42,hat=p.hat;
   if(['Wizard hat','Witch hat'].includes(hat)){cyl(0,y,0,.87,.10);lathe(0,0,[[.61,y+.01],[.48,y+.30],[.23,y+.83],[.03,y+1.23],[0,y+1.26]],32);if(hat==='Wizard hat'){part('root',accent);box(0,y+.36,.43,.13,.13,.02);}}
   else if(['Crown','Tiara'].includes(hat)){lathe(0,0,[[.60,4.28],[.66,4.30],[.65,4.55],[.59,4.55],[.59,4.30]],32);for(let i=0;i<(hat==='Tiara'?3:8);i++){const a=hat==='Tiara'?.9+i*.65:i/8*6.2831853;box(Math.cos(a)*.60,4.63,Math.sin(a)*.60,.13,.24,.13);}part('root',access);sphere(0,4.56,.64,.075);}
   else if(['Space helmet','Knight helmet','Bike helmet'].includes(hat)){lathe(0,-.06,[[.59,4.08],[.68,4.22],[.70,4.44],[.55,4.67],[.20,4.78],[0,4.79]],32);if(hat!=='Bike helmet'){box(-.64,3.87,-.04,.13,.71,.80);box(.64,3.87,-.04,.13,.71,.80);box(0,3.48,.1,1.30,.13,.85);part('root',hat==='Space helmet'?'#5487ac':'#37414f');if(hat==='Knight helmet'){box(0,3.91,.62,1.14,.38,.06);part('root',ink);for(let i=0;i<7;i++)box(-.45+i*.15,3.90,.66,.05,.25,.01);}else {box(0,4.16,.58,1.20,.08,.15);}}}
   else if(hat==='Baseball cap'||hat==='Visor'){if(hat==='Baseball cap')sphere(0,4.42,-.04,.67,.32,.67);else cyl(0,4.38,0,.65,.14);box(0,4.30,.65,.97,.08,.64);}
   else if(hat==='Beanie'){sphere(0,4.43,0,.67,.41,.67);cyl(0,4.25,0,.68,.16);sphere(0,4.85,0,.15);}
   else if(hat==='Beret'){sphere(.09,4.46,-.02,.75,.20,.70);cyl(0,4.59,0,.07,.17);}
   else if(hat==='Hard hat'){sphere(0,4.44,0,.67,.37,.66);cyl(0,4.30,0,.73,.08);box(0,4.65,0,.10,.24,1.17);}
   else if(hat==='Chef hat'){cyl(0,4.47,0,.59,.35);for(let i=0;i<6;i++){const a=i/6*6.2831853;sphere(Math.cos(a)*.34,4.85,Math.sin(a)*.34,.35,.27,.35);}}
   else if(hat==='Pirate hat'){sphere(0,4.43,0,.69,.26,.58);box(-.68,4.40,0,.32,.35,.72);box(.68,4.40,0,.32,.35,.72);part('root',white);sphere(0,4.46,.58,.12,.13,.02);box(0,4.34,.59,.09,.05,.02);}
   else {const brim=hat==='Sun hat'?1.01:hat==='Cowboy hat'?.92:hat==='Bucket hat'?.80:.82;cyl(0,y,0,brim,.09);lathe(0,0,[[.58,y+.03],[hat==='Bucket hat'?.48:.56,y+(hat==='Top hat'?.77:.39)],[0,y+(hat==='Top hat'?.78:.40)]],32);part('root',accent);cyl(0,y+.14,0,.586,.10);}
  }
  paintSlot='cape';if(p.cape!=='None'){part('root',access);const length=p.cape==='Short cape'?1.23:2.73;sheet([-.73,3.11,-.51],[.73,3.11,-.51],[1.05,3.11-length,-.72],[-1.05,3.11-length,-.72]);if(p.cape==='Royal cape'){part('root',white);box(0,3.04,-.54,1.52,.14,.08);}if(p.cape==='Poncho'){torso(2.12,3.15,2.01,1.65,1.04);}}
  paintSlot='back';if(p.back!=='None'){part('root',access);const type=p.back;if(type==='Wings'){for(const side of [-1,1])sheet([side*.30,3.1,-.5],[side*2.20,3.6,-.66],[side*1.78,2.37,-.70],[side*.35,2.50,-.5]);}else if(['Scuba tanks','Jetpack'].includes(type)){for(const side of [-1,1])cyl(side*.37,2.62,-.77,.25,1.05);if(type==='Jetpack'){part('root',accent);for(const side of [-1,1])lathe(side*.37,-.77,[[.10,1.70],[.23,2.15],[0,2.15]],16);}}else if(type==='Quiver'){cyl(.25,2.59,-.73,.24,.95);part('root',hair);for(let i=0;i<3;i++)cyl(.13+i*.12,3.20,-.75,.028,.5);}else {box(type==='Messenger bag'?.32:0,type==='Messenger bag'?2.21:2.56,-.69,type==='Messenger bag'?1.18:1.04,type==='Hiking pack'?1.3:type==='Messenger bag'?.70:.94,.44);if(type==='Messenger bag'){for(let i=0;i<10;i++)printRect(-.56+i*.11,3.07-i*.085,.07,.13);}part('root',accent);box(0,2.51,-.934,.69,.48,.05);for(const side of [-1,1])printRect(side*.58,2.59,.08,.96);}}
  paintSlot='accessory';if(p.scarf!=='None'){part('root',access);if(p.scarf==='Tie'){printRect(0,2.68,.13,.76,.45);tri([-.065,2.30,.45],[.065,2.30,.45],[0,2.19,.45]);}else if(p.scarf==='Bow tie'){box(-.15,3.04,.46,.23,.17,.08);box(.15,3.04,.46,.23,.17,.08);}else {cyl(0,3.23,0,.36,.16);if(p.scarf==='Bandana')tri([-.30,3.14,.47],[.30,3.14,.47],[0,2.81,.47]);else box(.31,p.scarf==='Long scarf'?2.54:2.83,.47,.21,p.scarf==='Long scarf'?1.15:.56,.06);}}
  if(p.neck!=='None'){part('root',accent);for(let i=0;i<16;i++){const a=i/15*Math.PI;box(Math.cos(a)*.37,3.06-Math.sin(a)*.34,.437,.035,.035,.016);}if(p.neck==='Pearls')for(let i=0;i<12;i++){const a=i/11*Math.PI;sphere(Math.cos(a)*.37,3.06-Math.sin(a)*.34,.45,.044,.044,.024);}if(p.neck!=='Necklace')sphere(0,2.69,.45,p.neck==='Medal'?.12:.07,.10,.025);}
  if(p.ears!=='None'){part('head',p.ears==='Stud earrings'||p.ears==='Hoop earrings'?accent:access);for(const side of [-1,1]){if(p.ears==='Stud earrings')sphere(side*.60,3.52,0,.045);else if(p.ears==='Hoop earrings')lathe(side*.61,0,[[.12,3.36],[.13,3.4],[.13,3.5],[.09,3.5],[.09,3.4],[.12,3.36]],16);else sphere(side*.65,3.85,-.02,.16,.23,.22);}if(p.ears==='Ear defenders')for(const side of [-1,1])box(side*.70,3.87,-.02,.14,.40,.43);if(p.ears==='Headphones'||p.ears==='Ear defenders')box(0,4.47,-.12,1.22,.07,.13);}
  if(p.belt!=='None'){part('hips',p.shoeColor);box(0,1.97,0,1.45,.13,.84);part('hips',accent);box(0,1.97,.45,.22,.16,.045);if(p.belt!=='Simple belt'){part('hips',access);for(const side of [-1,1])box(side*.57,1.86,.46,.24,.30,.15);}}
  paintSlot='held';if(p.held!=='None'){part('rightArm',access);const x=1.10,y=1.94,z=.34,t=p.held;
   const weapon=typeof GameWeapons!=='undefined'?GameWeapons.catalog[t]:null;
   if(weapon?.style==='magic'){
    part('rightArm','#453350');limb([x,y-.25,z],[x,y+1.39,z],.085,.045);
    part('rightArm','#eec877');for(const at of [-.18,.12,.56,1.32])cyl(x,y+at,z,at===1.32?.13:.105,.07);
    const palette=typeof GameMagic!=='undefined'?GameMagic.get(p.spell).colors[0]:[.45,.35,.88],gem='#'+palette.map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');part('rightArm',gem);sphere(x,y+1.52,z,.15,.25,.15);
    part('rightArm','#b9f5ff');sphere(x,y+1.57,z,.085,.18,.085);
    part('rightArm','#eec877');for(const side of [-1,1])limb([x+side*.11,y+1.35,z],[x+side*.17,y+1.60,z],.035,.015);
   }else if(weapon?.style==='fire'){
    const antique=weapon.era==='Medieval',long=weapon.long,metal=antique?'#8996a6':'#354255',dark='#1d2634',silver='#b7c6d5',wood=antique?'#885432':'#73503b',end=weapon.muzzle[2];
    // Every firearm has an open muzzle, trigger guard and a distinct receiver.
    const barrel=(start,end,r)=>{part('rightArm',metal);limb([x,y+.25,z+start],[x,y+.25,z+end-.025],r,r);part('rightArm',silver);limb([x,y+.25,z+end-.045],[x,y+.25,z+end],r*1.10,r*1.10);part('rightArm',dark);limb([x,y+.25,z+end+.001],[x,y+.25,z+end+.005],r*.66,r*.66);};
    const grip=()=>{part('rightArm',antique?wood:dark);box(x,y-.10,z,.22,.45,.27);part('rightArm',silver);box(x,y-.17,z+.24,.055,.055,.35);box(x,y-.03,z+.43,.055,.32,.055);part('rightArm',dark);box(x,y+.02,z+.21,.05,.15,.05);};
    const stock=(length)=>{part('rightArm',wood);box(x,y+.10,z-.28,.26,.28,.45);sheet([x,y+.20,z-.35],[x,y+.16,z-length],[x,y-.17,z-length],[x,y-.07,z-.35],.29);part('rightArm',dark);box(x,y-.015,z-length,.31,.39,.09);};
    const sights=()=>{part('rightArm',silver);box(x,y+.44,z+.16,.11,.09,.13);box(x,y+.39,z+end-.13,.055,.12,.065);};
    grip();
    if(t==='Flintlock pistol'){
     part('rightArm',wood);box(x,y+.12,z+.31,.29,.28,.73);sphere(x,y-.23,z-.05,.17,.13,.15);barrel(.25,end,.105);part('rightArm','#d4b55e');box(x+.18,y+.20,z+.04,.08,.22,.34);box(x+.19,y+.37,z+.11,.065,.24,.09);box(x,y-.18,z,.23,.05,.29);sights();
    }else if(t==='Musket'){
     stock(.86);part('rightArm',wood);box(x,y+.13,z+.76,.25,.24,1.45);barrel(.04,end,.10);part('rightArm','#c5a461');box(x+.16,y+.22,z+.10,.085,.20,.36);box(x+.19,y+.38,z+.12,.08,.22,.09);for(const at of [.58,1.12,1.62]){part('rightArm',silver);box(x,y+.22,z+at,.29,.32,.075);}sights();part('rightArm',silver,false,'ramrod');limb([x-.17,y+.02,z+.34],[x-.17,y+.02,z+1.95],.026,.026);
    }else if(t==='Handgun'){
     part('rightArm',dark);box(x,y+.13,z+.36,.29,.23,.77);part('rightArm',silver,false,'slide');box(x,y+.28,z+.40,.32,.23,.88);part('rightArm',dark,false,'slide');for(const at of [-.01,.07,.15])box(x+.167,y+.28,z+at,.014,.14,.035);barrel(.84,end,.085);sights();part('rightArm',dark,false,'magazine');box(x,y-.29,z,.23,.12,.29);
    }else if(t==='Revolver'){
     part('rightArm',metal);box(x,y+.15,z+.24,.28,.26,.56);part('rightArm',metal,false,'cylinder');limb([x,y+.25,z+.08],[x,y+.25,z+.45],.205,.205);part('rightArm',dark,false,'cylinder');for(let i=0;i<6;i++){const a=i*Math.PI/3;limb([x+Math.cos(a)*.19,y+.25+Math.sin(a)*.19,z+.13],[x+Math.cos(a)*.19,y+.25+Math.sin(a)*.19,z+.40],.027,.027);}barrel(.46,end,.105);part('rightArm',silver);box(x,y+.44,z-.05,.065,.20,.12);sights();
    }else if(t==='Submachine gun'){
     part('rightArm',metal);box(x,y+.19,z+.42,.35,.34,1.02);barrel(.93,end,.11);part('rightArm',dark);box(x,y+.08,z+.93,.30,.22,.29);box(x,y+.42,z+.35,.14,.08,.63);part('rightArm',metal);limb([x-.12,y+.21,z-.07],[x-.12,y+.21,z-.62],.035,.035);limb([x+.12,y+.21,z-.07],[x+.12,y+.21,z-.62],.035,.035);box(x,y+.12,z-.63,.28,.29,.07);part('rightArm',dark,false,'magazine');box(x,y-.22,z+.45,.22,.57,.29);sights();
    }else if(t==='Rifle'){
     stock(.70);part('rightArm',metal);box(x,y+.18,z+.43,.34,.32,.89);part('rightArm',dark);box(x,y+.15,z+1.11,.30,.26,.66);for(const at of [.91,1.07,1.23,1.39]){part('rightArm',silver);box(x+.158,y+.15,z+at,.022,.13,.035);}barrel(1.43,end,.10);part('rightArm',dark);limb([x,y+.55,z+.14],[x,y+.55,z+.83],.13,.13);part('rightArm',silver);box(x,y+.39,z+.31,.18,.14,.07);box(x,y+.39,z+.67,.18,.14,.07);part('rightArm',dark,false,'magazine');sheet([x,y+.06,z+.42],[x,y+.06,z+.68],[x,y-.48,z+.53],[x,y-.48,z+.25],.25);sights();
    }else if(t==='Shotgun'){
     stock(.79);part('rightArm',metal);box(x,y+.16,z+.35,.33,.31,.71);barrel(.58,end,.115);part('rightArm',metal);limb([x,y+.045,z+.57],[x,y+.045,z+1.67],.085,.085);part('rightArm',wood,false,'pump');box(x,y+.07,z+1.00,.36,.28,.53);part('rightArm',dark,false,'pump');for(const at of [.80,.90,1.0,1.10,1.20])box(x,y+.07,z+at,.37,.29,.022);sights();part('rightArm','#b54835',false,'reload-shell');limb([x,y-.12,z+.17],[x,y-.12,z+.43],.065,.065);part('rightArm','#d4b55e',false,'reload-shell');limb([x,y-.12,z+.14],[x,y-.12,z+.19],.070,.070);
    }
   }else if(weapon){
    const metal='#9eafc3',edge='#d7e2ed',dark='#273345',wood='#96603a',tip=weapon.tip;
    const shaft=(end,r=.10,color=wood)=>{part('rightArm',color);limb([x,y-.28,z],[x,y+end,z],r,r);};
    const wrap=()=>{part('rightArm',dark);for(let at=-.18;at<=.20;at+=.085)box(x,y+at,z,.23,.035,.23);};
    if(t==='Club'){
     shaft(.70,.115);part('rightArm',wood);lathe(x,z,[[.12,y+.40],[.24,y+.64],[.30,y+1.14],[.25,y+tip-.04],[0,y+tip]],20);part('rightArm','#b5804d');for(const at of [.78,1.19])box(x,y+at,z,.59,.10,.56);wrap();
    }else if(t==='Mace'){
     shaft(tip-.24,.105);part('rightArm',metal);sphere(x,y+tip-.25,z,.34,.34,.34);for(let i=0;i<6;i++){const a=i*Math.PI/3,dx=Math.cos(a),dz=Math.sin(a);limb([x+dx*.23,y+tip-.25,z+dz*.23],[x+dx*.48,y+tip-.25,z+dz*.48],.12,.018);}limb([x,y+tip-.07,z],[x,y+tip+.16,z],.12,.018);wrap();
    }else if(t==='War hammer'||t==='Sledgehammer'){
     const heavy=t==='Sledgehammer',head=tip-.22;shaft(head,.115);part('rightArm',metal);box(x,y+head,z,heavy?1.08:.86,.44,.48);part('rightArm',edge);for(const side of [-1,1])box(x+side*(heavy?.51:.40),y+head,z,.09,.48,.52);part('rightArm',dark);box(x,y+head,z+.255,.17,.30,.035);wrap();
    }else if(t==='Sword'){
     shaft(.36,.095,dark);part('rightArm','#d5ac57');box(x,y+.30,z,.75,.12,.22);sphere(x,y-.24,z,.14,.12,.14);part('rightArm',metal);sheet([x-.16,y+.38,z],[x+.16,y+.38,z],[x+.14,y+tip-.26,z],[x-.14,y+tip-.26,z],.15);sheet([x-.14,y+tip-.26,z],[x+.14,y+tip-.26,z],[x,y+tip,z],[x,y+tip,z],.15);part('rightArm',edge);box(x,y+1.10,z+.083,.065,1.34,.023);
    }else if(t==='Battle axe'){
     shaft(tip-.16,.115);part('rightArm',metal);sheet([x-.10,y+tip-.55,z],[x+.40,y+tip-.08,z],[x+.78,y+tip+.01,z],[x+.73,y+tip-.78,z],.21);part('rightArm',edge);sheet([x+.69,y+tip-.03,z],[x+.78,y+tip+.01,z],[x+.73,y+tip-.78,z],[x+.64,y+tip-.69,z],.23);part('rightArm',dark);box(x,y+tip-.34,z,.27,.24,.30);wrap();
    }else if(t==='Baton'){
     shaft(tip,.12,dark);part('rightArm','#50637c');limb([x,y+.34,z],[x+.44,y+.34,z],.09,.09);sphere(x,y+tip,z,.12);wrap();
    }else if(t==='Baseball bat'){
     part('rightArm',wood);lathe(x,z,[[0,y-.30],[.16,y-.30],[.16,y-.22],[.095,y-.18],[.10,y+.30],[.16,y+.65],[.23,y+1.15],[.23,y+tip-.16],[.17,y+tip-.02],[0,y+tip]],24);wrap();
    }else if(t==='Crowbar'){
     shaft(tip-.24,.095,metal);part('rightArm',metal);limb([x,y+tip-.24,z],[x,y+tip-.10,z+.19],.105,.095);limb([x,y+tip-.10,z+.19],[x,y+tip-.30,z+.35],.095,.06);for(const dx of [-.058,.058])box(x+dx,y+tip-.33,z+.36,.052,.18,.09);wrap();
    }else if(t==='Hammer'){
     shaft(tip-.15,.095);part('rightArm',metal);box(x-.10,y+tip-.15,z,.61,.30,.33);part('rightArm',edge);box(x-.39,y+tip-.15,z,.10,.34,.38);for(const dz of [-.11,.11])limb([x+.19,y+tip-.10,z+dz],[x+.36,y+tip-.35,z+dz],.07,.035);wrap();
    }else if(t==='Wrench'){
     shaft(tip-.36,.115,metal);part('rightArm',metal);box(x,y+tip-.28,z,.40,.22,.19);for(const side of [-1,1])box(x+side*.19,y+tip-.12,z,.12,.28,.19);part('rightArm',edge);box(x,y+.40,z+.124,.09,.62,.022);wrap();
    }else if(t==='Shovel'){
     shaft(.87,.095);part('rightArm',dark);box(x,y+.91,z,.44,.09,.17);for(const side of [-1,1])box(x+side*.18,y+.75,z,.085,.32,.17);part('rightArm',metal);sheet([x-.22,y-.30,z],[x+.22,y-.30,z],[x+.30,y+tip+.12,z+.07],[x-.30,y+tip+.12,z+.07],.14);sheet([x-.30,y+tip+.12,z+.07],[x+.30,y+tip+.12,z+.07],[x+.20,y+tip,z+.09],[x-.20,y+tip,z+.09],.14);part('rightArm',edge);box(x,y-.51,z+.105,.075,.39,.03);wrap();
    }
   }else if(['Hammer','Wrench','Shovel','Sword','Wand','Torch','Flower','Umbrella'].includes(t)){box(x,y+.28,z,.09,.88,.10);part('rightArm',t==='Flower'?'#d94568':accent);if(t==='Hammer')box(x,y+.77,z,.59,.23,.23);if(t==='Wrench'){box(x,y+.66,z,.24,.17,.1);box(x-.1,y+.81,z,.06,.20,.1);box(x+.1,y+.81,z,.06,.20,.1);}if(t==='Shovel')box(x,y-.29,z,.42,.49,.08);if(t==='Sword'){box(x,y+.80,z,.16,1.23,.055);box(x,y+.28,z,.53,.07,.13);}if(t==='Wand')sphere(x,y+.87,z,.10);if(t==='Torch'){part('rightArm','#f3ac31');sphere(x,y+.90,z,.18,.32,.16);}if(t==='Flower'){for(let i=0;i<5;i++){const a=i/5*6.2831853;sphere(x+Math.cos(a)*.14,y+.85+Math.sin(a)*.14,z,.11,.11,.04);}}if(t==='Umbrella'){lathe(x,z,[[0,y+2.27],[.5,y+2.12],[1.20,y+1.84],[1.20,y+1.79],[0,y+2.22]],20);box(x,y+1.25,z,.08,1.40,.08);}}
   else if(t==='Shield'){box(x,y+.17,z,.78,1.05,.16);part('rightArm',accent);box(x,y+.17,z+.09,.08,.63,.01);box(x,y+.27,z+.09,.48,.08,.01);}else if(t==='Camera'){box(x,y+.20,z,.65,.4,.33);part('rightArm',ink);sphere(x,y+.20,z+.24,.17,.17,.1);}else if(t==='Guitar'){sphere(x,y-.06,z,.33,.42,.12);box(x,y+.51,z,.11,.77,.09);part('rightArm',ink);sphere(x,y+.03,z+.13,.10,.10,.012);}else if(t==='Map'){part('rightArm',white);box(x,y+.15,z,.76,.57,.035);part('rightArm',access);box(x,y+.16,z+.025,.04,.40,.01);box(x,y+.15,z+.025,.50,.04,.01);}else if(t==='Briefcase'){box(x,y-.31,z,.79,.55,.23);part('rightArm',accent);box(x,y-.02,z,.22,.06,.12);}else if(t==='Lantern'){box(x,y+.24,z,.39,.55,.36);part('rightArm','#f3c744');box(x,y+.24,z+.19,.28,.34,.01);}
  }
  rigGeometry();
  const partBounds={head:[[-.60,3.23,-.60],[.60,4.39,.60]],torso:[[-.85,1.78,-.46],[.85,3.17,.46]],leftLeg:[[-.75,.48,-.38],[-.03,1.79,.38]],rightLeg:[[.03,.48,-.38],[.75,1.79,.38]],leftArm:[[-1.45,2.20,-.28],[-.71,3.20,.29]],rightArm:[[.71,2.20,-.28],[1.45,3.20,.29]],leftFoot:[[-.77,0,-.41],[-.01,.86,.58]],rightFoot:[[.01,0,-.41],[.77,.86,.58]]};
  const fixedBounds=new Set(Object.keys(partBounds));for(const g of geometry.values()){if(!g.v.length)continue;if(!fixedBounds.has(g.slot)){const bound=partBounds[g.slot]||[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]],pivot=pivots[g.joint];for(let i=0;i<g.v.length;i+=3)for(let k=0;k<3;k++){const a=g.v[i+k]+pivot[k];bound[0][k]=Math.min(bound[0][k],a);bound[1][k]=Math.max(bound[1][k],a);}partBounds[g.slot]=bound;}}
  const uvFor=(a,normal,slot)=>{const [min,max]=partBounds[slot],unit=k=>Math.max(.002,Math.min(.998,(a[k]-min[k])/Math.max(.001,max[k]-min[k])));let face,u,w;const abs=normal.map(Math.abs);if(abs[2]>=abs[0]&&abs[2]>=abs[1]){face=normal[2]>=0?0:1;u=normal[2]>=0?unit(0):1-unit(0);w=unit(1);}else if(abs[0]>=abs[1]){face=normal[0]>=0?3:2;u=normal[0]>=0?1-unit(2):unit(2);w=unit(1);}else{face=normal[1]>=0?4:5;u=unit(0);w=normal[1]>=0?1-unit(2):unit(2);}return [(face%3+u)/3,(Math.floor(face/3)+(1-w))/2];};
  for(const g of geometry.values()){if(!g.v.length)continue;const a=gl.createBuffer(),b=gl.createBuffer(),u=gl.createBuffer(),uv=[],pivot=pivots[g.joint];for(let i=0;i<g.v.length;i+=9){const normal=g.uvNormals[i/9];for(let j=0;j<3;j++)uv.push(...uvFor(g.v.slice(i+j*3,i+j*3+3).map((v,k)=>v+pivot[k]),normal,g.slot));}gl.bindBuffer(gl.ARRAY_BUFFER,a);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(g.v),gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(g.n),gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,u);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(uv),gl.STATIC_DRAW);compiled.push({p:a,n:b,uv:u,count:g.v.length/3,joint:g.joint,slot:g.slot,locked:g.locked,variant:g.variant,color:rgb(g.color),surface:{vertices:g.v,uv,color:g.color},localBounds:typeof RigCollision!=='undefined'?RigCollision.vertexBounds(g.v):null,art:p.paint?.[g.slot]||null});}
  cache.set(signature,compiled);profileCache.set(p,signature);if(cache.size>32){const key=cache.keys().next().value,old=cache.get(key);cache.delete(key);for(const g of old){gl.deleteBuffer(g.p);gl.deleteBuffer(g.n);gl.deleteBuffer(g.uv);}}

 }
 // Rasterize the actual part mesh in its six print views. This keeps every asset
 // color and pattern in the editor without a second, approximate pattern catalog.
 function appearanceAtlas(p,slot){build(p);const width=384,height=256,data=new Uint8ClampedArray(width*height*4),depth=new Float32Array(width*height);depth.fill(-Infinity);for(const g of compiled){if(g.slot!==slot||g.variant==='fist')continue;const {vertices,uv,color}=g.surface,rgba=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)).concat(255);for(let i=0;i<vertices.length/3;i+=3){const points=[0,1,2].map(j=>[uv[(i+j)*2]*width,uv[(i+j)*2+1]*height]),face=Math.floor((points[0][1]+points[1][1]+points[2][1])/3/128)*3+Math.floor((points[0][0]+points[1][0]+points[2][0])/3/128),axis=[2,2,0,0,1,1][face],sign=[1,-1,-1,1,1,-1][face],z=[0,1,2].map(j=>(vertices[(i+j)*3+axis]+pivots[g.joint][axis])*sign),[[ax,ay],[bx,by],[cx,cy]]=points,den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<.00001)continue;const x0=Math.max(face%3*128,Math.floor(Math.min(ax,bx,cx))),x1=Math.min(face%3*128+127,Math.ceil(Math.max(ax,bx,cx))),y0=Math.max(Math.floor(face/3)*128,Math.floor(Math.min(ay,by,cy))),y1=Math.min(Math.floor(face/3)*128+127,Math.ceil(Math.max(ay,by,cy)));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const u=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/den,v=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/den,w=1-u-v;if(u<-.00001||v<-.00001||w<-.00001)continue;const index=y*width+x,d=u*z[0]+v*z[1]+w*z[2];if(d>=depth[index]-.000001){depth[index]=d;data.set(rgba,index*4);}}}}return {width,height,data};}
 function texture(data){if(!data)return fallback;if(textureCache.has(data))return textureCache.get(data);textureCache.set(data,fallback);const image=new Image();image.onload=()=>{if(textureCache.get(data)!==fallback)return;const c=document.createElement('canvas');c.width=384;c.height=256;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,384,256);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,384,256,0,gl.RGBA,gl.UNSIGNED_BYTE,ctx.getImageData(0,0,384,256).data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);textureCache.set(data,t);if(textureCache.size>80){const key=textureCache.keys().next().value,old=textureCache.get(key);textureCache.delete(key);if(old!==fallback)gl.deleteTexture(old);}onDirty();};image.onerror=()=>onDirty();image.src=data;return fallback;}
 let scene=null;
 function begin(mvp,eye,light){scene={mvp,eye,light};gl.useProgram(program);gl.uniformMatrix4fv(U.MVP,false,mvp);gl.uniform3fv(U.Eye,eye);gl.uniform3fv(U.Light,light.light);gl.uniform3fv(U.Ambient,light.ambient.map(v=>Math.max(v,.27)));gl.uniform3fv(U.Fog,light.horizon);gl.uniform2f(U.FogRange,80,180);gl.uniform1f(U.Alpha,1);gl.uniform1f(U.Floor,0);gl.uniform1f(U.Flat,0);gl.uniform1f(U.Snow,0);gl.uniform1f(U.Night,light.night);gl.uniform1f(U.Particle,0);gl.uniform1i(U.Texture,0);gl.activeTexture(gl.TEXTURE0);gl.disable(gl.BLEND);gl.depthMask(true);}
 function renderMesh(g,m,c,override=null){if(g.uv){gl.bindBuffer(gl.ARRAY_BUFFER,g.uv);gl.enableVertexAttribArray(A);gl.vertexAttribPointer(A,2,gl.FLOAT,false,0,0);}else{gl.disableVertexAttribArray(A);gl.vertexAttrib2f(A,0,0);}gl.bindTexture(gl.TEXTURE_2D,override||texture(g.art));gl.uniform1f(U.Paint,override||g.art?1:0);gl.uniformMatrix4fv(U.Model,false,m);gl.uniform3fv(U.Color,c);gl.bindBuffer(gl.ARRAY_BUFFER,g.p);gl.enableVertexAttribArray(P);gl.vertexAttribPointer(P,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,g.n);gl.enableVertexAttribArray(N);gl.vertexAttribPointer(N,3,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,g.count);}
 function groupMatrix(g,pose,held,state,p,preview,weapon,buildWeight,motion){
   let rig=g.slot==='held'?held:pose[g.joint];
   if(state.studioPose?.prop==='bat'||state.studioPose?.prop==='hockey'){
    const lengths=StudioMotion.armLengths(p),side=g.joint.startsWith('left')?-1:1;
    if(g.locked&&['leftArm','rightArm'].includes(g.joint)){const rest=sub(pivots[side<0?'leftForearm':'rightForearm'],pivots[g.joint]);rig=rigidAttachment(rig,rest,rest,lengths[0]);}
    if(g.slot.endsWith('Hand'))rig=rigidHand(rig,g.slot==='leftHand'?-1:1,lengths[1]);
   }
   // Clearance-aware weapon elbows retain their round shape while reaching.
   if(g.locked&&weapon?.bodyClearance&&['leftArm','rightArm'].includes(g.joint)){const side=g.joint==='leftArm'?-1:1,child=side<0?'leftForearm':'rightForearm',rest=sub(pivots[child],pivots[g.joint]),length=1+(weaponArmLengths(weapon,p,side)[0]-1)*(preview?1:1-buildWeight);rig=rigidAttachment(rig,rest,rest,length);}
   if(g.slot.endsWith('Hand')&&weapon&&(!preview||weapon.bodyClearance))rig=rigidHand(rig,g.slot==='leftHand'?-1:1,1+(weaponArmLengths(weapon,p,g.slot==='leftHand'?-1:1)[1]-1)*(preview?1:1-buildWeight));
   if(g.slot==='rightHand'&&weapon?.handDriven){
    // The hand owns the orientation; the mace is a fixed attachment to it.
    const grip=weaponHandMatrix(pose,state,weapon,p);
    rig=blendBone(rig,grip,preview?1:1-smooth((buildWeight-.35)/.30));
   }
   if(g.slot==='held'&&!preview&&weapon&&buildWeight===0){
    const m=motion,cycle=Math.sin(m.reload*Math.PI*6)*m.load;
    if(g.variant==='magazine')rig=mul(held,matrix(-.07*m.load,-.50*m.load,0));
    if(g.variant==='slide')rig=mul(held,matrix(0,0,-.12*m.recoil));
    if(g.variant==='pump')rig=mul(held,matrix(0,0,-.24*Math.sin(Math.PI*clamp01((m.t-.28)/.50))*(state.attack>0?1:0)));
    if(g.variant==='ramrod')rig=mul(held,matrix(0,.10*m.load,.56*m.load+.24*cycle));
    if(g.variant==='reload-shell')rig=mul(held,matrix(-.12*m.load,-.14*m.load-.12*cycle,0));
    if(g.variant==='cylinder'){const pivot=add(weaponGrip,[0,.25,.25]);rig=mul(held,mul(matrix(...add(pivot,[-.24*m.load,.04*m.load,0]),0,0,Math.PI*6*m.reload*m.load),matrix(...pivot.map(v=>-v))));}
   }
  return scaledMatrix(rig,state,p);
 }
 const colliderCache=new WeakMap();
 function collisionParts(p){
  if(colliderCache.has(p))return colliderCache.get(p);
  build(p);const merged=new Map();for(const g of compiled){if(g.variant!=='normal'||!g.localBounds)continue;const key=g.joint+'|'+g.slot+'|'+g.locked;let part=merged.get(key);if(!part){part={joint:g.joint,slot:g.slot,locked:g.locked,variant:g.variant,localBounds:{min:[...g.localBounds.min],max:[...g.localBounds.max]}};merged.set(key,part);}else for(let k=0;k<3;k++){part.localBounds.min[k]=Math.min(part.localBounds.min[k],g.localBounds.min[k]);part.localBounds.max[k]=Math.max(part.localBounds.max[k],g.localBounds.max[k]);}}
  const parts=[...merged.values()];
  // Preserve separate clothing/accessory boxes rather than widening one body envelope.
  const rig={parts,matrix:groupMatrix};colliderCache.set(p,rig);return rig;
 }
 function bindCollision(p,controller){
  const old=controller.state.rigContact;
  if(old?.profile===p&&old.controller===controller)return;
  Object.defineProperty(controller.state,'rigContact',{configurable:true,enumerable:false,value:{...collisionParts(p),profile:p,controller}});
 }
 function draw(p,state,preview=false,animated=false){
  build(p);if(preview&&livePaint?.dirty){liveTexture=uploadCanvas(livePaint.canvas,liveTexture);livePaint.dirty=false;}
  const neutral=preview&&!animated,pose=jointPose(state,neutral,p),held=heldPose(pose,state,p,neutral),weapon=!(state.heroAction||state.flying||state.climbing)&&typeof GameWeapons!=='undefined'?GameWeapons.catalog[p.held]:null,buildWeight=weaponBuild(state),motion=weapon?combatMotion(state,weapon):null,clenched=!neutral&&(state.studioFist||(p.held==='None'||state.heroAction==='Claws')&&state.attack>0&&attackWeight(clamp01(1-state.attack/.52))>.08);
  for(const g of compiled){
   if(g.slot==='held'&&(state.heroAction||state.flying||state.climbing))continue;
   if(g.variant==='claws'){if(p.held!=='None'&&state.heroAction!=='Claws')continue;}else if(g.slot.endsWith('Hand')&&(g.variant==='fist')!==clenched)continue;
   if(g.variant==='reload-shell'&&(neutral||!state.reload||buildWeight>0))continue;
   const rig=groupMatrix(g,pose,held,state,p,neutral,weapon,buildWeight,motion);
   renderMesh(g,rig,g.color,preview&&livePaint?.slot===g.slot?liveTexture:null);
  }
 }

 function debris(mesh,d){renderMesh(mesh,matrix(d.x,d.y,d.z,d.ry||0,d.rx||0,d.rz||0,d.scale||.65),d.color);}
 function effect(mesh,m,color,alpha=1,additive=true){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,additive?gl.ONE:gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.uniform1f(U.Flat,additive?1:0);gl.uniform1f(U.Alpha,alpha);renderMesh(mesh,m,color);gl.uniform1f(U.Flat,0);gl.uniform1f(U.Alpha,1);gl.depthMask(true);gl.disable(gl.BLEND);}
 return {begin,draw,debris,effect,matrix,mul,appearanceAtlas,setLivePaint,cachePaint,collisionParts,bindCollision};
}
function muzzle(profile,state){const w=GameWeapons.get(profile.held),pose=jointPose(state,false,profile),held=scaledMatrix(heldPose(pose,state,profile),state,profile);return transform(held,add(weaponGrip,w.muzzle||[0,.24,w.long?1.48:.73]));}
return {create,matrix,mul,jointPose,heldPose,muzzle,strikePoints,pivots,parents,freeJointPose,transform,solveLimb,handGrip,weaponArmLengths,weaponBuild,combatMotion,aimBone,relativeTransform,blendBone,scaledMatrix,effectPose};
})();
