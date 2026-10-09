const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
let bootstrap=fs.readFileSync(path.join(__dirname,'characters.cjs'),'utf8').split('const b=boot(),call=')[0];
bootstrap=bootstrap.replace('stored=new Map(),buffers=[];','stored=new Map(),buffers=[],uniforms=new Map(),shaderSources=[];').replace('bufferData:(_,a)=>','shaderSource:(_,source)=>shaderSources.push(source),uniform1f:(key,value)=>uniforms.set(key,value),uniform3fv:(key,value)=>uniforms.set(key,[...value]),bufferData:(_,a)=>');
bootstrap=bootstrap.replace(".split('</script>')[0],context)",".split('</script>')[0].replace(/\\}\\)\\(\\);\\s*$/, 'globalThis.environmentAPI={G:WorldGenerator,P:GamePhysics,S:SkyCycle,sky:lightState,camera,draw,mesh,isPavement,legacyRoadMark,paint:()=>{roadPaintRevision=-1;drawRoadPaint();return {meshes:roadPaintMeshes,vertices:[...positions]};},view:(a,b)=>{yaw=a;pitch=b;draw();},elapse:seconds=>{clock+=seconds;draw();}};})();'),context)").replace('return {tools,elements,buttons,buffers,stored,','return {api:context.environmentAPI,shaderSources,uniforms,tools,elements,buttons,buffers,stored,');
const ctx={require,__dirname,console,AbortController,Blob,URL,setTimeout};vm.runInNewContext(bootstrap+';globalThis.boot=boot;',ctx);
const game=ctx.boot(),{G,P,S}=game.api,A=game.api,call=(n,v)=>game.tools.get(n).execute(v);
const paintedShader=game.shaderSources.find(source=>source.includes('sampler2D uTexture'));assert(paintedShader.includes('vec4 decal=texture2D(uTexture,vUV);')&&paintedShader.includes('vec3 base=mix(material,'),'road material preserves the character paint shader');
const config={biomes:['forest'],time:'day',rain:false,snow:false,snowing:false,size:24,seed:73521};
for(const [biome,group,minHeight] of [['forest','tree',18],['rainforest','tree',26],['beach','palm',15]]){
 const world=G.generate({...config,biomes:[biome]}),objects=new Map();for(const p of world.pieces)if(p.group?.startsWith(group+'-')){if(!objects.has(p.group))objects.set(p.group,[]);objects.get(p.group).push(p);}
 assert(objects.size,biome+' has trees');for(const ps of objects.values()){const bs=ps.map(P.bounds),height=Math.max(...bs.map(b=>b.y1))-.4,width=Math.max(...bs.map(b=>b.x1))-Math.min(...bs.map(b=>b.x0)),depth=Math.max(...bs.map(b=>b.z1))-Math.min(...bs.map(b=>b.z0));assert(height>=minHeight,biome+' trees tower above even tall characters');assert(width>=8&&depth>=8,'broader canopies');}
}
for(const time of ['day','noon','evening','night']){
 const start=S.sample(time,0),later=S.sample(time,120),repeat=S.sample(time,S.duration);assert(Math.hypot(...start.sun.map((v,k)=>v-later.sun[k]))>.5,'sun moves with time');assert(Math.hypot(...start.sun.map((v,k)=>v-repeat.sun[k]))<1e-5,'complete twenty-minute orbit');
 for(let i=0;i<=1200;i+=10){const s=S.sample(time,i,true,true);for(const values of [s.sun,s.moon,s.light,s.zenith,s.horizon,s.ambient])assert(values.every(Number.isFinite));assert(s.night>=0&&s.night<=1);assert(Math.abs(Math.hypot(...s.sun)-1)<1e-5);for(let k=0;k<3;k++)assert(Math.abs(s.sun[k]+s.moon[k])<1e-6);}
}
call('generate_lego_world',{...config,biomes:['city','highway']});
assert(game.read().pieces.filter(p=>A.isPavement(p)).length>0);
for(const p of game.read().pieces.filter(p=>A.isPavement(p))){assert.equal(A.mesh(p).count,36,'road has a continuous slab with no studs or Lego seams');}
assert(game.read().pieces.every(p=>!G.isRoadMark(p,game.read().world.config,2)),'new highways use no raised marking tiles');
const paint=A.paint();assert(paint.meshes.some(m=>m.color==='white')&&paint.meshes.some(m=>m.color==='yellow'),'white and yellow road paint');assert(paint.vertices.length>0);for(let i=1;i<paint.vertices.length;i+=3)assert(Math.abs(paint.vertices[i]-.412)<1e-6,'paint lies flat on pavement');
const pieces=JSON.stringify(game.read().pieces),counts=game.read().pieces.length;A.paint();assert.equal(JSON.stringify(game.read().pieces),pieces,'paint never adds physical pieces');assert.equal(game.read().pieces.length,counts);
const sun=[...game.uniforms.get('uSunDirection')],moon=[...game.uniforms.get('uMoonDirection')];
for(const [yaw,pitch] of [[0,0],[Math.PI/2,.4],[Math.PI,-.6],[5,1.2]]){A.view(yaw,pitch);const camera=A.camera();assert.deepEqual(game.uniforms.get('uForward'),camera.forward);assert.deepEqual(game.uniforms.get('uRight'),camera.right);assert.deepEqual(game.uniforms.get('uUp'),camera.up);assert.deepEqual(game.uniforms.get('uSunDirection'),sun,'orbit cannot move the world sun');assert.deepEqual(game.uniforms.get('uMoonDirection'),moon,'orbit cannot move the world moon');}
assert.equal(game.uniforms.get('uTanHalfFov'),Math.tan(.62/2));A.elapse(60);assert.notDeepEqual(game.uniforms.get('uSunDirection'),sun,'time advances the sun with a stationary camera');
game.elements['#bb-time'].value='night';game.fire('bb-time','change');A.draw();assert(game.uniforms.get('uSunDirection')[1]<0&&game.uniforms.get('uMoonDirection')[1]>0,'night resets to moon above horizon');
const dark=S.sample('night',0);assert(dark.night>.99);const noon=S.sample('noon',0);assert(noon.sun[1]>.9&&noon.night===0);
const roadWorld=G.generate({...config,biomes:['highway']}),r=G.roads(roadWorld.config,2).find(r=>r.type==='highway'),oldMark={id:10000,x:r.x,z:r.z+3,y:1,rows:1,cols:2,turn:0,kind:'tile',color:2},legacy={format:'brick-builder',version:4,pieces:[...roadWorld.pieces,oldMark],world:{config:roadWorld.config,layoutVersion:2}};
const controller=new P.Controller(legacy.pieces,roadWorld);assert(!controller.pieces.some(p=>p.id===oldMark.id),'legacy raised marks become paint for collisions');assert.equal(controller.floor(r.x+1,r.z+3.5,1),.4,'no invisible road bump');assert.equal(P.looseFloor(controller,r.x+1,r.z+3.5,1),.4,'fragments settle on actual pavement');
game.fire('bb-open');game.elements['#bb-data'].value=JSON.stringify(legacy);game.fire('bb-load-code');assert.equal(game.elements['#bb-dialog-message'].textContent,'');assert(A.legacyRoadMark(oldMark),'legacy marks render as paint');assert(game.read().pieces.some(p=>p.id===oldMark.id),'saved brick data is preserved');
const moved={...oldMark,z:r.z+5};assert(!G.isRoadMark(moved,roadWorld.config,2),'ordinary edited tiles stay physical');
call('explore_lego_world',{playing:true});assert.equal(game.uniforms.get('uTanHalfFov'),Math.tan(.90/2),'sky matches exploration camera lens');
console.log('PASS: larger forest/rainforest/palm trees, full celestial orbit and camera-independent sky uniforms, smooth road meshes, flat clipped paint without pieces, legacy road collision/save compatibility and pavement debris support.');
