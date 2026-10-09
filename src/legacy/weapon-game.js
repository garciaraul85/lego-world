// Combat is local to the sandbox. Projectiles stop at the first solid brick;
// every destroyed creation uses the existing exact-original rebuild system.
let weaponAmmo=new Map(),weaponOwner='',fireHeld=new Set(),shots=[],combatEffects=[];
function syncWeapon(){
 const p=activeProfile(),w=GameWeapons.get(p.held),owner=activeCharacterId+'|'+p.held+(p.held==='Wand'?'|'+p.spell:'');
 if(owner!==weaponOwner){weaponOwner=owner;pendingSmash=null;pendingSpell=null;shots=[];fireHeld.clear();smashCooldown=0;if(controller)Object.assign(controller.state,{attack:0,reload:0,attackDuration:w.duration,weaponRecoil:0,recoilVelocity:0,attackWeapon:p.held});}
 q('#bb-weapon').value=GameWeapons.catalog[p.held]?p.held:'None';
 q('#bb-smash').textContent=w.action||'Strike';q('#bb-smash').setAttribute('aria-label',(w.action||'Strike')+' · '+(p.held==='None'?'unarmed':p.held)+' · F');q('#bb-reload').hidden=w.style!=='fire';
 q('#bb-weapon-status').textContent=w.style==='magic'?'Ready':w.style==='fire'?(controller?.state.reload>0?'Reloading…':ammoFor(p.held)+' / '+w.capacity):p.held==='None'?'Unarmed':w.style==='punch'?'Held item':w.style==='thrust'?'Thrust':w.twoHand?'Two-hand strike':w.style==='sweep'?'Sweeping strike':'Downward strike';
 q('#bb-spell-controls').hidden=w.style!=='magic';q('#bb-spell').value=p.spell;q('#bb-weapon-bar').dataset.magic=String(w.style==='magic');
 q('#bb-reload').disabled=w.style!=='fire'||controller?.state.reload>0||ammoFor(p.held)===w.capacity;
}
function ammoFor(name){const key=activeCharacterId+'|'+name;if(!weaponAmmo.has(key))weaponAmmo.set(key,GameWeapons.get(name).capacity||0);return weaponAmmo.get(key);}
function equipWeapon(name){if(name!=='None'&&!GameWeapons.catalog[name])throw Error('Unknown weapon.');remember();activeCharacter().profile=CharacterCatalog.validate({...activeProfile(),held:name});cancelRebuild();syncCharacter();persist();canvas.focus({preventScroll:true});dirty=true;return {weapon:name};}
for(const era of ['Unarmed','Medieval','Modern','Tools','Magic']){const group=document.createElement('optgroup');group.label=era;for(const name of era==='Unarmed'?['None']:Object.keys(GameWeapons.catalog).filter(n=>GameWeapons.catalog[n].era===era)){const o=document.createElement('option');o.value=name;o.textContent=name==='None'?'Unarmed':name==='Wand'?'Magic wand':name;group.appendChild(o);}q('#bb-weapon').appendChild(group);}
for(const name of Object.keys(GameMagic.spells)){const o=document.createElement('option');o.value=o.textContent=name;q('#bb-spell').appendChild(o);}
function equipSpell(name){if(!GameMagic.spells[name])throw Error('Unknown spell.');remember();activeCharacter().profile=CharacterCatalog.validate({...activeProfile(),spell:name});syncCharacter();persist();canvas.focus({preventScroll:true});dirty=true;return {spell:name};}
q('#bb-spell').addEventListener('change',e=>equipSpell(e.target.value));
q('#bb-weapon').addEventListener('change',e=>equipWeapon(e.target.value));q('#bb-reload').addEventListener('click',()=>reloadWeapon());
function reloadWeapon(){const w=GameWeapons.get(activeProfile().held);if(!playing||w.style!=='fire'||controller.state.reload>0||ammoFor(activeProfile().held)>=w.capacity||controller.state.building)return false;pendingSmash=null;Object.assign(controller.state,{attack:0,reload:w.reload,reloadDuration:w.reload});smashCooldown=0;syncWeapon();dirty=true;return true;}
function fireWeapon(){
 const physics=ensurePhysics(),p=activeProfile(),w=GameWeapons.get(p.held),s=physics.state;
 if(s.reload>0)return {reloading:true};if(ammoFor(p.held)<=0){reloadWeapon();return {reloading:true};}
 weaponAmmo.set(activeCharacterId+'|'+p.held,ammoFor(p.held)-1);Object.assign(s,{attack:w.duration,attackDuration:w.duration,recoilVelocity:(s.recoilVelocity||0)+w.recoil});smashCooldown=w.interval;
 const muzzle=CharacterModel.muzzle(p,{...s,rigContact:s.rigContact,attack:0}),confined=GamePhysics.containPoint(physics.area,muzzle[0],muzzle[2],.10),origin=[confined.x,muzzle[1],confined.z],heading=s.heading;
 const shoulder=[s.x,s.y+2.88*CharacterCatalog.heightScale(p),s.z],barrel=origin.map((v,k)=>v-shoulder[k]),length=Math.hypot(...barrel),blocked=GameWeapons.cast(shoulder,barrel.map(v=>v/Math.max(.001,length)),length,pieces,GamePhysics.bounds);
 if(blocked){impactEffect(blocked.point);if(blocked.piece.y>0)breakHit(physics,blocked.piece);combatEffects.push({kind:'flash',position:origin,life:.07,total:.07,heading});syncWeapon();return {fired:true,ammo:ammoFor(p.held)};}
 for(let i=0;i<(w.pellets||1);i++){const spread=w.pellets?(i-(w.pellets-1)/2)*.025:0,dir=[Math.sin(heading+spread),0,Math.cos(heading+spread)],distance=Math.min(w.range,GameWeapons.edgeDistance(origin,dir,physics.area));
  if(distance>0)shots.push({position:[...origin],origin:[...origin],dir,remaining:distance,speed:82,age:0});
 }
 combatEffects.push({kind:'flash',position:origin,life:.07,total:.07,heading});syncWeapon();dirty=true;return {fired:true,ammo:ammoFor(p.held)};
}
function castSpell(){
 const physics=ensurePhysics(),p=activeProfile(),w=GameWeapons.get(p.held),s=physics.state;
 if(w.style!=='magic'||s.building||pendingSpell)return {cast:false};
 pendingSmash=null;pendingSpell={spell:p.spell,elapsed:0,owner:weaponOwner};
 Object.assign(s,{attack:w.duration,attackDuration:w.duration,attackWeapon:'Wand'});smashCooldown=w.interval;
 const hand=CharacterModel.muzzle(p,s),confined=GamePhysics.containPoint(physics.area,hand[0],hand[2],.1),point=[confined.x,hand[1],confined.z];
 combatEffects.push(...GameMagic.burst(p.spell,point,true));syncWeapon();dirty=true;return {cast:true,spell:p.spell};
}
function launchSpell(name){
 const physics=ensurePhysics(),s=physics.state,p=activeProfile(),spell=GameMagic.get(name),tip=CharacterModel.muzzle(p,s),confined=GamePhysics.containPoint(physics.area,tip[0],tip[2],.1),origin=[confined.x,tip[1],confined.z],shoulder=[s.x,s.y+2.88*CharacterCatalog.heightScale(p),s.z],delta=origin.map((v,k)=>v-shoulder[k]),length=Math.hypot(...delta),blocked=GameWeapons.cast(shoulder,delta.map(v=>v/Math.max(.001,length)),length,pieces,GamePhysics.bounds);
 if(blocked){spellImpact(name,blocked.point,blocked.piece);return;}
 // Aim at a creation in a narrow forward cone, with the first obstruction
 // still taking the hit. Empty space casts straight along the wand's facing.
 const forward=[Math.sin(s.heading),0,Math.cos(s.heading)];let target=null,rank=Infinity;
 for(const piece of pieces){if(piece.y===0)continue;const b=GamePhysics.bounds(piece),point=[(b.x0+b.x1)/2,Math.max(s.y+1,Math.min(s.y+2.6,(b.y0+b.y1)/2)),(b.z0+b.z1)/2],d=point.map((v,k)=>v-shoulder[k]),distance=Math.hypot(d[0],d[2]),along=d[0]*forward[0]+d[2]*forward[2],across=Math.abs(d[0]*forward[2]-d[2]*forward[0]);if(along>.5&&distance<spell.range&&across<.65+along*.12&&distance<rank){target=point;rank=distance;}}
 const vector=target?target.map((v,k)=>v-origin[k]):forward,n=Math.hypot(...vector),dir=vector.map(v=>v/Math.max(.001,n)),remaining=Math.min(spell.range,GameWeapons.edgeDistance(origin,dir,physics.area));
 if(remaining>0)shots.push({spell:name,position:[...origin],origin:[...origin],dir,remaining,speed:spell.speed,age:0,emission:0});
 combatEffects.push(...GameMagic.burst(name,origin,true));dirty=true;
}
function spellImpact(name,point,first=null){
 const spell=GameMagic.get(name),physics=ensurePhysics();combatEffects.push(...GameMagic.burst(name,point));
 const candidates=pieces.filter(p=>{if(p.y===0)return false;const b=GamePhysics.bounds(p);return Math.hypot(Math.max(b.x0-point[0],0,point[0]-b.x1),Math.max(b.y0-point[1],0,point[1]-b.y1),Math.max(b.z0-point[2],0,point[2]-b.z1))<=spell.radius;});
 const ids=[...(first&&first.y>0?[first.id]:[]),...candidates.map(p=>p.id)],seen=new Set();let hits=0;
 for(const id of ids){const p=pieces.find(p=>p.id===id);if(!p)continue;const key=p.group||'brick-'+p.id;if(seen.has(key))continue;seen.add(key);const result=breakHit(physics,p,{heading:physics.state.heading,impulse:spell.impulse,mass:1.2});hits+=result.smashed||0;if(seen.size>=12)break;}
 return hits;
}
function impactEffect(point,heading=0){for(let i=0;i<5;i++)combatEffects.push({kind:'spark',position:[...point],velocity:[Math.cos(i*2.4)*2,1.3+i*.2,Math.sin(i*2.4)*2],life:.22,total:.22,heading});}
function combatStep(dt){
 if(!playing)return;const s=controller.state,w=GameWeapons.get(activeProfile().held);
 const steps=Math.max(1,Math.ceil(dt/.008)),h=dt/steps;for(let i=0;i<steps;i++){s.recoilVelocity=(s.recoilVelocity||0)+(-180*(s.weaponRecoil||0)-23*(s.recoilVelocity||0))*h;s.weaponRecoil=(s.weaponRecoil||0)+s.recoilVelocity*h;}
 if(Math.abs(s.weaponRecoil||0)<.00001&&Math.abs(s.recoilVelocity||0)<.0001)s.weaponRecoil=s.recoilVelocity=0;
 if(s.reload>0){s.reload=Math.max(0,s.reload-dt);if(s.reload===0){weaponAmmo.set(activeCharacterId+'|'+activeProfile().held,w.capacity);syncWeapon();}}
 if(pendingSpell){pendingSpell.elapsed+=dt;if(pendingSpell.owner!==weaponOwner||w.style!=='magic')pendingSpell=null;else if(pendingSpell.elapsed>=w.contact){const spell=pendingSpell.spell;pendingSpell=null;launchSpell(spell);}}
 if(w.style==='magic'){const label=pendingSpell?'Charging':smashCooldown>0?'Recovering':'Ready';if(q('#bb-weapon-status').textContent!==label)q('#bb-weapon-status').textContent=label;}
 const automatic=w.automatic&&(heldKeys.has('f')||fireHeld.size>0);if(automatic&&!conversation&&!gameOverlayOpen()&&smashCooldown<=0&&!s.reload&&!s.building)smash();
 const active=[];for(const shot of shots){shot.age+=dt;const distance=Math.min(shot.remaining,shot.speed*dt),hit=GameWeapons.cast(shot.position,shot.dir,distance,pieces,GamePhysics.bounds),start=[...shot.position],end=hit?.point||shot.position.map((v,k)=>v+shot.dir[k]*distance);
  if(shot.spell){shot.emission+=dt;while(shot.emission>=.035){shot.emission-=.035;const t=1-shot.emission/Math.max(.001,dt),point=start.map((v,k)=>v+(end[k]-v)*Math.max(0,Math.min(1,t)));combatEffects.push(...GameMagic.trail(shot.spell,point,shot.dir,shot.age-shot.emission));}}
  else combatEffects.push({kind:'trace',position:shot.position.map((v,k)=>(v+end[k])/2),length:Math.hypot(...end.map((v,k)=>v-shot.position[k])),life:.055,total:.055,heading:Math.atan2(shot.dir[0],shot.dir[2])});
  shot.position=end;shot.remaining-=distance;
  if(hit){if(shot.spell)spellImpact(shot.spell,end,hit.piece);else{impactEffect(end);if(hit.piece.y>0)breakHit(ensurePhysics(),hit.piece);}}else if(shot.remaining>.001)active.push(shot);else if(shot.spell)combatEffects.push(...GameMagic.burst(shot.spell,end,true));
 }shots=active;

 for(const e of combatEffects)GameMagic.step(e,dt,controller.area);
 combatEffects=combatEffects.filter(e=>e.life>0).slice(-600);shots=shots.slice(-24);
}
function drawCombatEffects(){
 if(!combatEffects.length)return;const dm=mesh({rows:1,cols:1,turn:0,kind:'tile'});
 for(const e of combatEffects){const m=CharacterModel.matrix(...e.position,e.kind==='magic'?(e.ry||0)+(e.total-e.life)*2:e.heading||0,e.rx||0,e.rz||0),size=e.kind==='magic'?[e.size,e.size*1.8,e.size]:e.kind==='trace'?[e.width||.035,e.width||.09,Math.max(.04,e.length)]:e.kind==='flash'?[.14,.37,.22]:[.045,.09,.045];for(let c=0;c<3;c++)for(let r=0;r<3;r++)m[c*4+r]*=size[c];m[13]-=.1;characterRenderer.effect(dm,m,e.color||(e.kind==='flash'?[1,.65,.11]:[1,.85,.38]),Math.min(1,e.life/e.total));}
}
q('#bb-smash').addEventListener('pointerdown',e=>{e.preventDefault();q('#bb-smash').setPointerCapture?.(e.pointerId);if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))document.activeElement.blur();fireHeld.add(e.pointerId);smash();});
for(const type of ['pointerup','pointercancel','lostpointercapture'])q('#bb-smash').addEventListener(type,e=>fireHeld.delete(e.pointerId));
