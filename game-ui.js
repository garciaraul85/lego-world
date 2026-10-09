// Game chrome stays local: no changes to projects, character assets, or controls.
const helpPages=[
 {title:'Become your own superhero.',text:'Clothing includes eleven hero costumes for either character type. Colors, masks, capes, prints, and powers stay editable. Choose a power from the exploration selector.',steps:[['Q','Use the selected power. Flight, climbing, and speed toggle on and off.'],['FLY','Drag to look in any direction, then fly with WASD or the pad. Space / Jump rises, Ctrl / Descend lowers, and Run accelerates.'],['POWER','Telekinesis: lift, then throw with Q. Freezing breath encases neighbors and creations in ice for five seconds. Mind reading shows their fictional thoughts.']]},
 {title:'Your world. Your adventure.',text:'Move through the world, meet its builders, and look for things to create. Keyboard and on-screen controls work together.',steps:[['WASD','Walk. Arrow keys work too.'],['SHIFT','Run. Hold Run and tap Jump on a touchscreen.'],['SPACE','Jump. Drag the scene to turn or tilt the camera, including up at the sky.']]},
 {title:'Break it. Build it back.',text:'Face a nearby creation to smash it into loose bricks. Its glowing build area shows where to stand; the arrow points at the creation you are restoring.',steps:[['WEAPON','F performs the equipped action: swing, slash, chop, strike, thrust, or shoot. Heavy weapons recover more slowly.'],['R','Reload firearms. Hold Shoot for automatic weapons. Drag the scene to face your target.'],['HOLD E','Hold Rebuild until the bar fills. Your weapon stows while both hands build. Walking or jumping cancels.']]},
 {title:'Build a place to explore.',text:'Open World to combine forests, cities, beaches, castles, and other landscapes. Pick the sky and weather, then generate your world.',steps:[['WORLD','Choose one or more environments. Connect named spawn points on this map or between maps. Touch a glowing gate to teleport; step out after arriving before entering again.'],['SKY','Mix rain, snow cover, and falling snow with any time of day. Look at sun / moon turns the camera toward the visible celestial body.'],['BRICKS','Place, rotate, move, copy, and remove bricks. Undo recovers a change.']]},
 {title:'Make your own minifigure.',text:'Choose a starting look, then open Appearance, Clothing, or Accessories. Browse with the side buttons or open a selector to see every option.',steps:[['LOOK','Change the face, hair, colors, and body options.'],['GEAR','Mix outfits, hats, glasses, and equipment.'],['EXPLORE','Your character is ready to play. Edits save automatically on this device.']]},
 {title:'Draw straight onto your character.',text:'Draw on parts opens the print workshop. The drawing starts with the colors and patterns already on your character, and your strokes appear on the 3D preview.',steps:[['PART','Choose the part and its side.'],['DRAW','Pick ink and brush size. Use Eraser or Undo stroke to adjust.'],['DONE','Done drawing saves your work. Rotate the preview to inspect every side.']]},
 {title:'Bring a photo. Meet a neighbor.',text:'From a photo picks up a person’s colors and prints. Choose the closest outfit, hairstyle, and accessories to finish the look. Explore to meet other minifigures.',steps:[['PHOTO','Frame one person, then choose the matching clothing and gear.'],['CREATE','Create from photo applies the look. Photos stay on this device.'],['T','Walk near a neighbor and tap Talk. Choose a topic or ask a question.']]}
];
let helpPage=0,helpFocus=null;
// Editing uses normal page scrolling on phones; exploration stays bounded.
function syncMobileEditor(){
 const width=root.clientWidth||window.innerWidth||780;
 root.dataset.editorScroll=String(!playing&&root.dataset.mobile==='true'&&(root.dataset.compact==='true'||width<=1024));
}
function gameOverlayOpen(){return mapDiagramOpen||!q('#bb-help-dialog').hidden||!q('#bb-system-menu').hidden;}
function syncGameUI(){
 syncMobileEditor();
 const caption=q('#bb-world-caption');if(caption){const biomes=world?.config?.biomes||[];caption.textContent=(biomes.length?biomes.map(v=>v.replaceAll('_',' ')).slice(0,2).join(' + '):'Free build')+' · '+environment.time+' · '+activeMap().name;}
 q('#bb-studio-note').hidden=!characterPreview;
}
function drawHelp(){
 const page=helpPages[helpPage];q('#bb-help-title').textContent=page.title;q('#bb-help-text').textContent=page.text;q('#bb-help-progress').textContent=(helpPage+1)+' / '+helpPages.length;
 q('#bb-help-back').disabled=helpPage===0;q('#bb-help-next').textContent=helpPage===helpPages.length-1?'Done':'Next';
 const list=q('#bb-help-steps');list.replaceChildren();
 for(const [key,text] of page.steps){const li=document.createElement('li'),kbd=document.createElement('kbd'),span=document.createElement('span');kbd.textContent=key;span.textContent=text;li.appendChild(kbd);li.appendChild(span);list.appendChild(li);}
}
function closeGameMenu(){q('#bb-system-menu').hidden=true;q('#bb-menu').setAttribute('aria-expanded','false');}
function setHelpInert(value){for(const id of ['bb-workspace-dock','bb-build-tools','bb-preview-tools','bb-play-hud','bb-weapon-bar','bb-game-info','bb-touch-controls','bb-canvas','bb-studio-note'])q('#'+id).inert=value;for(const el of root.querySelectorAll('header,aside,footer'))el.inert=value;}
function openGameHelp(){
 if(mapDiagramOpen)closeMapDiagram();
 closeGameMenu();helpFocus=document.activeElement;clearInput();pendingSmash=null;if(controller)controller.state.attack=0;helpPage=playing?0:characterPreview?4:3;drawHelp();q('#bb-help-dialog').hidden=false;setHelpInert(true);q('#bb-help-close').focus({preventScroll:true});
}
function closeGameHelp(){q('#bb-help-dialog').hidden=true;setHelpInert(false);clearInput();if(playing)canvas.focus({preventScroll:true});else helpFocus?.focus?.({preventScroll:true});dirty=true;}
q('#bb-help-dialog').hidden=true;q('#bb-system-menu').hidden=true;
q('#bb-help-open').addEventListener('click',openGameHelp);q('#bb-help-close').addEventListener('click',closeGameHelp);
q('#bb-help-back').addEventListener('click',()=>{helpPage=Math.max(0,helpPage-1);drawHelp();});
q('#bb-help-next').addEventListener('click',()=>{if(helpPage===helpPages.length-1)closeGameHelp();else{helpPage++;drawHelp();}});
q('#bb-menu').addEventListener('click',()=>{const open=q('#bb-system-menu').hidden;clearInput();pendingSmash=null;if(controller)controller.state.attack=0;q('#bb-system-menu').hidden=!open;q('#bb-menu').setAttribute('aria-expanded',String(open));});
q('#bb-system-menu').addEventListener('click',closeGameMenu);
document.addEventListener('keydown',e=>{
 const field=['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName);
 if(e.key==='Escape'&&gameOverlayOpen()){e.preventDefault();e.stopPropagation?.();if(mapDiagramOpen)closeMapDiagram();else if(!q('#bb-help-dialog').hidden)closeGameHelp();else{closeGameMenu();q('#bb-menu').focus();}return;}
 if(!field&&e.key.toLowerCase()==='h'&&q('#bb-dialog').hidden){e.preventDefault();if(q('#bb-help-dialog').hidden)openGameHelp();else closeGameHelp();return;}
 if(!q('#bb-help-dialog').hidden&&e.key==='Tab'){
  const buttons=Array.from(q('#bb-help-dialog').querySelectorAll('button:not([disabled])'));if(!buttons.length)return;const first=buttons[0],last=buttons.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }
},true);
// Native selectors remain accessible, with controller-like previous/next steps.
var gamePickers=[];
for(const select of root.querySelectorAll('select')){
 if(select.id==='bb-weapon')continue;
 const holder=document.createElement('div'),prev=document.createElement('button'),next=document.createElement('button');holder.className='game-picker';prev.type=next.type='button';prev.textContent='‹';next.textContent='›';
 const nativeLabel=select.labels?.[0],label=(nativeLabel?Array.from(nativeLabel.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim():'')||select.id.replace('bb-','').replaceAll('-',' ');prev.setAttribute('aria-label','Previous '+label);next.setAttribute('aria-label','Next '+label);
 if(nativeLabel&&select.id)nativeLabel.htmlFor=select.id;
 select.parentElement?.classList.add('has-picker');select.parentNode.insertBefore(holder,select);holder.appendChild(prev);holder.appendChild(select);holder.appendChild(next);
 function step(direction){const options=Array.from(select.options);if(options.length<2)return;let i=select.selectedIndex;for(let n=0;n<options.length;n++){i=(i+direction+options.length)%options.length;if(!options[i].disabled){select.selectedIndex=i;select.dispatchEvent(new Event('change',{bubbles:true}));break;}}}
 prev.addEventListener('click',()=>step(-1));next.addEventListener('click',()=>step(1));gamePickers.push({select,prev,next});
}
function refreshGamePickers(){for(const {select,prev,next} of (gamePickers||[]))prev.disabled=next.disabled=select.disabled||Array.from(select.options).filter(o=>!o.disabled).length<2;}
refreshGamePickers();syncGameUI();
