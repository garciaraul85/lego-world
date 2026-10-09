const WorldGenerator=(()=>{
'use strict';
const biomes=[['forest','Forest'],['city','City'],['prairie','Prairie'],['mountains','Mountains'],['volcanoes','Volcanoes'],['desert','Desert'],['beach','Beach'],['highway','Highway'],['castle_outside','Castle outside'],['castle_inside','Castle inside'],['rainforest','Rainforest']];
const times=['day','noon','evening','night'];
const foliage=['Oak','Birch','Pine','Autumn maple','Willow'];
const mountainShapes=[['mixed','Mixed natural'],['alpine','Sharp alpine peaks'],['ridges','Long mountain ridges'],['rolling','Rolling hills'],['plateau','Broad plateaus']];
const mountainScales=[['mixed','Mixed heights'],['low','Low'],['medium','Medium'],['high','High']];
function districtSize(config,version=2){return version===1?(config.biomes.some(b=>b.startsWith('castle'))?Math.max(24,config.size):config.size):config.biomes.some(b=>b==='city'||b.startsWith('castle'))?Math.max(48,config.size*2):config.size;}
function roads(config,version=2){const B=districtSize(config,version),cols=Math.ceil(Math.sqrt(config.biomes.length)),rows=Math.ceil(config.biomes.length/cols),width=cols*B,depth=rows*B,ox=-width/2,oz=-depth/2,result=[];for(let i=0;i<config.biomes.length;i++)if(config.biomes[i]==='city'){const x=ox+i%cols*B,z=oz+Math.floor(i/cols)*B;for(let a=0;a<B;a+=version===1?12:16){result.push({x:x+a,z,w:4,d:B,axis:'z',type:'city'},{x,z:z+a,w:B,d:4,axis:'x',type:'city'});}}if(config.biomes.includes('highway'))result.push({x:ox,z:oz+Math.floor(depth/8)*4,w:width,d:8,axis:'x',type:'highway'});return result;}
function isRoadMark(p,config,version=2){if(p.y!==1||p.kind!=='tile'||p.group||![2,5].includes(p.color)||!config?.biomes.includes('highway'))return false;const r=roads(config,version).find(r=>r.type==='highway'),w=p.turn%2?p.rows:p.cols,d=p.turn%2?p.cols:p.rows;if(p.x<r.x||p.x>=r.x+r.w||(p.x-r.x)%4!==0||d!==1)return false;return p.color===2?w===2&&p.z===r.z+3:w===4&&(p.z===r.z||p.z===r.z+7);}
function isPavement(p,config,version=2){if(p.y!==0||p.color!==6||!config)return false;const w=p.turn%2?p.rows:p.cols,d=p.turn%2?p.cols:p.rows,x=p.x+w/2,z=p.z+d/2;return roads(config,version).some(r=>x>=r.x&&x<r.x+r.w&&z>=r.z&&z<r.z+r.d);}
function validate(config){if(!config||!Array.isArray(config.biomes)||!config.biomes.length||config.biomes.some(b=>!biomes.some(v=>v[0]===b))||new Set(config.biomes).size!==config.biomes.length)throw Error('Choose at least one environment.');if(!times.includes(config.time))throw Error('Choose a time of day.');if(![16,24,32].includes(config.size))throw Error('Choose a supported world size.');if(!Number.isInteger(config.seed)||config.seed<0||config.seed>99999999)throw Error('Use a whole seed from 0 to 99999999.');for(const k of ['rain','snow','snowing'])if(typeof config[k]!=='boolean')throw Error('Weather options must be on or off.');const mountainShape=config.mountainShape??'mixed',mountainScale=config.mountainScale??'mixed';if(!mountainShapes.some(v=>v[0]===mountainShape)||!mountainScales.some(v=>v[0]===mountainScale))throw Error('Choose a supported mountain shape and height.');return {...config,biomes:[...config.biomes],mountainShape,mountainScale};}
function generate(input){
 const config=validate(input);let state=config.seed>>>0;
 const random=()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
 const hash=(x,z)=>{let n=Math.imul(x+config.seed,374761393)+Math.imul(z,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
 const B=districtSize(config);
 const columns=Math.ceil(Math.sqrt(config.biomes.length)),rows=Math.ceil(config.biomes.length/columns),width=columns*B,depth=rows*B,ox=-Math.floor(width/2),oz=-Math.floor(depth/2);
 let groupSerial=1,activeGroup=null;const pieces=[],occupied=new Set(),tops=new Set(),surface=new Map(),regions=[];
 const key=(x,z,y)=>x+','+z+','+y,foot=(x,z)=>x+','+z;
 const shapes=new Set(['1,1','1,2','1,3','1,4','1,6','1,8','2,2','2,3','2,4','2,6','2,8','4,4','4,8','8,8']);
 function put(x,z,y,w,d,kind,color){
  const h=kind==='brick'?3:1,r=Math.min(w,d),c=Math.max(w,d);if(!shapes.has(r+','+c))throw Error('Unsupported generated piece shape.');
  let supported=y===0;
  for(let i=0;i<w;i++)for(let j=0;j<d;j++){if(tops.has(key(x+i,z+j,y)))supported=true;for(let k=0;k<h;k++)if(occupied.has(key(x+i,z+j,y+k)))return false;}
  if(!supported)return false;
  const p={id:pieces.length+1,rows:r,cols:c,turn:w===c?0:1,x,y,z,kind,color};if(activeGroup)p.group=activeGroup;pieces.push(p);
  for(let i=0;i<w;i++)for(let j=0;j<d;j++){for(let k=0;k<h;k++)occupied.add(key(x+i,z+j,y+k));if(kind!=='tile')tops.add(key(x+i,z+j,y+h));surface.set(foot(x+i,z+j),Math.max(surface.get(foot(x+i,z+j))||0,y+h));}return true;
 }
 function level(x,z,w=1,d=1){let y=0;for(let i=0;i<w;i++)for(let j=0;j<d;j++)y=Math.max(y,surface.get(foot(x+i,z+j))||0);return y;}
 function rectangle(x,z,y,w,d,kind,color){for(let a=0;a<w;){const cw=[8,4,2,1].find(n=>n<=w-a);for(let b=0;b<d;){const cd=[8,4,2,1].find(n=>n<=d-b);put(x+a,z+b,y,cw,cd,kind,color);b+=cd;}a+=cw;}}
 // Each storey has 7.2 studs of headroom plus a floor plate. Four-stud
 // doorways lead into hollow rooms; all surfaces remain editable bricks.
 function building(x,z,w,d,storeys,wall,house=false){return grouped(house?'house':'skyscraper',()=>{
  const stride=19,door=Math.floor((w-4)/2);
  for(let floor=0;floor<storeys;floor++){
   const base=1+floor*stride;
   for(let layer=0;layer<6;layer++){
    const y=base+layer*3,window=layer===2||layer===3,color=window?13:wall;
    rectangle(x,z,y,w,1,'brick',color);rectangle(x,z+1,y,1,d-2,'brick',wall);rectangle(x+w-1,z+1,y,1,d-2,'brick',wall);
    if(floor===0){rectangle(x,z+d-1,y,door,1,'brick',wall);rectangle(x+door+4,z+d-1,y,w-door-4,1,'brick',wall);}
    else rectangle(x,z+d-1,y,w,1,'brick',color);
   }
   rectangle(x,z,base+18,w,d,'plate',floor===storeys-1?11:10);
  }
  const roof=1+storeys*stride;
  if(house){const color=[0,8,4][Math.floor(random()*3)];for(let layer=0;layer<3;layer++)rectangle(x+layer*2,z-1,roof+layer*3,w-layer*4,d+2,'brick',color);rectangle(x+4,z-1,roof+9,w-8,d+2,'tile',color);}
  else{rectangle(x,z,roof,w,1,'brick',wall);rectangle(x,z+d-1,roof,w,1,'brick',wall);rectangle(x,z+1,roof,1,d-2,'brick',wall);rectangle(x+w-1,z+1,roof,1,d-2,'brick',wall);for(let l=0;l<4;l++)put(x+2,z+2,roof+l*3,1,1,'brick',11);}
 });}
 function _tower(x,z,y,layers=18){for(let i=0;i<layers;i++){rectangle(x,z,y+i*3,8,2,'brick',i%3===0?11:10);rectangle(x,z+6,y+i*3,8,2,'brick',10);rectangle(x,z+2,y+i*3,2,4,'brick',10);rectangle(x+6,z+2,y+i*3,2,4,'brick',10);}const t=y+layers*3;put(x,z,t,8,8,'plate',10);for(const dx of [0,3,6])for(const dz of [0,6])put(x+dx,z+dz,t+1,2,2,'brick',14);}
 function _tree(x,z,y,tropical=false,style=foliage[Math.floor(random()*foliage.length)]){
  const n=tropical?20+Math.floor(random()*9):12+Math.floor(random()*7),trunk=style==='Birch'?5:8;
  for(let l=0;l<n;l++)put(x+3,z+3,y+l*3,2,2,'brick',style==='Birch'&&l%4===1?11:trunk);
  const top=y+n*3,leaf=tropical?16:style==='Autumn maple'?4:style==='Willow'?12:3;
  if(style==='Pine'&&!tropical){
   for(let l=0;l<10;l++){const w=l<3?8:l<6?4:2;rectangle(x+(8-w)/2,z+(8-w)/2,top+l*3,w,w,'brick',l%2?16:3);}
  }else{
   put(x,z,top,8,8,'plate',leaf);put(x,z,top+1,8,8,'brick',leaf);
   put(x+2,z,top+4,4,8,'brick',style==='Autumn maple'?2:tropical?3:12);
   put(x+2,z+2,top+7,4,4,'brick',leaf);
   if(style==='Willow'){for(const [dx,dz,w,d] of [[0,0,1,8],[7,0,1,8],[1,0,6,1],[1,7,6,1]])rectangle(x+dx,z+dz,top+4,w,d,'brick',12);}
   if(random()<.65)put(x+3,z+2,top+10,2,4,'plate',style==='Autumn maple'?17:3);
  }
 }
 function undergrowth(x,z,y,style){return grouped(style,()=>{
  if(style==='fern'){put(x+1,z+1,y,1,1,'brick',16);put(x,z+1,y+3,3,1,'plate',12);put(x+1,z,y+4,1,3,'plate',3);}
  else if(style==='mushroom'){put(x+1,z+1,y,1,1,'brick',14);put(x,z,y+3,2,2,'plate',0);put(x+1,z+1,y+4,1,1,'tile',5);}
  else{put(x+1,z+1,y,1,1,'brick',8);put(x,z,y+3,4,4,'brick',style==='flower-bush'?12:16);put(x+1,z+1,y+6,2,2,'plate',3);if(style==='flower-bush')for(const [a,b] of [[0,0],[3,2],[1,3]])put(x+a,z+b,y+6,1,1,'tile',[7,15,2][Math.floor(random()*3)]);}
 });}
 // Merge equal-height terrain cells into broad bricks instead of filling
 // every peak with thousands of tiny columns. All layers remain supported.
 function terrain(x,z,volcanic=false){
  const N=B/2,heights=Array.from({length:N},()=>Array(N).fill(0)),peak=volcanic?30:48,cx=B*.50,cz=B*.50,radius=B*.46,crater=B*.15;
  const variation=hash(x+19,z+41),angle=(variation-.5)*1.3,ca=Math.cos(angle),sa=Math.sin(angle),shape=config.mountainShape;
  const hills=[[.35,.38,.37,.30,34],[.69,.68,.29,.37,26],[.25,.76,.24,.19,15]].map(([u,v,rx,rz,h],i)=>({u:u*B,v:v*B,rx:rx*B*(.92+.16*hash(x+i,z+17)),rz:rz*B,h:(config.mountainScale==='mixed'?h:{low:10,medium:22,high:40}[config.mountainScale]*(i===0?1:i===1?.78:.48))*(.93+.14*hash(x+i,z+29)),shape:shape==='mixed'?['alpine','ridges','rolling'][i]:shape}));
  const ridge=(px,pz)=>{let value=0;const count=5;for(let i=0;i<count-1;i++){const ax=B*(.12+i*.18),az=B*(.49+Math.sin(i*.9+variation*3)*.17),bx=B*(.12+(i+1)*.18),bz=B*(.49+Math.sin((i+1)*.9+variation*3)*.17),dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/(dx*dx+dz*dz))),d=Math.hypot(px-ax-t*dx,pz-az-t*dz)/(B*.19),h=(config.mountainScale==='mixed'?30:{low:10,medium:22,high:40}[config.mountainScale])*(.78+.22*Math.sin(i*.8+variation*2));value=Math.max(value,h*Math.pow(Math.max(0,1-d),1.25));}return value;};
  for(let a=0;a<N;a++)for(let b=0;b<N;b++){
   if(isRoad(x+a*2,z+b*2)||isRoad(x+a*2,z+b*2+1))continue;
   const px=a*2+1,pz=b*2+1,r=Math.hypot(px-cx,pz-cz);
   if(volcanic)heights[a][b]=Math.max(0,Math.floor(r<crater?peak-8:peak*Math.max(0,1-(r-crater)/(radius-crater))));
   else{
    let high=shape==='ridges'?ridge(px,pz):0;
    if(shape!=='ridges')for(const hill of hills){const dx=px-hill.u,dz=pz-hill.v,u=(dx*ca-dz*sa)/hill.rx,v=(dx*sa+dz*ca)/hill.rz,r=Math.hypot(u,v);let slope=0;
     if(hill.shape==='rolling')slope=r<1?Math.pow(Math.cos(r*Math.PI/2),1.8):0;
     else if(hill.shape==='plateau')slope=Math.max(0,Math.min(1,(1-r)/.62));
     else if(hill.shape==='ridges')slope=Math.pow(Math.max(0,1-Math.hypot(u*.62,v)),1.2);
     else slope=Math.pow(Math.max(0,1-r),1.25);
     high=Math.max(high,hill.h*slope);
    }
    // Low frequency folds break up perfect cones without a noisy grid of spikes.
    const folds=Math.sin(px*.39+variation*5)*Math.cos(pz*.31-variation*3)*(shape==='rolling'?.4:1.3);
    heights[a][b]=Math.max(0,Math.min(47,Math.floor(high+(high>1?folds:0))));
   }
  }
  for(let l=0;l<peak;l++){
   const done=new Set(),color=volcanic?(l%6===0?6:11):shape==='rolling'&&l<5?12:l>=22?5:l>=12?10:11;
   for(let a=0;a<N;a++)for(let b=0;b<N;b++)if(heights[a][b]>l&&!done.has(a+','+b)){
    const span=(w,d)=>a+w<=N&&b+d<=N&&Array.from({length:w},(_,i)=>Array.from({length:d},(_,j)=>heights[a+i][b+j]>l&&!done.has((a+i)+','+(b+j))).every(Boolean)).every(Boolean);
    const [w,d]=[[4,4],[4,2],[2,4],[2,2],[4,1],[1,4],[2,1],[1,2],[1,1]].find(([w,d])=>span(w,d));
    put(x+a*2,z+b*2,1+l*3,w*2,d*2,'brick',color);for(let i=0;i<w;i++)for(let j=0;j<d;j++)done.add((a+i)+','+(b+j));
   }
  }
  if(volcanic)for(let a=0;a<N;a++)for(let b=0;b<N;b++){
   const px=a*2+1,pz=b*2+1,r=Math.hypot(px-cx,pz-cz),h=heights[a][b];
   if(h>0&&(r<crater||pz>cz&&Math.abs(px-cx-Math.sin(pz*.45)*1.4)<1.6))put(x+a*2,z+b*2,1+h*3,2,2,'tile',hash(x+a,z+b)<.5?0:4);
  }
 }
 function _palm(x,z,y){const n=12+Math.floor(random()*7);for(let l=0;l<n;l++)put(x+3,z+3,y+l*3,1,1,'brick',8);put(x,z+3,y+n*3,8,1,'plate',3);put(x+3,z,y+n*3+1,1,8,'plate',12);put(x+3,z+3,y+n*3+2,2,2,'plate',3);put(x+3,z+3,y+n*3+3,1,1,'tile',9);}
 function _cactus(x,z,y){const n=2+Math.floor(random()*3);for(let l=0;l<n;l++)put(x+1,z+1,y+l*3,1,1,'brick',3);const arm=y+3;put(x,z+1,arm,3,1,'plate',3);put(x,z+1,arm+1,1,1,'brick',3);put(x+2,z+1,arm+1,1,1,'brick',3);}
 function _car(x,z,y){put(x,z,y,2,4,'plate',6);put(x,z,y+1,2,4,'brick',random()<.5?0:4);put(x,z+1,y+4,2,2,'brick',13);put(x,z,y+4,2,1,'tile',14);}
 function grouped(name,fn){const old=activeGroup;activeGroup=name+'-'+groupSerial++;try{return fn();}finally{activeGroup=old;}}
 function tree(x,z,y,tropical=false){const style=tropical?'Rainforest':foliage[Math.floor(random()*foliage.length)];return grouped('tree-'+style.toLowerCase().replaceAll(' ','-'),()=>_tree(x,z,y,tropical,style));}
 function palm(...args){return grouped('palm',()=>_palm(...args));}
 function cactus(...args){return grouped('cactus',()=>_cactus(...args));}
 function car(...args){return grouped('car',()=>_car(...args));}
 function tower(...args){return grouped('tower',()=>_tower(...args));}
 const roadRow=Math.floor(depth/8)*4;
 function isRoad(x,z){return config.biomes.includes('highway')&&z>=oz+roadRow&&z<oz+roadRow+8;}
 // A shared ground grid stitches all selected districts into one editable world.
 for(let index=0;index<columns*rows;index++){
  const biome=config.biomes[index]||config.biomes[0],x=ox+(index%columns)*B,z=oz+Math.floor(index/columns)*B;
  if(index<config.biomes.length)regions.push({biome,x,z,width:B,depth:B});
  const grid=B>=48&&biome!=='city'?8:4;
  for(let a=0;a<B;a+=grid)for(let b=0;b<B;b+=grid){let color=3;
   if(biome==='prairie')color=hash(x+a,z+b)<.55?12:3;
   if(biome==='mountains')color=10;if(biome==='volcanoes')color=11;
   if(biome==='desert')color=hash(x+a,z+b)<.3?14:9;
   if(biome==='rainforest')color=16;
   if(biome==='beach')color=a<B/3?13:9;
   if(biome==='city')color=a%16===0||b%16===0?6:10;
   if(biome==='highway')color=12;
   if(biome==='castle_outside')color=a>=4&&a<B-4&&b>=4&&b<B-4?10:3;
   if(biome==='castle_inside')color=((a+b)/4)%2===0?10:8;
   if(isRoad(x+a,z+b))color=6;
   put(x+a,z+b,0,grid,grid,'plate',color);
  }
 }
 for(const r of regions){const {biome,x,z}=r;
  if(biome==='forest'||biome==='rainforest'){
   const spacing=B>=48&&config.biomes.length>=8?12:8;
   for(let a=0;a<=B-8;a+=spacing)for(let b=0;b<=B-8;b+=spacing)if(!isRoad(x+a,z+b)&&!isRoad(x+a,z+b+7)&&random()<(biome==='rainforest'?.90:.72)){tree(x+a,z+b,1,biome==='rainforest');if(biome==='rainforest'&&random()<.4)put(x+a,z+b,1,1,1,'plate',15);}
  }
  if(['forest','rainforest','prairie'].includes(biome))for(let a=1;a<=B-4;a+=8)for(let b=1;b<=B-4;b+=8)if(!isRoad(x+a,z+b)&&!isRoad(x+a,z+b+3)){const styles=biome==='rainforest'?['fern','shrub','mushroom']:['flower-bush','shrub','mushroom'];undergrowth(x+a,z+b,1,styles[Math.floor(random()*styles.length)]);}
  if(biome==='mountains'||biome==='volcanoes')terrain(x,z,biome==='volcanoes');
  if(biome==='prairie')for(let i=0;i<B*2;i++){const a=Math.floor(random()*B),b=Math.floor(random()*B);if(!isRoad(x+a,z+b)){put(x+a,z+b,1,1,1,'plate',12);put(x+a,z+b,2,1,1,'tile',[0,2,7,15][Math.floor(random()*4)]);}}
  if(biome==='desert'){
   const peaks=[[B*.38,B*.48,B*.28,2],[B*.75,B*.7,B*.25,2]];
   for(let a=0;a<B;a+=2)for(let b=0;b<B;b+=2){if(isRoad(x+a,z+b))continue;let high=0;for(const [px,pz,radius,h] of peaks)high=Math.max(high,Math.floor(Math.max(0,1-Math.hypot(a-px,b-pz)/radius)*h+.3*hash(x+a,z+b)));for(let l=0;l<high;l++)put(x+a,z+b,1+l*3,2,2,'brick',9);}
   if(biome==='desert')for(let i=0;i<Math.max(3,B/5);i++){const a=Math.floor(random()*(B-4)),b=Math.floor(random()*(B-4));if(!isRoad(x+a,z+b))cactus(x+a,z+b,level(x+a+1,z+b+1));}
  }
  if(biome==='beach'){
   for(let a=0;a<B/3;a+=4)for(let b=0;b<B;b+=4){if(!isRoad(x+a,z+b)&&hash(x+a,z+b)>.55)put(x+a,z+b,1,4,1,'tile',5);}
   for(let a=Math.ceil(B/3/8)*8;a<=B-8;a+=8)for(let b=0;b<=B-8;b+=8)if(!isRoad(x+a,z+b)&&!isRoad(x+a,z+b+7))palm(x+a,z+b,1);
   for(let i=0;i<5;i++){const a=Math.ceil(B/2)+Math.floor(random()*(B/2-2)),b=Math.floor(random()*(B-2));if(!isRoad(x+a,z+b))put(x+a,z+b,1,1,2,'tile',[0,2,15][i%3]);}
  }
  if(biome==='city'){
   let lot=0;
   for(let a=4;a<B-10;a+=16)for(let b=4;b<B-10;b+=16){const house=lot++%3===0,w=house?10:8,d=house?8:10,bx=x+a+1,bz=z+b+1;if(isRoad(bx,bz)||isRoad(bx,bz+d))continue;
    building(bx,bz,w,d,house?1+Math.floor(random()*2):6+Math.floor(random()*5),[5,10,11,17][Math.floor(random()*4)],house);
   }
   for(let b=2;b<B;b+=8){if(!isRoad(x,z+b)){for(let n=0;n<3;n++)put(x,z+b,1+n*3,1,1,'brick',11);put(x,z+b,10,1,2,'plate',2);}}
  }
  if(biome==='castle_outside'){
   grouped('castle-wall',()=>{const span=B-24,gate=Math.floor(B/2)-4;
    for(let l=0;l<10;l++){const y=1+l*3;rectangle(x+12,z+4,y,span,2,'brick',10);rectangle(x+4,z+12,y,2,span,'brick',10);rectangle(x+B-6,z+12,y,2,span,'brick',10);
     if(l<6){rectangle(x+12,z+B-6,y,gate-12,2,'brick',10);rectangle(x+gate+8,z+B-6,y,B-12-gate-8,2,'brick',10);}
     else if(l===6)rectangle(x+gate-2,z+B-6,y,12,2,'brick',10);else rectangle(x+12,z+B-6,y,span,2,'brick',10);
    }
    for(let a=12;a<B-12;a+=4){put(x+a,z+4,31,2,2,'brick',14);put(x+a,z+B-6,31,2,2,'brick',14);}
   });
   for(const a of [4,B-12])for(const b of [4,B-12])tower(x+a,z+b,1);
   building(x+Math.floor(B/2)-6,z+12,12,12,3,10);
  }
  if(biome==='castle_inside'){
   for(let l=0;l<12;l++){for(let a=0;a<B;a+=4)put(x+a,z,1+l*3,4,1,'brick',10);for(let b=4;b<B;b+=4){put(x,z+b,1+l*3,1,4,'brick',10);put(x+B-1,z+b,1+l*3,1,4,'brick',10);}}
   for(const a of [4,B-6])for(const b of [4,B-7]){for(let l=0;l<10;l++)put(x+a,z+b,1+l*3,2,2,'brick',l%2?11:10);put(x+a-1,z+b,31,4,2,'plate',14);}
   const cx=x+Math.floor(B/2)-1;for(let l=0;l<4;l++)put(cx,z+3,1+l*3,2,1,'brick',0);put(cx,z+4,1,2,2,'brick',0);put(cx,z+4,4,2,2,'plate',0);put(cx,z+3,13,2,1,'tile',2);
   for(const dx of [0,1])put(cx+dx,z+5,5,1,1,'brick',2);
   const tx=x+Math.floor(B/2)-4,tz=z+Math.floor(B/2)+3;
   for(const dx of [0,7])for(const dz of [0,1])for(let l=0;l<2;l++)put(tx+dx,tz+dz,1+l*3,1,1,'brick',8);
   put(tx,tz,7,8,2,'plate',8);for(const dx of [1,6]){put(tx+dx,tz,8,1,1,'brick',14);put(tx+dx,tz,11,1,1,'plate',2);}
   for(let b=4;b<B;b+=4)put(cx,z+b,1,2,2,'plate',0);
  }
 }
 if(config.biomes.includes('highway')){
  const rz=oz+roadRow;
  for(let x=ox+3;x<ox+width-3;x+=12)car(x,rz+1,1);
 }
 return {pieces,regions,width,depth,config,layoutVersion:2};
}
return {biomes,foliage,mountainShapes,mountainScales,times,validate,generate,districtSize,roads,isRoadMark,isPavement};
})();
