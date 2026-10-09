(()=>{
'use strict';
const root=document.getElementById('brick-builder'),q=s=>root.querySelector(s),canvas=q('#bb-canvas');
const sizes=[[4,4],[4,8],[8,8],[1,1],[1,2],[1,3],[1,4],[1,6],[1,8],[2,2],[2,3],[2,4],[2,6],[2,8]];
const colors=[['Classic red','#d20c20'],['Bright blue','#0058ac'],['Sunshine yellow','#f7c900'],['Forest green','#168344'],['Orange','#f27714'],['White','#eef0f2'],['Black','#222630'],['Lavender','#a187cd'],['Brown','#754429'],['Sand','#d8b875'],['Stone','#7f8a94'],['Dark stone','#485665'],['Grass','#79b44c'],['Water blue','#28a8cb'],['Cream','#f0d7a2'],['Pink','#e990b3'],['Jungle green','#0f603a'],['Terracotta','#b15d3e']];
let pieces=[],selected=null,moving=null,tool='add',nextId=1,undoStack=[],redoStack=[];
let template={rows:2,cols:4,kind:'brick',color:0,turn:0},ghost={...template,x:-2,z:-1,y:0,id:-1},ghostVisible=true;
let characters=[{id:1,profile:{...CharacterCatalog.defaults}}],activeCharacterId=1,playing=false,characterPreview=false,currentPanel='world',savedBuildLoaded=false,broken=[],brokenSerial=1,savedPlayer=null;
let world=null,environment={time:'day',rain:false,snow:false,snowing:false},renderRevision=0;
let mapNetwork=null,mapSpawnId=1,mapPlacing=false,mapPreviewReturn=null,mapTravelUntil=0,portalMeshes=null,mapTouchState=null;
let mapSpawnDraft=null,mapDiagramOpen=false,mapDiagramSelection=null,mapDiagramSource=null,spawnFacingMesh=null,spawnFacingAngle=null;
let yaw=.65,pitch=.65,target=[0,1,0],baseDistance=35,zoom=55,dirty=true,topView=false;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),height=p=>p.kind==='brick'?3:1;
const dims=p=>p.turn%2?[p.rows,p.cols]:[p.cols,p.rows];
const copy=p=>({...p}),clone=a=>a.map(copy),key=(x,z,y)=>x+','+z+','+y;
const normalize=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function validatePiece(p){
 if(!p||typeof p!=='object'||!sizes.some(([r,c])=>r===p.rows&&c===p.cols)||!['brick','plate','tile'].includes(p.kind)||!Number.isInteger(p.color)||p.color<0||p.color>=colors.length||!Number.isInteger(p.turn)||p.turn<0||p.turn>3)return 'Invalid piece.';
 if(!Number.isInteger(p.x)||!Number.isInteger(p.z)||Math.abs(p.x)>256||Math.abs(p.z)>256||!Number.isInteger(p.y)||p.y<0||p.y+height(p)>300)return 'Position is outside the build area.';
 return null;
}
function inspect(list){
 if(list.length>12000)return {ok:false,reason:'This world has reached 12,000 pieces.'};
 const occupied=new Map(),tops=new Map(),bottoms=new Map(),adj=list.map(()=>new Set());
 for(let i=0;i<list.length;i++){
  const p=list[i],bad=validatePiece(p);if(bad)return {ok:false,reason:bad};const [w,d]=dims(p),h=height(p);
  for(let x=0;x<w;x++)for(let z=0;z<d;z++){
   for(let y=0;y<h;y++){const k=key(p.x+x,p.z+z,p.y+y);if(occupied.has(k))return {ok:false,reason:'Pieces overlap. Try a different position or height.'};occupied.set(k,i);}
   bottoms.set(key(p.x+x,p.z+z,p.y),i);
   if(p.kind!=='tile')tops.set(key(p.x+x,p.z+z,p.y+h),i);
  }
 }
 for(const [k,a] of tops){const b=bottoms.get(k);if(b!==undefined&&a!==b){adj[a].add(b);adj[b].add(a);}}
 const visited=new Set(),queue=[];for(let i=0;i<list.length;i++)if(list[i].y===0){visited.add(i);queue.push(i);}
 for(let j=0;j<queue.length;j++)for(const n of adj[queue[j]])if(!visited.has(n)){visited.add(n);queue.push(n);}
 if(visited.size!==list.length)return {ok:false,reason:'Needs a stud connection to the build. Tiles have no top studs.',connected:visited,adj};
 return {ok:true,reason:'Studs aligned. Ready to connect.',adj,occupied,tops,bottoms};
}
function candidateList(p){return [...pieces.filter(b=>b.id!==moving),copy(p)];}
let supportRevision=-1,supportCache=null;
function ghostCheck(){
 if(moving)return inspect(candidateList(ghost));const bad=validatePiece(ghost);if(bad)return {ok:false,reason:bad};
 if(supportRevision!==renderRevision){supportCache=inspect(pieces);supportRevision=renderRevision;}
 if(!supportCache.ok)return supportCache;if(pieces.length>=12000)return {ok:false,reason:'This world has reached 12,000 pieces.'};
 const [w,d]=dims(ghost),h=height(ghost);let connected=ghost.y===0;
 for(let x=0;x<w;x++)for(let z=0;z<d;z++){for(let y=0;y<h;y++)if(supportCache.occupied.has(key(ghost.x+x,ghost.z+z,ghost.y+y)))return {ok:false,reason:'Pieces overlap. Try a different position or height.'};if(supportCache.tops.has(key(ghost.x+x,ghost.z+z,ghost.y)))connected=true;if(ghost.kind!=='tile'&&supportCache.bottoms.has(key(ghost.x+x,ghost.z+z,ghost.y+h)))connected=true;}
 return {ok:connected,reason:connected?'Studs aligned. Ready to connect.':'Needs a stud connection. Tiles have no top studs.'};
}
function snapshot(){return {pieces:clone(pieces),nextId,world:world?JSON.parse(JSON.stringify(world)):null,environment:{...environment},broken:JSON.parse(JSON.stringify(broken)),player:controller?{...controller.state}:savedPlayer,characters:characterData(),npcs:npcData(),maps:JSON.parse(JSON.stringify(exportMapNetwork())),mapSpawnId};}
function remember(){undoStack.push(snapshot());if(undoStack.length>(world||ensureMapNetwork().maps.length>1?12:80))undoStack.shift();redoStack=[];q('#bb-undo').disabled=false;q('#bb-redo').disabled=true;}
function persist(){try{localStorage.setItem('lego-free-build-v1',JSON.stringify(data()));return true;}catch(e){q('#bb-character-message').textContent='Device storage is full. Use Save to download your project with all artwork.';return false;}}
function commit(list,message){remember();pieces=clone(list);renderRevision++;if(controller){controller.replace(pieces,world);controller.repairPosition();physicsRevision=renderRevision;}persist();dirty=true;sync();if(message)status(message);}
function status(text,valid){q('#bb-status').textContent=text;if(valid===undefined)q('#bb-status').removeAttribute('data-valid');else q('#bb-status').dataset.valid=String(valid);}
function sync(){
 q('#bb-count').textContent=pieces.length+' '+(pieces.length===1?'piece':'pieces')+' · '+(pieces.length?'Height '+Math.max(...pieces.map(p=>p.y+height(p)))+' plates':'Empty build');
 q('#bb-undo').disabled=!undoStack.length;q('#bb-redo').disabled=!redoStack.length;
 const p=pieces.find(p=>p.id===selected);if(!p)selected=null;
 q('#bb-selected').textContent=p?`${p.rows} × ${p.cols} ${p.kind} selected`:'No piece selected';
 for(const name of ['move','copy','delete'])q('#bb-'+name).disabled=!p||!!moving;
 q('#bb-place').hidden=playing||characterPreview||tool!=='add'&&tool!=='move';q('#bb-place').textContent=moving?'Connect here':'Place '+template.kind;
 for(const b of root.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===tool));
 for(const b of q('#bb-parts').children)b.setAttribute('aria-pressed',String(Number(b.dataset.rows)===template.rows&&Number(b.dataset.cols)===template.cols));
 for(const b of q('#bb-colors').children)b.setAttribute('aria-pressed',String(Number(b.dataset.color)===template.color));
 q('#bb-kind').value=template.kind;q('#bb-color-name').textContent=colors[template.color][0];q('#bb-orientation').textContent='Orientation: '+template.turn*90+'°';
 if(ghost&&(tool==='add'||tool==='move')){
  q('#bb-x').value=ghost.x;q('#bb-z').value=ghost.z;q('#bb-y').value=ghost.y;const check=ghostCheck();q('#bb-place').disabled=!check.ok;status(`${check.reason} X ${ghost.x}, Z ${ghost.z}, height ${ghost.y}.`,check.ok);
 }else{q('#bb-place').disabled=true;status(tool==='orbit'?(world?environment.time.charAt(0).toUpperCase()+environment.time.slice(1)+' sky · Drag to explore · Bricks tab to edit':'Drag to orbit. Use Shift-drag or two fingers to pan.'):p?'Move, copy, recolor, rotate, or remove this piece.':'Tap a piece to select it.');}
 dirty=true;
}
function setTool(name){if(playing)stopPlaying();if(characterPreview)leavePreview();updateGameVisibility();moving=null;tool=name;ghostVisible=name==='add';if(name==='add'){ghost={...ghost,...template,id:-1};}sync();}
function place(){
 if(tool!=='add'&&tool!=='move')return;
 const check=ghostCheck();if(!check.ok){status(check.reason,false);return;}
 const p={...ghost,id:moving||nextId};if(!moving)delete p.group;const list=candidateList(p);const oldMoving=moving;
 commit(list);if(!oldMoving)nextId++;else{moving=null;tool='select';selected=p.id;ghostVisible=false;}
 if(!oldMoving){ghost={...p,id:-1,y:p.y+height(p)};selected=p.id;}
 persist();sync();
}
function removeSelected(){const p=pieces.find(p=>p.id===selected);if(!p)return;const list=pieces.filter(b=>b.id!==p.id),check=inspect(list);if(!check.ok){status('This supports other pieces. Remove or move those first.',false);return;}selected=null;commit(list,'Piece removed.');}
function startMove(){const p=pieces.find(p=>p.id===selected);if(!p)return;moving=p.id;tool='move';template={rows:p.rows,cols:p.cols,kind:p.kind,color:p.color,turn:p.turn};ghost=copy(p);ghostVisible=true;sync();}
function duplicate(){const p=pieces.find(p=>p.id===selected);if(!p)return;moving=null;tool='add';template={rows:p.rows,cols:p.cols,kind:p.kind,color:p.color,turn:p.turn};ghost={...p,id:-1,y:p.y+height(p)};ghostVisible=true;sync();}
function updateTemplate(values){
 template={...template,...values};
 if(tool==='select'&&selected){const p=pieces.find(b=>b.id===selected),updated={...p,...values},list=pieces.map(b=>b.id===selected?updated:b);const result=inspect(list);if(!result.ok){template={rows:p.rows,cols:p.cols,kind:p.kind,color:p.color,turn:p.turn};sync();status(result.reason,false);return;}commit(list);sync();}
 else{if(tool==='orbit')setTool('add');ghost={...ghost,...template};sync();}
}
function undo(redo=false){if(playing)stopPlaying(false);leavePreview();updateGameVisibility();const from=redo?redoStack:undoStack,to=redo?undoStack:redoStack;if(!from.length)return;to.push(snapshot());const old=from.pop();pieces=clone(old.pieces);nextId=old.nextId;world=old.world||null;environment=old.environment||{time:'day',rain:false,snow:false,snowing:false};if(old.characters){characters=old.characters.items;activeCharacterId=old.characters.activeId;syncCharacter();}broken=old.broken||[];savedPlayer=old.player||null;controller=null;restoreNPCs(old.npcs);debris=[];for(const entry of broken)makeDebris(entry);restoreMapNetwork(old.maps,old.mapSpawnId);renderRevision++;restoreWorldControls();stopTour();fit();selected=null;moving=null;tool='orbit';ghostVisible=false;if(currentPanel==='characters')showCharacterStudio();persist();sync();}
function precise(){const values=['x','z','y'].map(k=>Number(q('#bb-'+k).value));if(values.some(v=>!Number.isInteger(v))){status('Use whole studs and plate heights.',false);return;}if(tool==='select'||tool==='orbit')setTool('add');[ghost.x,ghost.z,ghost.y]=values;ghostVisible=true;sync();}
for(const [rows,cols] of sizes){const b=document.createElement('button');b.type='button';b.className='part';b.dataset.rows=rows;b.dataset.cols=cols;b.textContent=rows+' × '+cols;b.addEventListener('click',()=>{if(tool==='select')setTool('add');updateTemplate({rows,cols});});q('#bb-parts').appendChild(b);}
colors.forEach(([name,hex],color)=>{const b=document.createElement('button');b.type='button';b.className='swatch';b.style.setProperty('--color',hex);b.dataset.color=color;b.setAttribute('aria-label',name);b.addEventListener('click',()=>updateTemplate({color}));q('#bb-colors').appendChild(b);});
q('#bb-kind').addEventListener('change',e=>{if(tool==='select')setTool('add');updateTemplate({kind:e.target.value});});
for(const b of root.querySelectorAll('[data-tool]'))b.addEventListener('click',()=>setTool(b.dataset.tool));
q('#bb-rotate').addEventListener('click',()=>updateTemplate({turn:(template.turn+1)%4}));q('#bb-place').addEventListener('click',place);q('#bb-move').addEventListener('click',startMove);q('#bb-copy').addEventListener('click',duplicate);q('#bb-delete').addEventListener('click',removeSelected);q('#bb-undo').addEventListener('click',()=>undo());q('#bb-redo').addEventListener('click',()=>undo(true));for(const k of ['x','z','y'])q('#bb-'+k).addEventListener('change',precise);
const gl=canvas.getContext('webgl',{antialias:true,alpha:true});
if(!gl){q('#bb-error').hidden=false;q('#bb-place').disabled=true;return;}
const vertex=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aInstanceOffset;attribute vec3 aInstanceColor;uniform mat4 uMVP;uniform vec3 uOffset;uniform vec3 uColor;uniform float uInstances;uniform float uPointSize;varying vec3 vNormal;varying vec3 vPosition;varying vec3 vColor;void main(){vNormal=aNormal;vPosition=aPosition+mix(uOffset,aInstanceOffset,uInstances);vColor=mix(uColor,aInstanceColor,uInstances);gl_Position=uMVP*vec4(vPosition,1.0);gl_PointSize=uPointSize;}`;
const fragment=`precision mediump float;varying vec3 vNormal;varying vec3 vPosition;varying vec3 vColor;uniform vec3 uEye;uniform float uAlpha;uniform float uFloor;uniform float uFlat;uniform vec3 uLight;uniform vec3 uAmbient;uniform vec3 uFog;uniform vec2 uFogRange;uniform float uSnow;uniform float uNight;uniform float uParticle;uniform float uExplore;uniform float uPavement;uniform vec3 uFocus;void main(){if(uExplore>0.5){vec3 d=uFocus-uEye;float len=length(d);vec3 axis=d/max(len,0.001);float along=dot(vPosition-uEye,axis);float away=length(vPosition-uEye-axis*along);if(along>0.0&&along<len-1.4&&away<1.38)discard;}if(uParticle>0.5&&length(gl_PointCoord-vec2(0.5))>0.5)discard;if(uFlat>0.5){gl_FragColor=vec4(vColor,uAlpha);return;}vec3 n=normalize(vNormal);vec3 v=normalize(uEye-vPosition);vec3 l=normalize(uLight);vec3 l2=normalize(vec3(5.0,2.0,-4.0));float d=max(dot(n,l),0.0);float d2=max(dot(n,l2),0.0);float spec=pow(max(dot(n,normalize(l+v)),0.0),65.0);float rim=pow(1.0-max(dot(n,v),0.0),3.0);float grain=fract(sin(dot(floor(vPosition.xz*19.0),vec2(12.98,78.23)))*4375.8);vec3 surface=mix(vColor,vec3(0.075,0.086,0.10)+grain*0.008,uPavement);vec3 base=mix(vColor,vec3(0.93,0.97,1.0),uSnow*smoothstep(0.55,0.97,n.y)*0.95);if(uPavement>0.5)base=mix(surface,vec3(0.93,0.97,1.0),uSnow*smoothstep(0.55,0.97,n.y)*0.95);vec3 c=base*(uAmbient+d*mix(0.70,0.24,uNight)+d2*0.15)+vec3(0.9,0.93,1.0)*spec*0.38*(1.0-uPavement)+vec3(0.14,0.20,0.30)*rim*0.12;float lamp=step(0.7,vColor.r)*step(0.5,vColor.g)*(1.0-step(0.25,vColor.b));c+=vColor*lamp*uNight*0.6;if(uFloor>0.5){vec2 f=fract(vPosition.xz);float grid=max(1.0-smoothstep(0.01,0.035,min(f.x,1.0-f.x)),1.0-smoothstep(0.01,0.035,min(f.y,1.0-f.y)));c=mix(vec3(0.08,0.12,0.17),vec3(0.15,0.21,0.29),grid);}float fog=smoothstep(uFogRange.x,uFogRange.y,length(uEye-vPosition))*0.62;c=mix(pow(max(c,vec3(0.0)),vec3(0.8)),uFog,fog);gl_FragColor=vec4(c,uAlpha);}`;
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
let program;try{program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Shader linking failed');}catch(e){q('#bb-error').hidden=false;return;}
gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
const loc={p:gl.getAttribLocation(program,'aPosition'),n:gl.getAttribLocation(program,'aNormal'),m:gl.getUniformLocation(program,'uMVP'),c:gl.getUniformLocation(program,'uColor'),e:gl.getUniformLocation(program,'uEye'),o:gl.getUniformLocation(program,'uOffset'),a:gl.getUniformLocation(program,'uAlpha'),f:gl.getUniformLocation(program,'uFloor'),flat:gl.getUniformLocation(program,'uFlat')};
let positions=[],normals=[];const meshes=new Map();
function tri(a,b,c,na,nb,nc){positions.push(...a,...b,...c);if(!na){na=normalize(cross(b.map((v,i)=>v-a[i]),c.map((v,i)=>v-a[i])));nb=na;nc=na;}normals.push(...na,...nb,...nc);}
function box(cx,cy,cz,w,h,d,r=.025){
 const half=[w/2,h/2,d/2],center=[cx,cy,cz];r=Math.min(r,w/3,h/3,d/3);
 // Project each subdivided cube face onto a rounded box. Normals follow its bevels.
 for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
  const u=(axis+1)%3,v=(axis+2)%3,U=[-half[u],-half[u]+r,half[u]-r,half[u]],V=[-half[v],-half[v]+r,half[v]-r,half[v]];
  function point(i,j){const p=[0,0,0];p[axis]=sign*half[axis];p[u]=U[i];p[v]=V[j];const inside=p.map((x,k)=>clamp(x,-half[k]+r,half[k]-r));const n=normalize(p.map((x,k)=>x-inside[k]));return {p:inside.map((x,k)=>x+r*n[k]+center[k]),n};}
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){const a=point(i,j),b=point(i+1,j),c=point(i+1,j+1),d0=point(i,j+1);tri(a.p,b.p,c.p,a.n,b.n,c.n);tri(a.p,c.p,d0.p,a.n,c.n,d0.n);}
 }
}
function lathe(cx,cz,profile){const N=world?12:64;
 for(let k=0;k<profile.length-1;k++){
  const [r0,y0]=profile[k],[r1,y1]=profile[k+1];const len=Math.hypot(y1-y0,r1-r0)||1,radial=(y1-y0)/len,ny=(r0-r1)/len;
  for(let i=0;i<N;i++){const a=i/N*Math.PI*2,b=(i+1)/N*Math.PI*2;
   const point=(r,y,t)=>[cx+r*Math.cos(t),y,cz+r*Math.sin(t)],normal=t=>[radial*Math.cos(t),ny,radial*Math.sin(t)];
   tri(point(r0,y0,a),point(r0,y0,b),point(r1,y1,b),normal(a),normal(b),normal(b));tri(point(r0,y0,a),point(r1,y1,b),point(r1,y1,a),normal(a),normal(b),normal(a));
  }
 }
}

function upload(){const p=gl.createBuffer(),n=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,p);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(positions),gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,n);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(normals),gl.STATIC_DRAW);return {p,n,count:positions.length/3};}
let roadLayoutKey='',roadLayoutRects=[],roadPaintRevision=-1,roadPaintKey='',roadPaintMeshes=[];
function roadLayout(){const k=world?[world.layoutVersion,world.config.size,...world.config.biomes].join('|'):'';if(k!==roadLayoutKey){roadLayoutKey=k;roadLayoutRects=world?WorldGenerator.roads(world.config,world.layoutVersion):[];}return roadLayoutRects;}
function legacyRoadMark(p){return world&&WorldGenerator.isRoadMark(p,world.config,world.layoutVersion);}
function isPavement(p){return !!world&&WorldGenerator.isPavement(p,world.config,world.layoutVersion);}
// Road lines are paint, clipped to existing pavement. They do not create
// selectable tiles, floating fragments, or bumps in the collision surface.
function drawRoadPaint(){
 const roads=roadLayout();if(!roads.length)return;
 if(roadPaintRevision!==renderRevision||roadPaintKey!==roadLayoutKey){
  for(const m of roadPaintMeshes){gl.deleteBuffer(m.mesh.p);gl.deleteBuffer(m.mesh.n);}roadPaintMeshes=[];
  const ground=pieces.filter(isPavement),marks={white:[],yellow:[]},clip=(r,color)=>{for(const p of ground){const b=GamePhysics.bounds(p),x0=Math.max(r.x,b.x0),x1=Math.min(r.x+r.w,b.x1),z0=Math.max(r.z,b.z0),z1=Math.min(r.z+r.d,b.z1);if(x1>x0&&z1>z0)marks[color].push([x0,z0,x1,z1,b.y1+.012]);}};
  for(const r of roads){const along=r.axis==='x',length=along?r.w:r.d,cross=along?r.d:r.w,start=along?r.x:r.z,edge=along?r.z:r.x,rect=(a,b,c,w)=>along?{x:a,z:c,w:b-a,d:w}:{x:c,z:a,w,d:b-a};
   if(r.type==='highway'){for(const at of [edge+.28,edge+cross-.40])clip(rect(start,start+length,at,.12),'white');for(const at of [edge+cross/2-.17,edge+cross/2+.07])for(let a=start;a<start+length;a+=5)clip(rect(a,Math.min(a+3,start+length),at,.10),'yellow');}
   else for(let a=start;a<start+length;a+=5){const m=rect(a,Math.min(a+2.6,start+length),edge+cross/2-.055,.11),junction=roads.some(other=>other!==r&&(other.type==='highway'||other.axis!==r.axis)&&m.x<other.x+other.w&&m.x+m.w>other.x&&m.z<other.z+other.d&&m.z+m.d>other.z);if(!junction)clip(m,'white');}
  }
  for(const [color,rects] of Object.entries(marks)){if(!rects.length)continue;positions=[];normals=[];for(const [x0,z0,x1,z1,y] of rects){const n=[0,1,0];tri([x0,y,z0],[x0,y,z1],[x1,y,z1],n,n,n);tri([x0,y,z0],[x1,y,z1],[x1,y,z0],n,n,n);}roadPaintMeshes.push({mesh:upload(),color});}
  roadPaintRevision=renderRevision;roadPaintKey=roadLayoutKey;
 }
 const night=lightState().night;for(const m of roadPaintMeshes)drawMesh(m.mesh,[0,0,0],m.color==='white'?[.80-night*.40,.82-night*.40,.83-night*.40]:[.95-night*.42,.68-night*.32,.07],1,false,true);
}
function mesh(piece){const [w,d]=dims(piece),kind=piece.kind,paved=isPavement(piece),k=w+','+d+','+kind+','+(world?'world':'brick')+','+paved;if(meshes.has(k))return meshes.get(k);positions=[];normals=[];const h=height(piece)*.4,t=kind==='brick'?.15:.08,W=w-.025,D=d-.025;
 if(paved){const a=[-w/2,-h/2,-d/2],b=[w/2,h/2,d/2];for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const u=(axis+1)%3,v=(axis+2)%3,n=[0,0,0];n[axis]=sign;const pts=[[0,0],[1,0],[1,1],[0,1]].map(([i,j])=>{const p=[0,0,0];p[axis]=sign<0?a[axis]:b[axis];p[u]=i?b[u]:a[u];p[v]=j?b[v]:a[v];return p;});tri(pts[0],pts[1],pts[2],n,n,n);tri(pts[0],pts[2],pts[3],n,n,n);}const m=upload();meshes.set(k,m);return m;}
 box(0,h/2-t/2,0,W,t,D);box(0,-t/2,-D/2+t/2,W,h-t,t);box(0,-t/2,D/2-t/2,W,h-t,t);box(-W/2+t/2,-t/2,0,t,h-t,D-2*t);box(W/2-t/2,-t/2,0,t,h-t,D-2*t);
 if(kind!=='tile')for(let x=0;x<w;x++)for(let z=0;z<d;z++)lathe(x-(w-1)/2,z-(d-1)/2,[[.28,h/2-.005],[.30,h/2+.015],[.30,h/2+.202],[.294,h/2+.218],[.28,h/2+.225],[0,h/2+.225]]);
 if(w>1&&d>1){for(let x=0;x<w-1;x++)for(let z=0;z<d-1;z++)lathe(x-(w-2)/2,z-(d-2)/2,[[.325,-h/2+.03],[.335,-h/2+.045],[.335,h/2-t],[.245,h/2-t],[.245,-h/2+.045],[.255,-h/2+.03],[.325,-h/2+.03]]);}
 else{const alongX=w>1,len=Math.max(w,d);for(let i=0;i<len-1;i++)lathe(alongX?i-(len-2)/2:0,alongX?0:i-(len-2)/2,[[.12,-h/2+.05],[.13,-h/2+.065],[.13,h/2-t],[0,h/2-t],[0,-h/2+.05],[.12,-h/2+.05]]);}
 const m=upload();meshes.set(k,m);return m;
}
positions=[];normals=[];box(0,-.1,0,48,.15,48,.04);const floorMesh=upload();
function outline(p){const [w,d]=dims(p),h=height(p)*.4,top=h+(p.kind==='tile'?0:.225),x0=p.x-.025,x1=p.x+w+.025,z0=p.z-.025,z1=p.z+d+.025,y0=p.y*.4-.02,y1=p.y*.4+top+.025;
 const corners=[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
 positions=[];normals=[];for(const [a,b] of edges){positions.push(...corners[a],...corners[b]);normals.push(0,1,0,0,1,0);}return upload();
}
let outlineMesh=null,outlineKey='';
function multiply(a,b){const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
function camera(){if(playing&&controller){target=[controller.state.x,controller.state.y+2*CharacterCatalog.heightScale(activeProfile()),controller.state.z];}const viewport=canvas.getBoundingClientRect(),previewFit=characterPreview?Math.max(1,.75/Math.max(.1,viewport.width/Math.max(1,viewport.height))):1;const distance=baseDistance*55/zoom*previewFit;const orbitPitch=playing?Math.max(.08,pitch):pitch;let eye=[target[0]+distance*Math.sin(yaw)*Math.cos(orbitPitch),target[1]+distance*Math.sin(orbitPitch),target[2]+distance*Math.cos(yaw)*Math.cos(orbitPitch)];if(playing){const f=Math.max(.76,GamePhysics.cameraDistance(target,eye,pieces));eye=eye.map((v,i)=>target[i]+(v-target[i])*f);}const aim=playing&&pitch<.08?[target[0],eye[1]-Math.tan(pitch)*Math.hypot(eye[0]-target[0],eye[2]-target[2]),target[2]]:target;const z=normalize(eye.map((v,i)=>v-aim[i])),right=normalize(cross([0,1,0],z)),up=cross(z,right);return {eye,right,up,forward:z.map(v=>-v),distance};}
function drawMesh(m,offset,c,alpha=1,floor=false,flat=false,lines=false,mode=null,paved=false){
 gl.uniform1f(sceneUniforms.pavement,paved?1:0);
 gl.uniform1f(sceneUniforms.instances,0);gl.disableVertexAttribArray(instanceLoc.offset);gl.disableVertexAttribArray(instanceLoc.color);gl.vertexAttrib3f(instanceLoc.offset,0,0,0);gl.vertexAttrib3f(instanceLoc.color,0,0,0);
 gl.uniform3fv(loc.o,offset);gl.uniform3fv(loc.c,c);gl.uniform1f(loc.a,alpha);gl.uniform1f(loc.f,floor?1:0);gl.uniform1f(loc.flat,flat?1:0);
 gl.bindBuffer(gl.ARRAY_BUFFER,m.p);gl.enableVertexAttribArray(loc.p);gl.vertexAttribPointer(loc.p,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,m.n);gl.enableVertexAttribArray(loc.n);gl.vertexAttribPointer(loc.n,3,gl.FLOAT,false,0,0);gl.drawArrays(mode===null?(lines?gl.LINES:gl.TRIANGLES):mode,0,m.count);gl.uniform1f(sceneUniforms.pavement,0);
}
const rgb=color=>[1,3,5].map(i=>Math.pow(parseInt(colors[color][1].slice(i,i+2),16)/255,1.5));
function drawPiece(p,alpha=1,c=null){if(legacyRoadMark(p))return;const [w,d]=dims(p);drawMesh(mesh(p),[p.x+w/2,p.y*.4+height(p)*.2,p.z+d/2],c||rgb(p.color),alpha,false,false,false,null,isPavement(p));}
// Shared world rendering: sky, daylight, instanced brick groups, and precipitation.
const instancing=gl.getExtension('ANGLE_instanced_arrays');
let batchRevision=-1,batchMoving=null,batches=[],clock=0,skyStartClock=0,lastSkyDraw=0,touring=false,lastFrame=null;
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
const sceneUniforms={light:gl.getUniformLocation(program,'uLight'),ambient:gl.getUniformLocation(program,'uAmbient'),fog:gl.getUniformLocation(program,'uFog'),fogRange:gl.getUniformLocation(program,'uFogRange'),snow:gl.getUniformLocation(program,'uSnow'),night:gl.getUniformLocation(program,'uNight'),instances:gl.getUniformLocation(program,'uInstances'),particle:gl.getUniformLocation(program,'uParticle'),point:gl.getUniformLocation(program,'uPointSize'),explore:gl.getUniformLocation(program,'uExplore'),focus:gl.getUniformLocation(program,'uFocus'),pavement:gl.getUniformLocation(program,'uPavement')};
const instanceLoc={offset:gl.getAttribLocation(program,'aInstanceOffset'),color:gl.getAttribLocation(program,'aInstanceColor')};
const skyVertex=`attribute vec2 aSky;varying vec2 vUV;void main(){vUV=aSky*0.5+0.5;gl_Position=vec4(aSky,0.999,1.0);}`;
const skyFragment=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUV;uniform vec3 uZenith;uniform vec3 uHorizon;uniform float uNight;uniform float uOvercast;uniform float uTime;uniform float uAspect;uniform float uSeed;uniform float uStudio;uniform vec3 uRight;uniform vec3 uUp;uniform vec3 uForward;uniform vec3 uSunDirection;uniform vec3 uMoonDirection;uniform float uTanHalfFov;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+uSeed)*43758.5453);}
void main(){vec2 uv=vUV;if(uStudio>0.5){gl_FragColor=vec4(mix(uHorizon,uZenith,smoothstep(0.0,1.0,uv.y)),1.0);return;}
vec2 ndc=uv*2.0-1.0;vec3 ray=normalize(uForward+uRight*ndc.x*uAspect*uTanHalfFov+uUp*ndc.y*uTanHalfFov);
vec3 c=mix(uHorizon,uZenith,smoothstep(0.0,0.85,ray.y));vec2 sphere=vec2(atan(ray.z,ray.x)/6.283185+0.5,asin(clamp(ray.y,-1.0,1.0))/3.141593+0.5);
float stars=step(0.991,hash(floor(sphere*vec2(280.0,160.0))))*uNight*(1.0-uOvercast)*smoothstep(0.05,0.30,ray.y);c+=vec3(stars*0.65);
float sunDistance=length(ray-normalize(uSunDirection)),moonDistance=length(ray-normalize(uMoonDirection));float sunDisk=(1.0-smoothstep(0.034,0.038,sunDistance))*smoothstep(-0.025,0.025,uSunDirection.y);float moonDisk=(1.0-smoothstep(0.029,0.033,moonDistance))*smoothstep(-0.025,0.025,uMoonDirection.y);
vec3 sunColor=mix(vec3(1.0,0.45,0.20),vec3(1.0,0.89,0.60),smoothstep(0.05,0.40,uSunDirection.y));c=mix(c,sunColor,sunDisk*(1.0-uOvercast*0.85));c=mix(c,vec3(0.87,0.94,1.0),moonDisk*(1.0-uOvercast*0.85));c+=sunColor*exp(-sunDistance*sunDistance*160.0)*0.12*(1.0-uNight)*(1.0-uOvercast);
vec2 cell=floor(vec2(fract(sphere.x+uTime*0.00005),sphere.y)*vec2(92.0,48.0));float cloud=step(0.61-uOvercast*0.28,hash(vec2(floor(cell.x/4.0),floor(cell.y/2.0))))*step(0.2,hash(cell))*smoothstep(0.10,0.22,ray.y)*(1.0-smoothstep(0.75,0.98,ray.y));vec3 cloudColor=mix(vec3(0.95,0.97,1.0),vec3(0.16,0.20,0.31),uNight);c=mix(c,cloudColor,cloud*mix(0.42,0.73,uOvercast));gl_FragColor=vec4(c,1.0);}`;
const skyProgram=gl.createProgram();gl.attachShader(skyProgram,shader(gl.VERTEX_SHADER,skyVertex));gl.attachShader(skyProgram,shader(gl.FRAGMENT_SHADER,skyFragment));gl.linkProgram(skyProgram);if(!gl.getProgramParameter(skyProgram,gl.LINK_STATUS))throw Error('Sky shader linking failed');
const skyBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),gl.STATIC_DRAW);
const skyLoc={p:gl.getAttribLocation(skyProgram,'aSky'),zenith:gl.getUniformLocation(skyProgram,'uZenith'),horizon:gl.getUniformLocation(skyProgram,'uHorizon'),night:gl.getUniformLocation(skyProgram,'uNight'),overcast:gl.getUniformLocation(skyProgram,'uOvercast'),time:gl.getUniformLocation(skyProgram,'uTime'),right:gl.getUniformLocation(skyProgram,'uRight'),up:gl.getUniformLocation(skyProgram,'uUp'),forward:gl.getUniformLocation(skyProgram,'uForward'),sun:gl.getUniformLocation(skyProgram,'uSunDirection'),moon:gl.getUniformLocation(skyProgram,'uMoonDirection'),fov:gl.getUniformLocation(skyProgram,'uTanHalfFov'),aspect:gl.getUniformLocation(skyProgram,'uAspect'),seed:gl.getUniformLocation(skyProgram,'uSeed'),studio:gl.getUniformLocation(skyProgram,'uStudio')};
function lightState(){
 if(characterPreview)return {zenith:[.055,.105,.19],horizon:[.14,.24,.36],light:[-.55,1.1,1.35],ambient:[.39,.42,.48],night:0,overcast:1};
 return SkyCycle.sample(environment.time,clock-skyStartClock,environment.rain,environment.snowing);
}
function drawSky(aspect,cam){
 lastSkyDraw=clock;
 const s=lightState();gl.useProgram(skyProgram);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.BLEND);gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);gl.enableVertexAttribArray(skyLoc.p);gl.vertexAttribPointer(skyLoc.p,2,gl.FLOAT,false,0,0);gl.uniform3fv(skyLoc.zenith,s.zenith);gl.uniform3fv(skyLoc.horizon,s.horizon);gl.uniform1f(skyLoc.night,s.night);gl.uniform1f(skyLoc.overcast,s.overcast);gl.uniform1f(skyLoc.time,clock);gl.uniform3fv(skyLoc.right,cam.right);gl.uniform3fv(skyLoc.up,cam.up);gl.uniform3fv(skyLoc.forward,cam.forward);gl.uniform3fv(skyLoc.sun,s.sun||[0,1,0]);gl.uniform3fv(skyLoc.moon,s.moon||[0,-1,0]);gl.uniform1f(skyLoc.fov,Math.tan((playing?.90:.62)/2));gl.uniform1f(skyLoc.aspect,aspect);gl.uniform1f(skyLoc.seed,(world?.config.seed||73521)%4096);gl.uniform1f(skyLoc.studio,characterPreview?1:0);gl.drawArrays(gl.TRIANGLES,0,6);gl.disableVertexAttribArray(skyLoc.p);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.useProgram(program);
 gl.uniform3fv(sceneUniforms.light,s.light);gl.uniform3fv(sceneUniforms.ambient,s.ambient);gl.uniform3fv(sceneUniforms.fog,s.horizon);gl.uniform2f(sceneUniforms.fogRange,Math.max(55,baseDistance*.9),Math.max(120,baseDistance*2.5));gl.uniform1f(sceneUniforms.snow,environment.snow?1:0);gl.uniform1f(sceneUniforms.night,s.night);gl.uniform1f(sceneUniforms.particle,0);gl.uniform1f(sceneUniforms.point,3);gl.uniform1f(sceneUniforms.instances,0);
}
function rebuildBatches(){
 for(const b of batches)gl.deleteBuffer(b.instances);batches=[];
 const grouped=new Map();for(const p of pieces){if(p.id===moving||legacyRoadMark(p))continue;const [w,d]=dims(p),paved=isPavement(p),k=w+','+d+','+p.kind+','+paved;let group=grouped.get(k);if(!group){group={shape:p,paved,values:[],count:0};grouped.set(k,group);}group.values.push(p.x+w/2,p.y*.4+height(p)*.2,p.z+d/2,...rgb(p.color));group.count++;}
 for(const group of grouped.values()){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(group.values),gl.STATIC_DRAW);batches.push({mesh:mesh(group.shape),paved:group.paved,instances:buffer,count:group.count});}
 batchRevision=renderRevision;batchMoving=moving;
}
function drawBatches(){
 if(!instancing){for(const p of pieces)if(p.id!==moving)drawPiece(p);return;}
 if(batchRevision!==renderRevision||batchMoving!==moving)rebuildBatches();gl.uniform1f(sceneUniforms.instances,1);gl.uniform1f(loc.a,1);gl.uniform1f(loc.f,0);gl.uniform1f(loc.flat,0);gl.uniform3fv(loc.o,[0,0,0]);
 gl.enableVertexAttribArray(instanceLoc.offset);gl.enableVertexAttribArray(instanceLoc.color);instancing.vertexAttribDivisorANGLE(instanceLoc.offset,1);instancing.vertexAttribDivisorANGLE(instanceLoc.color,1);
 for(const b of batches){gl.uniform1f(sceneUniforms.pavement,b.paved?1:0);gl.bindBuffer(gl.ARRAY_BUFFER,b.mesh.p);gl.enableVertexAttribArray(loc.p);gl.vertexAttribPointer(loc.p,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,b.mesh.n);gl.enableVertexAttribArray(loc.n);gl.vertexAttribPointer(loc.n,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,b.instances);gl.vertexAttribPointer(instanceLoc.offset,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(instanceLoc.color,3,gl.FLOAT,false,24,12);instancing.drawArraysInstancedANGLE(gl.TRIANGLES,0,b.mesh.count,b.count);}
 gl.uniform1f(sceneUniforms.pavement,0);instancing.vertexAttribDivisorANGLE(instanceLoc.offset,0);instancing.vertexAttribDivisorANGLE(instanceLoc.color,0);gl.disableVertexAttribArray(instanceLoc.offset);gl.disableVertexAttribArray(instanceLoc.color);gl.uniform1f(sceneUniforms.instances,0);
}
const precipitation={p:gl.createBuffer(),n:gl.createBuffer(),count:0};
function drawWeather(){
 if(!environment.rain&&!environment.snowing)return;const spread=world?Math.max(world.width,world.depth)*.6:24,ceiling=world?Math.max(24,...pieces.map(p=>(p.y+height(p))*.4+12)):25;const vertices=[],normal=[];
 function particles(snow){const count=snow?180:200,speed=snow?2.1:18;for(let i=0;i<count;i++){const a=((i*0.61803398875)%1)*2-1,b=((i*0.41421356237)%1)*2-1;const x=target[0]+a*spread+(snow?Math.sin(clock*.7+i)*.65:0),z=target[2]+b*spread,y=((i*.73*ceiling-clock*speed)%ceiling+ceiling)%ceiling;vertices.push(x,y,z);normal.push(0,1,0);if(!snow){vertices.push(x-.15,y+.9,z);normal.push(0,1,0);}}}
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 for(const snow of [false,true]){if(snow?!environment.snowing:!environment.rain)continue;vertices.length=0;normal.length=0;particles(snow);precipitation.count=vertices.length/3;gl.bindBuffer(gl.ARRAY_BUFFER,precipitation.p);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,precipitation.n);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(normal),gl.DYNAMIC_DRAW);gl.uniform1f(sceneUniforms.particle,snow?1:0);gl.uniform1f(sceneUniforms.point,Math.min(window.devicePixelRatio||1,2)*(snow?3.3:2));drawMesh(precipitation,[0,0,0],snow?[.98,.99,1]:[.60,.78,.95],snow?.88:.45,false,true,false,snow?gl.POINTS:gl.LINES);}
 gl.uniform1f(sceneUniforms.particle,0);gl.depthMask(true);gl.disable(gl.BLEND);
}
function stopTour(){touring=false;q('#bb-tour').textContent='Tour world';}

