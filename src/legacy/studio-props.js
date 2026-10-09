// Sports equipment belongs only to the preview frame, never the inventory.
function drawStudioRoutineProps(a,pose){
 const prop=a.clip.prop;if(!prop)return;
 const M=CharacterModel,tr=M.transform,u=a.progress,point=side=>tr(pose[side<0?'leftForearm':'rightForearm'],M.handGrip(side)),right=point(1),left=point(-1),average=left.map((v,k)=>(v+right[k])/2);
 const contact=(progress,side=null)=>{const rig=StudioMotion.pose({studioPose:a.clip,studioProgress:progress},a.profile),hand=side=>tr(rig[side<0?'leftForearm':'rightForearm'],M.handGrip(side));return side===null?hand(-1).map((v,k)=>(v+hand(1)[k])/2):hand(side);};
 const solid=(shape,pos,size,color,rx=0,ry=0,rz=0)=>heroShape(shape,pos,size,color,rx,ry,rz,1,false,CharacterModel.scaledMatrix(CharacterModel.matrix(),a.state,a.profile));
 const rod=(from,to,width,color)=>{const d=to.map((v,k)=>v-from[k]),length=Math.hypot(...d);solid('cylinder',from.map((v,k)=>(v+to[k])/2),[width,length,width],color,Math.atan2(Math.hypot(d[0],d[2]),d[1]),Math.atan2(d[0],d[2]));};
 const ball=(pos,radius,type)=>{
  const colors={soccer:[.96,.97,.96],volley:[.97,.8,.15],baseball:[.95,.96,.97],basket:[.9,.3,.035]},color=colors[type];solid('sphere',pos,[radius*2,radius*2,radius*2],color);
  if(type==='soccer')for(const d of [[1,0,0],[-1,0,0],[0,1,0],[0,0,1],[0,0,-1]])solid('sphere',pos.map((v,k)=>v+d[k]*radius*.86),[radius*.56,radius*.56,radius*.56],[.06,.07,.09]);
  else for(const axis of [0,1,2])for(let i=0;i<20;i++){const angle=i*Math.PI/10+u*2,v=[Math.cos(angle)*radius,Math.sin(angle)*radius,0];if(axis===1)[v[1],v[2]]=[v[2],v[1]];if(axis===2)[v[0],v[2]]=[v[2],v[0]];solid('sphere',pos.map((n,k)=>n+v[k]),[.025,.025,.025],type==='baseball'?[.8,.12,.12]:type==='volley'?[.05,.3,.75]:[.07,.06,.05]);}
 };
 const arc=(start,end,from,to,height)=>{const v=Math.max(0,Math.min(1,(u-start)/(end-start)));return from.map((n,k)=>n+(to[k]-n)*v+(k===1?Math.sin(v*Math.PI)*height:0));};
 if(prop==='mat'){solid('cube',[0,-.025,0],[3.7,.045,5.3],[.09,.48,.55]);return;}
 if(prop==='weights'){for(const hand of [left,right]){rod([hand[0]-.28,hand[1],hand[2]],[hand[0]+.28,hand[1],hand[2]],.09,[.6,.65,.7]);for(const side of [-1,1])solid('cube',[hand[0]+side*.27,hand[1],hand[2]],[.16,.3,.3],[.15,.18,.23]);}return;}
 if(prop==='bat'||prop==='hockey'){
  const p=StudioMotion.parameters(a.clip,u),g=p.grip,frame=M.mul(pose.root,M.matrix(0,0,0,g[4],g[3],g[5]));frame.set(average,12);
  if(prop==='bat'){const tip=tr(frame,[0,1.65,0]);rod(tr(frame,[0,-.22,0]),tip,.12,[.63,.36,.15]);rod(tr(frame,[0,.65,0]),tip,.22,[.76,.5,.26]);}
  else{const end=[average[0]+Math.sin(g[5])*1.7,.14+Math.max(0,Math.abs(g[5])-.55)*2.3,average[2]+.95*Math.cos(g[5])],blade=[end[0]+.5,end[1],end[2]+.15];rod(average,end,.075,[.12,.16,.2]);rod(end,blade,.16,[.2,.25,.3]);solid('cylinder',[Math.sin(u*Math.PI*2)*.55,.07,1.45],[.28,.12,.28],[.045,.05,.06]);}
  return;
 }
 if(prop==='hockey-save'){solid('cylinder',[0,.07,1.6],[.28,.12,.28],[.04,.05,.06]);return;}
 let pos,type,radius=.27;
 if(prop.startsWith('soccer')){type='soccer';radius=.3;pos=prop==='soccer-dribble'?[Math.sin(u*Math.PI*2)*.32,.31,.96+.18*Math.sin(u*Math.PI*4)]:u<.4?[.5,.31,.9]:arc(.4,.82,[.5,.31,.9],[.6,.31,3.5],prop==='soccer-shot'?.8:.08);}
 if(prop.startsWith('volley')){type='volley';radius=.3;const hit=contact(.44,prop==='volley-spike'?1:null),impact=hit.map((v,k)=>v+(k===1&&prop==='volley-set'?.3:k===2&&prop==='volley-bump'?.32:0));pos=u<.44?arc(0,.44,[0,4.8,2.7],impact,0):arc(.44,1,impact,[0,prop==='volley-spike'?.5:4.8,3.5],prop==='volley-spike'?0:.9);}
 if(prop.startsWith('baseball')){type='baseball';radius=.12;pos=prop==='baseball-pitch'?(u<.48?right:arc(.48,1,contact(.48,1),[.3,2.2,3.8],.3)):(u<.44?arc(0,.44,[-.6,3,3.6],contact(.44,-1),.2):left);if(prop==='baseball-catch')solid('sphere',left,[.42,.46,.22],[.6,.33,.13]);}
 if(prop.startsWith('basket')){type='basket';radius=.34;if(prop==='basket-dribble')pos=[right[0],.35+(right[1]-.35)*Math.abs(Math.cos(u*Math.PI*2)),right[2]+.22];else if(prop==='basket-shot'){const held=average.map((v,k)=>v+(k===1?.35:0)),release=contact(.44).map((v,k)=>v+(k===1?.35:0));pos=u<.44?held:arc(.44,1,release,[0,3.7,3.8],1.6);}else{const held=average.map((v,k)=>v+(k===2?.26:0)),release=contact(.44).map((v,k)=>v+(k===2?.26:0));pos=u<.44?held:arc(.44,1,release,[0,2.7,3.8],.08);}}
 if(pos)ball(pos,radius,type);
}
