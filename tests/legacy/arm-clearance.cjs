const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const seen=[],ctx={Float32Array,onMesh:(mesh,rig)=>seen.push({mesh,rig})};
for(const [file,name]of [['game-weapons.js','GameWeapons'],['character-catalog.js','CharacterCatalog'],['character-model.js','CharacterModel']]){
 let source=fs.readFileSync(path.join(__dirname,'../../src/legacy',file),'utf8');
 if(file==='character-model.js')source=source.replace('function renderMesh(g,m,c,override=null){','function renderMesh(g,m,c,override=null){globalThis.onMesh(g,m);');
 vm.runInNewContext(source+';globalThis.'+name+'='+name,ctx);
}
const {CharacterModel:M,GameWeapons:W,CharacterCatalog:C}=ctx;
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const local=(m,p)=>[0,1,2].map(k=>[0,1,2].reduce((sum,j)=>sum+m[k*4+j]*(p[j]-m[12+j]),0));
function bodyDistance(p,profile){
 const y=Math.max(1.92,Math.min(3.16,p[1])),female=profile.gender==='Female',width=profile.outfit==='Armor'?.90:(female?.76:.80)-(y-1.92)/1.24*(female?.05:.09);
 const chest=female?profile.breastSize/100*.32:0,front=.44+chest*Math.exp(-1.6*(((Math.abs(p[0])-.34)/.35)**2+((p[1]-2.72)/.35)**2));
 return Math.hypot(Math.max(0,Math.abs(p[0])-width),Math.max(0,1.92-p[1],p[1]-3.16),Math.max(0,p[2]-front));
}
const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,createBuffer:()=>({}),getAttribLocation:(_,s)=>s,getUniformLocation:(_,s)=>s},{get:(o,k)=>k in o?o[k]:k.toUpperCase()===k?1:()=>{}}),renderer=M.create(gl,'void main(){vec3 base=mix(vColor,vec3(0),0.0);}');
let samples=0,vertices=0;
for(const config of [{},{gender:'Female',breastSize:50},{gender:'Female',breastSize:100},{outfit:'Armor'},{gender:'Female',breastSize:100,outfit:'Armor'}])for(const [held,w]of Object.entries(W.catalog).filter(([,w])=>w.style==='fire')){
 const profile=C.validate({...C.defaults,...config,held,shirt:'Jacket'});
 for(const action of ['attack','reload','run','jump','stow']){let previous;
  for(let i=0;i<=100;i++){
   const t=i/100,state={x:4,y:5,z:-8,heading:.8,grounded:action!=='jump',phase:t*Math.PI*2,moveBlend:action==='run'?1:0,runBlend:1,airTime:.3,vy:4,attack:action==='attack'?w.duration*(1-t):0,attackDuration:w.duration,reload:action==='reload'?w.reload*(1-t):0,reloadDuration:w.reload,buildBlend:action==='stow'?t:0,building:action==='stow',buildTime:.3},pose=M.jointPose(state,false,profile);
   for(const [name,m]of Object.entries(pose)){assert(Array.from(m).every(Number.isFinite));if(previous)assert(Math.max(...m.map((v,k)=>Math.abs(v-previous[name][k])))<.20,held+' smooth '+action+' '+name);}previous=pose;
   for(const [child,parent]of Object.entries(M.parents)){const offset=M.pivots[child].map((v,k)=>v-M.pivots[parent][k]);assert(Math.hypot(...point(pose[parent],offset).map((v,k)=>v-pose[child][12+k]))<.00001,held+' connected '+child);}
   if(action==='stow')continue;
   const rig=M.heldPose(pose,state,profile),grip=point(rig,[.02,-.61,.315]),rightHand=point(pose.rightForearm,[-.03,-.61,.06]);assert(Math.hypot(...grip.map((v,k)=>v-rightHand[k]))<.00001,held+' holds gun');
   for(const side of ['left','right']){
    const shoulder=point(pose.root,M.pivots[side+'Arm']);assert(Math.hypot(...shoulder.map((v,k)=>v-pose[side+'Arm'][12+k]))<.00001,held+' shoulder attached');
    const a=local(pose.root,point(pose[side+'Forearm'],[0,0,0])),b=local(pose.root,point(pose[side+'Forearm'],[side==='left'?.03:-.03,-.61,.06]));
    for(let j=0;j<=16;j++){const p=a.map((v,k)=>v+(b[k]-v)*j/16);assert(bodyDistance(p,profile)>.225,held+' '+config.gender+' '+action+' '+t+' '+side+' elbow/forearm outside torso');samples++;}
   }
   if(i%25===0){seen.length=0;renderer.draw(profile,state);for(const {mesh,rig}of seen.filter(({mesh})=>mesh.joint.endsWith('Forearm')&&mesh.slot!=='held'))for(let j=0;j<mesh.surface.vertices.length;j+=3){const p=local(pose.root,point(rig,mesh.surface.vertices.slice(j,j+3)));assert(bodyDistance(p,profile)>.002,held+' actual '+mesh.slot+' mesh outside torso during '+action);vertices++;}}
  }
 }
}
console.log(`PASS: ${samples} firearm elbow/forearm capsule samples and ${vertices} actual mesh vertices clear the torso across body shapes, aiming, firing, reload, run and jump; connected grips and smooth rebuilding transitions.`);
