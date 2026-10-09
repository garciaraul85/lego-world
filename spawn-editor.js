// Spawn tools share the exact same arrival clearance checks as exploration.
function syncSpawnEditor(){
 const p=selectedSpawn(),values={x:p.x,z:p.z,y:p.y,heading:((p.heading*180/Math.PI)%360+360)%360};
 for(const [key,value] of Object.entries(values))q('#bb-spawn-'+key).value=String(Math.round(value*100)/100);
 q('#bb-spawn-placement').hidden=!mapPlacing;
 q('#bb-spawn-placement-status').textContent=mapSpawnDraft?.message||'Tap or drag on open ground. Green shows the safe arrival position.';
}
function focusMapSpawn(){
 switchPanel('world');stopTour();const p=selectedSpawn();target=[p.x,p.y+1.8,p.z];baseDistance=19;zoom=55;pitch=.8;yaw=.3;topView=false;q('#bb-zoom').value=zoom;if(root.dataset.mobile==='true')canvas.scrollIntoView?.({block:'center',behavior:'smooth'});canvas.focus({preventScroll:true});dirty=true;
}
function beginMapSpawnPlacement(){
 switchPanel('world');cancelCameraGesture();mapPlacing=true;mapSpawnDraft=null;
 const b=GamePhysics.worldBounds(pieces,world),r=canvas.getBoundingClientRect(),size=Math.max(b.x1-b.x0,b.z1-b.z0,8),ceiling=Math.max(0,...pieces.map(p=>(p.y+height(p))*.4));
 target=[(b.x0+b.x1)/2,selectedSpawn().y,(b.z0+b.z1)/2];baseDistance=Math.max(size*.6/Math.tan(.31)*Math.max(1,r.height/r.width),ceiling-target[1]+12);zoom=55;pitch=1.55;yaw=0;topView=true;q('#bb-zoom').value=zoom;
 syncMapUI();if(root.dataset.mobile==='true')canvas.scrollIntoView?.({block:'center',behavior:'smooth'});canvas.focus({preventScroll:true});mapNotice('Top view: tap or drag to place. Green is safe; red needs more room. Two fingers zoom and pan.');dirty=true;
}
function cancelMapSpawnPlacement(){mapPlacing=false;mapSpawnDraft=null;spawnHandlePointer=null;spawnHandleDrag=null;cancelCameraGesture();syncMapUI();mapNotice('Placement canceled. Your point has not moved.');dirty=true;}
function spawnSurface(clientX,clientY){
 const r=ray(clientX,clientY),p=pick(r);if(!p)throw Error('Choose a terrain or brick surface.');
 // Intersect the top plane rather than the nearest vertical face of the brick.
 const y=(p.y+height(p))*.4,t=(y-r.o[1])/r.d[1];if(!Number.isFinite(t)||t<0)throw Error('Choose a visible top surface.');
 const x=r.o[0]+r.d[0]*t,z=r.o[2]+r.d[2]*t,b=GamePhysics.bounds(p);if(x<b.x0-.01||x>b.x1+.01||z<b.z0-.01||z>b.z1+.01)throw Error('Aim at the top of the surface.');
 return {x:Math.round(x*2)/2,y,z:Math.round(z*2)/2,heading:selectedSpawn().heading};
}
function updateMapSpawnDraft(clientX,clientY){
 let desired=null;
 try{desired=spawnSurface(clientX,clientY);return draftSpawnPosition(desired);}
 catch(e){mapSpawnDraft={desired,safe:null,message:e.message};}
 q('#bb-spawn-placement-status').textContent=mapSpawnDraft.message;dirty=true;return mapSpawnDraft;
}
function draftSpawnPosition(desired){
 try{const safe=mapSafeSpot(desired.x,desired.z,desired.y,desired.heading),adjusted=Math.hypot(safe.x-desired.x,safe.z-desired.z)>.05;mapSpawnDraft={desired,safe,message:(adjusted?'Snapped to nearby clear ground. ':'Safe arrival. ')+'X '+safe.x.toFixed(1)+' · Z '+safe.z.toFixed(1)+' · Release to place.'};}catch(e){mapSpawnDraft={desired,safe:null,message:e.message};}
 q('#bb-spawn-placement-status').textContent=mapSpawnDraft.message;dirty=true;return mapSpawnDraft;
}
function exactSpawnPosition(position){
 const c=ensurePhysics();ensureNPCs();const {x,z,y,heading}=position;if(![x,z,y,heading].every(Number.isFinite)||y<0)throw Error('Enter valid coordinates and a ground height of zero or higher.');if(!c.contains(x,z))throw Error('Keep the whole character inside this map.');
 const old=c.state.heading;c.state.heading=heading;
 try{const floor=c.floor(x,z,y+.1);if(floor===null||Math.abs(floor-y)>.12||!c.clear(x,floor,z))throw Error('This position is blocked or unsupported. The spawn has not moved.');return {x,z,y:floor,heading};}finally{c.state.heading=old;}
}
function adjustMapSpawn(dx=0,dz=0,turn=0){mapTry(()=>{const p=selectedSpawn();saveMapSpawn(exactSpawnPosition({x:p.x+dx,z:p.z+dz,y:p.y,heading:(p.heading+turn+Math.PI*2)%(Math.PI*2)}));dirty=true;});}
function applySpawnFields(){mapTry(()=>{const values={};for(const field of ['x','z','y','heading']){const text=q('#bb-spawn-'+field).value.trim();if(!text)throw Error('Fill in every position field.');values[field]=Number(text);}values.heading=((values.heading%360+360)%360)*Math.PI/180;saveMapSpawn(exactSpawnPosition(values));});}
function updateSpawnHandle(mvp,bounds){
 const handle=q('#bb-spawn-handle');handle.hidden=playing||characterPreview||currentPanel!=='world'||mapDiagramOpen;
 if(handle.hidden)return;const p=mapSpawnDraft?.safe||selectedSpawn(),v=[p.x,p.y+4.2,p.z,1],clip=[0,1,2,3].map(i=>v.reduce((sum,value,k)=>sum+mvp[k*4+i]*value,0)),x=clip[0]/clip[3],y=clip[1]/clip[3];
 if(clip[3]<=0||Math.abs(x)>.96||Math.abs(y)>.94){handle.hidden=true;return;}
 handle.style.left=(x*.5+.5)*bounds.width+'px';handle.style.top=(.5-y*.5)*bounds.height+'px';handle.textContent=selectedSpawn().name+' · drag to move';handle.setAttribute('aria-label','Drag '+activeMap().name+' / '+selectedSpawn().name+' to move it');
}
function drawSpawnFacing(p,color){
 if(spawnFacingAngle!==p.heading){if(spawnFacingMesh){gl.deleteBuffer(spawnFacingMesh.p);gl.deleteBuffer(spawnFacingMesh.n);}positions=[];normals=[];const c=Math.cos(p.heading),s=Math.sin(p.heading),v=(x,z)=>[x*c+z*s,0,-x*s+z*c],n=[0,1,0];tri(v(-.12,1.25),v(.12,1.25),v(.12,2.05),n,n,n);tri(v(-.12,1.25),v(.12,2.05),v(-.12,2.05),n,n,n);tri(v(-.4,2.05),v(.4,2.05),v(0,2.65),n,n,n);spawnFacingMesh=upload();spawnFacingAngle=p.heading;}
 drawMesh(spawnFacingMesh,[p.x,p.y+.075,p.z],color,.75,false,true);
}
function drawSpawnDraft(){
 if(!playing&&currentPanel==='world')drawSpawnFacing(selectedSpawn(),[.7,1,.9]);
 if(!mapPlacing||!mapSpawnDraft?.desired||!portalMeshes)return;
 const p=mapSpawnDraft.safe||mapSpawnDraft.desired,color=mapSpawnDraft.safe?[.3,1,.5]:[1,.15,.2];
 drawMesh(portalMeshes.ring,[p.x,p.y+.08,p.z],color,.95,false,true);
 drawSpawnFacing(p,color);
}
q('#bb-spawn-focus').addEventListener('click',focusMapSpawn);q('#bb-spawn-placement-cancel').addEventListener('click',cancelMapSpawnPlacement);q('#bb-spawn-apply').addEventListener('click',applySpawnFields);
for(const [key,x,z,turn] of [['north',0,-.5,0],['south',0,.5,0],['west',-.5,0,0],['east',.5,0,0],['turn',0,0,Math.PI/4]])q('#bb-spawn-'+key).addEventListener('click',()=>adjustMapSpawn(x,z,turn));
let spawnHandlePointer=null,spawnHandleDrag=null;
function spawnPlanePoint(clientX,clientY,y){const r=ray(clientX,clientY),t=(y-r.o[1])/r.d[1];return Number.isFinite(t)&&t>=0?{x:r.o[0]+r.d[0]*t,z:r.o[2]+r.d[2]*t}:null;}
function updateSpawnHandleDrag(e){
 if(!spawnHandleDrag)return;const plane=spawnPlanePoint(e.clientX,e.clientY,spawnHandleDrag.origin.y);if(!plane)return;
 const p=spawnHandleDrag.origin,x=Math.round((p.x+plane.x-spawnHandleDrag.start.x)*2)/2,z=Math.round((p.z+plane.z-spawnHandleDrag.start.z)*2)/2,y=ensurePhysics().floor(x,z,p.y+.6);
 draftSpawnPosition({x,y:y??p.y,z,heading:p.heading});
}
q('#bb-spawn-handle').addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();e.stopPropagation?.();cancelCameraGesture();const origin={...selectedSpawn()},start=spawnPlanePoint(e.clientX,e.clientY,origin.y);if(!start)return;mapPlacing=true;spawnHandlePointer=e.pointerId;spawnHandleDrag={origin,start};q('#bb-spawn-handle').setPointerCapture?.(e.pointerId);syncSpawnEditor();});
q('#bb-spawn-handle').addEventListener('pointermove',e=>{if(e.pointerId===spawnHandlePointer)updateSpawnHandleDrag(e);});
q('#bb-spawn-handle').addEventListener('pointerup',e=>{if(e.pointerId!==spawnHandlePointer)return;updateSpawnHandleDrag(e);spawnHandlePointer=null;spawnHandleDrag=null;mapTry(()=>{if(!mapSpawnDraft?.safe)throw Error(mapSpawnDraft?.message||'Choose clear ground.');saveMapSpawn(mapSpawnDraft.safe);});});
for(const type of ['pointercancel','lostpointercapture'])q('#bb-spawn-handle').addEventListener(type,()=>{if(spawnHandlePointer!==null){spawnHandlePointer=null;cancelMapSpawnPlacement();}});
q('#bb-spawn-handle').addEventListener('click',e=>{if(e.detail===0)focusMapSpawn();});

