// Each map owns its scenery/adventure state; the character collection is shared.
function mapName(value,fallback='Map'){return typeof value==='string'&&value.trim()?value.trim().slice(0,40):fallback;}
function mapPayload(build){const {pieces,world,environment,broken,player,npcs}=build;return JSON.parse(JSON.stringify({pieces,world,environment,broken,player,npcs}));}
function ensureMapNetwork(){
 if(!mapNetwork){const p=savedPlayer&&validPlayer(savedPlayer)?savedPlayer:new GamePhysics.Controller(pieces,world).state;mapNetwork={activeId:1,nextId:2,maps:[{id:1,name:'Map 1',spawns:[{id:1,name:'Arrival',x:p.x,y:p.y,z:p.z,heading:p.heading}],build:null}],links:[]};}
 return mapNetwork;
}
function activeMap(){return ensureMapNetwork().maps.find(m=>m.id===mapNetwork.activeId);}
function exportMapNetwork(build=currentMapBuild()){
 const network=ensureMapNetwork(),m=activeMap(),bounds=GamePhysics.worldBounds(pieces,world);for(const point of m.spawns){if(point.x<bounds.x0||point.x>bounds.x1||point.z<bounds.z0||point.z>bounds.z1){const c=new GamePhysics.Controller(pieces,world);Object.assign(point,{x:c.state.x,y:c.state.y,z:c.state.z});}}m.build=mapPayload(build);
 // Root fields contain the selected map, retaining compatibility with old saves.
 return {...network,maps:network.maps.map(m=>({...m,spawns:m.spawns.map(p=>({...p})),build:m.id===network.activeId?null:m.build})),links:network.links.map(l=>({...l,from:{...l.from},to:{...l.to}}))};
}
function parseMapNetwork(raw,current){
 if(raw===undefined)return null;
 if(!raw||!Array.isArray(raw.maps)||raw.maps.length<1||raw.maps.length>16||!Array.isArray(raw.links)||raw.links.length>256)throw Error('Invalid map collection. Use 1–16 maps and at most 256 connections.');
 const mapIds=new Set();const maps=raw.maps.map(m=>{
  if(!m||!Number.isInteger(m.id)||m.id<1||m.id>1000000||mapIds.has(m.id)||typeof m.name!=='string'||!m.name.trim()||m.name.length>40)throw Error('Invalid map name or id.');mapIds.add(m.id);
  if(!Array.isArray(m.spawns)||m.spawns.length<1||m.spawns.length>32)throw Error('Each map needs 1–32 spawn points.');
  const parsed=m.id===raw.activeId?current:parseBuild(JSON.stringify({...m.build,format:'brick-builder',version:4,characters:current.characters}),true),bounds=GamePhysics.worldBounds(parsed,parsed.world),pointIds=new Set();
  const spawns=m.spawns.map(s=>{
   if(!s||!Number.isInteger(s.id)||s.id<1||s.id>1000000||pointIds.has(s.id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>32||!validPlayer(s)||s.y<0||s.x<bounds.x0||s.x>bounds.x1||s.z<bounds.z0||s.z>bounds.z1)throw Error('Invalid or out-of-bounds spawn point.');pointIds.add(s.id);return {id:s.id,name:s.name,x:s.x,y:s.y,z:s.z,heading:s.heading};
  });
  return {id:m.id,name:m.name,spawns,build:mapPayload({pieces:parsed,world:parsed.world,environment:parsed.environment,player:parsed.player,broken:parsed.broken,npcs:parsed.npcs})};
 });
 if(!mapIds.has(raw.activeId))throw Error('The selected map does not exist.');
 const linkIds=new Set(),pairs=new Set();const endpoint=e=>{const m=maps.find(m=>m.id===e?.mapId);return m&&m.spawns.some(s=>s.id===e.spawnId);};
 const links=raw.links.map(l=>{if(!l||!Number.isInteger(l.id)||l.id<1||l.id>1000000||linkIds.has(l.id)||!endpoint(l.from)||!endpoint(l.to)||l.from.mapId===l.to.mapId&&l.from.spawnId===l.to.spawnId||typeof l.twoWay!=='boolean')throw Error('Invalid map connection.');linkIds.add(l.id);const k=[l.from.mapId,l.from.spawnId,l.to.mapId,l.to.spawnId].join(':');if(pairs.has(k))throw Error('Duplicate map connection.');pairs.add(k);return {id:l.id,from:{mapId:l.from.mapId,spawnId:l.from.spawnId},to:{mapId:l.to.mapId,spawnId:l.to.spawnId},twoWay:l.twoWay};});
 return {activeId:raw.activeId,nextId:Math.max(...mapIds)+1,maps,links};
}
function restoreMapNetwork(network,spawnId=null){mapNetwork=network?JSON.parse(JSON.stringify(network)):null;mapTouchState=null;mapPlacing=false;mapSpawnDraft=null;mapPreviewReturn=null;mapTravelUntil=clock+1;mapSpawnId=activeMap().spawns.find(p=>p.id===spawnId)?.id||activeMap().spawns[0].id;syncMapUI();}
function mapNotice(message){q('#bb-map-message').textContent=message;}
function mapTry(action){try{action();}catch(e){mapNotice(e.message);}}
function selectedSpawn(){return activeMap().spawns.find(s=>s.id===mapSpawnId)||activeMap().spawns[0];}
function fillMapSelect(el,items,value){el.replaceChildren();for(const item of items){const option=document.createElement('option');option.value=String(item.id);option.textContent=item.name;el.appendChild(option);}el.value=String(items.some(item=>String(item.id)===String(value))?value:items[0]?.id??'');}
function syncMapUI(){
 const network=ensureMapNetwork(),m=activeMap(),spawn=selectedSpawn();mapSpawnId=spawn.id;
 const room=16-network.maps.length;q('#bb-random-worlds').disabled=room<2;q('#bb-random-count').max=Math.max(2,room);if(Number(q('#bb-random-count').value)>room&&room>=2)q('#bb-random-count').value=room;q('#bb-random-note').textContent=room<2?'Remove a map to make room for at least two new worlds.':'Adds random terrain, skies and weather, with return routes to this map.';
 fillMapSelect(q('#bb-map-select'),network.maps,m.id);q('#bb-map-name').value=m.name;
 fillMapSelect(q('#bb-spawn-select'),m.spawns,spawn.id);q('#bb-spawn-name').value=spawn.name;
 const destinations=network.maps.filter(n=>n.id!==m.id||n.spawns.length>1).map(n=>({id:n.id,name:n.name+(n.id===m.id?' (this map)':'')})),previous=Number(q('#bb-link-map').value),destination=destinations.find(n=>n.id===previous)||destinations[0];fillMapSelect(q('#bb-link-map'),destinations,destination?.id);syncLinkSpawns();
 q('#bb-map-delete').disabled=network.maps.length===1;q('#bb-spawn-delete').disabled=m.spawns.length===1;q('#bb-map-new').disabled=q('#bb-map-copy').disabled=network.maps.length>=16;
 q('#bb-spawn-place').textContent=mapPlacing?'Cancel placement':'Place on map';q('#bb-spawn-place').setAttribute('aria-pressed',String(mapPlacing));syncSpawnEditor();if(mapDiagramOpen)drawMapDiagram();
 const overview=q('#bb-map-overview');overview.replaceChildren();
 for(const n of network.maps){const node=document.createElement('button');node.type='button';node.className='map-node';node.textContent=n.name+' · '+n.spawns.length+' spawn'+(n.spawns.length===1?'':'s')+' · '+network.links.filter(l=>l.from.mapId===n.id||l.to.mapId===n.id).length+' connections';node.setAttribute('aria-pressed',String(n.id===m.id));node.setAttribute('aria-label','Preview '+n.name);node.addEventListener('click',()=>mapTry(()=>previewMap(n.id,n.spawns[0].id)));overview.appendChild(node);}
 const list=q('#bb-map-links');list.replaceChildren();
 for(const l of network.links){const from=mapEndpoint(l.from),to=mapEndpoint(l.to),row=document.createElement('div'),text=document.createElement('div'),buttons=document.createElement('div');row.className='map-link';buttons.className='row';text.textContent=from.map.name+' / '+from.spawn.name+(l.twoWay?' ↔ ':' → ')+to.map.name+' / '+to.spawn.name;row.appendChild(text);
  for(const [label,fn] of [['Preview A',()=>previewMap(l.from.mapId,l.from.spawnId)],['Preview B',()=>previewMap(l.to.mapId,l.to.spawnId)],['Unlink',()=>{remember();network.links=network.links.filter(e=>e.id!==l.id);persist();syncMapUI();}]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>mapTry(fn));buttons.appendChild(b);}row.appendChild(buttons);list.appendChild(row);
 }
 q('#bb-map-preview').hidden=mapPreviewReturn===null||playing||characterPreview;q('#bb-map-preview-label').textContent='Preview · '+m.name+' / '+spawn.name;
 refreshGamePickers();mapPortalFrame();dirty=true;
}
function syncLinkSpawns(){const m=ensureMapNetwork().maps.find(m=>m.id===Number(q('#bb-link-map').value)),points=(m?.spawns||[]).filter(s=>m.id!==mapNetwork.activeId||s.id!==selectedSpawn().id);fillMapSelect(q('#bb-link-spawn'),points,Number(q('#bb-link-spawn').value));q('#bb-link-create').disabled=!points.length;refreshGamePickers();}
function mapEndpoint(e){const map=ensureMapNetwork().maps.find(m=>m.id===e.mapId);return {map,spawn:map?.spawns.find(s=>s.id===e.spawnId)};}
function switchMap(id,{preview=false,spawnId=null,travel=false}={}){
 const network=ensureMapNetwork(),destination=network.maps.find(m=>m.id===id);if(!destination)throw Error('Choose an existing map.');if(spawnId!==null&&!destination.spawns.some(s=>s.id===spawnId))throw Error('Choose an existing spawn point.');
 if(id===network.activeId){if(travel){arriveAtMapSpawn(destination,destination.spawns.find(s=>s.id===spawnId)||destination.spawns[0]);syncMapUI();persist();dirty=true;}else if(spawnId)mapSpawnId=spawnId;return;}
 const wasPlaying=playing,collection=characterData();if(playing)stopPlaying(false);leavePreview();activeMap().build=mapPayload(currentMapBuild());mapPlacing=false;closeConversation();cancelRebuild();clearInput();
 network.activeId=id;const build=destination.build;pieces=clone(build.pieces);world=build.world?worldMeta(build.world.config,build.world.layoutVersion??1):null;environment={...build.environment};
 Object.assign(pieces,{world,environment,characters:collection,player:build.player,broken:build.broken,npcs:build.npcs});restoreAdventure(pieces);nextId=Math.max(0,...pieces.map(p=>p.id),...broken.flatMap(e=>e.originals.map(p=>p.id)))+1;physicsRevision=-1;renderRevision++;skyStartClock=clock;selected=null;moving=null;ghostVisible=false;tool='orbit';stopTour();mapSpawnId=spawnId||destination.spawns[0].id;restoreWorldControls();ensureNPCs();fit();
 if(travel)arriveAtMapSpawn(destination,selectedSpawn());
 else{switchPanel('world');if(!preview)mapPreviewReturn=null;if(wasPlaying)gameMessage('Opened '+destination.name,2);}
 syncMapUI();persist();dirty=true;
}
function arriveAtMapSpawn(destination,point){
 // Local teleports move the existing actor, preserving terrain, damage, NPCs and sky time.
 const safe=mapSafeSpot(point.x,point.z,point.y,point.heading,true);
 closeConversation();cancelRebuild();clearInput();pendingSmash=null;pendingSpell=null;
 Object.assign(point,safe);mapSpawnId=point.id;mapPreviewReturn=null;
 Object.assign(ensurePhysics().state,safe,{vy:0,grounded:true,speed:0,running:false,attack:0,phase:0,reload:0,weaponRecoil:0,recoilVelocity:0,jumpBuffer:0,coyote:0,airTime:0,landing:0,gaitSpeed:0,moveBlend:0,runBlend:0});
 savedPlayer={...controller.state};startPlaying();mapTravelUntil=clock+1.5;resetMapTouch(true);gameMessage('Arrived at '+destination.name+' · '+point.name,3);
}
function createMap(config=worldConfig(),copyMap=false,name){
 const network=ensureMapNetwork();if(network.maps.length>=16)throw Error('A project can hold 16 maps.');
 // Validate and generate before changing the existing project.
 const generated=copyMap?null:WorldGenerator.generate(config);if(generated){const check=inspect(generated.pieces);if(!check.ok)throw Error(check.reason);}
 remember();if(playing)stopPlaying(false);leavePreview();const current=activeMap();current.build=mapPayload(currentMapBuild());const id=network.nextId++,newMap={id,name:mapName(name,copyMap?current.name.slice(0,35)+' copy':'Map '+id),spawns:copyMap?JSON.parse(JSON.stringify(current.spawns)):[],build:copyMap?JSON.parse(JSON.stringify(current.build)):{pieces:clone(generated.pieces),world:{config:generated.config,layoutVersion:generated.layoutVersion,width:generated.width,depth:generated.depth},environment:{time:generated.config.time,rain:generated.config.rain,snow:generated.config.snow,snowing:generated.config.snowing},player:null,broken:[],npcs:[]}};
 if(!copyMap){const spawn=new GamePhysics.Controller(newMap.build.pieces,worldMeta(newMap.build.world.config,newMap.build.world.layoutVersion)).state;newMap.spawns=[{id:1,name:'Arrival',x:spawn.x,y:spawn.y,z:spawn.z,heading:spawn.heading}];}
 network.maps.push(newMap);mapPreviewReturn=null;switchMap(id);mapNotice('Map added. Choose its environment below, or connect its Arrival point to another map.');return id;
}
function generateConnectedWorlds(input={}){
 const network=ensureMapNetwork(),count=input.count??3,seed=input.seed??Math.floor(Math.random()*100000000),size=input.size??worldConfig().size;
 if(!Number.isInteger(count)||count<2||count>15)throw Error('Choose 2–15 new maps.');
 if(network.maps.length+count>16)throw Error('Only '+(16-network.maps.length)+' map slots remain. Remove maps or choose a smaller batch.');
 if(network.nextId+count-1>1000000)throw Error('Map ids are exhausted. Save this project and start a new one.');
 const staged=ConnectedWorlds.generate({...input,count,seed,size,maxLinks:256-network.links.length,profile:activeProfile()},(profile,c)=>characterRenderer.bindCollision(profile,c));
 for(const m of staged.maps){const check=inspect(m.build.pieces);if(!check.ok)throw Error(check.reason);}
 const anchor=activeMap(),anchorPoint=selectedSpawn(),safe=mapSafeSpot(anchorPoint.x,anchorPoint.z,anchorPoint.y,anchorPoint.heading,true);
 // A batch is one edit: no intermediate maps, saves or undo entries.
 remember();if(playing)stopPlaying(false);leavePreview();anchor.build=mapPayload(currentMapBuild());Object.assign(anchorPoint,safe);
 const ids=staged.maps.map(()=>network.nextId++);staged.maps.forEach((m,i)=>network.maps.push({id:ids[i],...m}));
 let nextLink=Math.max(0,...network.links.map(l=>l.id))+1;
 const endpoint=i=>i===-1?{mapId:anchor.id,spawnId:anchorPoint.id}:{mapId:ids[i],spawnId:1};
 for(const link of staged.links)network.links.push({id:nextLink++,from:endpoint(link.from),to:endpoint(link.to),twoWay:true});
 mapPreviewReturn=null;previewMap(ids[0],1);fit();syncMapUI();const saved=persist();
 mapNotice(count+' random maps · '+staged.links.length+' two-way connections · Seed '+seed+'. Preview any map below or Explore from spawn.'+(saved?'':' Device storage is full; use Save to download all maps.'));
 return {seed,mapIds:ids,connections:staged.links.length,saved};
}
function handleRandomWorlds(){const button=q('#bb-random-worlds');button.disabled=true;try{const text=q('#bb-random-seed').value.trim();generateConnectedWorlds({count:q('#bb-random-count').value.trim()===''?3:Number(q('#bb-random-count').value),seed:text===''?undefined:Number(text),biomes:q('#bb-random-selected').checked?[...biomeInputs].filter(([,input])=>input.checked).map(([id])=>id):undefined});}catch(e){mapNotice(e.message);}finally{syncMapUI();}}
function removeMap(){const network=ensureMapNetwork(),id=network.activeId;if(network.maps.length===1)throw Error('Keep at least one map.');remember();switchMap(network.maps.find(m=>m.id!==id).id);network.maps=network.maps.filter(m=>m.id!==id);network.links=network.links.filter(l=>l.from.mapId!==id&&l.to.mapId!==id);mapPreviewReturn=null;syncMapUI();persist();mapNotice('Map and its connections removed. Undo restores them.');}
function mapSafeSpot(x,z,y,heading=0,fallback=false){
 const c=ensurePhysics();ensureNPCs();if(![x,z,y,heading].every(Number.isFinite))throw Error('Choose a valid spawn point.');
 if(!c.contains(x,z)){if(!fallback)throw Error('Choose a point inside this map.');const p=GamePhysics.containPoint(c.area,x,z,GamePhysics.characterMargin*GamePhysics.scaleOf(c.state));x=p.x;z=p.z;}
 const previousHeading=c.state.heading;c.state.heading=heading;
 try{
  const test=(px,pz,ceiling=Infinity)=>{if(!c.contains(px,pz))return null;const floor=c.floor(px,pz,ceiling);return floor!==null&&c.clear(px,floor,pz)?{x:px,y:floor,z:pz,heading}:null;};
  for(const radius of [0,.8,1.6,2.4,4])for(let i=0;i<(radius?16:1);i++){const a=i*Math.PI/8,p=test(x+Math.cos(a)*radius,z+Math.sin(a)*radius,y+.6);if(p&&Math.abs(p.y-y)<1.2)return p;}
  if(fallback){
   // Repair old gates on edges, destroyed platforms, and occupied arrival areas.
   for(const p of [c.state,c.spawnPoint])if(p){const safe=test(p.x,p.z,p.y+.1);if(safe)return safe;}
   for(const brick of pieces.filter(p=>p.y===0)){const b=GamePhysics.bounds(brick);for(const fx of [.5,.25,.75,.1,.9])for(const fz of [.5,.25,.75,.1,.9]){const safe=test(b.x0+(b.x1-b.x0)*fx,b.z0+(b.z1-b.z0)*fz,1.35);if(safe)return safe;}}
  }
  throw Error('No open arrival ground remains in this map. Rebuild or place a spawn on open terrain.');
 }finally{c.state.heading=previousHeading;}
}
function setMapSpawn(position){const spawn=selectedSpawn(),safe=mapSafeSpot(position.x,position.z,position.y,position.heading??spawn.heading);return saveMapSpawn(safe);}
function saveMapSpawn(safe){const spawn=selectedSpawn();remember();Object.assign(spawn,safe);mapPlacing=false;mapSpawnDraft=null;syncMapUI();persist();mapNotice('Spawn placed on safe ground. Cyan gates are connected; gold points are unconnected.');return {...spawn};}
function placeMapSpawn(clientX,clientY){mapTry(()=>{updateMapSpawnDraft(clientX,clientY);if(!mapSpawnDraft?.safe)throw Error(mapSpawnDraft?.message||'Choose open terrain.');saveMapSpawn(mapSpawnDraft.safe);});}
function addMapSpawn(name){const m=activeMap();if(m.spawns.length>=32)throw Error('A map can hold 32 spawn points.');const c=ensurePhysics(),safe=mapSafeSpot(c.state.x,c.state.z,c.state.y,c.state.heading,true);remember();const id=Math.max(...m.spawns.map(s=>s.id))+1;m.spawns.push({id,name:mapName(name,'Spawn '+id).slice(0,32),...safe});mapSpawnId=id;syncMapUI();persist();mapNotice('Spawn added. Use Place on map to choose its location.');return id;}
function removeMapSpawn(){const m=activeMap();if(m.spawns.length===1)throw Error('Keep at least one spawn point.');remember();m.spawns=m.spawns.filter(s=>s.id!==mapSpawnId);mapNetwork.links=mapNetwork.links.filter(l=>!(l.from.mapId===m.id&&l.from.spawnId===mapSpawnId)&&!(l.to.mapId===m.id&&l.to.spawnId===mapSpawnId));mapSpawnId=m.spawns[0].id;mapPlacing=false;persist();syncMapUI();}
function connectMaps(toMapId,toSpawnId,twoWay=true){return connectMapEndpoints({mapId:ensureMapNetwork().activeId,spawnId:selectedSpawn().id},{mapId:toMapId,spawnId:toSpawnId},twoWay);}
function connectMapEndpoints(from,to,twoWay=true){
 const network=ensureMapNetwork();if(from.mapId===to.mapId&&from.spawnId===to.spawnId||!mapEndpoint(from).spawn||!mapEndpoint(to).spawn)throw Error('Choose a different spawn point, on this map or another map.');if(network.links.length>=256)throw Error('This project has 256 connections.');
 const match=(a,b)=>a.mapId===b.mapId&&a.spawnId===b.spawnId;if(network.links.some(l=>match(l.from,from)&&match(l.to,to)||match(l.from,to)&&match(l.to,from)))throw Error('These spawn points are already connected.');
 remember();const id=Math.max(0,...network.links.map(l=>l.id))+1;network.links.push({id,from:{...from},to:{...to},twoWay:twoWay===true});persist();syncMapUI();mapNotice('Connected. Touch the glowing gate to teleport. After arriving, step out before entering again.');return id;
}
function previewMap(id,spawnId){const destination=ensureMapNetwork().maps.find(m=>m.id===id);if(!destination||spawnId!==undefined&&!destination.spawns.some(s=>s.id===spawnId))throw Error('Choose an existing map and spawn point.');if(mapPreviewReturn===null)mapPreviewReturn=ensureMapNetwork().activeId;if(playing)stopPlaying(false);leavePreview();switchMap(id,{preview:true,spawnId});mapSpawnId=spawnId||selectedSpawn().id;const point=selectedSpawn();switchPanel('world');target=[point.x,point.y+2,point.z];baseDistance=20;zoom=55;pitch=.6;q('#bb-zoom').value=zoom;syncMapUI();mapNotice('Destination preview. Rotate or zoom; Return takes you back.');}
function refreshMapSpawnPositions(){
 const m=activeMap(),c=ensurePhysics();for(const s of m.spawns){try{Object.assign(s,mapSafeSpot(s.x,s.z,s.y,s.heading));}catch{Object.assign(s,{x:c.state.x,y:c.state.y,z:c.state.z,heading:c.state.heading});}}
 syncMapUI();
}
function outboundMapLinks(){
 const network=ensureMapNetwork(),routes=[];
 // Evaluate both endpoints independently: a two-way link can stay within one map.
 for(const link of network.links){if(link.from.mapId===network.activeId)routes.push({link,source:link.from,destination:link.to});if(link.twoWay&&link.to.mapId===network.activeId)routes.push({link,source:link.to,destination:link.from});}
 return routes;
}
function mapGateHit(point,a,b,radius){
 // Swept actor/cylinder contact catches fast running and flying through a gate.
 const dx=b.x-a.x,dz=b.z-a.z,ox=a.x-point.x,oz=a.z-point.z,A=dx*dx+dz*dz,B=2*(ox*dx+oz*dz),C=ox*ox+oz*oz-radius*radius;
 let enter=0,exit=1;
 if(A<1e-10){if(C>0)return null;}else{const discriminant=B*B-4*A*C;if(discriminant<0)return null;const root=Math.sqrt(discriminant);enter=Math.max(0,(-B-root)/(2*A));exit=Math.min(1,(-B+root)/(2*A));}
 const low=point.y-4.02*GamePhysics.scaleOf(controller.state),high=point.y+3.6,dy=b.y-a.y;
 if(Math.abs(dy)<1e-10){if(a.y<low||a.y>high)return null;}else{const u=(low-a.y)/dy,v=(high-a.y)/dy;enter=Math.max(enter,Math.min(u,v));exit=Math.min(exit,Math.max(u,v));}
 return enter<=exit?enter:null;
}
function touchedMapGates(state){return activeMap().spawns.filter(p=>mapNetwork.links.some(l=>l.from.mapId===mapNetwork.activeId&&l.from.spawnId===p.id||l.to.mapId===mapNetwork.activeId&&l.to.spawnId===p.id)&&mapGateHit(p,state,state,2.5)!==null);}
function resetMapTouch(arrived=false){const s=controller?.state;if(!s){mapTouchState=null;return;}const blocked=touchedMapGates(s).map(p=>({...p}));mapTouchState={mapId:ensureMapNetwork().activeId,last:{x:s.x,y:s.y,z:s.z},locked:arrived||blocked.length>0,blocked};}
function stepMapTeleports(){
 if(!playing||!controller)return;
 const s=controller.state,current={x:s.x,y:s.y,z:s.z};
 if(!mapTouchState||mapTouchState.mapId!==ensureMapNetwork().activeId){resetMapTouch();return;}
 const previous=mapTouchState.last;mapTouchState.last=current;
 if(characterPreview||gameOverlayOpen()||conversation||!q('#bb-dialog').hidden)return;
 let exited=null;
 if(mapTouchState.locked){if(mapTouchState.blocked.some(p=>mapGateHit(p,current,current,2.5)!==null))return;exited=new Set(mapTouchState.blocked.map(p=>p.id));mapTouchState.locked=false;mapTravelUntil=Math.min(mapTravelUntil,clock);}
 const hits=outboundMapLinks().filter(n=>!exited?.has(n.source.spawnId)).map(n=>({...n,contact:mapGateHit(mapEndpoint(n.source).spawn,previous,current,1.2+.4*GamePhysics.scaleOf(s))})).filter(n=>n.contact!==null).sort((a,b)=>a.contact-b.contact);
 if(!hits.length)return;
 const first=hits[0],selected=Number(q('#bb-map-route').value),near=hits.find(n=>n.source.spawnId===first.source.spawnId&&n.link.id===selected)||first;
 // Lock before loading, including failures, so a blocked gate cannot retry every frame.
 mapTouchState.locked=true;
 try{performMapTravel(near);return true;}catch(e){resetMapTouch(true);gameMessage(e.message,3);}
}
function nearbyMapLinks(){
 if(!playing||!controller||clock<mapTravelUntil||gameOverlayOpen()||conversation||!q('#bb-dialog').hidden)return [];const s=controller.state;
 return outboundMapLinks().map(n=>({...n,distance:Math.hypot(s.x-mapEndpoint(n.source).spawn.x,s.z-mapEndpoint(n.source).spawn.z)})).filter(n=>n.distance<=2.5&&mapGateHit(mapEndpoint(n.source).spawn,s,s,2.5)!==null).sort((a,b)=>a.distance-b.distance);
}
function nearbyMapLink(linkId=Number(q('#bb-map-route').value)){const list=nearbyMapLinks();return list.find(n=>n.link.id===linkId)||list[0]||null;}
function mapPortalFrame(){const seen=new Set(),list=nearbyMapLinks().filter(n=>{if(seen.has(n.link.id))return false;seen.add(n.link.id);return true;}),route=q('#bb-map-route'),key=list.map(n=>n.link.id+':'+n.source.spawnId).join(',');
 if(route.dataset.routes!==key){const value=Number(route.value);fillMapSelect(route,list.map(n=>({id:n.link.id,name:mapEndpoint(n.destination).map.name+' / '+mapEndpoint(n.destination).spawn.name})),list.some(n=>n.link.id===value)?value:list[0]?.link.id);route.dataset.routes=key;refreshGamePickers();}
 route.hidden=list.length<2;if(route.parentElement?.className==='game-picker')route.parentElement.hidden=list.length<2;q('#bb-map-travel-panel').hidden=q('#bb-map-travel').hidden=!list.length;
 const near=nearbyMapLink();if(near){const end=mapEndpoint(near.destination);q('#bb-map-travel').textContent='Touch gate: '+end.map.name+' / '+end.spawn.name+' · G';}q('#bb-map-preview').hidden=mapPreviewReturn===null||playing||characterPreview;
}
function travelMap(linkId){const near=nearbyMapLink(linkId??Number(q('#bb-map-route').value));if(!near||linkId!==undefined&&near.link.id!==linkId)throw Error('Walk to a connected glowing spawn point to travel.');
 return performMapTravel(near);
}
function performMapTravel(near){
 // Check the target first so a blocked destination cannot strand the character.
 const end=mapEndpoint(near.destination),old=ensureMapNetwork().activeId;try{switchMap(end.map.id,{travel:true,spawnId:end.spawn.id});if(ensureMapNetwork().activeId!==end.map.id)throw Error('The destination did not load.');batchRevision=-1;roadPaintRevision=-1;supportRevision=-1;dirty=true;draw();}catch(error){if(ensureMapNetwork().activeId!==old)switchMap(old);startPlaying();draw();throw error;}return {fromMapId:old,mapId:end.map.id,spawnId:end.spawn.id,player:{...controller.state}};
}
function drawMapPortals(){
 if(!portalMeshes){positions=[];normals=[];const n=[0,1,0];for(let i=0;i<48;i++){const a=i*Math.PI/24,b=(i+1)*Math.PI/24,p=(r,t)=>[r*Math.cos(t),0,r*Math.sin(t)];tri(p(.95,a),p(1.2,a),p(1.2,b),n,n,n);tri(p(.95,a),p(1.2,b),p(.95,b),n,n,n);}portalMeshes={ring:upload()};}
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);gl.uniform1f(sceneUniforms.explore,0);const area=controller?.area||GamePhysics.worldBounds(pieces,world);
 for(const s of activeMap().spawns){const connected=mapNetwork.links.some(l=>l.from.mapId===mapNetwork.activeId&&l.from.spawnId===s.id||l.to.mapId===mapNetwork.activeId&&l.to.spawnId===s.id),color=connected?[.16,1,.87]:[1,.73,.25],pulse=reducedMotion?1:.78+.22*Math.sin(clock*3+s.id);drawMesh(portalMeshes.ring,[s.x,s.y+.045,s.z],color,.7*pulse,false,true);if(connected||s.id===mapSpawnId){const post=mesh({rows:1,cols:1,turn:0,kind:'brick'});for(const offset of [-1.4,1.4])for(let level=0;level<3;level++)drawMesh(post,[clamp(s.x+Math.cos(s.heading)*offset,area.x0+.5,area.x1-.5),s.y+.6+level*1.2,clamp(s.z-Math.sin(s.heading)*offset,area.z0+.5,area.z1-.5)],color,.24*pulse,false,true);}}
 drawSpawnDraft();gl.uniform1f(sceneUniforms.explore,playing?1:0);gl.depthMask(true);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.BLEND);
}
q('#bb-map-select').addEventListener('change',e=>mapTry(()=>switchMap(Number(e.target.value))));
q('#bb-random-worlds').addEventListener('click',handleRandomWorlds);
q('#bb-map-new').addEventListener('click',()=>mapTry(()=>createMap()));q('#bb-map-copy').addEventListener('click',()=>mapTry(()=>createMap(undefined,true)));q('#bb-map-delete').addEventListener('click',()=>mapTry(removeMap));
q('#bb-map-rename').addEventListener('click',()=>{remember();activeMap().name=mapName(q('#bb-map-name').value,activeMap().name);syncMapUI();persist();});
q('#bb-spawn-select').addEventListener('change',e=>{mapSpawnId=Number(e.target.value);mapPlacing=false;mapSpawnDraft=null;syncMapUI();focusMapSpawn();});
q('#bb-spawn-place').addEventListener('click',()=>{if(mapPlacing)cancelMapSpawnPlacement();else beginMapSpawnPlacement();});
q('#bb-spawn-here').addEventListener('click',()=>mapTry(()=>{const s=ensurePhysics().state;setMapSpawn(s);}));q('#bb-spawn-add').addEventListener('click',()=>mapTry(()=>addMapSpawn(q('#bb-spawn-name').value)));q('#bb-spawn-delete').addEventListener('click',()=>mapTry(removeMapSpawn));
q('#bb-spawn-rename').addEventListener('click',()=>{remember();selectedSpawn().name=mapName(q('#bb-spawn-name').value,selectedSpawn().name).slice(0,32);syncMapUI();persist();});
q('#bb-link-map').addEventListener('change',syncLinkSpawns);q('#bb-link-create').addEventListener('click',()=>mapTry(()=>connectMaps(Number(q('#bb-link-map').value),Number(q('#bb-link-spawn').value),q('#bb-link-return').checked)));
q('#bb-map-preview-play').addEventListener('click',()=>mapTry(()=>{const point=selectedSpawn(),safe=mapSafeSpot(point.x,point.z,point.y,point.heading,true);Object.assign(point,safe);Object.assign(ensurePhysics().state,safe,{vy:0,grounded:true,speed:0,attack:0});savedPlayer={...controller.state};mapPreviewReturn=null;startPlaying();mapPortalFrame();}));
q('#bb-map-preview-back').addEventListener('click',()=>mapTry(()=>{const id=mapPreviewReturn;mapPreviewReturn=null;if(id!==null)switchMap(id);syncMapUI();}));
q('#bb-map-route').addEventListener('change',mapPortalFrame);
let mapPointerTravelAt=-Infinity;
function activateMapTravel(){try{cancelCameraGesture();clearInput();travelMap();}catch(e){gameMessage(e.message,3);}}
// Activate on press: walking cannot move out of range before a touch is released.
q('#bb-map-travel').addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();mapPointerTravelAt=clock;activateMapTravel();});
q('#bb-map-travel').addEventListener('click',e=>{if(e.detail!==0&&clock-mapPointerTravelAt<.8)return;activateMapTravel();});
document.addEventListener('keydown',e=>{if(playing&&e.key.toLowerCase()==='g'&&!e.repeat&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();try{travelMap();}catch(err){gameMessage(err.message,2);}}});
function registerMapTools(register){register({name:'manage_lego_maps',description:'Create, switch, preview and connect saved LEGO maps through named spawn points. Characters are shared; terrain, NPCs and damage belong to each map. Touch a connected gate while exploring to teleport, including between two points on the same map.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['read','create','copy','switch','preview','addSpawn','setSpawn','connect','travel','generateRandom']},mapId:{type:'integer'},spawnId:{type:'integer'},linkId:{type:'integer'},name:{type:'string'},count:{type:'integer',minimum:2,maximum:15},seed:{type:'integer',minimum:0,maximum:99999999},biomes:{type:'array',items:{type:'string'}},size:{type:'integer',enum:[16,24,32]},position:{type:'object',properties:{x:{type:'number'},y:{type:'number'},z:{type:'number'},heading:{type:'number'}},required:['x','y','z']},twoWay:{type:'boolean'},config:{type:'object'}},required:['action']},execute(input){if(!input)throw Error('Choose a map action.');let result;switch(input.action){case 'read':break;case 'generateRandom':result=generateConnectedWorlds(input);break;case 'create':result=createMap(input.config||worldConfig(),false,input.name);break;case 'copy':result=createMap(undefined,true,input.name);break;case 'switch':switchMap(input.mapId);break;case 'preview':previewMap(input.mapId,input.spawnId);break;case 'addSpawn':result=addMapSpawn(input.name);break;case 'setSpawn':if(input.spawnId){if(!activeMap().spawns.some(s=>s.id===input.spawnId))throw Error('Unknown spawn point.');mapSpawnId=input.spawnId;}if(!input.position)throw Error('Choose a spawn position.');result=setMapSpawn(input.position);break;case 'connect':result=connectMaps(input.mapId,input.spawnId,input.twoWay!==false);break;case 'travel':result=travelMap(input.linkId);break;default:throw Error('Unsupported map action.');}draw();return {result,network:exportMapNetwork()};}});}
