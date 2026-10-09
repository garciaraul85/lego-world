const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
let source=fs.readFileSync(path.join(__dirname,'characters.cjs'),'utf8').split('const b=boot(),call=')[0];
source=source.replace('style={setProperty(){}}','style={values:{},setProperty(k,v){this.values[k]=v;}}');
source=source.replace('root={dataset:{},','root={style:elements["#brick-builder"].style,dataset:elements["#brick-builder"].dataset,');
source=source.replace('doc={addEventListener(){},',`doc={events:{},addEventListener(type,f){(this.events[type]||=[]).push(f);},`);
source=source.replace('const context={document:doc,window:{devicePixelRatio:1,addEventListener(){},location:{reload(){}}},',`
const win={devicePixelRatio:1,innerWidth:390,innerHeight:844,events:{},addEventListener(type,f){(this.events[type]||=[]).push(f);},location:{reload(){}},matchMedia:()=>({matches:true}),screen:{orientation:{type:'portrait-primary',angle:0,events:{},addEventListener(type,f){(this.events[type]||=[]).push(f);}}},visualViewport:{height:844,events:{},addEventListener(type,f){(this.events[type]||=[]).push(f);}}};
elements['#bb-game-header'].getBoundingClientRect=()=>({height:60});
elements['#bb-inventory'].getBoundingClientRect=()=>({width:248});
elements['#bb-canvas'].getBoundingClientRect=()=>({width:win.innerWidth,height:win.visualViewport.height-60,left:0,top:0});
let lastViewport;gl.viewport=(...a)=>{lastViewport=a;};
const context={document:doc,window:win,`);
source=source.replace("split('</script>')[0],context);",`split('</script>')[0].replace(/\\}\\)\\(\\);\\s*$/, 'globalThis.screenQA={root,metrics:gameScreenMetrics,resize:resizeGameScreen,camera,fit,toggle:toggleGameScreen,draw,frame:gameFrame,angles:()=>[yaw,pitch,zoom],inputs:()=>({run:runHeld.size,jump:jumpHeld.size,move:touchMove.size,pointers:pointers.size}),clear:clearInput};})();'),context);`);
source=source.replace('return {tools,elements,buttons',`return {qa:context.screenQA,win,doc,viewport:()=>lastViewport,emit:(target,type)=>{for(const f of target.events[type]||[])f();},key:key=>{for(const f of doc.events.keydown||[])f({key,target:elements['#bb-canvas'],preventDefault(){},stopPropagation(){}});},tools,elements,buttons`);
const sandbox={require,console,__dirname,Event,setTimeout,AbortController,Blob,URL};vm.runInNewContext(source+'globalThis.boot=boot;',sandbox);
const b=sandbox.boot(),el=id=>b.elements['#'+id],qa=b.qa,emit=b.emit;
async function main(){
 const call=(name,args)=>b.tools.get(name).execute(args);
 // Studio/editor must fit before the user enters play or requests full screen.
 assert.equal(qa.root.dataset.mode,'preview');assert.equal(qa.root.dataset.fit,'true');assert.equal(qa.root.style.values['--game-view-height'],'844px');
 assert.equal(qa.root.dataset.compact,'true');assert.equal(qa.root.dataset.editorScroll,'true','phone editors use page scrolling');
 call('explore_lego_world',{playing:true});assert.equal(qa.root.dataset.editorScroll,'false','exploration keeps its fitted screen');const initial=b.read(),position=()=>JSON.stringify([b.read().player.x,b.read().player.y,b.read().player.z,b.read().player.heading]);
 const player=position(),angles=JSON.stringify(qa.angles()),pieces=JSON.stringify(initial.pieces);
 assert.equal(qa.root.dataset.layout,'portrait');assert.equal(qa.root.dataset.dock,'bottom');
 b.fire('bb-run','pointerdown',{pointerId:1,preventDefault(){}});b.fire('bb-jump','pointerdown',{pointerId:2,preventDefault(){}});assert.equal(qa.inputs().run,1);assert.equal(qa.inputs().jump,1,'run and jump have independent touch state');
 b.fire('bb-canvas','pointerdown',{pointerId:3,clientX:20,clientY:20});assert.equal(qa.inputs().pointers,1);
 function rotate(angle,width,height,type){b.win.screen.orientation.angle=angle;b.win.screen.orientation.type=type;b.win.innerWidth=width;b.win.innerHeight=height;b.win.visualViewport.height=height;emit(b.win.screen.orientation,'change');emit(b.win,'resize');qa.draw();assert.deepEqual([...b.viewport()],[0,0,width,height-60]);assert.equal(qa.root.dataset.rotation,String(angle));assert.equal(position(),player,'rotation preserves the player position');assert.equal(JSON.stringify(qa.angles()),angles,'rotation preserves camera angles and zoom');}
 rotate(90,844,390,'landscape-primary');assert.equal(qa.root.dataset.short,'true');assert.equal(qa.root.dataset.dock,'side');assert.equal(qa.inputs().run,0);assert.equal(qa.inputs().jump,0);assert.equal(qa.inputs().pointers,0);
 rotate(180,390,844,'portrait-secondary');rotate(270,844,390,'landscape-secondary');rotate(0,390,844,'portrait-primary');
 b.fire('bb-run','pointerdown',{pointerId:4,preventDefault(){}});b.win.visualViewport.height=340;emit(b.win.visualViewport,'resize');assert.equal(qa.inputs().run,1,'keyboard/visual viewport resize does not cancel held controls');assert.equal(qa.root.dataset.layout,'portrait','keyboard does not change physical orientation');assert.equal(qa.root.style.values['--game-view-height'],'340px');
 b.win.visualViewport.height=844;emit(b.win.visualViewport,'resize');
 let requests=0;qa.root.requestFullscreen=function(options){assert.equal(options.navigationUI,'hide');requests++;b.doc.fullscreenElement=qa.root;emit(b.doc,'fullscreenchange');return Promise.resolve();};
 b.doc.exitFullscreen=()=>{b.doc.fullscreenElement=null;emit(b.doc,'fullscreenchange');return Promise.resolve();};
 await qa.toggle();assert.equal(requests,1);assert.equal(qa.root.dataset.display,'fullscreen');assert.equal(el('bb-fullscreen')['aria-pressed'],'true');assert.equal(el('bb-fullscreen').disabled,false);
 b.key('Escape');assert.equal(qa.root.dataset.mode,'play','native Escape must not exit exploration');b.doc.fullscreenElement=null;emit(b.doc,'fullscreenchange');assert.equal(qa.root.dataset.display,'window');assert.equal(el('bb-fullscreen')['aria-pressed'],'false','browser/system exit synchronizes the button');
 await qa.toggle();await qa.toggle();assert.equal(qa.root.dataset.display,'window','screen button exits native full screen');
 qa.root.requestFullscreen=()=>Promise.reject(Error('iframe permission denied'));await qa.toggle();assert.equal(qa.root.dataset.display,'expanded');assert(el('bb-screen-status').textContent.includes('unavailable'));b.key('Escape');assert.equal(qa.root.dataset.display,'window');assert.equal(qa.root.dataset.mode,'play','Escape exits expanded view without leaving exploration');
 delete qa.root.requestFullscreen;qa.root.webkitRequestFullscreen=()=>{b.doc.webkitFullscreenElement=qa.root;emit(b.doc,'webkitfullscreenchange');};delete b.doc.exitFullscreen;b.doc.webkitExitFullscreen=()=>{b.doc.webkitFullscreenElement=null;emit(b.doc,'webkitfullscreenchange');};await qa.toggle();assert.equal(qa.root.dataset.display,'fullscreen');await qa.toggle();assert.equal(qa.root.dataset.display,'window','legacy WebKit enter/exit works');
 delete qa.root.webkitRequestFullscreen;await qa.toggle();assert.equal(qa.root.dataset.display,'expanded','unsupported browsers receive an expanded view');await qa.toggle();assert.equal(qa.root.dataset.display,'window');
 // Mobile sizing must work with a mouse and without Screen Orientation APIs.
 b.win.matchMedia=()=>({matches:false});b.win.screen.orientation.type='landscape-primary';b.win.innerWidth=320;b.win.innerHeight=480;b.win.visualViewport.height=480;qa.resize();assert.equal(qa.root.dataset.mobile,'true');assert.equal(qa.root.dataset.fit,'true');assert.equal(qa.root.dataset.layout,'portrait','actual viewport wins over stale device orientation');
 b.win.innerWidth=568;b.win.innerHeight=320;b.win.visualViewport.height=320;qa.resize();assert.equal(qa.root.dataset.layout,'landscape');assert.equal(qa.root.dataset.short,'true');
 b.win.innerWidth=820;b.win.innerHeight=1180;b.win.visualViewport.height=1180;b.win.matchMedia=()=>({matches:true});qa.resize();assert.equal(qa.root.dataset.dock,'bottom','portrait tablets use the split editor, even above the desktop CSS breakpoint');
 // Tall auto-sized embeds cannot use their document height as phone height.
 b.win.top=Object.defineProperty({},'visualViewport',{get(){throw Error('cross-origin parent');}});Object.assign(b.win.screen,{width:390,height:844,availWidth:390,availHeight:844});b.win.screen.orientation.type='portrait-primary';b.win.innerWidth=390;b.win.innerHeight=2400;b.win.visualViewport.height=2400;qa.resize();assert.equal(qa.root.style.values['--game-view-height'],'692px');assert.equal(qa.root.dataset.layout,'portrait');
 b.win.screen.orientation.type='landscape-primary';b.win.screen.orientation.angle=90;b.win.innerWidth=844;qa.resize();assert.equal(qa.root.style.values['--game-view-height'],'319px');assert.equal(qa.root.dataset.layout,'landscape','rotating a tall embedded view uses physical screen limits');
 // A keyboard shrinking the layout viewport must not change the editor mode.
 b.win.screen.orientation.type='portrait-primary';b.win.screen.orientation.angle=0;b.win.innerWidth=390;b.win.innerHeight=844;b.win.visualViewport.height=700;qa.resize();b.doc.activeElement={tagName:'INPUT'};b.win.innerHeight=300;b.win.visualViewport.height=300;qa.resize();assert.equal(qa.root.dataset.layout,'portrait');assert.equal(qa.root.style.values['--game-view-height'],'300px');assert.equal(qa.root.dataset.keyboard,'true','chat expands into the remaining space above the keyboard');b.doc.activeElement=el('bb-canvas');
 // Verify the actual delivered CSS overrides the old fixed-height stack in all
 // mobile modes, and keeps long inventories inside the bounded game shell.
 const css=fs.readFileSync(path.join(__dirname,'../../src/legacy/game-ui.css'),'utf8'),fit='[data-fit=true]';
 const rules=[...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].map(m=>({selector:m[1],body:m[2]}));
 assert(rules.some(r=>r.selector.includes(fit)&&r.selector.trim().endsWith(')')&&/height:var\(--game-view-height/.test(r.body)&&/display:flex/.test(r.body)&&/overflow:hidden/.test(r.body)),'root has one bounded screen height');
 assert(rules.some(r=>r.selector.includes(fit)&&r.selector.trim().endsWith('.layout')&&/flex:1/.test(r.body)&&/min-height:0/.test(r.body)&&/overflow:hidden/.test(r.body)),'layout cannot expand past the screen');
 assert(rules.some(r=>r.selector.includes(fit)&&r.selector.trim().endsWith('.stage')&&/min-height:0/.test(r.body)),'fixed 560/720px scene minimums are overridden');
 // The delivered editor tree must reserve real space rather than overlaying
 // controls on the canvas. Validate parents from the actual shipped HTML.
 const html=fs.readFileSync(path.join(__dirname,'../../dist/index.html'),'utf8').replace(/<script>[\s\S]*?<\/script>/g,'').replace(/<style>[\s\S]*?<\/style>/g,'');
 const nodes=new Map(),stack=[],voidTags=new Set(['input','meta','link','img','br','hr']);
 for(const tag of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/gi)){
  const [,close,name,attrs]=tag,type=name.toLowerCase();if(close){let i=stack.length-1;while(i>=0&&stack[i].tag!==type)i--;if(i>=0)stack.length=i;continue;}
  const id=attrs.match(/\bid="([^"]+)"/)?.[1],node={tag:type,id,parent:stack.at(-1)};if(id)nodes.set(id,node);if(!voidTags.has(type))stack.push(node);
 }
 assert.equal(nodes.get('bb-workspace-dock').parent.id,'bb-layout','tabs occupy a separate layout row');
 assert.equal(nodes.get('bb-canvas').parent.id,'bb-stage','canvas has its own stage grid cell');
 assert.equal(nodes.get('bb-count').parent.parent.id,'bb-editor-footer','build totals stay visible in the footer');
 assert.equal(nodes.get('bb-editor-footer').parent.id,'bb-inventory','placement/status stay in the inventory footer');
 for(const id of ['bb-world-panel','bb-bricks-panel','bb-character-panel','bb-art-panel','bb-photo-panel'])assert.equal(nodes.get(id).parent.id,'bb-editor-scroll',id+' shares the settings container');
 for(const id of ['bb-help-dialog','bb-dialog'])assert.equal(nodes.get(id).parent.id,'brick-builder',id+' can use the full shell, rather than a tiny preview');
 assert(!nodes.has('bb-editor-switch'),'there is no separate settings/scene switch');
 const mobileCSS=css.slice(css.indexOf('/* Mobile editing is one page'));
 assert(/\[data-editor-scroll=true\]\{[^}]*height:auto;[^}]*overflow-y:visible/.test(mobileCSS),'mobile page grows with all editor controls');
 for(const child of ['layout','editor-scroll'])assert(new RegExp('\\.'+child+'\\{[^}]*height:auto;[^}]*overflow:visible').test(mobileCSS),child+' cannot clip long mobile forms');
 assert(/\.stage\{display:grid;[^}]*height:var\(--editor-scene-height/.test(mobileCSS),'mobile scene stays visible above settings');
 assert(/\[data-display=fullscreen\].*overflow-y:auto/.test(mobileCSS),'fullscreen and expanded mobile editors can scroll');
 const finalCSS=css.slice(css.indexOf('/* Editors use real rows'));
 assert(finalCSS.includes('grid-template-rows:auto minmax(0,56fr) minmax(0,44fr)'),'portrait editor reserves tabs, scene and settings rows');
 assert(finalCSS.includes('grid-template-columns:minmax(0,1fr) var(--editor-panel-width'),'landscape reserves a separate panel column');
 assert(/#bb-canvas\{position:relative;[^}]*grid-row:2/.test(finalCSS),'editor canvas cannot fill under its toolbar');
 assert(/\.editor-scroll\{[^}]*overflow-y:auto;overflow-x:hidden/.test(finalCSS),'desktop editor settings retain internal scrolling');
 assert(/\.stage-tools\{overflow-x:auto/.test(finalCSS),'small scene toolbars have an accessible horizontal strip');
 assert.equal(position(),player);assert.equal(JSON.stringify(b.read().pieces),pieces,'display changes preserve every brick');assert.equal(JSON.stringify(qa.angles()),angles);
 call('explore_lego_world',{playing:false});
 for(const [width,height,coarse] of [[320,480,true],[568,320,true],[390,844,true],[844,390,true],[820,1180,true],[1366,768,false],[1366,768,true]]){
  b.win.top=b.win;b.win.innerWidth=width;b.win.innerHeight=height;b.win.visualViewport.height=height;b.win.matchMedia=()=>({matches:coarse});b.doc.activeElement=el('bb-canvas');qa.resize();
  assert.equal(qa.root.dataset.fit,'true','desktop and mobile editors both fit their viewport');
  assert.equal(qa.root.dataset.compact,width<=600||coarse&&Math.min(width,height)<=500?'true':'false');
  b.fire('bb-character-tab');assert.equal(qa.root.dataset.mode,'preview');assert.equal(el('bb-character-panel').hidden,false);assert.equal(qa.root.dataset.editorScroll,(coarse||width<=760)&&(width<=1024||width<=600||coarse&&Math.min(width,height)<=500)?'true':'false');
  b.fire('bb-world-tab');assert.equal(qa.root.dataset.mode,'build');assert.equal(el('bb-world-panel').hidden,false);assert.equal(el('bb-character-panel').hidden,true);
  b.fire('bb-bricks-tab');assert.equal(qa.root.dataset.mode,'build');assert.equal(el('bb-bricks-panel').hidden,false);assert.equal(el('bb-world-panel').hidden,true);
  b.fire('bb-character-tab');call('explore_lego_world',{playing:true});call('explore_lego_world',{playing:false});b.fire('bb-character-tab');assert.equal(qa.root.dataset.mode,'preview','returning from play restores editor layout');
 }
 // Portrait/tall canvases widen the preview frustum without overwriting zoom.
 const oldRect=el('bb-canvas').getBoundingClientRect,oldZoom=qa.angles()[2];el('bb-canvas').getBoundingClientRect=()=>({width:320,height:700,left:0,top:0});const narrow=qa.camera().distance;el('bb-canvas').getBoundingClientRect=()=>({width:700,height:320,left:0,top:0});const wide=qa.camera().distance;assert(narrow>wide*1.5,'character auto-fits a narrow canvas');assert.equal(qa.angles()[2],oldZoom,'auto-fit preserves chosen zoom');el('bb-canvas').getBoundingClientRect=oldRect;
 // A temporarily zero-size canvas during rotation must not poison the camera.
 b.fire('bb-world-tab');el('bb-canvas').getBoundingClientRect=()=>({width:0,height:0,left:0,top:0});qa.fit();assert(Number.isFinite(qa.camera().distance)&&qa.camera().distance>0,'zero-size preview camera remains finite');el('bb-canvas').getBoundingClientRect=oldRect;qa.draw();assert(qa.camera().eye.every(Number.isFinite));
 console.log('PASS: mobile-only page scrolling with scene and all settings, no view switch, desktop/play isolation; separate editor tabs/toolbars/canvas/settings/footer; character/world/bricks at phone, tablet and desktop sizes; play/editor transitions; narrow preview auto-fit; bounded mobile studio/editor/play layouts, small portrait and landscape screens, portrait tablets, stale/missing orientation and pointer metadata, tall cross-origin embeds, keyboard resizing, four rotations, GL sizing, independent Run + Jump, native/WebKit full screen and fallback, and player/world/camera preservation.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
