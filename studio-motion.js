// Local choreography: no physics, equipment writes, or exploration actions.
const StudioMotion=(()=>{
 'use strict';
 const clips=[],smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 const add=(id,label,group,duration,keys,prop=null)=>clips.push({id:'routine:'+id,label,group,kind:'routine',duration,keys,prop,held:'None'});
 const guard={la:[-1.05,0,-.18],ra:[-1.05,0,.18],le:-1.1,re:-1.1,ll:[-.12,0,0],rl:[-.12,0,0],lk:.22,rk:.22,y:1.73};
 const overhead={la:[-2.9,0,-.12],ra:[-2.9,0,.12],le:-.12,re:-.12};
 // Each sequence begins and ends in the same stance. Interpolation eases
 // through wind-up, contact, follow-through and recovery, including holds.
 const cycle=(start,middle,peak,end=middle)=>[[0,start],[.23,middle],[.44,peak],[.64,peak],[.82,end],[1,start]];
 const hold=p=>[[0,p],[.15,p],[.8,p],[1,p]];
 add('mountain','Mountain · overhead stretch','Yoga',5,cycle({}, {la:[-1.4,0,-.3],ra:[-1.4,0,.3]},overhead),'mat');
 add('tree','Tree · balance','Yoga',6,cycle({la:[-.9,0,-.35],ra:[-.9,0,.35],le:-1.1,re:-1.1},{rl:[-.45,0,.45],rk:1.1},{...overhead,rl:[-.9,.45,.55],rk:1.65}),'mat');
 add('warrior','Warrior · lunge and reach','Yoga',6,cycle({stance:.65},{y:1.4,ll:[-.65,0,0],lk:1.1,rl:[.3,0,0],la:[0,0,-1.55],ra:[0,0,1.55]},{y:1.3,ll:[-.85,0,0],lk:1.25,rl:[.4,0,0],la:[0,0,-1.55],ra:[0,0,1.55],turn:.18}),'mat');
 add('chair','Chair · bent-knee hold','Yoga',5,cycle({}, {y:1.45,lean:.15,...overhead},{y:1.08,lean:.24,...overhead}),'mat');
 add('side-bend','Standing side bend','Yoga',6,[[0,overhead],[.25,{...overhead,roll:.32}],[.5,overhead],[.75,{...overhead,roll:-.32}],[1,overhead]],'mat');
 const plank={body:1.47,y:.92,free:true,la:[-1.47,0,-.13],ra:[-1.47,0,.13],le:-.05,re:-.05};
 add('plank','Plank · hold','Yoga',4,hold(plank),'mat');
 add('cobra','Cobra · chest lift','Yoga',5,cycle({...plank,y:.42,lean:-.2},{...plank,y:.42,lean:-.25},{...plank,y:.42,lean:-.52,head:.35}),'mat');
 add('seated-twist','Seated torso twist','Yoga',6,[[0,{y:.6,free:true,ll:[-1.5,0,0],rl:[-1.5,0,0],la:[-.45,0,-.2],ra:[-.45,0,.2]}],[.25,{y:.6,free:true,ll:[-1.5,0,0],rl:[-1.5,0,0],turn:.65,head:-.3,la:[-.6,0,-.3],ra:[-.2,0,.3]}],[.5,{y:.6,free:true,ll:[-1.5,0,0],rl:[-1.5,0,0]}],[.75,{y:.6,free:true,ll:[-1.5,0,0],rl:[-1.5,0,0],turn:-.65,head:.3,la:[-.2,0,-.3],ra:[-.6,0,.3]}],[1,{y:.6,free:true,ll:[-1.5,0,0],rl:[-1.5,0,0],la:[-.45,0,-.2],ra:[-.45,0,.2]}]],'mat');
 add('squat','Squats','Exercise',2.6,cycle({}, {y:1.5,lean:.15,la:[-.7,0,0],ra:[-.7,0,0]}, {y:.95,lean:.3,la:[-1.2,0,0],ra:[-1.2,0,0]}));
 add('jumping-jacks','Jumping jacks','Exercise',1.8,cycle({}, {free:true,y:1.94,ll:[0,0,-.25],rl:[0,0,.25],la:[0,0,-1.4],ra:[0,0,1.4]}, {free:true,y:2.04,ll:[0,0,-.45],rl:[0,0,.45],la:[0,0,-2.85],ra:[0,0,2.85]}));
 add('push-up','Push-ups','Exercise',2.8,cycle(plank,{...plank,le:-.55,re:-.55,y:.85},{...plank,la:[-1.1,0,-.2],ra:[-1.1,0,.2],le:-1.2,re:-1.2,y:.55}),'mat');
 add('sit-up','Sit-ups','Exercise',3,cycle({body:-1.5,y:.7,free:true,ll:[-.8,0,0],rl:[-.8,0,0],lk:1.35,rk:1.35,la:[-1.5,0,-.3],ra:[-1.5,0,.3],le:-1.5,re:-1.5},{body:-.8,y:.7,free:true,ll:[-.7,0,0],rl:[-.7,0,0],lk:1.1,rk:1.1,la:[-1.5,0,-.3],ra:[-1.5,0,.3],le:-1.5,re:-1.5},{body:-.35,y:.7,free:true,ll:[-.6,0,0],rl:[-.6,0,0],lk:1,rk:1,la:[-1.5,0,-.3],ra:[-1.5,0,.3],le:-1.5,re:-1.5}),'mat');
 add('lunges','Alternating lunges','Exercise',4,[[0,{}],[.25,{y:1.12,ll:[-.85,0,0],lk:1.4,rl:[.3,0,0],rk:.45,la:[-.6,0,0],re:-.8}],[.5,{}],[.75,{y:1.12,rl:[-.85,0,0],rk:1.4,ll:[.3,0,0],lk:.45,ra:[-.6,0,0],le:-.8}],[1,{}]]);
 add('high-knees','High knees','Exercise',1.4,[[0,{}],[.25,{ll:[-1.4,0,0],lk:1.5,la:[.4,0,0],ra:[-.8,0,0],le:-.7,re:-.7}],[.5,{}],[.75,{rl:[-1.4,0,0],rk:1.5,ra:[.4,0,0],la:[-.8,0,0],le:-.7,re:-.7}],[1,{}]]);
 add('arm-circles','Arm circles','Exercise',3,[[0,{la:[0,0,-1.45],ra:[0,0,1.45]}],[.25,{la:[-.45,0,-1.2],ra:[-.45,0,1.2]}],[.5,{la:[0,0,-.95],ra:[0,0,.95]}],[.75,{la:[.45,0,-1.2],ra:[.45,0,1.2]}],[1,{la:[0,0,-1.45],ra:[0,0,1.45]}]]);
 add('biceps-curl','Dumbbell curls','Exercise',2.5,cycle({la:[-.12,0,-.15],ra:[-.12,0,.15]}, {la:[-.15,0,-.15],ra:[-.15,0,.15],le:-.9,re:-.9}, {la:[-.25,0,-.15],ra:[-.25,0,.15],le:-2.1,re:-2.1}),'weights');
 const standingTilt={y:1.72,la:[-.12,0,-.12],ra:[-.12,0,.12],le:-.25,re:-.25};
 add('standing-pelvic-tilt','Standing · pelvic tilts','Exercise',3.6,[[0,standingTilt],[.25,{...standingTilt,z:.13,body:.18,lean:-.18}],[.5,standingTilt],[.75,{...standingTilt,z:-.1,body:-.14,lean:.14}],[1,standingTilt]]);
 add('prone-hip-rock','Face down · hip rocks','Exercise',4,[[0,plank],[.25,{...plank,y:.98,z:-.1,body:1.35,lean:.12}],[.5,plank],[.75,{...plank,y:.86,z:.1,body:1.59,lean:-.12}],[1,plank]],'mat');
 add('jab-cross','Boxing · jab and cross','Fighting',2,[[0,guard],[.2,{...guard,turn:.2,la:[-1.6,0,-.15],le:-.08}],[.36,guard],[.55,{...guard,hipTurn:-.18,turn:-.38,ra:[-1.6,0,.05],re:-.08}],[.73,guard],[1,guard]]);
 add('hook','Boxing · hook','Fighting',1.6,cycle(guard,{...guard,turn:.3,ra:[-1.4,-.4,.5],re:-1.4},{...guard,hipTurn:-.22,turn:-.5,ra:[-1.4,.65,-.35],re:-1.35}));
 add('uppercut','Boxing · uppercut','Fighting',1.6,cycle(guard,{...guard,y:1.5,turn:.25,ra:[-.35,0,.25],re:-1.1},{...guard,turn:-.4,ra:[-1.6,0,.1],re:-1.25}));
 add('dodge','Boxing · duck and weave','Fighting',2.4,[[0,guard],[.25,{...guard,y:1.3,roll:.25,lean:.18}],[.5,{...guard,y:1.25,lean:.24}],[.75,{...guard,y:1.4,roll:-.25}],[1,guard]]);
 add('block','Martial arts · high block','Fighting',1.7,cycle(guard,{...guard,turn:.15,ra:[-1.8,0,.3],re:-1.2},{...guard,ra:[-2.45,0,.4],re:-.65}));
 add('front-kick','Front kick','Kicking',1.9,cycle(guard,{...guard,rl:[-1.4,0,0],rk:1.7,lean:-.14},{...guard,rl:[-1.6,0,0],rk:.05,lean:-.2}));
 add('side-kick','Side kick','Kicking',2.1,cycle(guard,{...guard,rl:[-.7,.25,.55],rk:1.65},{...guard,rl:[-.15,.3,1.48],rk:.1,roll:-.2,turn:.3}));
 add('roundhouse','Roundhouse kick','Kicking',2.2,cycle(guard,{...guard,rl:[-.9,-.45,.5],rk:1.5,turn:.35},{...guard,hipTurn:.3,turn:.7,rl:[-1.2,.75,.55],rk:.1,roll:-.15}));
 add('back-kick','Back kick','Kicking',2,cycle(guard,{...guard,rl:[-.35,0,0],rk:1.6,turn:.5},{...guard,rl:[1.25,0,0],rk:.12,lean:.4,turn:.65}));
 add('knee-strike','Knee strike','Kicking',1.6,cycle(guard,{...guard,rl:[-.6,0,0],rk:1.65},{...guard,rl:[-1.65,0,0],rk:1.85,lean:.15,la:[-.6,0,-.25],ra:[-.6,0,.25]}));
 add('soccer-dribble','Football / soccer · dribble','Football / soccer',2,[[0,{}],[.25,{rl:[-.45,0,0],rk:.4,la:[-.35,0,-.2]}],[.5,{}],[.75,{ll:[-.45,0,0],lk:.4,ra:[-.35,0,.2]}],[1,{}]],'soccer-dribble');
 add('soccer-pass','Football / soccer · pass','Football / soccer',2,cycle({},{rl:[.6,0,.1],rk:.9,turn:.2,la:[-.3,0,-.45]},{rl:[-1.05,0,.15],rk:.1,hipTurn:-.16,turn:-.22,la:[-.6,0,-.55]}),'soccer-pass');
 add('soccer-shot','Football / soccer · power shot','Football / soccer',2.4,cycle({},{rl:[.85,0,0],rk:1.3,turn:.35,ra:[.4,0,.5],la:[-.4,0,-.55]},{rl:[-1.45,0,0],rk:.1,hipTurn:-.25,turn:-.5,lean:.18,la:[-.7,0,-.7],ra:[-.3,0,.55]}),'soccer-shot');
 add('volley-bump','Volleyball · forearm pass','Volleyball',2.4,cycle({y:1.6,la:[-.8,0,.15],ra:[-.8,0,-.15]},{y:1.3,la:[-1.3,0,.3],ra:[-1.3,0,-.3],le:-.05,re:-.05},{y:1.75,la:[-1.65,0,.25],ra:[-1.65,0,-.25]}),'volley-bump');
 add('volley-set','Volleyball · overhead set','Volleyball',2.4,cycle({la:[-1.5,0,-.25],ra:[-1.5,0,.25],le:-1.2,re:-1.2},{y:1.4,la:[-2,0,-.15],ra:[-2,0,.15],le:-.8,re:-.8},{la:[-2.8,0,-.15],ra:[-2.8,0,.15],le:-.05,re:-.05}),'volley-set');
 add('volley-spike','Volleyball · jump spike','Volleyball',2.5,cycle({},{y:1.35,la:[.45,0,-.25],ra:[.55,0,.25]},{y:2.35,free:true,rl:[.1,0,0],ll:[.1,0,0],rk:.4,lk:.4,ra:[-2.65,0,.25],re:-.3,la:[-1.6,0,-.35],turn:.3},{y:2.05,free:true,ra:[-1.1,0,.15],re:-.05,la:[-.6,0,-.4],turn:-.4,lean:.15}),'volley-spike');
 add('baseball-swing','Baseball · batting','Baseball',2.5,cycle({grip:[0,2.75,.5,0,0,-.85]},{turn:.4,hipTurn:.2,grip:[0,2.95,.5,.15,0,-.95]},{turn:-.55,hipTurn:-.25,grip:[0,2.7,.55,1.2,0,-1.45]},{turn:-.35,grip:[0,2.9,.8,.7,0,-2.2]}),'bat');
 add('baseball-pitch','Baseball · pitch','Baseball',2.4,cycle({ra:[-.5,0,.2],re:-.7},{ll:[-1.3,0,0],lk:1.5,turn:.4,ra:[-2.1,0,.45],re:-1.2},{turn:-.6,hipTurn:-.25,lean:.2,ra:[-1.7,0,.15],re:-.05,ll:[-.3,0,0],lk:.3},{turn:-.35,lean:.25,ra:[-.5,0,-.2],re:-.25}),'baseball-pitch');
 add('baseball-catch','Baseball · catch','Baseball',2.2,cycle({la:[-.7,0,-.2],le:-.6},{la:[-1.5,0,-.25],le:-.15},{y:1.55,la:[-1.25,0,-.15],le:-.85,ra:[-1,0,-.2],re:-.9}),'baseball-catch');
 add('hockey-handle','Hockey · stick handling','Hockey',3,[[0,{y:1.6,lean:.2,grip:[0,2.5,.6,.7,0,-.25]}],[.25,{y:1.6,lean:.2,turn:.15,grip:[-.12,2.5,.6,.7,0,-.5]}],[.5,{y:1.6,lean:.2,grip:[0,2.5,.6,.7,0,-.25]}],[.75,{y:1.6,lean:.2,turn:-.15,grip:[.12,2.5,.6,.7,0,.05]}],[1,{y:1.6,lean:.2,grip:[0,2.5,.6,.7,0,-.25]}]],'hockey');
 add('hockey-slapshot','Hockey · slap shot','Hockey',2.6,cycle({y:1.6,lean:.2,grip:[0,2.5,.6,.7,0,-.25]},{turn:.5,hipTurn:.25,grip:[0,2.9,.4,.3,0,-1.5]},{turn:-.55,hipTurn:-.25,lean:.25,grip:[0,2.5,.6,.6,0,.2]},{turn:-.4,grip:[0,2.8,.5,.3,0,1.2]}),'hockey');
 add('hockey-save','Hockey · goalie save','Hockey',2.4,cycle({y:1.5,stance:.65,la:[-.5,0,-.5],ra:[-.5,0,.5]},{y:1.1,stance:.8,lean:.15},{y:.85,stance:.9,la:[-1.1,0,-.8],ra:[-.9,0,.6],turn:.15}),'hockey-save');
 add('basket-dribble','Basketball · dribble','Basketball',1.6,cycle({y:1.65,ra:[-.7,0,.25],re:-.7},{y:1.6,ra:[-.6,0,.25],re:-.15},{y:1.65,ra:[-.7,0,.25],re:-.7}),'basket-dribble');
 add('basket-shot','Basketball · jump shot','Basketball',2.7,cycle({la:[-1,0,.1],ra:[-1,0,-.1],le:-1,re:-1},{y:1.35,la:[-1.8,0,-.15],ra:[-1.8,0,.15],le:-.9,re:-.9},{y:2.2,free:true,la:[-2.6,0,-.15],ra:[-2.7,0,.15],le:-.05,re:-.05},{la:[-2.5,0,-.15],ra:[-2.65,0,.15],le:-.15,re:-.1}),'basket-shot');
 add('basket-pass','Basketball · chest pass','Basketball',2,cycle({la:[-1.1,0,.2],ra:[-1.1,0,-.2],le:-1,re:-1},{y:1.6,la:[-1.1,0,.2],ra:[-1.1,0,-.2],le:-1.2,re:-1.2},{la:[-1.55,0,.3],ra:[-1.55,0,-.3],le:-.05,re:-.05,lean:.12}),'basket-pass');
 const defaults={y:1.78,z:0,body:0,hipTurn:0,turn:0,lean:0,roll:0,head:0,stance:.39,free:false,la:[0,0,-.06],ra:[0,0,.06],ll:[0,0,0],rl:[0,0,0],le:-.12,re:-.12,lk:.035,rk:.035,grip:null};
 function parameters(clip,u){let a=clip.keys[0],b=clip.keys[1];for(let i=1;i<clip.keys.length;i++)if(u<=clip.keys[i][0]){a=clip.keys[i-1];b=clip.keys[i];break;}const t=smooth((u-a[0])/(b[0]-a[0])),p={};for(const key of Object.keys(defaults)){const av=a[1][key]??defaults[key],bv=b[1][key]??defaults[key];p[key]=Array.isArray(av)&&Array.isArray(bv)?av.map((v,k)=>v+(bv[k]-v)*t):typeof av==='number'?av+(bv-av)*t:av;}return p;}
 const chest=p=>p?.gender==='Female'&&!['Printed','Comic'].includes(p.breastMode)?(p.breastSize||0)/100:0;
 const armLengths=p=>[1.45+chest(p)*.35,1.45+chest(p)*.25];
 function pose(s,profile=null){
  const M=CharacterModel,{matrix:mat,mul,transform:tr,pivots:P}=M,p=parameters(s.studioPose,s.studioProgress),rot=(pos,r=[0,0,0])=>mat(...pos,r[1],r[0],r[2]),sub=(a,b)=>a.map((v,k)=>v-b[k]);
  const hips=mat(0,p.y,p.z,p.hipTurn,p.body),base=mul(hips,mat(0,-1.78,0)),root=mul(base,mul(mat(0,1.92,0,p.turn,p.lean,p.roll),mat(0,-1.92,0))),out={root,hips,head:mul(root,mat(...P.head,-p.turn*.6,p.head))};
  for(const side of [-1,1]){
   const left=side<0,arm=left?'leftArm':'rightArm',fore=left?'leftForearm':'rightForearm',leg=left?'leftLeg':'rightLeg',shin=left?'leftShin':'rightShin',foot=left?'leftFoot':'rightFoot';
   out[arm]=mul(root,rot(P[arm],p[left?'la':'ra']));out[fore]=mul(out[arm],mat(...sub(P[fore],P[arm]),0,p[left?'le':'re']));
   out[leg]=mul(base,rot(P[leg],p[left?'ll':'rl']));out[shin]=mul(out[leg],mat(...sub(P[shin],P[leg]),0,p[left?'lk':'rk']));out[foot]=mul(out[shin],mat(...sub(P[foot],P[shin])));
   const explicit=s.studioPose.keys.some(k=>k[1][left?'ll':'rl']);
   const floorHands=['routine:plank','routine:push-up','routine:cobra','routine:prone-hip-rock'].includes(s.studioPose.id),situp=s.studioPose.id==='routine:sit-up',lunge=['routine:warrior','routine:lunges'].includes(s.studioPose.id),footZ=floorHands?-1.05:situp?1.05:lunge?-p[left?'ll':'rl'][0]*.8:0;
   if(floorHands||situp||!p.free&&(!explicit||lunge)){const bones=M.solveLimb(tr(out[leg],[0,0,0]),[side*p.stance,.50,footZ],sub(P[shin],P[leg]),sub(P[foot],P[shin]),situp?[0,1,0]:[0,0,1],[1,0,0]);out[leg]=bones[0];out[shin]=bones[1];out[foot]=mat(...tr(out[shin],sub(P[foot],P[shin])));}
   if(!left&&s.studioPose.id==='routine:tree'){const w=smooth(-p.rl[0]/.9),bones=M.solveLimb(tr(out[leg],[0,0,0]),[.39*(1-w),.5+.72*w,0],sub(P[shin],P[leg]),sub(P[foot],P[shin]),[1,0,0],[0,0,1]);out[leg]=M.blendBone(out[leg],bones[0],w);out[shin]=M.blendBone(out[shin],bones[1],w);out[shin].set(tr(out[leg],sub(P[shin],P[leg])),12);out[foot]=M.blendBone(out[foot],mat(0,0,0,0,0,-Math.PI/2*w),w);out[foot].set(tr(out[shin],sub(P[foot],P[shin])),12);}
   if(floorHands){const bones=M.solveLimb(tr(root,P[arm]),[side*1.05,.14,1.12],sub(P[fore],P[arm]),M.handGrip(side),[side,-.1,-.1],[1,0,0]);out[arm]=bones[0];out[fore]=bones[1];}
   if(p.grip){const origin=p.grip.slice(0,3);origin[2]=Math.max(origin[2],.65+chest(profile)*.32);const grip=mul(root,rot(origin,p.grip.slice(3))),target=tr(grip,[side*.2,side*.12,0]),bones=M.solveLimb(tr(root,P[arm]),target,sub(P[fore],P[arm]),M.handGrip(side),[side,-1,0],[root[0],root[1],root[2]],false,armLengths(profile));out[arm]=bones[0];out[fore]=bones[1];}
  }
  // Floor routines use their hands, head and torso as well as their feet.
  // Upright jumps retain their intentional height; only penetration is lifted.
  let bottom=Infinity;const check=(m,points)=>{for(const v of points)bottom=Math.min(bottom,tr(m,v)[1]);};
  for(const name of ['leftFoot','rightFoot'])check(out[name],[[-.3,-.5,-.36],[.3,-.5,-.36],[-.3,-.5,.55],[.3,-.5,.55]]);
  for(const side of [-1,1])check(out[side<0?'leftForearm':'rightForearm'],[[side*.02,-.74,.06]]);
  if(p.free){check(out.head,[[0,0,-.6],[0,0,.6],[0,1.15,-.6],[0,1.15,.6]]);check(root,[[0,1.92,-.45],[0,1.92,.45],[0,3,-.45],[0,3,.45]]);}
  const lift=Math.max(0,-bottom);for(const m of Object.values(out))m[13]+=lift;
  return out;
 }
 return {clips,parameters,pose,armLengths};
})();
