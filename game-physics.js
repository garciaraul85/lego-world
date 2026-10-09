const GamePhysics=(()=>{
'use strict';
const dims=p=>p.turn%2?[p.rows,p.cols]:[p.cols,p.rows],height=p=>(p.kind==='brick'?3:1)*.4;
function bounds(p){const [w,d]=dims(p);return {x0:p.x,x1:p.x+w,z0:p.z,z1:p.z+d,y0:p.y*.4,y1:p.y*.4+height(p)};}
// Generated worlds retain their original border when creations are smashed.
// Free builds use their ground plates, so a tall or overhanging object cannot
// silently enlarge the playable area.
const characterMargin=1.6;
const characterRadius=.80,characterHeight=4.40;
const scaleOf=s=>typeof CharacterCatalog==='undefined'?1:CharacterCatalog.heightScale(s?.rigContact?.profile||s),radiusOf=s=>characterRadius*scaleOf(s),bodyHeight=s=>characterHeight*scaleOf(s);
const actorTop=s=>s.rigContact?Math.max(...RigCollision.core(s.rigContact,s).map(b=>b.max[1])):s.y+bodyHeight(s);
function worldBounds(pieces,world=null){
 if(world&&Number.isFinite(world.width)&&Number.isFinite(world.depth))return {x0:-Math.floor(world.width/2),x1:-Math.floor(world.width/2)+world.width,z0:-Math.floor(world.depth/2),z1:-Math.floor(world.depth/2)+world.depth};
 const ground=pieces.filter(p=>p.y===0);if(!ground.length)return {x0:-16,x1:16,z0:-16,z1:16};
 const area={x0:Infinity,x1:-Infinity,z0:Infinity,z1:-Infinity};for(const p of ground){const b=bounds(p);for(const k of ['x0','z0'])area[k]=Math.min(area[k],b[k]);for(const k of ['x1','z1'])area[k]=Math.max(area[k],b[k]);}return area;
}
function containPoint(area,x,z,r=characterMargin){const mx=Math.min(r,(area.x1-area.x0)/2),mz=Math.min(r,(area.z1-area.z0)/2);return {x:Math.max(area.x0+mx,Math.min(area.x1-mx,x)),z:Math.max(area.z0+mz,Math.min(area.z1-mz,z))};}
function intersectsXZ(b,x,z,r=.40){const dx=Math.max(b.x0-x,0,x-b.x1),dz=Math.max(b.z0-z,0,z-b.z1);return dx*dx+dz*dz<r*r;}
function overlapsPlayer(p,s){const b=bounds(p);if(s.rigContact)return RigCollision.core(s.rigContact,s).some(a=>RigCollision.contact(a,RigCollision.brick(b)));return intersectsXZ(b,s.x,s.z,.4*scaleOf(s))&&b.y1>s.y+.035&&b.y0<s.y+4.02*scaleOf(s);}
function penetration(b,x,z,r=.40){
 const cx=Math.max(b.x0,Math.min(x,b.x1)),cz=Math.max(b.z0,Math.min(z,b.z1)),dx=x-cx,dz=z-cz,d=Math.hypot(dx,dz);
 if(d>=r)return null;
 if(d>1e-8)return {nx:dx/d,nz:dz/d,depth:r-d};
 const faces=[[x-b.x0,-1,0],[b.x1-x,1,0],[z-b.z0,0,-1],[b.z1-z,0,1]].sort((a,b)=>a[0]-b[0]);
 return {nx:faces[0][1],nz:faces[0][2],depth:r+faces[0][0]};
}
// Restoring a doorway must not seal the builder into a small pocket.
// Compare reachable ground before/after; existing enclosed rooms stay usable.
const rebuildWorlds=new WeakMap();
function rebuildTraps(controller,originals,x,z,y){
 let cached=rebuildWorlds.get(controller);if(!cached||cached.pieces!==controller.pieces||cached.originals!==originals||cached.profile!==controller.state?.rigContact?.profile){const future=Object.create(Controller.prototype),current=Object.create(Controller.prototype);future.replace([...controller.pieces,...originals],controller.world);current.replace(controller.pieces,controller.world);for(const c of [future,current]){c.state={...controller.state};if(controller.state?.rigContact)Object.defineProperty(c.state,'rigContact',{enumerable:false,value:{...controller.state.rigContact,controller:c,coreSnapshot:null}});}
 cached={pieces:controller.pieces,originals,future,current,profile:controller.state?.rigContact?.profile};rebuildWorlds.set(controller,cached);}
 const future=cached.future;for(const c of [future,cached.current])Object.assign(c.state,controller.state);
 const corners=[[controller.area.x0,controller.area.z0],[controller.area.x0,controller.area.z1],[controller.area.x1,controller.area.z0],[controller.area.x1,controller.area.z1]].map(([a,b])=>containPoint(controller.area,a,b));
 const reach=Math.max(.4,Math.min(3.6,Math.max(...corners.map(p=>Math.hypot(p.x-x,p.z-z)))*.75));
 function escape(c){
  const queue=[[0,0]],seen=new Set(['0,0']);
  for(let i=0;i<queue.length;i++){const [a,b]=queue[i];if(Math.hypot(a,b)*.4>=reach)return true;
   for(const [da,db] of [[1,0],[-1,0],[0,1],[0,-1]]){const u=a+da,v=b+db,key=u+','+v;if(seen.has(key))continue;seen.add(key);
    const px=x+u*.4,pz=z+v*.4,f=c.floor(px,pz,y+.05);
    if(f!==null&&Math.abs(f-y)<.06&&c.clear(px,y,pz))queue.push([u,v]);
   }
  }return false;
 }
 // Neighbors can move away; only permanent scenery defines an enclosure.
 return !escape(future)&&escape(cached.current);
}
// A rebuilding marker must sit on supported, level ground with room for the
// entire character, both before and after the missing bricks return.
function rebuildSpot(controller,originals,x,z,level=controller.state.y){
 if(!controller.contains(x,z))return null;
 const y=controller.floor(x,z,level+.45);if(y===null||Math.abs(y-level)>.45)return null;
 if(controller.state.rigContact){const s={...controller.state,x,y,z,rigContact:controller.state.rigContact};if(controller.sceneryContacts(x,y,z).length||originals.some(p=>overlapsPlayer(p,s)))return null;}
 for(let i=0;i<8;i++){const a=i*Math.PI/4,sx=x+Math.cos(a)*.70*scaleOf(controller.state),sz=z+Math.sin(a)*.70*scaleOf(controller.state);
  if(controller.pieces.length&&!controller.nearby(sx,sz).some(({b})=>sx>=b.x0&&sx<=b.x1&&sz>=b.z0&&sz<=b.z1&&Math.abs(b.y1-y)<.035))return null;
 }
 const radius=.80*scaleOf(controller.state),blocks=b=>intersectsXZ(b,x,z,radius)&&b.y1>y+.035&&b.y0<y+4.02*scaleOf(controller.state);
 for(const dx of [-radius,0,radius])for(const dz of [-radius,0,radius])if(controller.nearby(x+dx,z+dz).some(({b})=>blocks(b)))return null;
 if(originals.some(p=>blocks(bounds(p))))return null;
 const bs=originals.map(bounds),x0=Math.min(...bs.map(b=>b.x0)),x1=Math.max(...bs.map(b=>b.x1)),z0=Math.min(...bs.map(b=>b.z0)),z1=Math.max(...bs.map(b=>b.z1));
 if(Math.hypot(Math.max(x0-x,0,x-x1),Math.max(z0-z,0,z-z1))>3.15||Math.min(...bs.map(b=>b.y0))>=y+4.5)return null;
 if(rebuildTraps(controller,originals,x,z,y))return null;
 let surface=y;for(const {p,b} of controller.nearby(x,z))if(Math.abs(b.y1-y)<.035&&x>=b.x0&&x<=b.x1&&z>=b.z0&&z<=b.z1)surface=Math.max(surface,b.y1+(p.kind==='tile'||controller.world&&typeof WorldGenerator!=='undefined'&&WorldGenerator.isPavement(p,controller.world.config,controller.world.layoutVersion)?0:.225));
 return {x,y,z,surface};
}
function findRebuildSpot(controller,originals,accept=()=>true){
 const s=controller.state,here=rebuildSpot(controller,originals,s.x,s.z);if(here&&accept(here))return here;
 for(let r=.5;r<=6;r+=.5)for(let i=0;i<32;i++){const a=i*Math.PI/16,spot=rebuildSpot(controller,originals,s.x+Math.cos(a)*r,s.z+Math.sin(a)*r);if(spot&&accept(spot))return spot;}
 return null;
}
// The rendered loose 1x1 brick is centered, with a body from -.6 to .6
// and a stud reaching .825. Keep its lowest rotated point on its support.
function debrisBottom(d){const cx=Math.cos(d.rx),sx=Math.sin(d.rx),cz=Math.cos(d.rz),sz=Math.sin(d.rz),up=cx*cz;return d.scale*(.4875*(Math.abs(cx*sz)+Math.abs(sx))+(up>=0?.6*up:-.825*up));}
function looseFloor(controller,x,z,ceiling){let floor=0;for(const {p,b} of controller.nearby(x,z)){const top=b.y1+(p.kind==='tile'||controller.world&&typeof WorldGenerator!=='undefined'&&WorldGenerator.isPavement(p,controller.world.config,controller.world.layoutVersion)?0:.225);if(x>=b.x0&&x<=b.x1&&z>=b.z0&&z<=b.z1&&top<=ceiling+.015&&top>floor)floor=top;}return floor;}
const flatAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
const debrisRadius=d=>Math.hypot(.4875,.825,.4875)*d.scale;
function confineDebris(d,controller){
 const p=containPoint(controller.area,d.x,d.z,debrisRadius(d));
 if(p.x!==d.x){if((d.x-p.x)*d.vx>0)d.vx=-d.vx*.32;d.x=p.x;d.sleeping=false;}
 if(p.z!==d.z){if((d.z-p.z)*d.vz>0)d.vz=-d.vz*.32;d.z=p.z;d.sleeping=false;}
 return d;
}
function stepDebrisPiece(d,dt,controller){
 confineDebris(d,controller);
 const n=Math.max(1,Math.ceil(dt/.008)),h=dt/n;d.age+=dt;
 for(let i=0;i<n;i++){
  const bottom=d.y-debrisBottom(d);
  if(d.sleeping){const floor=looseFloor(controller,d.x,d.z,bottom+.02);if(Math.abs(bottom-floor)<.025)continue;d.sleeping=false;}
  d.vy-=18*h;d.x+=d.vx*h;d.z+=d.vz*h;d.y+=d.vy*h;
  d.rx+=h*d.vx;d.ry+=h*d.vz;d.rz+=h*d.vy*.08;
  confineDebris(d,controller);
  const floor=looseFloor(controller,d.x,d.z,bottom+.02),extent=debrisBottom(d);
  if(d.vy<=0&&d.y-extent<=floor){
   d.vy=d.vy<-1.5?-d.vy*.28:0;
   const drag=Math.exp(-8*h);d.vx*=drag;d.vz*=drag;
   if(d.vy===0){
    const relax=Math.exp(-12*h);d.rx=flatAngle(d.rx)*relax;d.rz=flatAngle(d.rz)*relax;
    if(Math.hypot(d.vx,d.vz)<.10&&Math.abs(d.rx)+Math.abs(d.rz)<.02){d.vx=d.vy=d.vz=0;d.rx=d.rz=0;d.sleeping=true;}
   }
   d.y=floor+debrisBottom(d);
  }
 }
 return d;
}
class Controller{
 constructor(pieces,world=null){this.state={x:0,y:.4,z:0,vy:0,heading:Math.PI,grounded:true,phase:0,speed:0,gaitSpeed:0,moveBlend:0,runBlend:0,running:false,attack:0,building:false,buildTime:0,buildBlend:0,airTime:0,landing:0,jumpBuffer:0,coyote:0};this.replace(pieces,world);this.spawn();}
 replace(pieces,world=this.world){if(world&&typeof WorldGenerator!=='undefined')pieces=pieces.filter(p=>!WorldGenerator.isRoadMark(p,world.config,world.layoutVersion));this.world=world;this.area=worldBounds(pieces,world);this.pieces=pieces;this.bins=new Map();for(const p of pieces){const b=bounds(p),item={p,b};for(let x=Math.floor((b.x0-.6)/4);x<=Math.floor((b.x1+.6)/4);x++)for(let z=Math.floor((b.z0-.6)/4);z<=Math.floor((b.z1+.6)/4);z++){const k=x+','+z;if(!this.bins.has(k))this.bins.set(k,[]);this.bins.get(k).push(item);}}}
 contains(x,z,r=characterMargin*scaleOf(this.state)){const p=containPoint(this.area,x,z,r);return Math.abs(p.x-x)<1e-8&&Math.abs(p.z-z)<1e-8;}
 repairPosition(){const s=this.state;if(this.contains(s.x,s.z))return false;const p=containPoint(this.area,s.x,s.z,characterMargin*scaleOf(s));s.x=p.x;s.z=p.z;const y=this.floor(s.x,s.z);if(y===null||!this.clear(s.x,y,s.z)){this.spawn();return true;}Object.assign(s,{y,vy:0,grounded:true,speed:0,gaitSpeed:0,moveBlend:0,runBlend:0});return true;}
 nearby(x,z){return this.bins.get(Math.floor(x/4)+','+Math.floor(z/4))||[];}
 setActors(states){this.actors=states;}
 // Joint-bound compound bodies use the same sliding and recovery as scenery.
 // Unbound utility controllers retain the lightweight cylinder fallback.
 // Reference each state directly so moving NPCs never leave stale obstacles.
 actorContacts(x,y,z){const contacts=[];for(const actor of this.actors||[]){if(actor===this.state)continue;if(this.state.rigContact&&actor.rigContact){const hits=RigCollision.actorContacts(this.state.rigContact,{...this.state,x,y,z},actor);for(const h of hits)h.rigActor=true;contacts.push(...hits);continue;}if(actorTop(actor)<=y+.035||actor.y>=y+bodyHeight(this.state)-.035)continue;const dx=x-actor.x,dz=z-actor.z,d=Math.hypot(dx,dz),radius=radiusOf(this.state)+radiusOf(actor);if(d<radius)contacts.push({b:actor,actor:true,p:{nx:d>1e-8?dx/d:1,nz:d>1e-8?dz/d:0,depth:radius-d}});}return contacts;}
 sceneryContacts(x,y,z){if(this.state?.rigContact)return RigCollision.coreContacts(this.state.rigContact,{...this.state,x,y,z});return this.nearby(x,z).filter(({b})=>b.y1>y+.035&&b.y0<y+4.02*scaleOf(this.state)).map(({b})=>({b,p:penetration(b,x,z,.40*scaleOf(this.state))})).filter(c=>c.p);}
 clear(x,y,z){return this.contains(x,z)&&!this.sceneryContacts(x,y,z).length&&!this.actorContacts(x,y,z).length;}
 contacts(x,y,z){const contacts=[...this.sceneryContacts(x,y,z),...this.actorContacts(x,y,z)],unique=new Map();for(const c of contacts){if(!unique.has(c.b)||unique.get(c.b).p.depth<c.p.depth)unique.set(c.b,c);}return [...unique.values()];}
 // Permit motion out of a pre-existing overlap, never deeper into a wall.
 canEscape(x,y,z){if(!this.contains(x,z))return false;const s=this.state,old=this.contacts(s.x,y,s.z);if(!old.length)return false;
  return this.contacts(x,y,z).every(c=>{const prev=old.find(o=>o.b===c.b);return prev&&c.p.depth<=prev.p.depth+1e-7;});
 }
 separate(h){const s=this.state,contacts=this.contacts(s.x,s.y,s.z);if(!contacts.length)return;
  const score=(x,z)=>this.contacts(x,s.y,z).reduce((a,c)=>a+c.p.depth*c.p.depth,0);let best=score(s.x,s.z),move=null;
  // Small continuous nudges; no respawn, position snap, or passage through walls.
  for(const {p} of contacts){const d=Math.min(p.depth+.0001,h*2),x=s.x+p.nx*d,z=s.z+p.nz*d,v=score(x,z);
   if(v<best-1e-10&&this.canEscape(x,s.y,z)){best=v;move={x,z};}
  }if(move){s.x=move.x;s.z=move.z;}
 }
 move(ax,az){const s=this.state,p=containPoint(this.area,s.x+ax,s.z+az,characterMargin*scaleOf(s)),x=p.x,z=p.z;ax=x-s.x;az=z-s.z;
  if(this.clear(x,s.y,z)||this.canEscape(x,s.y,z)){s.x=x;s.z=z;return;}
  if(s.grounded){const f=this.floor(x,z,s.y+.45);if(f!==null&&f>s.y-.05&&f<=s.y+.45&&this.clear(x,f,z)){s.x=x;s.z=z;s.y=f;return;}}
  // Project the intended motion onto the rounded collision surface.
  let sx=ax,sz=az;
  for(let pass=0;pass<3;pass++){for(const {p,actor,rigActor,b} of this.contacts(s.x+sx,s.y,s.z+sz)){const into=sx*p.nx+sz*p.nz;if(into<0){sx-=into*p.nx;sz-=into*p.nz;}
    // Follow the curved body surface; a tangent alone can remain just inside it.
    if(actor&&!rigActor){const dx=s.x+sx-b.x,dz=s.z+sz-b.z,d=Math.hypot(dx,dz),depth=radiusOf(this.state)+radiusOf(b)-d;if(d>1e-8&&depth>0&&depth<=Math.hypot(ax,az)+.001){sx+=dx/d*(depth+.000001);sz+=dz/d*(depth+.000001);}}
   }
   if(this.clear(s.x+sx,s.y,s.z+sz)){s.x+=sx;s.z+=sz;return;}
  }
  // Axis fallback allows retreat along either side of a tight corner.
  for(const [dx,dz] of [[ax,0],[0,az]])if(this.clear(s.x+dx,s.y,s.z+dz)||this.canEscape(s.x+dx,s.y,s.z+dz)){s.x+=dx;s.z+=dz;}
 }
 floor(x,z,ceiling=Infinity){let result=this.pieces.length?null:0;for(const {b} of this.nearby(x,z))if(b.y1<=ceiling+.01&&intersectsXZ(b,x,z,.27*scaleOf(this.state))&&(result===null||b.y1>result))result=b.y1;for(const actor of this.actors||[]){const top=actorTop(actor);if(actor!==this.state&&top<=ceiling+.01&&Math.hypot(actor.x-x,actor.z-z)<radiusOf(this.state)+radiusOf(actor)&&(result===null||top>result))result=top;}return result;}
 spawn(){Object.assign(this.state,{building:false,buildTime:0,buildBlend:0,gaitSpeed:0,moveBlend:0,runBlend:0});const ground=this.pieces.filter(p=>p.y===0);for(const p of ground){const b=bounds(p);for(const fx of [.5,.25,.75])for(const fz of [.5,.25,.75]){const x=b.x0+(b.x1-b.x0)*fx,z=b.z0+(b.z1-b.z0)*fz,y=this.floor(x,z,1);if(y!==null&&this.clear(x,y,z)){Object.assign(this.state,{x,y,z,vy:0,grounded:true,speed:0,airTime:0,landing:0,jumpBuffer:0,coyote:0,attack:0});this.spawnPoint={x,y,z};return this.state;}}}if(!ground.length){Object.assign(this.state,{x:0,y:0,z:0,vy:0,grounded:true,airTime:0,landing:0,jumpBuffer:0,coyote:0,attack:0});this.spawnPoint={x:0,y:0,z:0};return this.state;}const b=bounds(ground[0]),pos=containPoint(this.area,(b.x0+b.x1)/2,(b.z0+b.z1)/2,characterMargin*scaleOf(this.state)),x=pos.x,z=pos.z,y=this.floor(x,z)||.4;Object.assign(this.state,{x,y,z,vy:0,grounded:true,airTime:0,landing:0,jumpBuffer:0,coyote:0,attack:0});this.spawnPoint={x,y,z};return this.state;}
 step(input,dt,yaw){dt=Math.max(0,Math.min(.06,dt));if(this.state.rigContact)this.state.rigContact.clock=(this.state.rigContact.clock||0)+dt;this.repairPosition();const s=this.state;s.landing=Math.max(0,(s.landing||0)-dt);s.coyote=s.grounded?.10:Math.max(0,(s.coyote||0)-dt);s.jumpBuffer=input.jump?.12:Math.max(0,(s.jumpBuffer||0)-dt);let mx=input.x||0,mz=input.z||0;const l=Math.hypot(mx,mz);if(l>1){mx/=l;mz/=l;}const right=[Math.cos(yaw),-Math.sin(yaw)],forward=[-Math.sin(yaw),-Math.cos(yaw)];const dx=right[0]*mx+forward[0]*mz,dz=right[1]*mx+forward[1]*mz;
 const weapon=s.attack>0&&typeof GameWeapons!=='undefined'?GameWeapons.get(s.attackWeapon):null,progress=weapon?1-s.attack/(s.attackDuration||weapon.duration):0,moveScale=weapon?.inertia?1-weapon.inertia*Math.sin(Math.PI*progress):1;
 s.running=!!input.run;const travel=input.flight?(input.flightSpeed||16):(s.running?7.8:4)*(input.speedScale||1);s.speed=Math.hypot(dx,dz)*travel*moveScale;if(s.speed>.01){const heading=Math.atan2(dx,dz);if(weapon?.inertia){const delta=Math.atan2(Math.sin(heading-s.heading),Math.cos(heading-s.heading)),limit=(10-weapon.mass)*dt;s.heading+=Math.max(-limit,Math.min(limit,delta));}else s.heading=heading;}if(s.jumpBuffer>0&&(s.grounded||s.coyote>0)){s.vy=input.jumpSpeed||9.5;s.grounded=false;s.airTime=0;s.landing=0;s.jumpBuffer=s.coyote=0;}const powered=input.flight||input.climbing;if(powered){s.vy=(input.vertical||0)*(input.flight?(input.flightSpeed||16):7);s.grounded=false;s.jumpBuffer=s.coyote=0;}const n=Math.max(1,Math.ceil(dt/.008),Math.ceil(Math.max(s.speed,Math.abs(s.vy))*dt/.09)),h=dt/n;
 for(let i=0;i<n;i++){
  this.separate(h);if(dx||dz)this.move(dx*travel*moveScale*h,dz*travel*moveScale*h);
  const old=s.y;if(!powered)s.vy-=22*h;let y=Math.min(320,s.y+s.vy*h);if(y===320&&s.vy>0)s.vy=0;
  if(s.vy>0){if(s.rigContact){for(const a of RigCollision.core(s.rigContact,{...s,y}))for(const {b} of RigCollision.nearby(s.rigContact,a)){if(a.max[1]-(y-old)<=b.y0+.02&&RigCollision.contact(a,RigCollision.brick(b))){y-=Math.max(0,a.max[1]-b.y0)+.005;s.vy=0;}}}else for(const {b} of this.nearby(s.x,s.z))if(intersectsXZ(b,s.x,s.z,.4*scaleOf(s))&&b.y0>=old+4.02*scaleOf(s)-.02&&b.y0<y+4.02*scaleOf(s)){y=b.y0-4.02*scaleOf(s)-.01;s.vy=0;}for(const actor of this.actors||[])if(actor!==s&&Math.hypot(actor.x-s.x,actor.z-s.z)<radiusOf(s)+radiusOf(actor)&&actor.y>=old+bodyHeight(s)-.02&&actor.y<y+bodyHeight(s)){y=actor.y-bodyHeight(s)-.01;s.vy=0;}}
  if(s.vy<=0){const f=this.floor(s.x,s.z,old+.05);if(f!==null&&y<=f){if(!s.grounded&&s.vy<-2){s.landing=.24;s.airTime=0;}y=f;s.vy=0;s.grounded=true;if(s.jumpBuffer>0){s.vy=input.jumpSpeed||9.5;s.grounded=false;s.landing=0;s.airTime=0;s.jumpBuffer=s.coyote=0;}}else s.grounded=false;}s.y=y;if(!s.grounded)s.airTime=(s.airTime||0)+h;
 }
 if(s.y<-15){this.spawn();return s;}s.buildBlend=Math.max(0,Math.min(1,(s.buildBlend||0)+(s.building?dt*3.5:-dt*3.5)));if(s.buildBlend>0)s.buildTime=(s.buildTime||0)+dt;else s.buildTime=0;
 const blend=1-Math.exp(-dt*12);s.gaitSpeed=(s.gaitSpeed||0)+(s.speed-(s.gaitSpeed||0))*blend;s.moveBlend=(s.moveBlend||0)+((s.speed>.01?1:0)-(s.moveBlend||0))*blend;s.runBlend=(s.runBlend||0)+((s.running&&s.speed>.01?1:0)-(s.runBlend||0))*blend;
 s.phase+=Math.min(12,s.gaitSpeed)*dt*1.85;s.attack=Math.max(0,s.attack-dt);return s;
 }
 target(reach=2.8){const s=this.state;reach*=scaleOf(s);let best=null,score=Infinity;const forward=[Math.sin(s.heading),Math.cos(s.heading)];for(const p of this.pieces){if(p.y===0)continue;const b=bounds(p);if(b.y0>s.y+bodyHeight(s)||b.y1<s.y-.5)continue;const cx=Math.max(b.x0,Math.min(s.x,b.x1)),cz=Math.max(b.z0,Math.min(s.z,b.z1)),dx=cx-s.x,dz=cz-s.z,dist=Math.hypot(dx,dz);if(dist>reach)continue;const facing=dist>.05?(dx*forward[0]+dz*forward[1])/dist:1;if(facing<-.25)continue;const rank=dist-facing*.5;if(rank<score){score=rank;best=p;}}return best;}
}
function cameraDistance(origin,eye,pieces){const d=eye.map((v,i)=>v-origin[i]);let nearest=1;for(const p of pieces){const b=bounds(p),mins=[b.x0,b.y0,b.z0],maxs=[b.x1,b.y1,b.z1];let lo=0,hi=1;for(let i=0;i<3;i++){if(Math.abs(d[i])<1e-8){if(origin[i]<mins[i]||origin[i]>maxs[i]){lo=2;break;}continue;}let a=(mins[i]-origin[i])/d[i],c=(maxs[i]-origin[i])/d[i];if(a>c)[a,c]=[c,a];lo=Math.max(lo,a);hi=Math.min(hi,c);if(lo>hi)break;}if(lo>0.04&&lo<=hi&&lo<nearest)nearest=Math.max(.12,lo-.035);}return nearest;}
return {Controller,bounds,worldBounds,containPoint,characterMargin,characterRadius,characterHeight,scaleOf,radiusOf,bodyHeight,intersectsXZ,overlapsPlayer,rebuildTraps,rebuildSpot,findRebuildSpot,cameraDistance,debrisBottom,debrisRadius,confineDebris,looseFloor,stepDebrisPiece};
})();