// A responsive diagram shows individual spawn endpoints, including local loops.
function diagramNodeKey(e){return e.mapId+':'+e.spawnId;}
function diagramEndpointName(e){const p=mapEndpoint(e);return p.spawn?p.map.name+' / '+p.spawn.name:'Choose a point';}
function diagramLayout(network,width){
 width=Math.max(280,width);const columns=width>=860?3:width>=570?2:1,gap=64,margin=48,cardWidth=(width-margin*2-gap*(columns-1))/columns,boxes=[],nodes=new Map();let top=16;
 for(let i=0;i<network.maps.length;i+=columns){const row=network.maps.slice(i,i+columns),rowHeight=Math.max(...row.map(m=>m.spawns.length*48+66));row.forEach((map,j)=>{const x=margin+j*(cardWidth+gap),h=map.spawns.length*48+66;boxes.push({map,x,y:top,w:cardWidth,h});map.spawns.forEach((spawn,k)=>nodes.set(diagramNodeKey({mapId:map.id,spawnId:spawn.id}),{x:x+14,y:top+48+k*48,w:cardWidth-28,h:42,mapId:map.id,spawnId:spawn.id}));});top+=rowHeight+40;}
 const routes=network.links.map((link,i)=>{const a=nodes.get(diagramNodeKey(link.from)),b=nodes.get(diagramNodeKey(link.to)),lane=20+(i%5)*5;let path;
  if(link.from.mapId===link.to.mapId){const ax=a.x+a.w,bx=b.x+b.w,side=Math.max(ax,bx)+lane;path=`M ${ax} ${a.y+21} C ${side} ${a.y+21}, ${side} ${b.y+21}, ${bx} ${b.y+21}`;}
  else if(Math.abs(a.x-b.x)<1){const side=Math.max(10,a.x-lane);path=`M ${a.x} ${a.y+21} C ${side} ${a.y+21}, ${side} ${b.y+21}, ${b.x} ${b.y+21}`;}
  else{const right=a.x<b.x,ax=right?a.x+a.w:a.x,bx=right?b.x:b.x+b.w,mid=(ax+bx)/2;path=`M ${ax} ${a.y+21} C ${mid} ${a.y+21}, ${mid} ${b.y+21}, ${bx} ${b.y+21}`;}
  return {link,path,local:link.from.mapId===link.to.mapId};
 });return {width,height:Math.max(220,top),boxes,nodes,routes};
}
function svgDiagramElement(tag,attributes={}){const el=document.createElementNS?document.createElementNS('http://www.w3.org/2000/svg',tag):document.createElement(tag);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));return el;}
function selectDiagramPoint(endpoint){
 mapDiagramSelection={...endpoint};
 if(q('#bb-diagram-connect').checked){if(!mapDiagramSource){mapDiagramSource={...endpoint};drawMapDiagram();q('#bb-diagram-selection').textContent='From '+diagramEndpointName(endpoint)+'. Choose the destination point.';return;}
  try{const from=mapDiagramSource;connectMapEndpoints(from,endpoint,q('#bb-diagram-two-way').checked);mapDiagramSource=null;drawMapDiagram();q('#bb-diagram-selection').textContent='Connected '+diagramEndpointName(from)+(q('#bb-diagram-two-way').checked?' ↔ ':' → ')+diagramEndpointName(endpoint)+'. Choose a starting point for another connection.';}catch(e){q('#bb-diagram-selection').textContent=e.message;}return;
 }
 drawMapDiagram();
}
function drawMapDiagram(){
 if(!mapDiagramOpen)return;
 const graph=q('#bb-diagram-graph'),width=q('#bb-diagram-scroll').clientWidth||Math.max(280,(root.clientWidth||780)-48),layout=diagramLayout(ensureMapNetwork(),width);graph.replaceChildren();graph.style.height=layout.height+'px';
 const svg=svgDiagramElement('svg',{viewBox:`0 0 ${layout.width} ${layout.height}`,width:'100%',height:layout.height,'aria-hidden':'true'}),defs=svgDiagramElement('defs');
 for(const [name,color] of [['route','#85bfc8'],['local','#edc478'],['selected','#a0ffe0']]){const marker=svgDiagramElement('marker',{id:'bb-diagram-arrow-'+name,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse',markerUnits:'strokeWidth'});marker.appendChild(svgDiagramElement('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:color}));defs.appendChild(marker);}svg.appendChild(defs);
 for(const route of layout.routes){const selected=[route.link.from,route.link.to].some(e=>diagramNodeKey(e)===diagramNodeKey(mapDiagramSelection||{})),type=route.local?'local':selected?'selected':'route',path=svgDiagramElement('path',{d:route.path,fill:'none',stroke:type==='selected'?'#a0ffe0':route.local?'#edc478':'#85bfc8','stroke-width':selected?3:2,'marker-end':`url(#bb-diagram-arrow-${type})`,'data-link-id':route.link.id});if(route.link.twoWay)path.setAttribute('marker-start',`url(#bb-diagram-arrow-${type})`);svg.appendChild(path);}
 graph.appendChild(svg);
 for(const box of layout.boxes){const card=document.createElement('div');card.className='diagram-map';Object.assign(card.style,{left:box.x+'px',top:box.y+'px',width:box.w+'px',height:box.h+'px'});const title=document.createElement('strong');title.textContent=box.map.name;card.appendChild(title);graph.appendChild(card);}
 for(const node of layout.nodes.values()){const endpoint={mapId:node.mapId,spawnId:node.spawnId},point=mapEndpoint(endpoint).spawn,button=document.createElement('button');button.type='button';button.className='diagram-point';Object.assign(button.style,{left:node.x+'px',top:node.y+'px',width:node.w+'px'});button.textContent=point.name;button.dataset.mapId=String(node.mapId);button.dataset.spawnId=String(node.spawnId);button.setAttribute('aria-label',diagramEndpointName(endpoint));button.setAttribute('aria-pressed',String(diagramNodeKey(endpoint)===diagramNodeKey(mapDiagramSelection||{})));if(mapDiagramSource&&diagramNodeKey(endpoint)===diagramNodeKey(mapDiagramSource))button.dataset.source='true';button.addEventListener('click',()=>selectDiagramPoint(endpoint));graph.appendChild(button);}
 q('#bb-diagram-show').disabled=!mapEndpoint(mapDiagramSelection||{}).spawn;q('#bb-diagram-selection').textContent=mapDiagramSource?'From '+diagramEndpointName(mapDiagramSource)+'. Choose the destination point.':q('#bb-diagram-connect').checked?'Choose the starting point.':diagramEndpointName(mapDiagramSelection)+' · Select Show selected point to locate it in 3D.';
}
function openMapDiagram(){cancelCameraGesture();clearInput();closeGameMenu();mapPlacing=false;mapSpawnDraft=null;mapDiagramSelection={mapId:ensureMapNetwork().activeId,spawnId:selectedSpawn().id};mapDiagramSource=null;mapDiagramOpen=true;q('#bb-map-diagram').hidden=false;q('#bb-diagram-connect').checked=false;q('#bb-diagram-two-way').checked=q('#bb-link-return').checked;syncSpawnEditor();drawMapDiagram();q('#bb-map-diagram').scrollIntoView?.({block:'nearest'});q('#bb-map-diagram-close').focus({preventScroll:true});dirty=true;}
function closeMapDiagram(){mapDiagramOpen=false;mapDiagramSource=null;q('#bb-map-diagram').hidden=true;canvas.focus({preventScroll:true});dirty=true;}
q('#bb-map-diagram').hidden=true;
q('#bb-map-routes').addEventListener('click',openMapDiagram);q('#bb-map-diagram-open').addEventListener('click',openMapDiagram);q('#bb-map-diagram-close').addEventListener('click',closeMapDiagram);
q('#bb-diagram-connect').addEventListener('change',()=>{mapDiagramSource=null;drawMapDiagram();});
q('#bb-diagram-show').addEventListener('click',()=>{const e=mapDiagramSelection;if(!mapEndpoint(e||{}).spawn)return;closeMapDiagram();previewMap(e.mapId,e.spawnId);});
q('#bb-map-diagram').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation?.();closeMapDiagram();return;}if(e.key!=='Tab')return;const controls=[...q('#bb-map-diagram').querySelectorAll('button,input')].filter(el=>!el.disabled&&!el.hidden);if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus();}});
new ResizeObserver(()=>{if(mapDiagramOpen)drawMapDiagram();}).observe(q('#bb-diagram-scroll'));
