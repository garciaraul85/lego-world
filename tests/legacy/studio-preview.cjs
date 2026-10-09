const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
let bootstrap=fs.readFileSync(path.join(__dirname,'characters.cjs'),'utf8').split('const b=boot(),call=')[0];
bootstrap=bootstrap.replace(".split('</script>')[0],context)",".split('</script>')[0].replace(/\\}\\)\\(\\);\\s*$/, 'globalThis.studioAPI={A:StudioAnimations,M:CharacterModel,W:GameWeapons,S:SuperPowers,C:CharacterCatalog,playback:studioAnimation,snapshot:studioAnimationSnapshot,step:gameFrame,draw,camera:()=>({yaw,pitch,zoom,target:[...target]}),debris:()=>JSON.stringify(debris)};})();'),context)").replace('return {tools,elements,buttons,buffers,stored,','return {api:context.studioAPI,tools,elements,buttons,buffers,stored,');
const context={require,__dirname,console,AbortController,Blob,URL,setTimeout};vm.runInNewContext(bootstrap+';globalThis.boot=boot;',context);
const b=context.boot(),{A,M,W,S,C}=b.api,el=id=>b.elements['#'+id],call=(n,v)=>b.tools.get(n).execute(v);
el('bb-help-dialog').hidden=el('bb-system-menu').hidden=el('bb-dialog').hidden=true;
const ids=new Set(A.clips.map(c=>c.id));assert.equal(ids.size,A.clips.length);
for(const [name,w] of Object.entries(W.catalog)){assert(ids.has(w.style==='magic'?'spell:Ember Burst':'weapon:'+name),name+' has an action preview');if(w.style==='fire')assert(ids.has('reload:'+name),name+' has a reload preview');}
for(const spell of C.choices.spell)assert(ids.has('spell:'+spell));
for(const power of Object.keys(S.powers).filter(n=>n!=='None'))assert(A.clips.some(c=>c.power===power||({Flying:'fly',Climbing:'climb','Super speed':'speed','Super jumping':'super-jump'}[power]===c.id)),power+' has a preview');
for(const construct of Object.keys(S.constructs))assert(ids.has('construct:'+construct));
const routines=A.clips.filter(c=>c.kind==='routine');assert.equal(routines.length,43);
assert(ids.has('routine:standing-pelvic-tilt'));assert(ids.has('routine:prone-hip-rock'));
for(const group of ['Yoga','Exercise','Fighting','Kicking','Football / soccer','Volleyball','Baseball','Hockey','Basketball'])assert(routines.filter(c=>c.group===group).length>=3,group+' has varied routines');
for(const id of ['routine:standing-pelvic-tilt','routine:prone-hip-rock']){
 const clip=A.get(id),poses=[.25,.75].map(u=>{const a=A.sample(id,clip.duration*u,C.defaults);return M.jointPose(a.state,false,a.profile);});
 assert(Math.abs(poses[0].hips[14]-poses[1].hips[14])>.18,id+' moves hips forwards and backwards locally');
 assert(Math.abs(poses[0].hips[9]-poses[1].hips[9])>.02,id+' articulates the pelvis');
 for(const pose of poses){assert(Math.abs(pose.head[9]-(id.includes('prone')?-Math.sin(1.47):0))<.001,id+' keeps the head orientation steady');for(const foot of ['leftFoot','rightFoot'])assert(Math.abs(pose[foot][14]-(id.includes('prone')?-1.05:0))<.001,id+' feet stay planted');}
}
for(const clip of routines){
 let previous=null;const start=A.sample(clip.id,0,C.defaults),finish=A.sample(clip.id,clip.duration,C.defaults),first=M.jointPose(start.state,false,start.profile),last=M.jointPose(finish.state,false,finish.profile);
 for(const key of Object.keys(first))assert(Array.from(first[key]).every((v,k)=>Math.abs(v-last[key][k])<1e-5),clip.id+' returns to its starting pose');
 for(let frame=0;frame<=Math.ceil(clip.duration*60);frame++){
  const a=A.sample(clip.id,Math.min(clip.duration,frame/60),C.defaults),pose=M.jointPose(a.state,false,a.profile);
  assert.equal(a.profile.held,'None','routine props never use saved equipment');
  for(const [child,parent] of Object.entries(M.parents)){const rest=M.pivots[child].map((v,k)=>v-M.pivots[parent][k]),hinge=M.transform(pose[parent],rest);assert(hinge.every((v,k)=>Math.abs(v-pose[child][12+k])<1e-5),clip.id+' keeps '+child+' attached');}
  for(const side of [-1,1]){const arm=side<0?'leftArm':'rightArm',shoulder=M.transform(pose.root,M.pivots[arm]);assert(shoulder.every((v,k)=>Math.abs(v-pose[arm][12+k])<1e-5),clip.id+' shoulder follows torso');}
  for(const foot of ['leftFoot','rightFoot'])for(const z of [-.36,.55])assert(M.transform(pose[foot],[0,-.5,z])[1]>-.001,clip.id+' feet stay above the floor');
  if(['routine:plank','routine:push-up','routine:cobra','routine:prone-hip-rock'].includes(clip.id))for(const side of [-1,1])assert(Math.abs(M.transform(pose[side<0?'leftForearm':'rightForearm'],M.handGrip(side))[1]-.14)<.02,clip.id+' hands remain planted while elbows bend');
  if(previous)for(const key of Object.keys(pose))assert(Array.from(pose[key]).every((v,k)=>Math.abs(v-previous[key][k])<.65),clip.id+' has no one-frame rig snap');previous=pose;
 }
 const middle=A.sample(clip.id,clip.duration*.44,C.defaults),posed=M.jointPose(middle.state,false,middle.profile),standing=M.jointPose({},true,C.defaults);assert(Object.keys(posed).some(key=>Array.from(posed[key]).some((v,k)=>Math.abs(v-standing[key][k])>.12)),clip.id+' has a distinct action pose');
}
// Two-handed sports gear follows the torso and remains reachable for body types.
for(const profile of [C.defaults,{...C.defaults,gender:'Female',breastMode:'Sculpted',breastSize:150}])for(const clip of routines.filter(c=>c.prop==='bat'||c.prop==='hockey'))for(const progress of [0,.23,.44,.64,.82,1]){
 const a=A.sample(clip.id,progress*clip.duration,profile),pose=M.jointPose(a.state,false,a.profile),keys=clip.keys,point=keys.find(k=>Math.abs(k[0]-progress)<.001);if(!point?.[1].grip)continue;
 const g=point[1].grip.slice();g[2]=Math.max(g[2],.65+(profile.gender==='Female'?profile.breastSize/100*.32:0));const grip=M.mul(pose.root,M.matrix(...g.slice(0,3),g[4],g[3],g[5]));
 for(const side of [-1,1]){const intended=M.transform(grip,[side*.2,side*.12,0]),actual=M.transform(pose[side<0?'leftForearm':'rightForearm'],M.handGrip(side));assert(Math.hypot(...actual.map((v,k)=>v-intended[k]))<.02,clip.id+' both hands reach the prop');}
}
for(const id of ['walk','run','speed','climb']){const duration=A.get(id).duration,a=A.sample(id,0,C.defaults),b=A.sample(id,duration,C.defaults),start=M.jointPose(a.state,false,a.profile),end=M.jointPose(b.state,false,b.profile);for(const key of Object.keys(start))assert(Array.from(start[key]).every((v,k)=>Math.abs(v-end[key][k])<1e-5),id+' loops without a pose jump');}
// Every sample is local, finite, and uses the same action/weapon rig as gameplay.
for(const clip of A.clips){
 for(const fraction of [0,.15,.4,.7,1]){const a=A.sample(clip.id,clip.duration*fraction,C.defaults);assert.equal(a.state.x,0);assert.equal(a.state.y,0);assert.equal(a.state.z,0);assert.equal(a.state.heading,0);assert(!a.state.rigContact);for(const m of Object.values(M.jointPose(a.state,!a.animated,a.profile)))assert(Array.from(m).every(Number.isFinite),clip.label+' finite rig');}
 el('bb-animation-clip').value=clip.id;b.fire('bb-animation-clip','change');el('bb-animation-scrub').value=400;b.fire('bb-animation-scrub','input');b.api.draw();
}
// Existing adventure and live debris remain frozen throughout studio playback.
b.fire('bb-open');el('bb-data').value=JSON.stringify({format:'brick-builder',version:4,pieces:[{id:1,x:-4,z:-4,y:0,rows:8,cols:8,turn:0,kind:'plate',color:3},{id:2,x:-1,z:2,y:1,rows:2,cols:2,turn:0,kind:'brick',color:8,group:'preview-test'},{id:3,x:-1,z:2,y:4,rows:2,cols:2,turn:0,kind:'brick',color:8,group:'preview-test'}],player:{x:0,y:.4,z:0,heading:0},npcs:[{id:1,profile:C.defaults,role:'Runner',biome:'prairie',state:{x:-2,y:.4,z:-2,heading:0}}]});b.fire('bb-load-code');assert.equal(el('bb-dialog-message').textContent,'');
call('explore_lego_world',{playing:true});call('control_lego_character',{power:'Strength',usePower:true,seconds:1});call('configure_lego_character',{profile:{held:'Club'}});
const before=JSON.stringify(b.read()),stored=b.stored.get('lego-free-build-v1'),debris=b.api.debris();
assert(JSON.parse(debris).length>0,'isolation check uses actual smashed fragments');
el('bb-animation-clip').value='reload:Rifle';b.fire('bb-animation-clip','change');b.api.step(.2);assert.equal(b.api.snapshot().profile.held,'Rifle');assert.equal(b.read().characters.items[0].profile.held,'Club','preview gear never equips the saved character');
for(let i=0;i<80;i++)b.api.step(.05);assert.equal(JSON.stringify(b.read()),before,'preview does not move player/NPCs or change world');assert.equal(b.api.debris(),debris,'preview does not simulate loose bricks');assert.equal(b.stored.get('lego-free-build-v1'),stored,'preview playback does not save transient state');
b.fire('bb-back');el('bb-studio-zoom').value=105;b.fire('bb-studio-zoom','input');const camera=JSON.stringify(b.api.camera());b.api.step(.1);assert.equal(JSON.stringify(b.api.camera()),camera,'playback preserves rotation and zoom');
b.fire('bb-animation-play');const paused=b.api.playback.time;b.api.step(.2);assert.equal(b.api.playback.time,paused,'pause holds the pose');
el('bb-animation-scrub').value=650;b.fire('bb-animation-scrub','input');assert(Math.abs(b.api.snapshot().progress-.65)<.00001,'timeline selects an exact pose');
el('bb-animation-speed').value=.5;b.fire('bb-animation-speed','input');b.fire('bb-animation-replay');b.api.step(.2);assert(Math.abs(b.api.playback.time-.1)<.00001,'slow motion advances at the chosen rate');
el('bb-animation-loop').checked=false;b.fire('bb-animation-loop','change');b.api.step(10);assert.equal(b.api.playback.running,false,'nonlooping playback stops at the end');assert.equal(b.api.snapshot().progress,1);
el('bb-animation-loop').checked=true;b.fire('bb-animation-loop','change');b.fire('bb-animation-replay');b.api.step(10);assert(b.api.playback.running&&b.api.playback.time<b.api.snapshot().duration,'loop stays inside the clip');
el('bb-character-panel').hidden=true;const t=b.api.playback.time;b.api.step(.2);assert.equal(b.api.playback.time,t,'painting pauses playback');assert.equal(b.api.snapshot().clip.id,'still','painting restores the neutral drawing pose');el('bb-character-panel').hidden=false;
call('explore_lego_world',{playing:true});const player=JSON.stringify(b.read().player);b.api.step(0);assert.equal(JSON.stringify(b.read().player),player,'preview pose never transfers into exploration');
console.log('PASS: '+A.clips.length+' local animation clips, full weapon/reload/spell/power coverage, real rig rendering, pause/replay/slow motion/scrubbing/looping, orbit and zoom, and unchanged saved character, world, NPCs, player and debris.');
