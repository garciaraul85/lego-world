// Toy weapons: timing, reach and swept collision share one catalog.
const GameWeapons=(()=>{
'use strict';
// Frames: grip XYZ, tool yaw/pitch/roll, hip/chest rotation, lean, crouch.
// Contact is a frame in the same curve used by rendering and swept collision.
const melee=(era,label,duration,contact,reach,physics,wind,hit,follow)=>{
 const ready=physics.twoHand?[.12,2.32,.74,-.12,-.25,-.28,0,0,0,0]:[.98,2.24,.32,0,.08,0,0,0,0,0],c=contact/duration;
 return {era,label,style:physics.style||'overhead',duration,contact,reach,...physics,frames:[[0,...ready],[c*.60,...wind],[c,...hit],[c+(1-c)*.34,...follow],[c+(1-c)*.55,...follow],[1,...ready]]};
};
const gun=(era,long,capacity,interval,reload,range,extra={})=>({era,style:'fire',long,capacity,interval,reload,range,duration:.30,recoil:2.8,brace:.35,reloadStyle:'magazine',...extra});
const catalog={
 'Club':melee('Medieval','Club diagonal shoulder strike',.88,.34,2.4,{mass:1.8,radius:.23,tip:1.18,inertia:.18,impulse:3.2,bodyClearance:true,continuous:true,armLengths:[1.65,1.45]},[1.26,3.06,.32,.25,-1.05,-.30,.20,.10,-.04,.03],[.62,2.78,1.10,-.08,1.03,.50,-.30,-.15,.07,.08],[.40,2.25,1.05,-.15,1.90,.65,-.34,-.25,.13,.12]),
 'Mace':melee('Medieval','Mace weighted shoulder strike',1.12,.49,2.4,{mass:2.6,radius:.29,tip:1.05,inertia:.25,impulse:4.2,bodyClearance:true,continuous:true,armLengths:[1.65,1.45]},[.88,2.98,.94,-.45,-.38,.58,-.15,-.29,-.06,.08],[.60,2.65,.75,.16,1.20,-.26,.18,.34,.13,.10],[.33,2.09,.62,.68,1.95,-.48,.30,.49,.19,.13]),
 'War hammer':melee('Medieval','War hammer crushing blow',1.02,.52,2.6,{twoHand:true,mass:3.7,radius:.24,tip:1.16,inertia:.34,impulse:5.5},[0,3.24,.12,-.12,-.90,.05,-.12,-.24,-.12,.12],[.04,2.75,.70,.04,1.35,.02,.16,.27,.18,.17],[.04,2.16,.52,.06,2.12,.04,.22,.34,.27,.22]),
 'Sword':melee('Medieval','Sword diagonal cut',.62,.24,2.6,{style:'sweep',edge:true,mass:1.1,radius:.10,tip:1.42,inertia:.10,impulse:2.5},[.80,2.92,.92,-.75,-.35,.83,-.12,-.25,-.03,.03],[.65,2.73,.79,.12,1.20,-.36,.16,.29,.08,.04],[.42,2.12,.76,.80,1.79,-.70,.28,.47,.12,.06]),
 'Battle axe':melee('Medieval','Axe two-handed diagonal chop',1.08,.53,2.6,{twoHand:true,style:'sweep',mass:3.3,radius:.26,tip:1.33,inertia:.32,impulse:5.0},[.05,3.14,.13,-.52,-.66,.62,-.18,-.30,-.09,.10],[.03,2.73,.68,.18,1.38,-.25,.20,.35,.16,.13],[-.12,2.13,.42,.62,2.04,-.57,.34,.59,.23,.19]),
 'Flintlock pistol':gun('Medieval',false,1,.48,2.1,30,{duration:.42,recoil:4.1,brace:.10,reloadStyle:'powder'}),
 'Musket':gun('Medieval',true,1,.65,2.6,45,{duration:.48,recoil:4.8,brace:.90,reloadStyle:'ramrod'}),
 'Baton':melee('Modern','Baton quick backhand',.48,.18,2.1,{style:'sweep',mass:.6,radius:.12,tip:1.10,inertia:.06,impulse:1.8},[.42,2.80,.72,-.75,.10,-1.0,-.08,-.28,0,.02],[.83,2.64,.84,.16,1.05,.60,.12,.28,.06,.03],[1.0,2.31,.66,.80,1.55,1.02,.18,.35,.08,.03]),
 'Baseball bat':melee('Modern','Bat two-handed horizontal swing',.82,.36,2.7,{twoHand:true,style:'sweep',mass:1.7,radius:.20,tip:1.08,inertia:.20,impulse:4.1},[.09,2.92,.12,-.80,.30,.95,-.24,-.40,-.03,.07],[.05,2.78,.65,.05,1.20,-.55,.22,.40,.09,.09],[-.10,2.70,.28,.90,1.48,-.85,.36,.55,.11,.12]),
 'Crowbar':melee('Modern','Crowbar hooked downward strike',.72,.31,2.3,{mass:1.5,radius:.16,tip:1.12,inertia:.15,impulse:3.0},[.96,2.99,.98,-.24,-.54,.32,-.14,-.28,-.05,.05],[.80,2.62,.76,.08,1.42,-.12,.16,.30,.10,.06],[.78,2.05,.58,.15,2.35,-.18,.21,.39,.15,.10]),
 'Sledgehammer':melee('Modern','Sledgehammer heavy overhead smash',1.26,.69,2.7,{twoHand:true,mass:5.5,radius:.32,tip:1.20,inertia:.46,impulse:7.2},[0,3.25,.09,-.08,-1.05,.02,-.17,-.29,-.16,.17],[0,2.78,.74,.02,1.45,0,.19,.34,.24,.23],[0,2.08,.42,.04,2.20,.03,.27,.44,.36,.30]),
 'Handgun':gun('Modern',false,12,.28,1.05,38,{duration:.26,recoil:2.6,brace:.65,twoHand:true}),
 'Revolver':gun('Modern',false,6,.42,1.35,40,{duration:.38,recoil:4.3,brace:.20,reloadStyle:'cylinder'}),
 'Submachine gun':gun('Modern',true,24,.13,1.3,42,{automatic:true,duration:.23,recoil:1.8,brace:.74}),
 'Rifle':gun('Modern',true,20,.19,1.45,58,{automatic:true,duration:.28,recoil:3.0,brace:1.0}),
 'Shotgun':gun('Modern',true,5,.82,1.8,25,{pump:true,pellets:5,duration:.68,recoil:6.5,brace:.86,reloadStyle:'shells'}),
 'Hammer':melee('Tools','Hammer compact wrist strike',.58,.23,2.1,{mass:.9,radius:.20,tip:.89,inertia:.09,impulse:2.1},[1.00,2.86,.96,-.05,-.52,.13,-.06,-.15,-.02,.03],[.91,2.65,.85,.03,1.55,-.02,.08,.18,.07,.03],[.91,2.23,.63,.06,2.05,-.03,.12,.23,.10,.04]),
 'Wrench':melee('Tools','Wrench short sideways strike',.55,.21,2.1,{style:'sweep',mass:.8,radius:.15,tip:.90,inertia:.08,impulse:1.9},[.63,2.76,.86,-.52,.15,.87,-.09,-.24,-.01,.02],[.94,2.65,.82,.12,1.37,-.43,.14,.27,.06,.03],[1.04,2.34,.63,.62,1.81,-.73,.19,.34,.08,.04]),
 'Shovel':melee('Tools','Shovel two-handed spade thrust',.92,.40,2.3,{twoHand:true,style:'thrust',mass:2.1,radius:.25,tip:-.55,support:.20,inertia:.23,impulse:3.6},[0,2.61,.05,.02,1.60,0,-.12,-.16,-.07,.08],[0,2.66,.90,.02,-1.45,0,.14,.18,.17,.11],[0,2.46,.78,.02,-1.55,0,.17,.22,.19,.12])
};
// Model extents, contact points and muzzle offsets use the same grip-relative
// coordinates. Increasing a model therefore increases its real swept reach.
catalog.Wand={era:'Magic',style:'magic',action:'Cast',duration:.62,contact:.22,interval:.70,automatic:true,continuous:true,mass:.3,inertia:.035,tip:1.74,muzzle:[.02,1.13,.315],reach:28,armLengths:[1.75,1.55],frames:[
 [0,1.15,2.48,.68,0,.60,0,0,0,0,0],
 [.20,1.26,2.96,.56,-.08,.10,-.10,.06,.05,-.02,0],
 [.22/.62,.88,2.73,1.05,0,1.42,0,-.05,-.08,.035,.02],
 [.60,.84,2.56,1.0,.04,1.48,0,-.04,-.06,.025,.01],
 [1,1.15,2.48,.68,0,.60,0,0,0,0,0]
]};
const models={
 'Club':{tip:1.62,radius:.30,action:'Swing'},
 'Mace':{tip:1.57,radius:.37,action:'Strike'},
 'War hammer':{tip:1.67,radius:.30,action:'Strike'},
 'Sword':{tip:1.97,radius:.12,action:'Slash'},
 'Battle axe':{tip:1.89,radius:.32,action:'Chop'},
 'Baton':{tip:1.43,radius:.14,action:'Swing'},
 'Baseball bat':{tip:1.73,radius:.24,action:'Swing'},
 'Crowbar':{tip:1.54,radius:.20,action:'Strike'},
 'Sledgehammer':{tip:1.90,radius:.40,action:'Smash'},
 'Hammer':{tip:1.17,radius:.25,action:'Strike'},
 'Wrench':{tip:1.22,radius:.20,action:'Strike'},
 'Shovel':{tip:-.88,radius:.30,action:'Thrust'},
 'Flintlock pistol':{muzzle:[0,.25,1.12],action:'Shoot'},
 'Musket':{muzzle:[0,.25,2.40],action:'Shoot'},
 'Handgun':{muzzle:[0,.25,1.02],action:'Shoot'},
 'Revolver':{muzzle:[0,.25,1.24],action:'Shoot'},
 'Submachine gun':{muzzle:[0,.25,1.42],action:'Shoot'},
 'Rifle':{muzzle:[0,.25,2.12],action:'Shoot'},
 'Shotgun':{muzzle:[0,.25,1.98],action:'Shoot'}
};
for(const [name,model] of Object.entries(models)){const w=catalog[name];Object.assign(w,model);if(w.frames)w.reach=Math.max(w.reach,Math.abs(w.tip)+1.25);}
// Instructor photo/video references: Still Mind Martial Arts, Cinco Teros.
// Coil at the shoulder, drive the hips before the chest, then slash through
// contact and recover around the outside. No static hold after the hit.
catalog.Club.fullBodyRig=true;
catalog.Club.handDriven=true;
catalog.Club.wristFrames=[[0,.02],[.20,-.55],[.28,.35],[catalog.Club.contact/catalog.Club.duration,1.35],[.53,1.95],[.65,1.65],[.81,.50],[1,.02]];
catalog.Club.frames=[
 [0,1.35,2.62,.66,-.08,-.18,-.18,0,0,0,0],
 [.16,1.55,2.96,.52,.22,-.94,-.28,.17,.04,-.03,.025],
 [.20,1.55,3.06,.76,.25,-.85,-.30,.20,.10,-.04,.03],
 [.27,1.35,3.02,1.08,.14,.20,.10,-.10,.10,-.01,.045],
 [catalog.Club.contact/catalog.Club.duration,.62,2.78,1.10,-.08,1.03,.50,-.30,-.15,.07,.08],
 [.53,.40,2.25,1.05,-.15,1.90,.65,-.34,-.25,.13,.12],
 [.65,.67,2.30,.98,-.10,1.72,.30,-.23,-.14,.07,.065],
 [.81,1.42,2.46,.88,.03,.52,-.12,-.055,-.025,.015,.02],
 [1,1.35,2.62,.66,-.08,-.18,-.18,0,0,0,0]
];
// The empty hand rises into guard, retracts during contact, then settles.
catalog.Club.elbowFrames=[[0,1.3,2.40,.10],[.20,1.65,3.10,-.20],[.39,1.45,2.85,-.10],[.53,1.20,2.35,.10],[.75,1.40,2.40,.15],[1,1.3,2.40,.10]];
catalog.Club.guardFrames=[[0,-.87,2.66,.65],[.20,-.70,2.99,.72],[.36,-.91,3.07,.70],[.53,-.82,2.97,.74],[.72,-.80,2.76,.72],[1,-.87,2.66,.65]];
// Lift the grip high, bring the weighted head over the shoulder, then drive
// down in one vertical plane. The elbow follows the hand's overhead path.
catalog.Mace.handDriven=true;
// Wrist flexion is relative to the forearm. The mace inherits the resulting
// C-hand transform, including running, airborne poses and body turns.
catalog.Mace.wristLimit=.60;
catalog.Mace.wristFrames=[[0,.02],[.16,.15],[.25,.55],[.34,.25],[catalog.Mace.contact/catalog.Mace.duration,.50],[.63,.60],[.74,.40],[.87,.12],[1,.02]];
// Turning the forearm carries the cuff and palm together. The wrist supplies
// only a small bend, instead of folding the hand through 150 degrees.
catalog.Mace.forearmRollFrames=[[0,0],[.16,0],[.25,-.18],[.34,-1.60],[catalog.Mace.contact/catalog.Mace.duration,-3.0],[.63,-3.0],[.74,-2.50],[.87,-.60],[1,0]];
catalog.Mace.overhead=true;
catalog.Mace.frames=[
 [0,1.35,2.62,.70,-.08,-.18,-.18,0,0,0,0],
 [.16,1.25,3.50,.56,-.04,-.42,-.08,.05,.02,-.025,.015],
 [.25,1.12,4.18,.50,0,-.35,0,.06,.03,-.035,.02],
 [.34,1.10,3.70,1.00,0,1.05,0,-.06,.02,.025,.045],
 [catalog.Mace.contact/catalog.Mace.duration,1.05,2.90,1.16,0,2.18,0,-.12,-.04,.10,.10],
 [.63,1.00,2.40,1.12,0,2.85,0,-.13,-.06,.16,.13],
 [.74,1.35,2.42,1.10,-.04,2.65,-.04,-.08,-.03,.08,.07],
 [.87,1.35,2.60,1.00,-.04,.95,-.08,-.025,0,.02,.025],
 [1,1.35,2.62,.70,-.08,-.18,-.18,0,0,0,0]
];
catalog.Mace.elbowFrames=[[0,1.3,2.40,.10],[.25,1.55,2.65,-.35],[.44,1.45,2.35,-.30],[.61,1.40,1.95,-.20],[.82,1.40,2.20,-.10],[1,1.3,2.40,.10]];
catalog.Mace.guardFrames=[[0,-.87,2.66,.65],[.24,-.70,3.02,.72],[.42,-.91,3.07,.70],[.61,-.82,2.97,.74],[.80,-.80,2.76,.72],[1,-.87,2.66,.65]];
// Include the radial spikes and the crown spike in body-clearance checks.
catalog.Mace.clearanceSamples=[[-.30,.18],[0,.16],[.40,.16],[.80,.16],[1.0,.40],[1.32,.51],[1.57,.31],[1.73,.14]];
// A short, eased body response only when the weighted head meets a brick.
catalog.Mace.impactResponse={duration:.17,pitch:.10,hip:.025,chest:.025,lean:-.025,crouch:.025,lift:.035,retract:.045};
// Keep the broad hammer head in front of the face while both hands stay on
// the shaft. Coil above the shoulder instead of through the forehead.
Object.assign(catalog['War hammer'],{bodyClearance:true,continuous:true,overhead:true,armLengths:[2.05,2.15],stowArc:1.45,
 elbowFrames:[[0,1.55,1.95,-.25],[.30,1.55,2.10,-.25],[.51,1.55,1.95,-.25],[.70,1.55,1.95,-.25],[1,1.55,1.95,-.25]],
 clearanceSamples:[[-.30,.17],[0,.17],[.40,.17],[.80,.17],[1.10,.17],[1.45,[.46,.25,.28]]]});
catalog['War hammer'].frames=[
 [0,.30,2.18,1.30,-.12,.30,-.25,0,0,0,0],
 [.16,.16,3.20,1.35,-.04,-.15,-.08,-.03,-.04,-.025,.02],
 [.30,.05,4.04,1.30,0,-.15,0,-.04,-.06,-.045,.035],
 [.40,.05,3.72,1.14,0,.60,0,.025,-.025,.035,.075],
 [catalog['War hammer'].contact/catalog['War hammer'].duration,.05,2.85,1.22,0,1.30,0,.055,.06,.17,.16],
 [.68,.05,2.05,1.08,0,2.08,0,.07,.08,.24,.21],
 [.82,.22,2.18,1.24,-.04,1.10,-.12,.025,.035,.10,.09],
 [1,.30,2.18,1.30,-.12,.30,-.25,0,0,0,0]
];

function motion(w,t){const frames=w.frames;let a=frames[0],b=frames[1],index=0;for(let i=1;i<frames.length;i++)if(t<=frames[i][0]){a=frames[i-1];b=frames[i];index=i-1;break;}let u=Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0])));
 if(w.continuous){
  const slope=(i,k)=>{if(i===0||i===frames.length-1)return 0;const before=frames[i][0]-frames[i-1][0],after=frames[i+1][0]-frames[i][0],d0=(frames[i][k]-frames[i-1][k])/before,d1=(frames[i+1][k]-frames[i][k])/after;if(d0*d1<=0)return 0;const w0=2*after+before,w1=after+2*before;return (w0+w1)/(w0/d0+w1/d1);},dt=b[0]-a[0],u2=u*u,u3=u2*u;
  return a.slice(1).map((v,k)=>(2*u3-3*u2+1)*v+(u3-2*u2+u)*dt*slope(index,k+1)+(-2*u3+3*u2)*b[k+1]+(u3-u2)*dt*slope(index+1,k+1));
 }
 u=u*u*(3-2*u);return a.slice(1).map((v,k)=>v+(b[k+1]-v)*u);}
