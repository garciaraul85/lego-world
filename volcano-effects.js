const volcanoActivity=VolcanoSimulation.create();let volcanoRevision=-1,volcanoWorld=null,volcanoHUD='',volcanoSurface=new Map();
function syncVolcanoes(){
 if(volcanoRevision===renderRevision&&volcanoWorld===world)return;
 const changed=volcanoWorld!==world;volcanoWorld=world;volcanoRevision=renderRevision;volcanoSurface=new Map();const sources=[];
 if(world?.config.biomes.includes('volcanoes')){
  for(const p of pieces){const [w,d]=dims(p),y=(p.y+height(p))*.4+(p.kind==='tile'||isPavement(p)?0:.225);for(let a=0;a<w;a++)for(let b=0;b<d;b++){const key=(p.x+a)+','+(p.z+b);volcanoSurface.set(key,Math.max(volcanoSurface.get(key)||0,y));}}
  for(const [i,r] of world.regions.entries())if(r.biome==='volcanoes'){
   const cx=r.x+r.width/2,cz=r.z+r.depth/2,radius=r.width*.15,lava=pieces.filter(p=>p.kind==='tile'&&[0,4].includes(p.color)&&p.y>20&&Math.hypot(p.x+1-cx,p.z+1-cz)<radius);
   if(lava.length){const y=Math.min(...lava.map(p=>(p.y+1)*.4));sources.push({id:'volcano-'+i,x:cx,y,z:cz,radius});}
  }
 }
 const bounds=world?{x0:-world.width/2,x1:world.width/2,z0:-world.depth/2,z1:world.depth/2}:{x0:-8,x1:8,z0:-8,z1:8};
 volcanoActivity.configure(sources,bounds,(x,z)=>volcanoSurface.get(Math.floor(x)+','+Math.floor(z))||.4,world?.config.seed??1,changed);
 q('#bb-volcano-controls').hidden=!sources.length;updateVolcanoHUD();
}
function updateVolcanoHUD(){const v=volcanoActivity.status()[0],text=v?v.name+(v.name==='Venting'||v.name==='Building pressure'?' · eruption in '+Math.ceil(v.eruptionIn)+'s':' · '+Math.ceil(v.remaining)+'s'):'';if(text!==volcanoHUD){volcanoHUD=text;q('#bb-volcano-status').textContent=text;}}
function volcanoFrame(dt){syncVolcanoes();if(!characterPreview&&!gameOverlayOpen()){volcanoActivity.step(dt);if(volcanoActivity.status().length)dirty=true;updateVolcanoHUD();}}
q('#bb-watch-volcano').addEventListener('click',()=>{if(playing)stopPlaying(false);if(characterPreview)switchPanel('world');syncVolcanoes();const v=volcanoActivity.status()[0];if(!v)return;stopTour();target=[v.x,v.y+7,v.z];baseDistance=Math.max(90,(v.y+40)*2,v.radius*12);yaw=.65;pitch=.25;zoom=55;q('#bb-zoom').value=55;setTool('orbit');dirty=true;draw();});
q('#bb-erupt-volcano').addEventListener('click',()=>{syncVolcanoes();volcanoActivity.erupt();updateVolcanoHUD();dirty=true;draw();});
// Billboards use world-space sizes, so smoke grows and drifts around the
// crater rather than sitting on the screen. Soft edges keep the plume readable.
const volcanoVertex=`attribute vec3 aPosition;attribute vec4 aColor;attribute vec2 aUV;uniform mat4 uMVP;varying vec4 vColor;varying vec2 vUV;void main(){vColor=aColor;vUV=aUV;gl_Position=uMVP*vec4(aPosition,1.0);}`;
const volcanoFragment=`precision mediump float;varying vec4 vColor;varying vec2 vUV;void main(){float r=dot(vUV,vUV);if(r>1.0)discard;float alpha=pow(1.0-r,1.6)*vColor.a;gl_FragColor=vec4(vColor.rgb,alpha);}`;
const volcanoProgram=gl.createProgram();gl.attachShader(volcanoProgram,shader(gl.VERTEX_SHADER,volcanoVertex));gl.attachShader(volcanoProgram,shader(gl.FRAGMENT_SHADER,volcanoFragment));gl.linkProgram(volcanoProgram);if(!gl.getProgramParameter(volcanoProgram,gl.LINK_STATUS))throw Error('Volcano shader failed.');
const volcanoBuffer=gl.createBuffer(),volcanoLoc={p:gl.getAttribLocation(volcanoProgram,'aPosition'),c:gl.getAttribLocation(volcanoProgram,'aColor'),uv:gl.getAttribLocation(volcanoProgram,'aUV'),m:gl.getUniformLocation(volcanoProgram,'uMVP')};
function drawVolcanoEffects(mvp,cam){
 syncVolcanoes();const activity=volcanoActivity.snapshot();if(!activity.vents.length)return;
 characterRenderer.begin(mvp,cam.eye,lightState());const brick=mesh({rows:1,cols:1,turn:0,kind:'brick'});
 for(const p of activity.particles)if(p.kind==='lava'){const heat=p.heat,color=[.12+heat*.88,.055+heat*(.10+p.color*.30),.025+heat*.015];characterRenderer.effect(brick,CharacterModel.matrix(p.x,p.y,p.z,p.ry,p.rx,p.rz,p.size),color,p.alpha,false);}
 const clouds=[],glows=[];
 for(const p of activity.particles){
  if(p.kind==='lava'){if(p.heat>.15)glows.push({...p,size:p.size*2.8,color:[1,.26+p.color*.15,.02,p.alpha*p.heat*.36]});continue;}
  if(p.kind==='blast'){glows.push({...p,color:[1,.45,.10,Math.max(0,1-p.age/p.life)*.6]});continue;}
  const tint=p.kind==='ash'?.18:p.dark?.30:.64,fade=Math.min(1,p.age/p.life);clouds.push({...p,color:[tint+fade*.07,tint+fade*.08,tint+fade*.09,p.alpha*(p.kind==='ash'?.75:1)]});
 }
 clouds.sort((a,b)=>((b.x-cam.eye[0])**2+(b.y-cam.eye[1])**2+(b.z-cam.eye[2])**2)-((a.x-cam.eye[0])**2+(a.y-cam.eye[1])**2+(a.z-cam.eye[2])**2));
 function billboards(items,additive){if(!items.length)return;const values=[];for(const p of items){const s=p.size/2;for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]])values.push(p.x+cam.right[0]*u*s+cam.up[0]*v*s,p.y+cam.right[1]*u*s+cam.up[1]*v*s,p.z+cam.right[2]*u*s+cam.up[2]*v*s,...p.color,u,v);}
  gl.useProgram(volcanoProgram);gl.uniformMatrix4fv(volcanoLoc.m,false,mvp);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,additive?gl.ONE:gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.bindBuffer(gl.ARRAY_BUFFER,volcanoBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.DYNAMIC_DRAW);for(const [loc,size,offset] of [[volcanoLoc.p,3,0],[volcanoLoc.c,4,12],[volcanoLoc.uv,2,28]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,36,offset);}gl.drawArrays(gl.TRIANGLES,0,values.length/9);for(const loc of [volcanoLoc.p,volcanoLoc.c,volcanoLoc.uv])gl.disableVertexAttribArray(loc);gl.depthMask(true);gl.disable(gl.BLEND);
 }
 billboards(clouds,false);billboards(glows,true);gl.useProgram(program);
}
