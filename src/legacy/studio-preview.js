// Preview playback is transient and never changes exploration or saved profiles.
const studioAnimation={id:'still',time:0,running:false,loop:true,speed:1};
for(const group of [...new Set(StudioAnimations.clips.map(c=>c.group))]){const optgroup=document.createElement('optgroup');optgroup.label=group;for(const clip of StudioAnimations.clips.filter(c=>c.group===group)){const option=document.createElement('option');option.value=clip.id;option.textContent=clip.label;optgroup.appendChild(option);}q('#bb-animation-clip').appendChild(optgroup);}
q('#bb-animation-clip').value='still';q('#bb-animation-loop').checked=true;
function studioAnimationSnapshot(){return StudioAnimations.sample(!characterPreview||q('#bb-character-panel').hidden?'still':studioAnimation.id,studioAnimation.time,activeProfile());}
function syncStudioAnimation(){
 const a=StudioAnimations.sample(studioAnimation.id,studioAnimation.time,activeProfile());
 q('#bb-animation-clip').value=studioAnimation.id;q('#bb-animation-play').textContent=studioAnimation.running?'Pause':'Play';q('#bb-animation-play').setAttribute('aria-pressed',String(studioAnimation.running));
 q('#bb-animation-play').disabled=q('#bb-animation-replay').disabled=q('#bb-animation-scrub').disabled=!a.animated;
 q('#bb-animation-scrub').value=Math.round(a.progress*1000);q('#bb-animation-scrub').setAttribute('aria-valuetext',a.time.toFixed(2)+' of '+a.duration.toFixed(2)+' seconds');q('#bb-animation-time').textContent=a.time.toFixed(2)+' / '+a.duration.toFixed(2)+' s';q('#bb-animation-speed-value').textContent=studioAnimation.speed.toFixed(2)+'×';q('#bb-studio-zoom').value=zoom;
}
function selectStudioAnimation(id){studioAnimation.id=StudioAnimations.get(id).id;studioAnimation.time=0;studioAnimation.running=studioAnimation.id!=='still';q('#bb-animation-note').textContent=StudioAnimations.get(id).label+' · In-place preview. Gear shown here is temporary.';syncStudioAnimation();dirty=true;}
q('#bb-animation-clip').addEventListener('change',e=>selectStudioAnimation(e.target.value));
q('#bb-animation-play').addEventListener('click',()=>{const a=studioAnimationSnapshot();if(studioAnimation.time>=a.duration)studioAnimation.time=0;studioAnimation.running=!studioAnimation.running;syncStudioAnimation();dirty=true;});
q('#bb-animation-replay').addEventListener('click',()=>{studioAnimation.time=0;studioAnimation.running=true;syncStudioAnimation();dirty=true;});
q('#bb-animation-loop').addEventListener('change',e=>{studioAnimation.loop=e.target.checked;});
q('#bb-animation-speed').addEventListener('input',e=>{studioAnimation.speed=Math.max(.25,Math.min(2,Number(e.target.value)||1));syncStudioAnimation();});
q('#bb-animation-scrub').addEventListener('input',e=>{studioAnimation.running=false;studioAnimation.time=studioAnimationSnapshot().duration*Math.max(0,Math.min(1000,Number(e.target.value)||0))/1000;syncStudioAnimation();dirty=true;});
q('#bb-studio-zoom').addEventListener('input',e=>setZoom(e.target.value));
q('#bb-animation-fit').addEventListener('click',()=>{target=[0,(StudioAnimations.get(studioAnimation.id).prop==='mat'?1.8:2.52)*CharacterCatalog.heightScale(activeProfile()),0];baseDistance=(studioAnimation.id==='still'?10.7:13.2)*Math.max(1,CharacterCatalog.heightScale(activeProfile()));setZoom(55);});
function studioAnimationFrame(dt){
 if(!studioAnimation.running||studioAnimation.id==='still'||q('#bb-character-panel').hidden||gameOverlayOpen()||!q('#bb-dialog').hidden)return;
 const a=studioAnimationSnapshot();studioAnimation.time+=dt*studioAnimation.speed;
 if(studioAnimation.time>=a.duration){if(studioAnimation.loop)studioAnimation.time%=a.duration;else{studioAnimation.time=a.duration;studioAnimation.running=false;}}
 syncStudioAnimation();dirty=true;
}
function drawStudioAnimationEffects(a){
 const {clip,state:s,profile:p,time:t}=a;if(!a.animated)return;
 let pose=CharacterModel.jointPose(s,false,p);
 if(clip.kind==='routine'){drawStudioRoutineProps(a,pose);return;}
 pose=CharacterModel.effectPose(s,p);const mouth=CharacterModel.transform(pose.head,[0,.27,.59]);
 const particles=(name,point,age,charge=false)=>{if(age<0||age>1.1)return;for(const e of GameMagic.burst(name,point,charge)){for(let remaining=age;remaining>0;remaining-=1/30)GameMagic.step(e,Math.min(1/30,remaining));if(e.life>0)heroShape('cube',e.position,[e.size,e.size*1.8,e.size],e.color,e.rx,e.ry+age*2,e.rz,Math.min(1,e.life/e.total));}};
 const beam=(from,to,color,width=.04,alpha=1)=>{const delta=to.map((v,k)=>v-from[k]),length=Math.hypot(...delta);heroShape('cube',from.map((v,k)=>(v+to[k])/2),[width,width,length],color,-Math.atan2(delta[1],Math.hypot(delta[0],delta[2])),Math.atan2(delta[0],delta[2]),0,alpha);};
 if(clip.kind==='spell'){const w=GameWeapons.get('Wand'),start=CharacterModel.muzzle(p,s);if(t<w.contact)particles(clip.spell,start,t,true);else{const age=t-w.contact,end=[start[0],start[1],start[2]+Math.min(2.5,age*8)];particles(clip.spell,end,Math.max(0,age-.3));}}
 if(clip.kind==='attack'&&GameWeapons.get(p.held).style==='fire'&&t<.16){const start=CharacterModel.muzzle(p,s);heroShape('sphere',start,[.18,.18,.18],[1,.7,.15],0,0,0,1-t/.16);beam(start,[start[0],start[1],start[2]+3],[1,.85,.4],.02,1-t/.16);}
 if(clip.power==='Laser eyes'&&t>.18&&t<.8){for(const side of [-1,1]){const eye=CharacterModel.transform(pose.head,[side*.225,.62,.58]);beam(eye,[eye[0],eye[1],eye[2]+3],[1,.12,.17],.055);}}
 if(clip.power==='Freezing breath'){
  if(t>.15&&t<.7)for(let i=0;i<12;i++){const z=(t*3+i/12)%1;heroShape('sphere',[mouth[0]+Math.sin(i*2.4)*z*.30,mouth[1]+Math.cos(i*2.4)*z*.30,mouth[2]+z*2.3],[.07,.07,.07],[.5,.9,1],0,0,0,.65);}
  if(t>.24&&t<5.24){heroShape('cube',[0,1.2,2.7],[.7,.7,.7],[.3,.5,.65],0,0,0,1,false);drawIceBox({x0:-.65,x1:.65,y0:.55,y1:1.85,z0:2.05,z1:3.35},5.24-t);}
 }
 if(clip.power==='Strength')particles('Ember Burst',[0,.25,1],t-.52);
 if(clip.power==='Telekinesis'&&t<2.2){const z=t<1.2?2:2+(t-1.2)*3,y=t<1.2?.8+1.1*Math.min(1,t/.4):1.9;heroShape('cube',[0,y,z],[.7,.7,.7],[.55,.35,.85],0,t*2,0,1,false);particles('Arcane Spiral',[0,y,z],t% .4,true);}
 if(clip.power==='Read minds'&&t<.8)particles('Arcane Spiral',[0,4.15,.2],t,true);
 if(clip.kind==='construct'&&t<SuperPowers.constructs[clip.construct].duration)drawConstruct({kind:clip.construct,age:t,position:[0,2.4,2.7],heading:0});
 if(clip.kind==='speed')particles('Thunder Bolt',[0,.5,-.3],t% .35,true);
}
