const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const context={Float32Array,Uint8Array,Uint8ClampedArray};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../character-model.js'),'utf8')+'\nglobalThis.model=CharacterModel;',context);
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../character-catalog.js'),'utf8')+'\nglobalThis.catalog=CharacterCatalog;',context);
const {model:M,catalog:C}=context,point=(m,p)=>[0,1,2].map(r=>m[r]*p[0]+m[r+4]*p[1]+m[r+8]*p[2]+m[r+12]),close=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<.00002);
for(const running of [false,true])for(const grounded of [false,true])for(const phase of [0,.5,Math.PI/2,Math.PI,Math.PI*1.5])for(const attack of [0,.16,.32]){
 const pose=M.jointPose({x:3,y:2,z:-4,heading:.7,speed:running?7.8:4,phase,running,grounded,attack});
 for(const [child,parent] of Object.entries(M.parents)){
  const offset=M.pivots[child].map((v,k)=>v-M.pivots[parent][k]);
  assert(close(point(pose[parent],offset),point(pose[child],[0,0,0])),child+' remains connected throughout motion');
  assert(Array.from(pose[child]).every(Number.isFinite));
 }
 if(grounded){const bottom=Math.min(...['leftFoot','rightFoot'].flatMap(name=>[-.36,.55].map(z=>point(pose[name],[0,-M.pivots[name][1],z])[1])));assert(Math.abs(bottom-2)<.00002,'a support foot stays on the ground while the other leg swings');}
}
const neutral=M.jointPose({},true),run=M.jointPose({speed:7.8,running:true,phase:Math.PI/2,grounded:true});
const bend=(a,b)=>Math.acos(Math.max(-1,Math.min(1,[4,5,6].reduce((sum,k)=>sum+a[k]*b[k],0))));assert(bend(run.leftShin,run.leftLeg)>.75,'running bends the knee independently of the hip');
assert(bend(run.rightForearm,run.rightArm)>.40,'running bends the elbow independently of the shoulder');
assert(close(point(neutral.leftShin,[0,0,0]),M.pivots.leftShin),'drawing uses the neutral rest pose');
let lastMatrix,lastColor,draws=[];
const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:(_,name)=>name,getAttribLocation:(_,name)=>({aPosition:0,aNormal:1,aUV:2}[name]),createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),createTexture:()=>({}),uniformMatrix4fv:(name,_,value)=>{if(name==='uModel')lastMatrix=Array.from(value);},uniform3fv:(name,value)=>{if(name==='uColor')lastColor=Array.from(value);},bufferData:(_,values)=>assert(Array.from(values).every(Number.isFinite)),drawArrays:()=>draws.push({matrix:lastMatrix,color:lastColor})},{get:(o,k)=>k in o?o[k]:k.toUpperCase()===k?1:()=>{}});
const renderer=M.create(gl,'void main(){vec3 base=mix(vColor,vec3(1.),0.);}',()=>{}),state={speed:7.8,running:true,phase:Math.PI/2,grounded:true},pose=M.jointPose(state),rgb=color=>[1,3,5].map(i=>Math.pow(parseInt(color.slice(i,i+2),16)/255,1.5));
for(const held of ['Hammer','Sword','Umbrella','Shield','Map']){
 draws=[];const profile=C.validate({...C.defaults,held,accessoryColor:'#19df48'});renderer.draw(profile,state,false);
 for(const bone of ['leftShin','rightShin','leftForearm','rightForearm'])assert(draws.some(d=>close(d.matrix,Array.from(pose[bone]))),bone+' renders its own section');
 const heldMeshes=draws.filter(d=>close(d.color,rgb(profile.accessoryColor)));assert(heldMeshes.length);assert(heldMeshes.every(d=>close(d.matrix,Array.from(pose.rightForearm))),held+' moves intact with the forearm');
 const feet=draws.filter(d=>close(d.color,rgb(profile.shoeColor)));assert(feet.length);assert(feet.every(d=>close(d.matrix,Array.from(pose.leftFoot))||close(d.matrix,Array.from(pose.rightFoot))),'shoes follow the articulated ankle');
}
console.log('PASS: articulated elbows and knees remain connected in walking, running, jumping and smashing; all lower sections render; shoes and complete held items follow the correct joint; painting retains a neutral rest pose.');
