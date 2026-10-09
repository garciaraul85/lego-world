// Finite, local particle spells. Travel uses swept collision against bricks;
// spell damage feeds the same loose-brick and exact rebuild system as weapons.
const GameMagic=(()=>{
 'use strict';
 const spells={
  'Ember Burst':{pattern:'embers',colors:[[1,.28,.05],[1,.64,.12],[1,.90,.38]],speed:18,range:25,radius:2.2,impulse:6,life:.65,description:'Orange sparks · fiery starburst'},
  'Frost Bloom':{pattern:'snowflake',colors:[[.30,.85,1],[.72,.97,1],[.30,.55,1]],speed:15,range:24,radius:2.5,impulse:4.5,life:.90,description:'Ice-blue crystals · six-point bloom'},
  'Arcane Spiral':{pattern:'spiral',colors:[[.67,.28,1],[1,.42,.90],[.47,.65,1]],speed:20,range:28,radius:2.4,impulse:5,life:.80,description:'Violet helix · expanding magic rings'},
  'Thunder Bolt':{pattern:'lightning',colors:[[1,.90,.20],[1,1,.72],[.50,.75,1]],speed:40,range:32,radius:1.8,impulse:7,life:.45,description:'Golden zigzags · branching lightning'},
  'Verdant Vortex':{pattern:'vortex',colors:[[.28,1,.45],[.72,1,.25],[.18,.80,.78]],speed:13,range:23,radius:3,impulse:7.5,life:1.0,description:'Green corkscrew · swirling leaf rings'},
  'Prism Nova':{pattern:'prism',colors:[[1,.27,.38],[1,.65,.20],[1,.94,.25],[.26,1,.55],[.25,.70,1],[.72,.35,1]],speed:22,range:27,radius:3.2,impulse:8,life:.85,description:'Rainbow ribbons · six-color nova'}
 };
 const get=name=>spells[name]||spells['Ember Burst'];
 const add=(a,b)=>a.map((v,k)=>v+b[k]),scale=(a,n)=>a.map(v=>v*n),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>scale(a,1/Math.max(.001,Math.hypot(...a)));
 function particle(s,point,i,velocity=[0,0,0],extra={}){return {kind:'magic',position:[...point],velocity,color:s.colors[i%s.colors.length],life:s.life,total:s.life,size:s.pattern==='snowflake'?.12:.085,rx:i*.7,ry:i*.4,rz:Math.PI/4,gravity:s.pattern==='embers'?3:0,drag:.7,...extra};}
 function trail(name,point,dir,phase){
  const s=get(name),side=unit(cross(dir,[0,1,0])),up=unit(cross(side,dir)),out=[];
  const count=s.pattern==='lightning'?4:s.pattern==='prism'?6:3;
  for(let i=0;i<count;i++){
   const theta=phase*(s.pattern==='vortex'?13:18)+i*Math.PI*2/count,r=s.pattern==='lightning'?((Math.floor(phase*80+i)%2)?1:-1)*.16:.18+(s.pattern==='vortex'?.13:0);
   const offset=s.pattern==='lightning'?scale(side,r):add(scale(side,Math.cos(theta)*r),scale(up,Math.sin(theta)*r)),position=add(point,offset);
   out.push(particle(s,position,i,scale(dir,-.5),{life:.28,total:.28,size:s.pattern==='lightning'?.07:.075,gravity:s.pattern==='embers'?2:0}));
  }
  out.push(particle(s,point,Math.floor(phase*30),[0,0,0],{life:.11,total:.11,size:.17,gravity:0}));return out;
 }
 function burst(name,point,charge=false){
  const s=get(name),out=[],count=charge?18:s.pattern==='snowflake'?42:s.pattern==='prism'?54:48;
  for(let i=0;i<count;i++){
   const branch=i%6,step=Math.floor(i/6),theta=branch*Math.PI/3,phase=i/count*Math.PI*6;let velocity,offset=[0,0,0],extra={};
   if(charge){offset=[Math.cos(i/count*Math.PI*2)*.34,Math.sin(i/count*Math.PI*2)*.34,0];velocity=[offset[0],offset[1],0];extra={life:.25,total:.25,size:.055};}
   else if(s.pattern==='snowflake'){const a=theta+(step%3===2?.19:step%3===1?-.19:0),speed=1.6+step*.53;velocity=[Math.cos(a)*speed,Math.sin(a)*speed,.45*Math.sin(i*2.3)];extra={size:.10,drag:1.4};}
   else if(s.pattern==='spiral'||s.pattern==='vortex'){const r=.12+step*.035;offset=[Math.cos(phase)*r,(i/count-.5)*.8,Math.sin(phase)*r];velocity=[Math.cos(phase)*(1.4+step*.32),s.pattern==='vortex'?1.8:.4,Math.sin(phase)*(1.4+step*.32)];extra={orbit:s.pattern==='vortex'?7:4,center:[...point],size:s.pattern==='vortex'?.10:.075};}
   else if(s.pattern==='lightning'){const a=theta+(step%2?.21:-.21);velocity=[Math.cos(a)*(3+step*.8),Math.sin(a)*(3+step*.8),Math.sin(i*1.7)*1.5];extra={size:.055,drag:2};}
   else if(s.pattern==='prism'){velocity=[Math.cos(theta)*(2+step*.45),Math.sin(theta)*(2+step*.45),Math.sin(step*.8)*1.3];extra={size:.09,drag:1.1};}
   else{const y=1-2*(i+.5)/count,a=i*2.399963,r=Math.sqrt(1-y*y),speed=2.6+(i%5)*.7;velocity=[Math.cos(a)*r*speed,y*speed+.9,Math.sin(a)*r*speed];extra={size:.08+(i%3)*.03};}
   out.push(particle(s,add(point,offset),i,velocity,extra));
  }return out;
 }
 function step(e,dt,area){
  e.life-=dt;if(e.velocity){const drag=Math.exp(-(e.drag||0)*dt);e.velocity=e.velocity.map((v,k)=>(v-(k===1?(e.gravity||0)*dt:0))*drag);e.position=add(e.position,scale(e.velocity,dt));}
  if(e.orbit&&e.center){const x=e.position[0]-e.center[0],z=e.position[2]-e.center[2],a=e.orbit*dt;e.position[0]=e.center[0]+x*Math.cos(a)-z*Math.sin(a);e.position[2]=e.center[2]+x*Math.sin(a)+z*Math.cos(a);}
  if(area){e.position[0]=Math.max(area.x0+.06,Math.min(area.x1-.06,e.position[0]));e.position[2]=Math.max(area.z0+.06,Math.min(area.z1-.06,e.position[2]));}e.position[1]=Math.max(.07,e.position[1]);return e;
 }
 return {spells,get,trail,burst,step};
})();
