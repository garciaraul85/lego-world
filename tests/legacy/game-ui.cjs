const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
let source=fs.readFileSync(path.join(__dirname,'characters.cjs'),'utf8').split('const b=boot(),call=')[0];
source=source.replace("constructor(tag='DIV'){", `
get parentElement(){return this.parentNode;}
get childNodes(){return [{nodeType:3,textContent:this.textContent||''},...this.children];}
get labels(){return this.parentNode?.tagName==='LABEL'?[this.parentNode]:[];}
get options(){return this.tagName==='SELECT'?this.children.filter(c=>c.tagName==='OPTION'):[];}
get selectedIndex(){return this.options.findIndex(o=>o.value===this.value);}
set selectedIndex(i){this.value=this.options[i]?.value||'';}
insertBefore(node,before){const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,node);node.parentNode=this;}
dispatchEvent(event){this.handlers[event.type]?.({target:this});return true;}
constructor(tag='DIV'){this.classList={add(){}};`);
source=source.replace('appendChild(b){this.children.push(b);}', 'appendChild(b){if(b.parentNode){const a=b.parentNode.children,i=a.indexOf(b);if(i>=0)a.splice(i,1);}this.children.push(b);b.parentNode=this;}');
const setup=`
const html=fs.readFileSync(path.join(__dirname,'../../dist/index.html'),'utf8');
for(const [,id,contents] of html.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\\s\\S]*?)<\\/select>/g)){
 const select=elements['#'+id];select.tagName='SELECT';const label=new Element('LABEL');label.textContent=id;label.appendChild(select);
 for(const [,value,flags,text] of contents.matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\\/option>/g)){const option=new Element('OPTION');option.value=value;option.textContent=text;select.appendChild(option);if(select.children.length===1||flags.includes('selected'))select.value=value;}
}
const allSelects=()=>{const found=new Set(),walk=e=>{if(e.tagName==='SELECT')found.add(e);for(const child of e.children)walk(child);};Object.values(elements).forEach(walk);return [...found];};
`;
source=source.replace("const buttons=['add'",setup+"const buttons=['add'");
source=source.replace("querySelectorAll:s=>s==='[data-tool]'?buttons:[]", "querySelectorAll:s=>s==='select'?allSelects():s==='[data-tool]'?buttons:[]");
source=source.replace('root={dataset:{},','root={dataset:elements[\'#brick-builder\'].dataset,');
source=source.replace('doc={addEventListener(){},',"doc={keys:[],addEventListener(type,f){if(type==='keydown')this.keys.push(f);},");
source=source.replace('const context={document:doc,','const context={Event,document:doc,');
source=source.replace("split('</script>')[0],context);", "split('</script>')[0].replace(/\\}\\)\\(\\);\\s*$/, 'globalThis.uiQA={frame:gameFrame};})();'),context);");
source=source.replace('return {tools,elements,buttons,buffers,stored,','return {qa:context.uiQA,selects:allSelects,key:key=>doc.keys.forEach(f=>f({key,target:elements[\'#bb-canvas\'],preventDefault(){},stopPropagation(){}})),tools,elements,buttons,buffers,stored,');
const ctx={require,__dirname,Event,console,AbortController,Blob,URL,setTimeout};vm.runInNewContext(source+'\nglobalThis.boot=boot;',ctx);const b=ctx.boot(),el=id=>b.elements['#'+id],call=(n,v)=>b.tools.get(n).execute(v);
const hair=b.selects().find(s=>s.id==='bb-character-hair'),picker=hair.parentNode,initial=b.read().characters.items[0].profile.hair;
picker.children[2].click();assert.notEqual(b.read().characters.items[0].profile.hair,initial,'next changes the real character asset');picker.children[0].click();assert.equal(b.read().characters.items[0].profile.hair,initial,'previous returns to the original asset');
const roster=el('bb-roster'),rosterPicker=roster.parentNode;assert(rosterPicker.children[0].disabled,'a one-character roster does not offer a nonexistent previous character');b.fire('bb-character-new');assert(!rosterPicker.children[0].disabled);rosterPicker.children[0].click();assert.equal(b.read().characters.activeId,1,'roster steps select saved characters');
b.fire('bb-help-open');assert(!el('bb-help-dialog').hidden);assert.equal(el('bb-help-progress').textContent,'5 / 7');assert.equal(el('bb-help-steps').children.length,3);b.fire('bb-help-next');assert(el('bb-help-title').textContent.includes('Draw'));b.fire('bb-help-close');assert(el('bb-help-dialog').hidden);
const ground={id:1,x:-4,z:-4,y:0,rows:8,cols:8,turn:0,kind:'plate',color:3};b.fire('bb-open');el('bb-data').value=JSON.stringify({format:'brick-builder',version:4,pieces:[ground]});b.fire('bb-load-code');call('explore_lego_world',{playing:true});
const position=()=>JSON.stringify(['x','y','z'].map(k=>b.read().player[k]));b.key('w');b.qa.frame(.025);const paused=position();b.fire('bb-help-open');b.key('w');b.qa.frame(.05);assert.equal(position(),paused,'the guide pauses movement and clears held input');assert.equal(el('bb-help-progress').textContent,'1 / 7');assert(el('bb-canvas').inert);
b.key('Escape');assert(el('bb-help-dialog').hidden&&!el('bb-canvas').inert);assert.equal(b.elements['#brick-builder'].dataset.mode,'play','Escape closes help without leaving the game');b.key('w');b.qa.frame(.025);assert.notEqual(position(),paused,'movement resumes after closing the guide');
b.fire('bb-menu');assert(!el('bb-system-menu').hidden);const menuPosition=position();b.qa.frame(.05);assert.equal(position(),menuPosition,'the project menu pauses play');b.key('Escape');assert(el('bb-system-menu').hidden);assert.equal(b.elements['#brick-builder'].dataset.mode,'play');
b.fire('bb-save');assert.equal(el('bb-dialog-title').textContent,'Save your world');assert(JSON.parse(el('bb-data').value).pieces.length);assert(!el('bb-build-code').open,'build code stays behind the optional advanced disclosure');b.fire('bb-dialog-close');b.fire('bb-new');assert(el('bb-build-code').hidden,'a new-world confirmation hides irrelevant build code');
b.fire('bb-dialog-close');b.fire('bb-world-tab');const mapSelect=el('bb-map-select'),mapPicker=mapSelect.parentNode;assert(mapPicker.children[0].disabled);b.fire('bb-map-new');assert.equal(b.read().maps.maps.length,2);assert(!mapPicker.children[0].disabled,'map arrows enable after adding maps');mapPicker.children[0].click();assert.equal(b.read().maps.activeId,1,'native map picker switches scenery');const route=el('bb-map-route');assert(route.parentNode.hidden,'single-route travel hides redundant picker arrows');
console.log('PASS: native asset and roster browsing, seven-page contextual help, menu/help pause, Escape recovery, input clearing, game-style save and new-world dialogs.');
