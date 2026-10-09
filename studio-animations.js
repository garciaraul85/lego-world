// Studio clips sample the existing game rig without a physics controller.
const StudioAnimations=(()=>{
 'use strict';
 const clips=[],add=(id,label,group,kind,duration,extra={})=>clips.push({id,label,group,kind,duration,...extra});
 add('still','Standing reference','Movement','still',1);
 add('walk','Walk','Movement','walk',Math.PI*4/6.5);
 add('run','Run','Movement','run',Math.PI*4/9);
 add('jump','Jump · takeoff, air and landing','Movement','jump',1.4);
 add('fall','Falling','Movement','fall',1.2);
 add('land','Landing','Movement','land',.6);
 add('build','Rebuilding','Movement','build',2.4);
 add('punch','Unarmed punch','Combat','attack',.87,{held:'None'});
 add('equipped','Equipped item action','Combat','attack',1,{equipped:true});
 for(const [held,w] of Object.entries(GameWeapons.catalog)){
  if(w.style==='magic')continue;
  add('weapon:'+held,held+' · '+(w.action||'Strike').toLowerCase(),'Weapons','attack',w.duration+.4,{held});
  if(w.style==='fire')add('reload:'+held,held+' · reload','Reloads','reload',w.reload+.4,{held});
 }
 for(const spell of Object.keys(GameMagic.spells))add('spell:'+spell,spell,'Spells','spell',1.7,{held:'Wand',spell});
 for(const [id,label,kind] of [['hover','Flying · hover','hover'],['fly','Flying · forward','fly'],['rise','Flying · rise','rise'],['descend','Flying · descend','descend'],['fly-punch','Flying · punch','fly-punch'],['climb','Climbing','climb'],['speed','Super speed','speed'],['super-jump','Super jump','super-jump']])add(id,label,'Powers',kind,kind==='super-jump'?2.1:kind==='fly-punch'?1.2:2);
 getClip('speed').duration=Math.PI*4/12;getClip('climb').duration=Math.PI*4/5.1;
 add('fly-transition','Flying · hover to forward','Powers','fly-transition',2);
 function getClip(id){return clips.find(c=>c.id===id);}
 for(const [power,duration] of [['Strength',1.35],['Laser eyes',1.4],['Freezing breath',6.1],['Telekinesis',2.6],['Read minds',1.3],['Claws',.95]])add('power:'+power,power==='Strength'?'Strength · ground smash':power==='Telekinesis'?'Telekinesis · lift and throw':power,'Powers','power',duration,{power});
 for(const [construct,design] of Object.entries(SuperPowers.constructs))add('construct:'+construct,'Green construct · '+construct.toLowerCase(),'Constructs','construct',design.duration+.6,{power:'Energy constructs',construct});
 clips.push(...StudioMotion.clips);
 const get=id=>clips.find(c=>c.id===id)||clips[0],looks=new WeakMap(),clamp=v=>Math.max(0,Math.min(1,v));
 function look(base,overrides){if(!Object.keys(overrides).length)return base;let cache=looks.get(base);if(!cache){cache=new Map();looks.set(base,cache);}const key=JSON.stringify(overrides);if(!cache.has(key))cache.set(key,{...base,...overrides});return cache.get(key);}
 function sample(id,time,base){
  const clip=get(id),held=clip.equipped?base.held:clip.held,w=GameWeapons.get(held||base.held),duration=clip.equipped?w.duration+.4:clip.duration,t=Math.max(0,Math.min(duration,Number(time)||0)),u=t/duration;
  const s={x:0,y:0,z:0,heading:0,speed:0,phase:0,grounded:true,attack:0,attackWeapon:'None',attackDuration:.52,vy:0,airTime:0,landing:0,moveBlend:0,runBlend:0,buildBlend:0,buildTime:0,reload:0,weaponRecoil:0},overrides={};
  if(clip.kind==='routine'){s.studioPose=clip;s.studioProgress=u;s.studioFist=['Fighting','Kicking'].includes(clip.group);overrides.held='None';}
  if(held!==undefined)overrides.held=held;if(clip.spell)overrides.spell=clip.spell;
  const jump=(span,height)=>{const start=.18,end=span-.32;if(t<start)s.landing=.24*(1-t/start);else if(t<end){s.grounded=false;s.airTime=t-start;s.vy=height*(1-2*(t-start)/(end-start));}else s.landing=.24*Math.max(0,1-(t-end)/.24);};
  if(['walk','run','speed'].includes(clip.kind)){const run=clip.kind!=='walk';Object.assign(s,{speed:run?16:8,phase:t*(clip.kind==='speed'?12:run?9:6.5),moveBlend:1,runBlend:run?1:0,running:run});}
  if(clip.kind==='jump')jump(duration,9.5);
  if(clip.kind==='super-jump')jump(duration,19);
  if(clip.kind==='fall')Object.assign(s,{grounded:false,airTime:.6,vy:-4-t*5});
  if(clip.kind==='land')s.landing=.24*Math.max(0,1-t/.24);
  if(clip.kind==='build')Object.assign(s,{building:true,buildBlend:Math.min(1,t/.15,(duration-t)/.2),buildTime:t});
  if(clip.kind==='attack'||clip.kind==='spell')Object.assign(s,{attack:Math.max(0,w.duration-t),attackDuration:w.duration,attackWeapon:held||base.held,weaponRecoil:w.style==='fire'?Math.max(0,1-t/.16):0});
  if(clip.kind==='reload')Object.assign(s,{reload:Math.max(0,w.reload-t),reloadDuration:w.reload});
  if(['hover','fly','rise','descend','fly-punch','fly-transition'].includes(clip.kind)){
   overrides.held='None';overrides.power='Flying';Object.assign(s,{flying:true,grounded:false,airTime:2,flightCruise:['fly','fly-punch'].includes(clip.kind)?1:0,flightTilt:0,vy:clip.kind==='rise'?9:clip.kind==='descend'?-9:0});
   if(clip.kind==='fly-punch')s.attack=Math.max(0,.52-t);
   if(clip.kind==='fly-transition'){const blend=clamp(Math.min(t/.45,(duration-t)/.45));s.flightCruise=blend*blend*(3-2*blend);}
  }
  if(clip.kind==='climb'){overrides.held='None';overrides.power='Climbing';Object.assign(s,{climbing:true,grounded:false,phase:t*3,airTime:1});}
  if(clip.kind==='power'||clip.kind==='construct'){
   overrides.held='None';overrides.power=clip.power;
   const span=clip.kind==='construct'?SuperPowers.constructs[clip.construct].duration:{Strength:.95,'Laser eyes':.8,'Freezing breath':.7,Telekinesis:2.2,'Read minds':.8,Claws:.52}[clip.power];
   Object.assign(s,{heroAction:t<span?clip.power:null,heroDuration:span,heroTime:Math.max(0,span-t)});
   if(clip.power==='Claws')s.attack=Math.max(0,.52-t);
  }
  return {clip,profile:look(base,overrides),state:s,time:t,duration,progress:u,animated:clip.kind!=='still'};
 }
 return {clips,get,sample};
})();
