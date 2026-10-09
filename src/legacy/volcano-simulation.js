// Volcanic activity is transient. Terrain and saved builds stay editable;
// hot Lego ejecta settle on the current surface before cooling away.
const VolcanoSimulation=(()=>{
 'use strict';
 const stages=[['Venting',0,12],['Building pressure',12,17],['Erupting',17,24],['Cooling',24,34],['Quiet',34,46]],cycle=46;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function phase(age){const t=((age%cycle)+cycle)%cycle;const stage=stages.find(s=>t>=s[1]&&t<s[2]);return {name:stage[0],remaining:stage[2]-t,eruptionIn:t<17?17-t:cycle-t+17};}
 function create(){
  let vents=[],particles=[],area={x0:-8,x1:8,z0:-8,z1:8},floor=()=>.4,seed=1,state=1;
  const random=()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
  function contain(p){const r=p.kind==='lava'?.95*p.size:Math.min(p.size/2,Math.min(area.x1-area.x0,area.z1-area.z0)*.45);for(const [k,v,min,max] of [['x','vx',area.x0+r,area.x1-r],['z','vz',area.z0+r,area.z1-r]]){if(p[k]<min){p[k]=min;if(p[v]<0)p[v]*=-.25;}if(p[k]>max){p[k]=max;if(p[v]>0)p[v]*=-.25;}}}
  function emit(v,kind,burst=false){
   const a=random()*Math.PI*2,r=random()*v.radius*.30,size=kind==='lava'?.45+random()*.42:kind==='ash'?.12+random()*.18:1.1+random()*1.3,speed=kind==='lava'?(burst?8:3)+random()*(burst?13:7):.3+random()*.9;
   const p={owner:v.id,kind,x:v.x+Math.cos(a)*r,y:v.y+.25+random()*.4,z:v.z+Math.sin(a)*r,vx:Math.cos(a)*speed,vy:kind==='lava'?(burst?22:15)+random()*(burst?15:10):kind==='ash'?9+random()*8:3+random()*3,vz:Math.sin(a)*speed,age:0,life:kind==='lava'?14:kind==='ash'?8:12,size,initialSize:size,rx:random()*6,ry:random()*6,rz:random()*6,spin:(random()-.5)*9,settled:false,dark:phase(v.age).name==='Erupting'||phase(v.age).name==='Building pressure',color:random()};contain(p);particles.push(p);
  }
  function burst(v){for(let i=0;i<38;i++)emit(v,'lava',true);for(let i=0;i<14;i++)emit(v,'smoke',true);for(let i=0;i<30;i++)emit(v,'ash',true);particles.push({owner:v.id,kind:'blast',x:v.x,y:v.y+1,z:v.z,age:0,life:1.2,size:2,initialSize:2,vx:0,vy:2,vz:0});}
  function configure(sources,bounds,surface,worldSeed=1,reset=false){
   if(reset||worldSeed!==seed){vents=[];particles=[];seed=worldSeed;state=(seed^0x765ab321)>>>0;}
   area={...bounds};floor=surface;const old=new Map(vents.map(v=>[v.id,v]));vents=sources.map(source=>({...source,age:old.get(source.id)?.age||0,smokeClock:old.get(source.id)?.smokeClock||0,lavaClock:old.get(source.id)?.lavaClock||0}));const ids=new Set(vents.map(v=>v.id));particles=particles.filter(p=>ids.has(p.owner));
  }
  function step(dt){
   dt=clamp(Number(dt)||0,0,.05);
   for(const v of vents){const previous=v.age;v.age+=dt;if(v.age>=cycle)v.age-=cycle;const stage=phase(v.age).name;if(previous<17&&v.age>=17)burst(v);
    const rate=stage==='Building pressure'?12:stage==='Erupting'?9:stage==='Cooling'?4:stage==='Quiet'?.5:3;v.smokeClock+=dt*rate;while(v.smokeClock>=1){emit(v,'smoke');v.smokeClock--;}
    if(stage==='Building pressure'||stage==='Erupting'){v.lavaClock+=dt*(stage==='Erupting'?12:2);while(v.lavaClock>=1){emit(v,'lava');emit(v,'ash');v.lavaClock--;}}
   }
   for(const p of particles){p.age+=dt;if(p.kind==='smoke')p.size=Math.min(p.initialSize+p.age*.62,Math.min(area.x1-area.x0,area.z1-area.z0)*.85);if(p.kind==='blast')p.size=Math.min(p.initialSize+p.age*15,Math.min(area.x1-area.x0,area.z1-area.z0)*.85);
    if(p.kind==='lava'){
     if(p.settled){const ground=floor(p.x,p.z);if(ground+.6*p.size<p.y-.02)p.settled=false;else p.y=ground+.6*p.size;}
     if(!p.settled){p.vy-=19*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.rx+=p.spin*dt;p.ry+=p.spin*.73*dt;p.rz+=p.spin*.4*dt;contain(p);const ground=floor(p.x,p.z);if(p.vy<0&&p.y-.6*p.size<=ground){p.y=ground+.6*p.size;p.vy=0;p.vx=0;p.vz=0;p.rx=0;p.rz=0;p.settled=true;p.landedAge=p.age;}}
    }else{p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;contain(p);}
   }
   particles=particles.filter(p=>p.age<p.life&&p.y<180);if(particles.length>360)particles.splice(0,particles.length-360);
  }
  function erupt(){for(const v of vents){v.age=17;v.smokeClock=0;v.lavaClock=0;burst(v);}if(particles.length>360)particles.splice(0,particles.length-360);return vents.length;}
  function status(){return vents.map(v=>({...v,...phase(v.age)}));}
  function snapshot(){return {vents:status(),particles:particles.map(p=>({...p,alpha:p.kind==='lava'?Math.min(1,(p.life-p.age)/2):Math.min(1,p.age/.5,(p.life-p.age)/2)*.5,heat:p.kind==='lava'?Math.max(0,1-p.age/6):0})),area:{...area}};}
  return {configure,step,erupt,snapshot,status};
 }
 return {create,phase,stages,cycle};
})();
