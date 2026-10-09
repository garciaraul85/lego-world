// Full screen changes the presentation only; the world, player, and camera persist.
let screenPending=false,screenPrevious=null,expandedOverflow=null;
function nativeGameFullscreen(){return document.fullscreenElement===root||document.webkitFullscreenElement===root;}
function gameScreenActive(){return nativeGameFullscreen()||root.dataset.display==='expanded';}
function gameScreenMetrics(){
 const width=Math.max(1,root.clientWidth||window.innerWidth||780),viewportHeight=Math.max(1,window.innerHeight||636);
 const orientation=window.screen?.orientation,legacy=window.orientation;
 const angle=Number.isFinite(orientation?.angle)?orientation.angle:Number.isFinite(legacy)?legacy:0;
 const rotation=((angle%360)+360)%360;
 // Narrow embeds and touch devices both need the bounded game shell. A coarse
 // pointer alone misses phones with a mouse, and some mobile web views.
 const mobile=width<=760||!!window.matchMedia?.('(any-pointer: coarse)').matches||(navigator.maxTouchPoints||0)>0;
 const embedded=!!window.top&&window.top!==window;
 let physicalHeight=window.screen?.availHeight||window.screen?.height||0;const physicalWidth=window.screen?.availWidth||window.screen?.width||0;
 if(physicalHeight&&physicalWidth&&orientation?.type)physicalHeight=orientation.type.startsWith('landscape')?Math.min(physicalWidth,physicalHeight):Math.max(physicalWidth,physicalHeight);
 let height=Math.min(viewportHeight,window.visualViewport?.height||viewportHeight),layoutHeight=viewportHeight;
 if(embedded&&physicalHeight>0&&!nativeGameFullscreen()){
  // An auto-sized iframe reports its own document height, not the phone's
  // visible viewport. Bound it to the device and leave room for host chrome.
  layoutHeight=Math.min(layoutHeight,physicalHeight);height=Math.min(height,Math.floor(physicalHeight*.82));
  try{height=Math.min(height,window.top.visualViewport?.height||window.top.innerHeight||height);}catch{}
 }
 const editing=['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName),sameDevice=screenPrevious&&screenPrevious.width===width&&screenPrevious.rotation===rotation;
 if(editing&&sameDevice)layoutHeight=screenPrevious.layoutHeight||layoutHeight;
 const layout=editing&&sameDevice?screenPrevious.layout:width>layoutHeight?'landscape':'portrait';
 const fit=true;height=Math.max(1,Math.floor(height));
 const compact=width<=600||mobile&&Math.min(width,layoutHeight)<=500;
 return {width,height,layoutHeight,rotation,layout,mobile,compact,fit,keyboard:editing&&height<layoutHeight*.75,short:fit&&layout==='landscape'&&height<600};
}
function resizeGameScreen(forceCancel=false){
 const next=gameScreenMetrics();
 if(forceCancel||screenPrevious&&(next.rotation!==screenPrevious.rotation||next.layout!==screenPrevious.layout)){clearInput();cancelCameraGesture();}
 screenPrevious=next;
 root.dataset.layout=next.layout;root.dataset.rotation=String(next.rotation);root.dataset.mobile=String(next.mobile);root.dataset.fit=String(next.fit);root.dataset.short=String(next.short);root.dataset.keyboard=String(next.keyboard);
 root.dataset.dock=next.mobile&&next.layout==='portrait'?'bottom':next.width>760||next.short?'side':'bottom';
 root.dataset.compact=String(next.compact);syncMobileEditor();
 root.style?.setProperty('--editor-panel-width',Math.min(320,Math.max(220,Math.round(next.width*.38)))+'px');
 root.style?.setProperty('--game-view-height',next.height+'px');
 root.style?.setProperty('--editor-scene-height',Math.min(440,Math.max(260,Math.round(next.height*.55)))+'px');
 // Use the real header height so text scaling and safe-area insets also fit.
 root.style?.setProperty('--game-header-height',(q('#bb-game-header').getBoundingClientRect().height||66)+'px');
 dirty=true;
}
function syncGameScreen(){
 if(nativeGameFullscreen())root.dataset.display='fullscreen';
 else if(root.dataset.display!=='expanded')root.dataset.display='window';
 const active=gameScreenActive(),expanded=root.dataset.display==='expanded',button=q('#bb-fullscreen');
 button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?(expanded?'Exit expanded view':'Exit full screen'):'Enter full screen');
 button.title=active?(expanded?'Exit expanded view':'Exit full screen'):'Full screen';
 q('#bb-fullscreen-label').textContent=active?(expanded?'Expanded':'Exit screen'):'Full screen';
 q('#bb-fullscreen-icon').textContent=active?'⊡':'⛶';button.disabled=screenPending;
 resizeGameScreen(true);
}
function setExpandedScreen(value){
 if(value){expandedOverflow=document.body?.style.overflow??null;if(document.body)document.body.style.overflow='hidden';root.dataset.display='expanded';}
 else{root.dataset.display='window';if(document.body&&expandedOverflow!==null)document.body.style.overflow=expandedOverflow;expandedOverflow=null;}
 syncGameScreen();
 q('#bb-screen-status').textContent=value?'Expanded view. Device full screen is unavailable here. Use the screen button or Escape to return.':'Returned to the normal game view.';
}
async function toggleGameScreen(){
 if(screenPending)return;
 closeGameMenu();clearInput();cancelCameraGesture();
 if(root.dataset.display==='expanded'){setExpandedScreen(false);return;}
 screenPending=true;q('#bb-fullscreen').disabled=true;
 try{
  if(nativeGameFullscreen()){
   const exit=document.exitFullscreen||document.webkitExitFullscreen;if(!exit)throw Error('Full screen exit is unavailable');await exit.call(document);
   q('#bb-screen-status').textContent='Returned to the normal game view.';
  }else{
   const enter=root.requestFullscreen||root.webkitRequestFullscreen;
   if(!enter){setExpandedScreen(true);return;}
   try{await enter.call(root,{navigationUI:'hide'});q('#bb-screen-status').textContent='Full screen. Rotate your device freely. Use the screen button or Escape to return.';}
   catch{if(!nativeGameFullscreen())setExpandedScreen(true);}
  }
 }catch{q('#bb-screen-status').textContent='Use your browser’s full-screen exit control to return.';}
 finally{screenPending=false;syncGameScreen();}
}
q('#bb-fullscreen').addEventListener('click',toggleGameScreen);
for(const event of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(event,()=>{
 if(root.dataset.display==='fullscreen'&&!nativeGameFullscreen())root.dataset.display='window';syncGameScreen();
});
window.addEventListener('resize',()=>resizeGameScreen());
window.addEventListener('orientationchange',()=>resizeGameScreen(true));
window.screen?.orientation?.addEventListener?.('change',()=>resizeGameScreen(true));
window.visualViewport?.addEventListener('resize',()=>resizeGameScreen());
try{if(window.top&&window.top!==window)window.top.visualViewport?.addEventListener('resize',()=>resizeGameScreen());}catch{}
// A container or header can resize without a window event (embedded views,
// larger text, and opening/closing browser chrome).
const gameScreenObserver=new ResizeObserver(()=>resizeGameScreen());gameScreenObserver.observe(root);gameScreenObserver.observe(q('#bb-game-header'));
document.addEventListener('keydown',e=>{
 if(e.key!=='Escape'||gameOverlayOpen()||!q('#bb-dialog').hidden||!gameScreenActive())return;
 if(root.dataset.display==='expanded'){e.preventDefault();setExpandedScreen(false);}
 // Native Escape belongs to the browser. It must not leave exploration.
},true);
syncGameScreen();