let studioShadow=null;
function drawStudioStand(){
 drawMesh(mesh({rows:4,cols:4,turn:0,kind:'tile'}),[0,-.2,0],[.11,.20,.32]);
 if(!studioShadow){positions=[];normals=[];const n=[0,1,0];for(let i=0;i<64;i++){const a=i*Math.PI/32,b=(i+1)*Math.PI/32;tri([0,0,0],[1.12*Math.cos(a),0,.66*Math.sin(a)],[1.12*Math.cos(b),0,.66*Math.sin(b)],n,n,n);}studioShadow=upload();}
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);drawMesh(studioShadow,[0,.012,0],[.015,.028,.06],.45,false,true);gl.depthMask(true);gl.disable(gl.BLEND);
}
function draw(){const bounds=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.round(bounds.width*dpr)),h=Math.max(1,Math.round(bounds.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const aspect=w/h,f=1/Math.tan((playing?.90:.62)/2),near=.1,far=2000;const projection=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]),cam=camera();
 if(characterPreview&&root.dataset.dock==='side'&&root.dataset.fit!=='true')projection[8]=Math.min(.48,(q('#bb-inventory').getBoundingClientRect().width+36)/bounds.width);
 drawSky(aspect,cam);
 const z=cam.forward.map(v=>-v),x=cam.right,y=cam.up,eye=cam.eye;const view=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);const mvp=multiply(projection,view);gl.uniformMatrix4fv(loc.m,false,mvp);gl.uniform3fv(loc.e,eye);gl.uniform1f(sceneUniforms.explore,playing?1:0);gl.uniform3fv(sceneUniforms.focus,target);
 gl.disable(gl.BLEND);gl.depthMask(true);if(characterPreview)drawStudioStand();else if(!world)drawMesh(floorMesh,[Math.round(target[0]),0,Math.round(target[2])],[.1,.14,.2],1,true);
 if(!characterPreview){drawBatches();drawRoadPaint();ensureNPCs();if(npcs.length){characterRenderer.begin(mvp,eye,lightState());for(const npc of npcs)characterRenderer.draw(npc.profile,npc.state);}}
 if(characterPreview||playing){characterRenderer.begin(mvp,eye,lightState());if(characterPreview){const a=studioAnimationSnapshot();characterRenderer.draw(a.profile,a.state,true,a.animated);drawStudioAnimationEffects(a);}else characterRenderer.draw(activeProfile(),ensurePhysics().state);}
 if(!characterPreview&&debris.length){characterRenderer.begin(mvp,eye,lightState());const dm=mesh({rows:1,cols:1,turn:0,kind:'brick'});for(const d of debris)characterRenderer.debris(dm,d);}
 if(playing){characterRenderer.begin(mvp,eye,lightState());drawCombatEffects();drawHeroEffects();}
 gl.useProgram(program);
 if(playing)drawRebuildGuide();if(!characterPreview)drawMapPortals();
 const p=pieces.find(b=>b.id===selected);if(p&&p.id!==moving){const k=JSON.stringify(p);if(k!==outlineKey){if(outlineMesh){gl.deleteBuffer(outlineMesh.p);gl.deleteBuffer(outlineMesh.n);}outlineMesh=outline(p);outlineKey=k;}drawMesh(outlineMesh,[0,0,0],[.72,.85,1],1,false,true,true);}
 if(ghostVisible&&(tool==='add'||tool==='move')){const ok=ghostCheck().ok;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);const c=ok?rgb(ghost.color).map((v,i)=>v*.75+[.04,.12,.06][i]):[.95,.035,.045];drawPiece(ghost,.55,c);gl.depthMask(true);gl.disable(gl.BLEND);}
 if(!characterPreview){drawVolcanoEffects(mvp,cam);gl.useProgram(program);drawWeather();}updateSpawnHandle(mvp,bounds);dirty=false;
}
function ray(clientX,clientY){const b=canvas.getBoundingClientRect(),aspect=b.width/b.height,nx=(clientX-b.left)/b.width*2-1,ny=1-(clientY-b.top)/b.height*2,cam=camera(),t=Math.tan(.62/2);return {o:cam.eye,d:normalize(cam.forward.map((v,i)=>v+cam.right[i]*nx*t*aspect+cam.up[i]*ny*t))};}
function boxHit(r,p){const [w,d]=dims(p),mins=[p.x,p.y*.4,p.z],maxs=[p.x+w,(p.y+height(p))*.4+(p.kind==='tile'?0:.225),p.z+d];let near=0,far=Infinity;for(let i=0;i<3;i++){if(Math.abs(r.d[i])<1e-8){if(r.o[i]<mins[i]||r.o[i]>maxs[i])return null;continue;}let a=(mins[i]-r.o[i])/r.d[i],b=(maxs[i]-r.o[i])/r.d[i];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;}return far>=0?near:null;}
function pick(r){let closest=Infinity,picked=null;for(const p of pieces){if(p.id===moving||legacyRoadMark(p))continue;const t=boxHit(r,p);if(t!==null&&t<closest){closest=t;picked=p;}}return picked;}
function positionAt(clientX,clientY){const r=ray(clientX,clientY);let best=null;
 for(const p of pieces){if(p.id===moving||legacyRoadMark(p))continue;const level=(p.y+height(p))*.4;if(Math.abs(r.d[1])<1e-8)continue;const t=(level-r.o[1])/r.d[1];if(t<0)continue;const x=r.o[0]+r.d[0]*t,z=r.o[2]+r.d[2]*t,[w,d]=dims(p);if(x>=p.x&&x<=p.x+w&&z>=p.z&&z<=p.z+d&&(!best||t<best.t))best={x,z,y:p.y+height(p),t};}
 if(!best&&Math.abs(r.d[1])>1e-8){const t=-r.o[1]/r.d[1];if(t>0)best={x:r.o[0]+r.d[0]*t,z:r.o[2]+r.d[2]*t,y:0,t};}
 if(!best)return;const [w,d]=dims(ghost);ghost.x=Math.round(best.x-w/2);ghost.z=Math.round(best.z-d/2);ghost.y=best.y;ghostVisible=true;sync();
}
function fit(){
 if(characterPreview){target=[0,2.52,0];baseDistance=10.7;zoom=55;dirty=true;return;}if(playing){zoom=55;baseDistance=11.5;pitch=.28;dirty=true;return;}
 if(!pieces.length){target=[0,1,0];baseDistance=35;}else{let min=[Infinity,0,Infinity],max=[-Infinity,0,-Infinity];for(const p of pieces){const [w,d]=dims(p);min[0]=Math.min(min[0],p.x);min[2]=Math.min(min[2],p.z);max[0]=Math.max(max[0],p.x+w);max[1]=Math.max(max[1],(p.y+height(p))*.4+.225);max[2]=Math.max(max[2],p.z+d);}target=min.map((v,i)=>(v+max[i])/2);const radius=Math.max(3,Math.hypot(...max.map((v,i)=>v-min[i]))/2);const b=canvas.getBoundingClientRect();baseDistance=radius/Math.sin(.31)*1.25*Math.max(1,(b.height||root.clientHeight||window.innerHeight||570)/(b.width||root.clientWidth||window.innerWidth||780));}
 zoom=55;q('#bb-zoom').value=55;yaw=.65;pitch=.65;topView=false;dirty=true;
}
function lookAtSky(){if(characterPreview)switchPanel('world');stopTour();const cam=camera(),sky=lightState(),direction=normalize(sky.sun[1]>=0?sky.sun:sky.moon);if(!playing)target=cam.eye.map((v,i)=>v+direction[i]*cam.distance);pitch=-Math.asin(clamp(direction[1],-.975,.975));yaw=Math.atan2(-direction[0],-direction[2]);topView=false;dirty=true;draw();}
q('#bb-sky-view').addEventListener('click',lookAtSky);
q('#bb-game-sky').addEventListener('click',()=>{closeGameMenu();lookAtSky();});
q('#bb-fit').addEventListener('click',fit);q('#bb-top').addEventListener('click',()=>{topView=!topView;pitch=topView?1.55:.65;yaw=topView?0:.65;dirty=true;});
function setZoom(v){zoom=clamp(Number(v),playing?35:20,playing?85:150);q('#bb-zoom').value=zoom;q('#bb-studio-zoom').value=zoom;dirty=true;}
q('#bb-zoom').addEventListener('input',e=>setZoom(e.target.value));canvas.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom*Math.exp(-e.deltaY*.001));},{passive:false});
const pointers=new Map();let gesture=null;
function cancelCameraGesture(){for(const id of pointers.keys()){try{canvas.releasePointerCapture?.(id);}catch{}}pointers.clear();gesture=null;}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(mapPlacing&&!e.shiftKey&&e.button!==2)updateMapSpawnDraft(e.clientX,e.clientY);stopTour();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===1)gesture={startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,drag:false,multi:false,pan:e.shiftKey||e.button===2,spawnPlace:mapPlacing&&!e.shiftKey&&e.button!==2};else{gesture.multi=true;const [a,b]=[...pointers.values()];gesture.pinch=Math.hypot(a[0]-b[0],a[1]-b[1]);gesture.center=[(a[0]+b[0])/2,(a[1]+b[1])/2];}});
function panCamera(dx,dy){if(playing||characterPreview)return;const cam=camera(),scale=cam.distance*Math.tan(.31)*2/canvas.getBoundingClientRect().height;target=target.map((v,i)=>v-cam.right[i]*dx*scale+cam.up[i]*dy*scale);target[1]=Math.max(0,target[1]);dirty=true;}
canvas.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId)){if(mapPlacing){updateMapSpawnDraft(e.clientX,e.clientY);return;}if(e.pointerType==='mouse'&&(tool==='add'||tool==='move'))positionAt(e.clientX,e.clientY);return;}
 pointers.set(e.pointerId,[e.clientX,e.clientY]);if(!gesture)return;
 if(pointers.size>=2){const [a,b]=[...pointers.values()],pinch=Math.hypot(a[0]-b[0],a[1]-b[1]),center=[(a[0]+b[0])/2,(a[1]+b[1])/2];if(gesture.pinch>0)setZoom(zoom*pinch/gesture.pinch);if(gesture.center)panCamera(center[0]-gesture.center[0],center[1]-gesture.center[1]);gesture.pinch=pinch;gesture.center=center;gesture.drag=true;return;}
 if(gesture.spawnPlace&&!gesture.multi){updateMapSpawnDraft(e.clientX,e.clientY);gesture.drag=true;return;}
 if(Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)>5)gesture.drag=true;
 if(gesture.drag){const dx=e.clientX-gesture.lastX,dy=e.clientY-gesture.lastY;if(gesture.pan)panCamera(dx,dy);else{yaw-=dx*.008;if(playing&&GameWeapons.get(activeProfile().held).style==='fire'&&controller.state.speed<.01)controller.state.heading=yaw+Math.PI;pitch=clamp(pitch+dy*.008,playing?-1.35:characterPreview?-.35:-1.5,playing?1.35:characterPreview?.6:1.55);dirty=true;topView=false;}}
 gesture.lastX=e.clientX;gesture.lastY=e.clientY;
});
canvas.addEventListener('pointerup',e=>{const tap=gesture&&!gesture.drag&&!gesture.multi;pointers.delete(e.pointerId);if(gesture?.spawnPlace&&!gesture.multi){placeMapSpawn(e.clientX,e.clientY);}else if(tap){if(mapPlacing){placeMapSpawn(e.clientX,e.clientY);}else if(tool==='add'||tool==='move')positionAt(e.clientX,e.clientY);else if(tool==='select'){const p=pick(ray(e.clientX,e.clientY));selected=p?.id||null;if(p)template={rows:p.rows,cols:p.cols,kind:p.kind,color:p.color,turn:p.turn};sync();}}if(!pointers.size)gesture=null;});
for(const ev of ['pointercancel','lostpointercapture'])canvas.addEventListener(ev,e=>{pointers.delete(e.pointerId);if(!pointers.size)gesture=null;});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&gameScreenActive())return;
 if(playing||characterPreview)return;
 if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
 if(e.target.tagName==='BUTTON'&&[' ','Enter'].includes(e.key))return;
 if(!q('#bb-dialog').hidden){if(e.key==='Escape')closeDialog();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);return;}
 if(e.key==='Escape'){if(mapPlacing){cancelMapSpawnPlacement();return;}setTool('select');return;}
 if(e.key.toLowerCase()==='r'){e.preventDefault();updateTemplate({turn:(template.turn+1)%4});}
 if(e.key===' '&&(tool==='add'||tool==='move')){e.preventDefault();place();}
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();}
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(tool==='add'||tool==='move'){if(e.key==='ArrowLeft')ghost.x--;if(e.key==='ArrowRight')ghost.x++;if(e.key==='ArrowUp')ghost.z--;if(e.key==='ArrowDown')ghost.z++;sync();}else{if(e.key==='ArrowLeft')yaw-=.1;if(e.key==='ArrowRight')yaw+=.1;if(e.key==='ArrowUp')pitch=clamp(pitch+.1,-1.5,1.55);if(e.key==='ArrowDown')pitch=clamp(pitch-.1,-1.5,1.55);dirty=true;}}
});
let dialogMode='save',dialogFocus=null;
function currentMapBuild(){return {format:'brick-builder',version:4,npcs:npcData(),characters:characterData(),player:controller?{...controller.state}:savedPlayer,broken:broken.map(e=>({id:e.id,originals:clone(e.originals)})),pieces:clone(pieces),world:world?{config:{...world.config,...environment},layoutVersion:world.layoutVersion,width:world.width,depth:world.depth}:null,environment:{...environment}};}
function data(){const build=currentMapBuild();return {...build,maps:exportMapNetwork(build)};}
function showDialog(mode){if(playing)stopPlaying(false);dialogMode=mode;dialogFocus=document.activeElement;q('#bb-dialog').hidden=false;q('#bb-dialog-title').textContent=mode==='save'?'Save your world':mode==='new'?'Start a new world':'Continue your adventure';q('#bb-build-code').hidden=mode==='new';q('#bb-build-code').open=false;q('#bb-dialog-message').textContent='';
 q('#bb-data').hidden=mode==='new';q('#bb-data').value=mode==='save'?JSON.stringify(data(),null,2):'';q('#bb-data').readOnly=mode==='save';
 q('#bb-dialog-help').textContent=mode==='save'?'Save a project to keep every map, spawn point, connection, character, and drawing together. Your progress also saves automatically on this device.':mode==='new'?'Clear the selected map. Other maps and your characters stay in your collection. Undo restores this map.':'Choose a saved world file to bring back your creations and characters. Advanced build code also accepts a copied save. Undo can recover your current world.';
 q('#bb-download').hidden=mode!=='save';q('#bb-copy-code').hidden=mode!=='save';q('#bb-load-file').hidden=mode!=='open';q('#bb-load-code').hidden=mode==='save';q('#bb-load-code').textContent=mode==='new'?'Start new world':'Load world';q('#bb-dialog').querySelector('label').hidden=mode==='new';for(const el of root.querySelectorAll('header,aside,footer,.stage-tools,.counts,canvas,.stage-bottom'))el.inert=true;q('#bb-dialog-close').focus();
}
function closeDialog(){q('#bb-dialog').hidden=true;for(const el of root.querySelectorAll('header,aside,footer,.stage-tools,.counts,canvas,.stage-bottom'))el.inert=false;dialogFocus?.focus();}
function parseBuild(text,nested=false){
 if(text.length>64000000)throw Error('The build file is too large.');let obj;try{obj=JSON.parse(text);}catch(e){throw Error('This is not valid JSON build code.');}if(obj?.format!=='brick-builder'||![1,2,3,4].includes(obj.version)||!Array.isArray(obj.pieces))throw Error('This file is not a supported Free Build project.');
 if(nested&&obj.maps!==undefined)throw Error('Nested map collections are not supported.');
 const ids=new Set();function piece(p,i,legacy=false){const id=legacy?i+1:p.id;if(!Number.isInteger(id)||id<1||id>1000000||ids.has(id))throw Error('Invalid or duplicate brick id.');ids.add(id);const result={id,rows:p.rows,cols:p.cols,kind:p.kind,color:p.color,turn:p.turn,x:p.x,y:p.y,z:p.z};if(typeof p.group==='string'&&p.group.length<100)result.group=p.group;const bad=validatePiece(result);if(bad)throw Error(bad);return result;}
 const list=obj.pieces.map((p,i)=>piece(p,i,obj.version<3)),check=inspect(list);if(!check.ok)throw Error(check.reason);list.world=obj.world?worldMeta(obj.world.config,obj.world.layoutVersion??1):null;list.environment=obj.environment&&WorldGenerator.times.includes(obj.environment.time)?{time:obj.environment.time,rain:obj.environment.rain===true,snow:obj.environment.snow===true,snowing:obj.environment.snowing===true}:{time:'day',rain:false,snow:false,snowing:false};list.characters=parseCharacters(obj.characters);list.player=validPlayer(obj.player)?{x:obj.player.x,y:obj.player.y,z:obj.player.z,heading:obj.player.heading,vy:0,grounded:true,phase:0,speed:0,running:false,attack:0}:null;
 if(obj.broken!==undefined&&!Array.isArray(obj.broken))throw Error('Invalid smashed objects.');const damageIds=new Set();list.broken=(obj.broken||[]).map(e=>{if(!Number.isInteger(e.id)||e.id<1||damageIds.has(e.id)||!Array.isArray(e.originals)||!e.originals.length)throw Error('Invalid smashed object.');damageIds.add(e.id);return {id:e.id,originals:e.originals.map((p,i)=>piece(p,i)),progress:0};});if(ids.size>12000)throw Error('This world has reached 12,000 pieces.');list.nextId=Math.max(0,...ids)+1;if(obj.npcs!==undefined){list.npcs=NPCWorld.serialize(NPCWorld.restore(obj.npcs,list,list.world));}if(!nested)list.maps=parseMapNetwork(obj.maps,list);return list;
}
function loadBuild(text){const list=parseBuild(text);if(playing)stopPlaying(false);leavePreview();commit(list);world=list.world;environment=list.environment;skyStartClock=clock;restoreAdventure(list);restoreMapNetwork(list.maps);renderRevision++;restoreWorldControls();nextId=list.nextId;selected=null;moving=null;tool=world?'orbit':'add';ghost={...template,x:-2,z:-1,y:0,id:-1};ghostVisible=!world;fit();updateGameVisibility();sync();persist();}
q('#bb-save').addEventListener('click',()=>showDialog('save'));q('#bb-open').addEventListener('click',()=>showDialog('open'));q('#bb-new').addEventListener('click',()=>showDialog('new'));q('#bb-dialog-close').addEventListener('click',closeDialog);
q('#bb-load-code').addEventListener('click',()=>{try{if(dialogMode==='new'){leavePreview();commit([]);resetAdventure();world=null;environment={time:'day',rain:false,snow:false,snowing:false};renderRevision++;refreshMapSpawnPositions();stopTour();nextId=1;selected=null;moving=null;tool='add';ghost={...template,x:-2,z:-1,y:0,id:-1};ghostVisible=true;fit();sync();persist();}else loadBuild(q('#bb-data').value);closeDialog();}catch(e){q('#bb-dialog-message').textContent=e.message;}});
q('#bb-download').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([q('#bb-data').value],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='my-brick-build.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);q('#bb-dialog-message').textContent='If downloading is blocked here, copy the code or use the full app.';});
q('#bb-copy-code').addEventListener('click',async()=>{q('#bb-data').select();try{await navigator.clipboard.writeText(q('#bb-data').value);q('#bb-dialog-message').textContent='Build code copied.';}catch(e){q('#bb-dialog-message').textContent='The code is selected. Use your device’s Copy action.';}});
q('#bb-load-file').addEventListener('click',()=>q('#bb-file').click());q('#bb-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>64000000)throw Error('The file is too large.');q('#bb-data').value=await file.text();q('#bb-dialog-message').textContent='File ready. Press Load build.';}catch(err){q('#bb-dialog-message').textContent=err.message;}e.target.value='';});
q('#bb-dialog').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeDialog();}if(e.key==='Tab'){const buttons=[...q('#bb-dialog').querySelectorAll('button,textarea')].filter(el=>!el.hidden&&!el.disabled);if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0].focus();}}});
const biomeInputs=new Map();
for(const [id,name] of WorldGenerator.biomes){const label=document.createElement('label');label.className='biome-choice';const input=document.createElement('input');input.type='checkbox';input.value=id;input.checked=id==='forest'||id==='mountains';input.setAttribute('aria-label',name);const span=document.createElement('span');span.textContent=name;label.appendChild(input);label.appendChild(span);q('#bb-biomes').appendChild(label);biomeInputs.set(id,input);input.addEventListener('change',()=>{q('#bb-world-message').textContent='Press Generate to update the terrain. You can restore the previous world with Undo.';});}
function worldConfig(){return {mountainShape:q('#bb-mountain-shape').value||'mixed',mountainScale:q('#bb-mountain-scale').value||'mixed',biomes:[...biomeInputs].filter(([,i])=>i.checked).map(([id])=>id),time:q('#bb-time').value||'day',rain:q('#bb-rain').checked,snow:q('#bb-snow').checked,snowing:q('#bb-snowing').checked,size:Number(q('#bb-world-size').value)||24,seed:Number(q('#bb-seed').value)};}
function restoreWorldControls(){if(!world)return;const c=world.config;q('#bb-mountain-shape').value=c.mountainShape||'mixed';q('#bb-mountain-scale').value=c.mountainScale||'mixed';for(const [id,input] of biomeInputs)input.checked=c.biomes.includes(id);q('#bb-world-size').value=c.size;q('#bb-seed').value=c.seed;q('#bb-time').value=environment.time;q('#bb-rain').checked=environment.rain;q('#bb-snow').checked=environment.snow;q('#bb-snowing').checked=environment.snowing;if(world.layoutVersion===1&&c.biomes.some(b=>b==='city'||b.startsWith('castle')))q('#bb-world-message').textContent='This saved world uses the original building scale. Generate a new world for larger buildings; Undo restores this one.';}
function worldMeta(config,layoutVersion=1){if(![1,2].includes(layoutVersion))throw Error('Unsupported world layout.');const c=WorldGenerator.validate(config),B=WorldGenerator.districtSize(c,layoutVersion),columns=Math.ceil(Math.sqrt(c.biomes.length)),rows=Math.ceil(c.biomes.length/columns),width=columns*B,depth=rows*B,ox=-Math.floor(width/2),oz=-Math.floor(depth/2);return {config:c,layoutVersion,width,depth,regions:c.biomes.map((biome,i)=>({biome,x:ox+i%columns*B,z:oz+Math.floor(i/columns)*B,width:B,depth:B}))};}
function switchPanel(panel){if(panel==='characters'){showCharacterStudio();return;}if(playing)stopPlaying(false);leavePreview();currentPanel=panel;q('#bb-character-panel').hidden=true;q('#bb-art-panel').hidden=true;q('#bb-photo-panel').hidden=true;q('#bb-character-tab').setAttribute('aria-pressed','false');q('#bb-world-panel').hidden=panel!=='world';q('#bb-bricks-panel').hidden=panel!=='bricks';q('#bb-world-tab').setAttribute('aria-pressed',String(panel==='world'));q('#bb-bricks-tab').setAttribute('aria-pressed',String(panel==='bricks'));setTool(panel==='world'?'orbit':'add');updateGameVisibility();}
function generateWorld(config=worldConfig(),initial=false){
 const generated=WorldGenerator.generate(config),check=inspect(generated.pieces);if(!check.ok)throw Error('Could not connect the generated world: '+check.reason);
 if(!initial)remember();leavePreview();resetAdventure();pieces=clone(generated.pieces);world={config:generated.config,layoutVersion:generated.layoutVersion,width:generated.width,depth:generated.depth,regions:generated.regions};environment={time:config.time,rain:config.rain,snow:config.snow,snowing:config.snowing};skyStartClock=clock;nextId=pieces.length+1;renderRevision++;selected=null;moving=null;tool='orbit';ghostVisible=false;stopTour();ensureNPCs();refreshMapSpawnPositions();fit();baseDistance*=.90;pitch=.52;restoreWorldControls();persist();sync();q('#bb-world-message').dataset.error='false';q('#bb-world-message').textContent=`${config.biomes.length} ${config.biomes.length===1?'environment':'environments'} · ${world.width} × ${world.depth} studs · Seed ${config.seed}. Switch to Bricks to edit.`;dirty=true;return {environments:config.biomes,pieces:pieces.length,seed:config.seed,width:world.width,depth:world.depth};
}
function handleGenerate(reroll=false){if(reroll)q('#bb-seed').value=Math.floor(Math.random()*99999999);const b=q('#bb-generate');b.disabled=true;try{generateWorld();}catch(e){q('#bb-world-message').textContent=e.message;q('#bb-world-message').dataset.error='true';}finally{b.disabled=false;}}
function applyAtmosphere(){const time=q('#bb-time').value;if(!WorldGenerator.times.includes(time))return;if(time!==environment.time)skyStartClock=clock;environment={time,rain:q('#bb-rain').checked,snow:q('#bb-snow').checked,snowing:q('#bb-snowing').checked};if(world)world.config={...world.config,...environment};persist();sync();dirty=true;}
for(const id of ['bb-mountain-shape','bb-mountain-scale'])q('#'+id).addEventListener('change',()=>{q('#bb-world-message').textContent='Generate to apply the selected mountain shape and height. Undo restores the previous terrain.';});
q('#bb-generate').addEventListener('click',()=>handleGenerate());q('#bb-reroll').addEventListener('click',()=>handleGenerate(true));q('#bb-world-tab').addEventListener('click',()=>switchPanel('world'));q('#bb-bricks-tab').addEventListener('click',()=>switchPanel('bricks'));for(const k of ['time','rain','snow','snowing'])q('#bb-'+k).addEventListener('change',applyAtmosphere);
q('#bb-tour').addEventListener('click',()=>{touring=!touring;q('#bb-tour').textContent=touring?'Pause tour':'Tour world';if(touring){if(playing)stopPlaying(false);if(characterPreview)switchPanel('world');setTool('orbit');}dirty=true;});
/* VOLCANO_WORLD */
/* CHARACTER_GAME */
/* MAP_NETWORK */

