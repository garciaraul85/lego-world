// Build a complete, seeded, connected batch before changing the user's project.
const ConnectedWorlds=(()=>{
 function generate(input,bindCollision=()=>{}){
  const count=input?.count,seed=input?.seed,size=input?.size??24,pool=input?.biomes??WorldGenerator.biomes.map(b=>b[0]),maxLinks=input?.maxLinks??256;
  if(!Number.isInteger(count)||count<2||count>15)throw Error('Choose 2–15 new maps.');
  if(!Number.isInteger(seed)||seed<0||seed>99999999)throw Error('Use a whole network seed from 0 to 99999999.');
  if(![16,24,32].includes(size))throw Error('Choose a supported world size.');
  if(!Array.isArray(pool)||!pool.length||new Set(pool).size!==pool.length||pool.some(b=>!WorldGenerator.biomes.some(v=>v[0]===b)))throw Error('Choose at least one supported environment.');
  if(!Number.isInteger(maxLinks)||maxLinks<count)throw Error('Remove some connections to make room for this network.');
  let state=seed>>>0;const random=()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;},pick=a=>a[Math.floor(random()*a.length)],shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const ordered=shuffle(pool),usedSeeds=new Set(),maps=[];
  for(let i=0;i<count;i++){
   const primary=ordered[i%ordered.length],biomes=[primary];if(pool.length>1&&random()<.35)biomes.push(pick(pool.filter(b=>b!==primary)));
   let terrainSeed;do{terrainSeed=Math.floor(random()*100000000);}while(usedSeeds.has(terrainSeed));usedSeeds.add(terrainSeed);
   const cold=biomes.includes('mountains')&&random()<.6,snow=cold||!biomes.some(b=>['beach','desert','volcanoes'].includes(b))&&random()<.12;
   const config={biomes,size,seed:terrainSeed,time:pick(WorldGenerator.times),rain:!snow&&random()<.3,snow,snowing:snow&&random()<.6,mountainShape:pick(WorldGenerator.mountainShapes)[0],mountainScale:pick(WorldGenerator.mountainScales)[0]};
   const world=WorldGenerator.generate(config),controller=new GamePhysics.Controller(world.pieces,world);bindCollision(input.profile,controller);controller.state.heading=random()*Math.PI*2;controller.spawn();
   const npcs=[],ground=world.pieces.filter(p=>p.y===0);
   for(const n of NPCWorld.populate(world.pieces,world,controller.state)){
    bindCollision(n.profile,n.controller);const accepted=[controller.state,...npcs.map(n=>n.state)];n.controller.setActors(accepted);
    // Check both the articulated rig and the importer's cylinder before saving.
    const restored=Object.create(GamePhysics.Controller.prototype);Object.assign(restored,{pieces:n.controller.pieces,bins:n.controller.bins,world:n.controller.world,area:n.controller.area,state:{...n.state}});restored.setActors(accepted);
    let placed=false;for(let attempt=0;attempt<180;attempt++){
     let x=n.state.x,z=n.state.z;if(attempt){const b=GamePhysics.bounds(ground[Math.floor(n.random()*ground.length)]);x=b.x0+.4+n.random()*Math.max(.1,b.x1-b.x0-.8);z=b.z0+.4+n.random()*Math.max(.1,b.z1-b.z0-.8);}
     const y=n.controller.floor(x,z,1.35);if(y!==null&&n.controller.clear(x,y,z)&&restored.clear(x,y,z)){Object.assign(n.state,{x,y,z});n.home={x,y,z};placed=true;break;}
    }if(placed)npcs.push(n);
   }
   if(!npcs.length)throw Error('Could not place neighbors safely. Try another seed.');
   NPCWorld.connect(npcs,controller);if(!controller.clear(controller.state.x,controller.state.y,controller.state.z))controller.spawn();
   const s=controller.state,floor=controller.floor(s.x,s.z,s.y+.1);if(floor===null||Math.abs(floor-s.y)>.1||!controller.clear(s.x,s.y,s.z))throw Error('Could not find an open arrival point. Try another seed.');
   const point={x:s.x,y:s.y,z:s.z,heading:s.heading},name=WorldGenerator.biomes.find(b=>b[0]===primary)[1]+' '+(i+1);
   maps.push({name,spawns:[{id:1,name:'Crossroads',...point}],build:{pieces:world.pieces,world:{config:world.config,layoutVersion:world.layoutVersion,width:world.width,depth:world.depth},environment:{time:config.time,rain:config.rain,snow:config.snow,snowing:config.snowing},player:point,broken:[],npcs:NPCWorld.serialize(npcs)}});
  }
  const links=[],pairs=new Set(),link=(from,to)=>{const key=[Math.min(from,to),Math.max(from,to)].join(':');if(pairs.has(key)||links.length>=maxLinks)return;pairs.add(key);links.push({from,to,twoWay:true});};
  // -1 is the existing map; every parent precedes its child, so all are reachable.
  for(let i=0;i<count;i++)link(i===0?-1:Math.floor(random()*(i+1))-1,i);
  for(let i=1;i<count;i++)if(random()<.4)link(Math.floor(random()*(i+1))-1,i);
  return {seed,maps,links};
 }
 return {generate};
})();
