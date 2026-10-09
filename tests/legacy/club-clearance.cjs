const weaponName=process.argv[2]||'Club';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),cp=require('child_process');
function boot(previous=false){const seen=[],ctx={Float32Array,onMesh:(mesh,rig)=>seen.push({mesh,rig})};for(const [file,name]of [['game-weapons.js','GameWeapons'],['character-catalog.js','CharacterCatalog'],['character-model.js','CharacterModel']]){let source=fs.readFileSync(path.join(__dirname,'../../src/legacy',file),'utf8');source=source.replace('function renderMesh(g,m,c,override=null){','function renderMesh(g,m,c,override=null){globalThis.onMesh(g,m);');vm.runInNewContext(source+';globalThis.'+name+'='+name,ctx);}return {...ctx,seen};}
const ctx=boot(),M=ctx.CharacterModel,W=ctx.GameWeapons,C=ctx.CharacterCatalog;
const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,createBuffer:()=>({}),getAttribLocation:(_,s)=>s,getUniformLocation:(_,s)=>s},{get:(o,k)=>k in o?o[k]:k.toUpperCase()===k?1:()=>{}}),renderer=M.create(gl,'void main(){vec3 base=mix(vColor,vec3(0),0.0);}');
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]),local=(m,p)=>[0,1,2].map(k=>[0,1,2].reduce((sum,j)=>sum+m[k*4+j]*(p[j]-m[12+j]),0));
const configs=[{},{gender:'Female',breastSize:100},{outfit:'Armor'},{cape:'Poncho'},{gender:'Female',breastSize:100,outfit:'Armor',cape:'Poncho'},{gender:'Female',outfit:'Dress',dress:'Ball gown'}];let count=0;
for(const config of configs){const p=C.validate({...C.defaults,...config,held:weaponName}),w=W.get(weaponName);ctx.seen.length=0;renderer.draw(p,{grounded:true});const meshes=ctx.seen.filter(({mesh})=>mesh.slot==='held').map(({mesh})=>mesh.surface.vertices);
 for(const action of ['swing','hit','run','jump','run-swing','jump-swing','stow','studio']){let previous;
  for(let i=0;i<=120;i++){const t=i/120,neutral=action==='studio',state={x:5,y:3,z:-7,heading:.8,grounded:!action.startsWith('jump'),phase:t*Math.PI*2,moveBlend:action.startsWith('run')?1:0,runBlend:1,airTime:.3,vy:4,attack:['swing','hit','run-swing','jump-swing'].includes(action)?w.duration*(1-t):0,attackDuration:w.duration,...(action==='hit'?{attackImpact:w.contact/w.duration}:{}),buildBlend:action==='stow'?t:0,building:action==='stow',buildTime:.3},pose=M.jointPose(state,neutral,p),held=M.heldPose(pose,state,p,neutral);
   const hand=point(pose.rightForearm,[-.03,-.61,.06]),grip=point(held,[.02,-.61,.315]);if(action!=='stow'||t<.35)assert(Math.hypot(...hand.map((v,k)=>v-grip[k]))<.00001,weaponName+' stays in the hand '+action+' '+t+' '+JSON.stringify(config)+' '+Math.hypot(...hand.map((v,k)=>v-grip[k])));
   for(const [name,m]of Object.entries({...pose,held})){assert(Array.from(m).every(Number.isFinite));if(previous)assert(Math.max(...m.map((v,k)=>Math.abs(v-previous[name][k])))<.20,weaponName+' smooth '+action+' '+name+' '+t);}previous={...pose,held};
   for(const [child,parent]of Object.entries(M.parents)){const offset=M.pivots[child].map((v,k)=>v-M.pivots[parent][k]);assert(Math.hypot(...point(pose[parent],offset).map((v,k)=>v-pose[child][12+k]))<.00001,weaponName+' keeps joint attached '+action+' '+child+' '+t);}
   for(const verts of meshes)for(let j=0;j<verts.length;j+=3){const a=local(pose.root,point(held,verts.slice(j,j+3))),y=a[1],female=p.gender==='Female',width=p.outfit==='Armor'?.90:(female?.76:.80)-(y-1.92)/1.24*(female?.05:.09),front=(p.cape==='Poncho'?.54:p.outfit==='Armor'?.48:.44)+(female?p.breastSize/100*.32:0)*Math.exp(-1.6*(((Math.abs(a[0])-.34)/.35)**2+((y-2.72)/.35)**2)),torso=Math.min(width-Math.abs(a[0]),y-1.92,3.16-y,front-a[2],a[2]+.54),head=Math.min(.61-Math.abs(a[0]),y-3.23,4.39-y,.61-Math.abs(a[2]));assert(torso<.003&&head<.003,weaponName+' actual geometry overlaps body: '+JSON.stringify(config)+' '+action+' '+t);count++;}
  }
 }
}
// A club must accelerate through contact, follow downward across the front,
// and return to its guard without changing the gripping hand's attachment.
const club=W.get(weaponName),strike=club.contact/club.duration,profile=C.validate({...C.defaults,held:weaponName});
const tip=t=>{const state={grounded:true,attack:club.duration*(1-t),attackDuration:club.duration},pose=M.jointPose(state,false,profile);return point(M.heldPose(pose,state,profile),[.02,-.61+club.tip,.315]);};
const windup=tip(.20),impact=tip(strike),follow=tip(.53);
assert(impact[2]>windup[2]+.8,'Club travels from shoulder windup toward the target');
if(club.overhead){const high=tip(.25),hand=t=>{const p=M.jointPose({grounded:true,attack:club.duration*(1-t),attackDuration:club.duration},false,profile);return local(p.root,point(p.rightForearm,[-.03,-.61,.06]));};assert(hand(.25)[1]>hand(0)[1]+1.0,'Hand rises high before an overhead strike');assert(high[1]>impact[1]+1.2&&follow[1]<impact[1]-.5,'Weighted head strikes downward');assert(Math.abs(follow[0]-impact[0])<.50,'Overhead follow-through stays in its vertical plane');}else if(club.fullBodyRig){assert(impact[0]<windup[0]-1.0,'Club crosses the target with the torso and hand');assert(follow[1]<impact[1]-.7,'Club follows downward after crossing the target');}else assert(follow[1]<impact[1]-.5&&follow[0]<impact[0]-.25,'Club follows diagonally down and across');
const before=W.motion(club,strike-.001),at=W.motion(club,strike),after=W.motion(club,strike+.001);
assert(after[4]>at[4]&&at[4]>before[4],'Club keeps turning through contact');
assert(Math.abs((after[4]-at[4])-(at[4]-before[4]))<.001,'Contact has continuous angular velocity');
assert.deepEqual(Array.from(W.motion(club,0)),Array.from(W.motion(club,1)),'Club returns to its guard');
if(weaponName==='Mace'){
 const direction=t=>{const s={grounded:true,attack:club.duration*(1-t),attackDuration:club.duration},pose=M.jointPose(s,false,profile),held=M.heldPose(pose,s,profile);return Array.from(held.slice(4,7));};
 assert(direction(.25)[1]>.9,'Mace points upward when raised');
 assert(direction(strike)[1]<-.55,'Mace points down at contact rather than sweeping horizontally');
 assert(direction(.63)[1]<-.90,'Mace follows through almost vertically downward');
 for(let i=0;i<=120;i++){const t=i/120,s={grounded:true,attack:club.duration*(1-t),attackDuration:club.duration},pose=M.jointPose(s,false,profile),held=M.heldPose(pose,s,profile);ctx.seen.length=0;renderer.draw(profile,s);for(const {mesh,rig}of ctx.seen.filter(({mesh})=>mesh.slot==='held'))for(let j=0;j<mesh.surface.vertices.length;j+=3)assert(point(rig,mesh.surface.vertices.slice(j,j+3))[1]>-.03,'Mace stays above the ground during the downward strike');}
}
if(club.impactResponse){
 const poseAt=(t,hit=true)=>{const s={grounded:true,attack:club.duration*(1-t),attackDuration:club.duration,...(hit?{attackImpact:strike}:{})},p=M.jointPose(s,false,profile);return {...p,held:M.heldPose(p,s,profile)};};
 const gap=(a,b)=>Math.max(...Object.keys(a).flatMap(k=>Array.from(a[k],(v,i)=>Math.abs(v-b[k][i]))));
 assert.equal(gap(poseAt(strike),poseAt(strike,false)),0,'Impact does not snap the pose at contact');
 const responseEnd=strike+club.impactResponse.duration/club.duration;
 assert(gap(poseAt(strike+.00001),poseAt(strike+.00001,false))<.000001,'Impact response eases in');
 assert(gap(poseAt(responseEnd-.00001),poseAt(responseEnd-.00001,false))<.000001,'Impact response eases out');
 assert.equal(gap(poseAt(responseEnd),poseAt(responseEnd,false)),0,'Impact returns exactly to the swing');
 const t=strike+club.impactResponse.duration/club.duration*.35,hit=poseAt(t),miss=poseAt(t,false);
 assert(gap({hips:hit.hips,root:hit.root},{hips:miss.hips,root:miss.root})>.005,'Hips and torso absorb a real hit');
 assert(gap({held:hit.held},{held:miss.held})>.02,'Weighted head reacts to real contact');
}
// Check the rendered hinges, since connected IK bones alone did not catch
// the elbow discs stretching into wedges when the club hand reached forward.
const guardHeights=[];
for(const t of [0,.20,strike,.53,.72,1]){
 const state={grounded:true,attack:club.duration*(1-t),attackDuration:club.duration},pose=M.jointPose(state,false,profile);
 const hand=local(pose.root,point(pose.leftForearm,[.03,-.61,.06]));guardHeights.push(hand[1]);assert(hand[2]>.5,'Empty hand keeps a forward guard');
 ctx.seen.length=0;renderer.draw(profile,state);
 for(const {mesh,rig}of ctx.seen.filter(({mesh})=>mesh.locked&&['leftArm','rightArm'].includes(mesh.joint))){
  for(let a=0;a<3;a++)for(let b=0;b<3;b++){const d=[0,1,2].reduce((sum,k)=>sum+rig[a*4+k]*rig[b*4+k],0);assert(Math.abs(d-(a===b?1:0))<.00001,'Club elbow hinge keeps its round rigid shape');}
  const child=mesh.joint==='leftArm'?'leftForearm':'rightForearm',rest=M.pivots[child].map((v,k)=>v-M.pivots[mesh.joint][k]);assert(Math.hypot(...point(rig,rest).map((v,k)=>v-pose[child][12+k]))<.00001,'Round hinge remains on the elbow joint');
 }
}
assert(Math.max(...guardHeights)-Math.min(...guardHeights)>.30,'Free arm rises and settles with the strike');
// Mace pronation moves the actual forearm; every other weapon keeps its poses.
// The original compared against git commit 2a9fc8f (not in this repo); poses are now frozen from v68.
const frozen=JSON.parse(fs.readFileSync(path.join(__dirname,'../fixtures/legacy/club-clearance-poses.v68.json'),'utf8')).poses;for(const [held,w]of Object.entries(W.catalog)){if(held==='Mace')continue;assert(frozen[held],held+' has frozen poses');configs.forEach((config,ci)=>[{},{attack:w.duration*.6,attackDuration:w.duration},{buildBlend:.3,buildTime:.3},{speed:7.8,moveBlend:1,runBlend:1,phase:1.4},{grounded:false,airTime:.3,vy:4}].forEach((partial,pi)=>{const p=C.validate({...C.defaults,...config,held}),s={heading:.8,grounded:true,...partial},before=frozen[held][ci][pi],after=M.jointPose(s,false,p);for(const [name,m]of Object.entries(after))assert.deepEqual(Array.from(m),before[name],held+' preserves '+name);}));}
console.log('PASS '+weaponName+': '+count+' actual '+weaponName+' vertices stay clear of torso/head across full swing, run, jump, rebuilding and studio for six body/clothing shapes; smooth connected arm and exact grip; other weapon poses unchanged.');