function registerWorldTool(register){register({name:'generate_lego_world',description:'Replace the current build with an editable procedural LEGO world combining selected environments, a sky, time of day, and optional rain or snow. The previous build can be restored with Undo.',inputSchema:{type:'object',properties:{mountainShape:{type:'string',enum:WorldGenerator.mountainShapes.map(v=>v[0])},mountainScale:{type:'string',enum:WorldGenerator.mountainScales.map(v=>v[0])},biomes:{type:'array',minItems:1,uniqueItems:true,items:{type:'string',enum:WorldGenerator.biomes.map(b=>b[0])}},time:{type:'string',enum:WorldGenerator.times},rain:{type:'boolean'},snow:{type:'boolean'},snowing:{type:'boolean'},size:{type:'integer',enum:[16,24,32]},seed:{type:'integer',minimum:0,maximum:99999999}},required:['biomes','time','rain','snow','snowing','size','seed'],additionalProperties:false},execute(input){const result=generateWorld(input);draw();return result;}});}

try{const saved=localStorage.getItem('lego-free-build-v1');if(saved){pieces=parseBuild(saved);savedBuildLoaded=true;world=pieces.world;environment=pieces.environment;restoreAdventure(pieces);restoreMapNetwork(pieces.maps);renderRevision++;restoreWorldControls();nextId=pieces.nextId;if(pieces.length)fit();}}catch(e){}
const lifecycle=new AbortController();
if(document.modelContext?.registerTool){const register=t=>{try{Promise.resolve(document.modelContext.registerTool(t,{signal:lifecycle.signal})).catch(()=>{});}catch(e){}};
 registerWorldTool(register);registerCharacterTools(register);registerNPCTools(register);registerMapTools(register);
 register({name:'read_brick_build',description:'Read the pieces and positions in the current 3D brick build.',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:()=>data()});
 register({name:'place_bricks',description:'Connect a batch of bricks, plates, or tiles to the current build. Coordinates are whole studs; y is plate heights (three plates per brick). Pieces must not overlap, and every component must connect to ground through studs.',inputSchema:{type:'object',properties:{pieces:{type:'array',minItems:1,maxItems:1000,items:{type:'object',properties:{rows:{type:'integer'},cols:{type:'integer'},kind:{type:'string',enum:['brick','plate','tile']},color:{type:'integer',minimum:0,maximum:17},turn:{type:'integer',minimum:0,maximum:3},x:{type:'integer'},z:{type:'integer'},y:{type:'integer'}},required:['rows','cols','kind','color','turn','x','y','z'],additionalProperties:false}}},required:['pieces'],additionalProperties:false},execute(input){if(!input||!Array.isArray(input.pieces)||!input.pieces.length||input.pieces.length>1000)throw Error('Expected a nonempty batch of pieces.');const added=input.pieces.map((p,i)=>({...p,id:nextId+i})),list=[...pieces,...added],check=inspect(list);if(!check.ok)throw Error(check.reason);commit(list);nextId+=added.length;selected=null;moving=null;setTool('select');draw();return {placedIds:added.map(p=>p.id),total:pieces.length};}});
 register({name:'move_brick',description:'Move or rotate one existing piece. Rejects collisions or disconnected assemblies without changing the build.',inputSchema:{type:'object',properties:{id:{type:'integer'},x:{type:'integer'},y:{type:'integer'},z:{type:'integer'},turn:{type:'integer',minimum:0,maximum:3}},required:['id','x','y','z','turn'],additionalProperties:false},execute(input){const p=pieces.find(p=>p.id===input?.id);if(!p)throw Error('Piece not found.');const changed={...p,x:input.x,y:input.y,z:input.z,turn:input.turn},list=pieces.map(b=>b.id===p.id?changed:b),check=inspect(list);if(!check.ok)throw Error(check.reason);commit(list);selected=p.id;moving=null;setTool('select');draw();return {moved:copy(changed)};}});
}
window.addEventListener('pagehide',()=>lifecycle.abort());
new ResizeObserver(()=>{dirty=true;}).observe(canvas);canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();q('#bb-error').hidden=false;});canvas.addEventListener('webglcontextrestored',()=>window.location.reload());
function frame(t=0){const dt=lastFrame===null?0:Math.max(0,Math.min((t-lastFrame)/1000,.05));lastFrame=t;if(!document.hidden){clock+=dt;volcanoFrame(dt);gameFrame(dt);mapPortalFrame();if(!characterPreview&&clock-lastSkyDraw>(reducedMotion?1:.05))dirty=true;if(touring){yaw+=dt*.16;dirty=true;}if(!reducedMotion&&(environment.rain||environment.snowing))dirty=true;if(dirty)draw();}requestAnimationFrame(frame);}if(!pieces.length&&!savedBuildLoaded){generateWorld({biomes:['forest','mountains'],time:'day',rain:false,snow:false,snowing:false,size:24,seed:73521},true);}else{tool='orbit';ghostVisible=false;sync();}syncCharacter();showCharacterStudio();syncMapUI();draw();requestAnimationFrame(frame);
})();
