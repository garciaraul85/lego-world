const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ctx={Float32Array};for(const [file,name] of [['game-physics.js','GamePhysics'],['character-model.js','CharacterModel']])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../src/legacy',file),'utf8')+'\nglobalThis.'+name+'='+name+';',ctx);
const P=ctx.GamePhysics,M=ctx.CharacterModel,ground={id:1,x:-4,z:-4,y:0,rows:8,cols:8,turn:0,kind:'plate',color:3};
const ctl=new P.Controller([ground]);ctl.step({jump:true},.025,0);assert(!ctl.state.grounded&&ctl.state.vy>8,'jump responds on its first frame');
const samples=[];for(let i=0;i<80;i++){ctl.step({},.016,0);samples.push({...ctl.state});}
const rise=samples.find(s=>s.vy>4&&s.airTime>.12),apex=samples.reduce((a,b)=>Math.abs(a.vy)<Math.abs(b.vy)&&!a.grounded?a:b),fall=samples.find(s=>s.vy<-6),land=samples.find(s=>s.landing>.1&&s.grounded);
assert(rise&&fall&&land,'jump has ascent, descent and landing phases');assert(samples.some(s=>s.y>2),'jump retains its useful height');
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,[4,5,6].reduce((v,i)=>v+a[i]*b[i],0))));
const rp=M.jointPose(rise),fp=M.jointPose(fall),lp=M.jointPose({...land,landing:.12}),idle=M.jointPose({...land,landing:0});
assert(angle(rp.leftArm,fp.leftArm)>.25,'arms change from reaching upward to balancing on descent');
assert(angle(lp.leftShin,lp.leftLeg)>.7,'knees absorb the landing');assert(lp.root[13]<idle.root[13]-.15,'landing lowers the torso instead of sliding feet through the floor');
assert(ctl.state.grounded&&ctl.state.landing===0,'landing recovers to standing');
const edge=new P.Controller([ground,{...ground,id:2,x:0,z:-1,y:1,rows:2,cols:2,kind:'brick'}]);Object.assign(edge.state,{x:2.2,y:1.6,z:0});edge.step({x:1},.05,0);assert(!edge.state.grounded);edge.step({jump:true},.025,0);assert(edge.state.vy>8,'brief ledge grace preserves a late jump inside the map');
const buffer=new P.Controller([ground]);Object.assign(buffer.state,{y:.48,grounded:false,vy:-3,airTime:.6,coyote:0});buffer.step({jump:true},.05,0);assert(!buffer.state.grounded&&buffer.state.vy>8,'a jump just before touching down launches on contact');buffer.step({jump:true},.05,0);assert(buffer.state.vy<8.6,'pressing again in midair does not reset upward velocity');
let previous;for(let i=0;i<=104;i++){
 const pose=M.jointPose({grounded:true,attack:.52*(1-i/104)});
 for(const [name,matrix] of Object.entries(pose)){
  assert(Array.from(matrix).every(Number.isFinite));
  if(previous)assert(Math.max(...Array.from(matrix).map((v,k)=>Math.abs(v-previous[name][k])))<.35,name+' transitions remain continuous');
  for(const a of [0,4,8])for(const b of [0,4,8])assert(Math.abs([0,1,2].reduce((v,k)=>v+matrix[a+k]*matrix[b+k],0)-(a===b?1:0))<.0001,name+' keeps a rigid rotation without deformation');
 }
 previous=pose;
}
const point=(m,p)=>[0,1,2].map(r=>m[r]*p[0]+m[r+4]*p[1]+m[r+8]*p[2]+m[r+12]);
for(const held of ['Hammer','Sword','Wand'])for(const attack of [.52,.406,.338,.26,.08]){const state={attack},pose=M.jointPose(state),wrist=M.heldPose(pose,state,{held}),grip=[1.10,1.94,.34].map((v,k)=>v-M.pivots.rightForearm[k]);assert(point(wrist,grip).every((v,k)=>Math.abs(v-point(pose.rightForearm,grip)[k])<1e-5),'swinging a held tool keeps its grip attached to the hand');}
const wind=M.jointPose({attack:.406}),contact=M.jointPose({attack:.338}),gripLocal=[.02,-.61,.315];
assert(point(contact.rightForearm,gripLocal)[2]>point(wind.rightForearm,gripLocal)[2]+.25,'the punch moves forward from the drawn-back position');
const yaw=m=>Math.atan2(m[8],m[0]);
assert(yaw(contact.hips)-yaw(wind.hips)<-.25,'the pelvis drives the punch forward');
assert(yaw(contact.root)-yaw(wind.root)<-.55,'the punching shoulder rotates forward with the torso');
assert(Math.abs(yaw(contact.root)-yaw(contact.hips))>.15,'the torso turns independently of the pelvis');
assert(Math.abs(yaw(contact.head))<.15,'the head keeps looking along the aim direction while the torso turns');
const lead=M.jointPose({attack:.52*(1-.30)});assert(Math.abs(yaw(lead.hips))>Math.abs(yaw(lead.root)-yaw(lead.hips)),'hip turn leads the chest during acceleration');
assert(angle(wind.root,contact.root)<.15,'forward lean remains balanced during rotation');
// Knuckles travel forward in one plane; the palm is no longer presented sideways.
assert(-contact.rightForearm[6]>.90,'knuckle face points along the strike');
const fistXs=[];for(let t=.22;t<=.35;t+=.005){const pose=M.jointPose({attack:.52*(1-t)});fistXs.push(point(pose.rightForearm,[.02,-.61,.06])[0]);}
assert(Math.max(...fistXs)-Math.min(...fistXs)<.08,'the fist stays on a narrow forward path despite torso rotation');
const strikeA=M.jointPose({attack:.52*(1-.22)}),strikeB=M.jointPose({attack:.52*(1-.35)});
for(const local of [[0,-.50,-.36],[0,-.50,.55]])assert(point(strikeA.leftFoot,local).every((v,k)=>Math.abs(v-point(strikeB.leftFoot,local)[k])<.0001),'the lead foot is planted throughout extension');
assert(point(strikeB.rightFoot,[0,-.50,-.36])[1]>.15,'the rear heel lifts to drive the hip turn');
assert(point(strikeA.rightFoot,[0,-.50,.55]).every((v,k)=>Math.abs(v-point(strikeB.rightFoot,[0,-.50,.55])[k])<.0001),'rear foot pivots around a planted toe');
for(const heading of [0,.7,2.1,-1.3]){
 const hits=[];for(let t=.22;t<=.35;t+=.005){const pose=M.jointPose({heading,attack:.52*(1-t)}),p=point(pose.rightForearm,[.02,-.61,.06]);hits.push([p[0]*Math.cos(heading)-p[2]*Math.sin(heading),p[0]*Math.sin(heading)+p[2]*Math.cos(heading)]);}
 assert(Math.max(...hits.map(p=>p[0]))-Math.min(...hits.map(p=>p[0]))<.08,'punch follows the aim direction at every heading');
 assert(hits.every((p,i)=>i===0||p[1]>=hits[i-1][1]-.001),'extension travels forward without an outward swing or reversal');
}
let modelMatrix,draws=[];const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:(_,n)=>n,getAttribLocation:(_,n)=>({aPosition:0,aNormal:1,aUV:2}[n]),createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),createTexture:()=>({}),uniformMatrix4fv:(n,_,m)=>{if(n==='uModel')modelMatrix=Array.from(m);},drawArrays:(_,start,count)=>draws.push({matrix:modelMatrix,count})},{get:(o,k)=>k in o?o[k]:k.toUpperCase()===k?1:()=>{}});
const catalog={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../src/legacy/character-catalog.js'),'utf8')+';globalThis.C=CharacterCatalog;',catalog);
const renderer=M.create(gl,'void main(){vec3 base=mix(vColor,vec3(1.),0.);}',()=>{}),profile=catalog.C.validate({...catalog.C.defaults,held:'None'});
function handDraws(state,preview=false){draws=[];renderer.draw(profile,state,preview);const arm=Array.from(M.jointPose(state,preview).rightForearm);return draws.filter(d=>d.matrix.every((v,k)=>Math.abs(v-arm[k])<1e-5)).map(d=>d.count).sort((a,b)=>a-b);}
const open=handDraws({}),closed=handDraws({attack:.338});assert.notDeepEqual(open,closed,'unarmed contact renders a closed fist rather than the open grip');assert.deepEqual(handDraws({attack:.338},true),handDraws({},true),'editing preserves the normal hand regardless of attack state');
for(let i=0;i<104;i++){
 const attack=.52*(1-i/104),pose=M.jointPose({attack}),weapon=M.heldPose(pose,{attack},{held:'Sword'});
 for(let y=1.79;y<=3.42;y+=.06){
  const pt=point(weapon,[.02,y-2.55,.315]),delta=pt.map((v,k)=>v-pose.root[12+k]),localX=delta.reduce((v,x,k)=>v+x*pose.root[k],0);
  assert(localX>.75,'the complete weapon arc stays outside the head and torso');
 }
}

const bootSource=fs.readFileSync(path.join(__dirname,'characters.cjs'),'utf8').split('const b=boot(),call=')[0];const bootCtx={require,__dirname,console,AbortController,Blob,URL,setTimeout};vm.runInNewContext(bootSource+'\nglobalThis.boot=boot;',bootCtx);const b=bootCtx.boot(),call=(n,v)=>b.tools.get(n).execute(v);
const tower=[1,4,7].map((y,i)=>({id:i+2,x:-1,z:-3,y,rows:2,cols:2,turn:0,kind:'brick',color:8,group:'target'}));
function load(){b.fire('bb-open');b.elements['#bb-data'].value=JSON.stringify({format:'brick-builder',version:4,pieces:[ground,...tower]});b.fire('bb-load-code');assert.equal(b.elements['#bb-dialog-message'].textContent,'');call('explore_lego_world',{playing:true});}
load();b.fire('bb-smash');assert.equal(b.read().pieces.length,4,'a button hit starts the windup without breaking early');call('control_lego_character',{seconds:.12});assert.equal(b.read().pieces.length,4);call('control_lego_character',{seconds:.08});assert.equal(b.read().pieces.length,1,'the impact breaks the target when the arm reaches contact');assert(b.read().player.attack>0,'follow-through continues after destruction');call('control_lego_character',{seconds:.4});assert.equal(b.read().player.attack,0);
load();b.fire('bb-smash');call('explore_lego_world',{playing:false});call('explore_lego_world',{playing:true});call('control_lego_character',{seconds:.6});assert.equal(b.read().pieces.length,4,'leaving exploration cancels a queued hit');
load();b.fire('bb-smash');b.fire('bb-respawn');call('control_lego_character',{seconds:.6});assert.equal(b.read().pieces.length,4,'respawn cancels an old queued impact');
console.log('PASS: responsive jump, rise/fall poses, planted landing crouch and recovery, edge grace, buffered landing jump, no midair extra jump, smooth full-body strikes, destruction at contact, follow-through and cancellation on exit/respawn.');