const unarmed={style:'punch',action:'Punch',duration:.52,contact:.18,reach:2.8};
const get=name=>catalog[name]||unarmed;
// Slab intersection returns the first obstruction, including terrain. A swept
// segment cannot jump through thin bricks at low frame rates.
function cast(origin,direction,distance,pieces,bounds){let result=null,nearest=distance;
 for(const piece of pieces){const b=bounds(piece),lo=[b.x0,b.y0,b.z0],hi=[b.x1,b.y1,b.z1];let entry=0,exit=distance;
  for(let k=0;k<3;k++){if(Math.abs(direction[k])<1e-8){if(origin[k]<lo[k]||origin[k]>hi[k]){entry=Infinity;break;}}else{let a=(lo[k]-origin[k])/direction[k],c=(hi[k]-origin[k])/direction[k];if(a>c)[a,c]=[c,a];entry=Math.max(entry,a);exit=Math.min(exit,c);if(entry>exit)break;}}
  if(entry<=exit&&entry>=0&&entry<=nearest){nearest=entry;result={piece,distance:entry,point:origin.map((v,k)=>v+direction[k]*entry)};}
 }return result;
}
function edgeDistance(origin,direction,area){let distance=Infinity;for(const [i,min,max] of [[0,area.x0,area.x1],[2,area.z0,area.z1]])if(Math.abs(direction[i])>1e-8)distance=Math.min(distance,Math.max(0,((direction[i]>0?max:min)-origin[i])/direction[i]));return distance;}
return {catalog,get,motion,cast,edgeDistance};
})();
