const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
let source=fs.readFileSync(path.join(__dirname,'maps.cjs'),'utf8').split('const b=ctx.boot(),el=')[0];
source=source.replace('mapPlacing,controller}','mapPlacing,controller,pieces,npcs,broken,world,skyStartClock,mapTouchState}').replace('move:p=>Object.assign','touch:stepMapTeleports,move:p=>Object.assign');
const context={require,__dirname,console,AbortController,Blob,URL,setTimeout};vm.runInNewContext(source+';globalThis.boot=ctx.boot;',context);const boot=context.boot;
const ground=[[-8,-8],[0,-8],[-8,0],[0,0]].map(([x,z],i)=>({id:i+1,x,z,y:0,rows:8,cols:8,kind:'plate',turn:0,color:3}));
const points=[{id:1,name:'Point A',x:-4,y:.4,z:0,heading:0},{id:2,name:'Point B',x:4,y:.4,z:0,heading:Math.PI}];
function fixture(links=[],count=1){const build={pieces:ground,world:null,environment:{time:'day',rain:false,snow:false,snowing:false},player:{...points[0]},broken:[],npcs:[]};return {format:'brick-builder',version:4,...build,maps:{activeId:1,nextId:count+1,maps:Array.from({length:count},(_,i)=>({id:i+1,name:'Map '+(i+1),spawns:points,build:i?build:null})),links}};}
const link=(id,fromMap,fromPoint,toMap,toPoint,twoWay=true)=>({id,from:{mapId:fromMap,spawnId:fromPoint},to:{mapId:toMap,spawnId:toPoint},twoWay});
function setup(project){const b=boot(JSON.stringify(project)),read=()=>JSON.parse(JSON.stringify(b.read())),manage=v=>b.tools.get('manage_lego_maps').execute(v),el=id=>b.elements['#'+id],wait=(seconds=2)=>{for(let i=0;i<Math.ceil(seconds/.025);i++)b.qa.tick(.025);},point=id=>read().maps.maps.find(m=>m.id===read().maps.activeId).spawns.find(p=>p.id===id),move=p=>b.qa.move({...p,vy:0,grounded:true,speed:0}),approach=id=>{const p=point(id);move({...p,z:p.z+3});b.qa.tick(.025);move({...p,z:p.z+2.2});b.qa.tick(.025);},touch=(id,route)=>{approach(id);if(route){el('bb-map-route').value=String(route);b.fire('bb-map-route','change');}move(point(id));b.qa.tick(.025);};return {b,read,manage,el,wait,point,move,approach,touch,play:()=>b.tools.get('explore_lego_world').execute({playing:true})};}

// Same-map links can be authored from the ordinary workshop and round-trip saves.
const local=setup(fixture());assert.equal(local.el('bb-link-map').value,'1');assert.equal(local.el('bb-link-spawn').children.length,1);assert.equal(local.el('bb-link-spawn').value,'2');assert(!local.el('bb-link-create').disabled);
const localLink=local.manage({action:'connect',mapId:1,spawnId:2}).result;assert.throws(()=>local.manage({action:'connect',mapId:1,spawnId:1}),/different spawn/);
local.play();local.wait();const before=local.b.qa.get();local.touch(1);assert.equal(local.read().maps.activeId,1);assert(Math.abs(local.read().player.x-4)<.001,'Point A touch moves player to Point B in the same map');
const after=local.b.qa.get();for(const key of ['pieces','controller','npcs','broken','world','skyStartClock'])assert.strictEqual(after[key],before[key],key+' is preserved by local teleport');
local.wait(8);assert(Math.abs(local.read().player.x-4)<.001,'standing at arrival never bounces back, even after cooldown');local.touch(2);assert(Math.abs(local.read().player.x+4)<.001,'exit and reenter Point B returns to Point A');
const saved=JSON.stringify(local.read()),reloaded=setup(JSON.parse(saved));assert.equal(reloaded.read().maps.links[0].id,localLink);reloaded.play();reloaded.wait();reloaded.touch(1);assert(Math.abs(reloaded.read().player.x-4)<.001,'saved local links still teleport');

