const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const ctx={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../game-physics.js'),'utf8')+';globalThis.P=GamePhysics;',ctx);const P=ctx.P;
const ground={id:1,x:-6,z:-6,y:0,rows:12,cols:12,turn:0,kind:'plate'},wall=(x,z,cols,rows,id=2)=>({id,x,z,y:1,rows,cols,turn:0,kind:'brick'});
function scene(parts,state){const c=new P.Controller([ground,...parts]);Object.assign(c.state,{x:0,z:0,y:.4,vy:0,grounded:true},state);return c;}
function walk(c,input,seconds){for(let t=0;t<seconds;t+=.025){const before={...c.state};c.step(input,.025,0);assert(Math.hypot(c.state.x-before.x,c.state.z-before.z)<.25,'movement and separation stay continuous');}}
// Scenery contact must stay close, even when live character collisions are enabled.
for(const [start,input,edge] of [
 [{x:-2,z:1},{x:1},s=>-s.x],
 [{x:4,z:1},{x:-1},s=>s.x-2],
 [{x:1,z:-2},{z:-1},s=>-s.z],
 [{x:1,z:4},{z:1},s=>s.z-2]
])for(const role of ['player','NPC']){
 const c=scene([wall(0,0,2,2)],start);
 c.setActors([c.state,{x:-3,z:-3,y:.4}]);
 walk(c,{...input,run:role==='player'},1);
 const gap=edge(c.state);
 assert(gap>=.39999&&gap<.46,role+' can reach the original brick contact distance');
 assert(c.clear(c.state.x,c.state.y,c.state.z),role+' stays outside the solid brick');
}
const narrow=scene([wall(-2,-3,2,6),wall(.6,-3,2,6,3)],{x:.3});
walk(narrow,{z:-1,run:true},.65);assert(narrow.state.z>3.5&&narrow.clear(narrow.state.x,narrow.state.y,narrow.state.z),'a character already wedged in an undersized gap can walk out of its open end');
const retreat=scene([wall(-2,-3,2,6),wall(.6,-3,2,6,3)],{x:.3});walk(retreat,{z:1},1);assert(retreat.state.z<-3.4,'retreat works in the opposite direction too');
const overlap=scene([wall(0,-2,2,4)],{x:-.37});walk(overlap,{},.1);assert(overlap.state.x<-.4&&overlap.clear(overlap.state.x,.4,0),'a small overlap separates smoothly while idle');
walk(overlap,{x:1,run:true},.5);assert(overlap.state.x<=-.39999,'recovery does not permit walking through a wall');
const corner=scene([wall(0,0,2,3)],{x:-.6,z:-.2});walk(corner,{x:1,z:1},.8);assert(corner.state.z<-1.2,'diagonal movement slides around a rounded corner rather than catching');assert(corner.clear(corner.state.x,.4,corner.state.z));
const corridor=scene([wall(-2,-4,2,8),wall(.85,-4,2,8,3)],{x:.425,z:-3});walk(corridor,{z:-1,run:true},.7);assert(corridor.state.z>2,'a valid narrow corridor stays traversable');
const landing=scene([wall(0,-2,2,4)],{x:-.39,y:2.2,vy:-2,grounded:false});walk(landing,{},.7);assert(landing.state.grounded&&landing.clear(landing.state.x,landing.state.y,landing.state.z),'landing beside a creation cannot leave the character caught in its side');
const room=[wall(-2,-2,1,4),wall(1,-2,1,4,3),wall(-2,1,4,1,4)],door=[wall(-2,-2,4,1,5)],builder=scene(room,{x:0,z:0});
assert(P.rebuildTraps(builder,door,0,0,.4),'restoring a closed wall identifies a newly sealed pocket');assert(!P.rebuildSpot(builder,door,0,0),'a marker is not offered inside the pocket');
builder.setActors([builder.state,{x:0,y:.4,z:0}]);assert(P.rebuildTraps(builder,door,0,0,.4),'temporary NPC crowding cannot hide a permanent rebuild enclosure');builder.setActors([]);
const spot=P.findRebuildSpot(builder,door);assert(spot&&!P.rebuildTraps(builder,door,spot.x,spot.z,spot.y),'the suggested marker leaves an escape route after restoration');
const openDoor=[wall(-2,-2,1,1,5),wall(1,-2,1,1,6)];assert(!P.rebuildTraps(builder,openDoor,0,0,.4),'a usable doorway remains valid');
console.log('PASS: narrow-gap escape, corner sliding, continuous overlap recovery, solid walls, running corridors, safe landings, and rebuild enclosure prevention.');