// Touch-only traversal through a branching two-way chain, including route choice.
const chain=setup(fixture([link(1,1,1,2,1),link(2,2,1,3,1)],3));chain.play();chain.wait();chain.touch(1);assert.equal(chain.read().maps.activeId,2);chain.wait(5);assert.equal(chain.read().maps.activeId,2,'arrival at branching gate waits until player leaves');chain.touch(1,2);assert.equal(chain.read().maps.activeId,3,'selected branch travels to Map 3 without G or clicking Travel');chain.wait();chain.touch(1);assert.equal(chain.read().maps.activeId,2);chain.wait();chain.touch(1,1);assert.equal(chain.read().maps.activeId,1);

// A directed loop may combine one-way and two-way links and different local points.
const cycle=setup(fixture([link(1,1,1,2,1,false),link(2,2,1,4,1),link(3,4,2,1,2,false)],4));cycle.play();cycle.wait();cycle.touch(1);assert.equal(cycle.read().maps.activeId,2);cycle.wait();assert.equal(cycle.el('bb-map-route').children.length,1,'arrival end of one-way link offers no reverse route');cycle.touch(1);assert.equal(cycle.read().maps.activeId,4);cycle.move(cycle.point(2));cycle.b.qa.tick(.025);assert.equal(cycle.read().maps.activeId,1,'moving straight from an arrival to another distinct gate still activates that gate');assert(Math.abs(cycle.read().player.x-4)<.001);cycle.wait();cycle.touch(2);assert.equal(cycle.read().maps.activeId,1,'one-way arrival cannot teleport backwards');

// A fast sweep can cross the whole gate between frames; altitude remains respected.
const fast=setup(fixture([link(1,1,1,2,2)],2));fast.play();fast.wait();fast.move({...fast.point(1),z:3});fast.b.qa.touch();fast.move({...fast.point(1),z:-3});assert(fast.b.qa.touch());assert.equal(fast.read().maps.activeId,2,'swept contact catches a fast pass, even with both endpoints outside the ring');
fast.wait();const p=fast.point(2);fast.move({...p,z:3,y:12,grounded:false});fast.b.qa.touch();fast.move({...p,z:-3,y:12,grounded:false});fast.b.qa.touch();assert.equal(fast.read().maps.activeId,2,'flying above a gate does not trigger it');

// Help, project dialogs and studio previews cannot trigger travel.
const paused=setup(fixture([link(1,1,1,2,1)],2));paused.play();paused.wait();paused.approach(1);paused.b.fire('bb-help-open');paused.move(paused.point(1));paused.b.qa.tick(.025);assert.equal(paused.read().maps.activeId,1);paused.b.fire('bb-help-close');paused.approach(1);paused.b.fire('bb-save');paused.move(paused.point(1));paused.b.qa.touch();assert.equal(paused.read().maps.activeId,1);paused.b.fire('bb-dialog-close');paused.b.fire('bb-edit-character');paused.b.qa.touch();assert.equal(paused.read().maps.activeId,1);

// Movement through the public character controller uses the same touch transition.
const controlled=fixture([link(1,1,1,2,1)],2);controlled.player={...points[0],z:3};const api=setup(controlled);api.play();api.wait();api.b.tools.get('control_lego_character').execute({forward:-1,seconds:1});assert.equal(api.read().maps.activeId,2);

// Identical-endpoint links remain invalid and imports are atomic.
const invalid=local.read();invalid.maps.links[0].to={...invalid.maps.links[0].from};const old=JSON.stringify(local.read());local.b.fire('bb-open');local.el('bb-data').value=JSON.stringify(invalid);local.b.fire('bb-load-code');assert(local.el('bb-dialog-message').textContent.includes('Invalid map connection'));assert.equal(JSON.stringify(local.read()),old);
console.log('PASS: touch teleports, same-map points and state preservation, no arrival bounce, selected two-way chain, directed cycle, no reverse one-way travel, swept fast contact, flight altitude, paused UI, character control and save/load validation.');
