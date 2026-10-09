// Shared hero catalog: costumes are editable starting looks, powers are independent.
const SuperPowers=(()=>{
 const powers={
  None:{action:'Power',hint:'Choose a power in the selector.'},
  Flying:{action:'Fly / land',hint:'Q toggles flight · Drag to aim, then fly with WASD / pad · Jump rises · Ctrl / Descend lowers · Run boosts flight.'},
  Strength:{action:'Ground smash',hint:'Q winds up a powerful ground smash around your character.'},
  'Laser eyes':{action:'Eye lasers',hint:'Q fires twin eye beams at the creation you face.'},
  'Freezing breath':{action:'Freeze',hint:'Q breathes an ice cone · Neighbors and creations are encased in ice for five seconds.'},
  Climbing:{action:'Climb / release',hint:'Q toggles climbing · Move forward against a wall to climb · Jump to release.'},
  'Super jumping':{action:'Super jump',hint:'Q launches a high jump · Space also jumps higher with this power.'},
  'Super speed':{action:'Speed boost',hint:'Q toggles an eight-second boost · Six times normal speed · Hold Run for maximum speed.'},
  'Energy constructs':{action:'Create construct',hint:'Q creates a random green hammer, fist, sword, anvil, rocket, or drill.'},
  Telekinesis:{action:'Lift / throw',hint:'Q lifts a nearby creation · Q again throws it toward where you face.'},
  'Read minds':{action:'Read mind',hint:'Q reveals the nearest visible neighbor’s thoughts within ten studs.'},
  Claws:{action:'Claw strike',hint:'Q punches with extended claws, using the full-body punch animation.'}
 };
 const costumes={
  'Solar champion':{shirtColor:'#245ac1',pantsColor:'#245ac1',accentColor:'#ffd348',accessoryColor:'#d52d48',cape:'Long cape',power:'Flying',emblem:'sun'},
  'Night sentinel':{shirtColor:'#263146',pantsColor:'#1e2739',accentColor:'#e5b942',accessoryColor:'#111827',cape:'Short cape',power:'Climbing',emblem:'wings'},
  Speedster:{shirtColor:'#ce273f',pantsColor:'#ce273f',accentColor:'#ffdc38',accessoryColor:'#f4b328',power:'Super speed',emblem:'bolt'},
  'Ice guardian':{shirtColor:'#94dce9',pantsColor:'#396cb4',accentColor:'#e8fcff',accessoryColor:'#75d4ef',cape:'Short cape',power:'Freezing breath',emblem:'ice'},
  'Emerald guardian':{shirtColor:'#209d59',pantsColor:'#182f2b',accentColor:'#befb96',accessoryColor:'#25d670',power:'Energy constructs',emblem:'ring'},
  'Cosmic voyager':{shirtColor:'#5a3897',pantsColor:'#252447',accentColor:'#f5aaff',accessoryColor:'#9367df',cape:'Long cape',power:'Telekinesis',emblem:'star'},
  'Steel titan':{shirtColor:'#a33732',pantsColor:'#753331',accentColor:'#f6bf5b',accessoryColor:'#a3b6c7',power:'Strength',emblem:'core'},
  'Mind oracle':{shirtColor:'#594ca6',pantsColor:'#39335d',accentColor:'#e4c0ff',accessoryColor:'#a994eb',cape:'Short cape',power:'Read minds',emblem:'eye'},
  'Wild claw':{shirtColor:'#eebf35',pantsColor:'#265695',accentColor:'#183e68',accessoryColor:'#cbd6e4',power:'Claws',emblem:'claw'},
  'Sky jumper':{shirtColor:'#e96828',pantsColor:'#41475e',accentColor:'#fff0bc',accessoryColor:'#eaa640',power:'Super jumping',emblem:'arrow'},
  'Crimson vision':{shirtColor:'#5a304d',pantsColor:'#333149',accentColor:'#ff7370',accessoryColor:'#ba3456',power:'Laser eyes',emblem:'diamond'}
 };
 for(const [name,base,cut] of [['Solar heroine','Solar champion','Leotard'],['Emerald heroine','Emerald guardian','Crop top and shorts'],['Cosmic heroine','Cosmic voyager','Two piece'],['Wild heroine','Wild claw','High cut']])costumes[name]={...costumes[base],gender:'Female',heroCut:cut};
 for(const [name,base,cut,neckline] of [['Storm heroine','Ice guardian','Long sleeve leotard','Scoop'],['Night huntress','Night sentinel','Battle skirt','Sweetheart'],['Star heroine','Cosmic voyager','One shoulder','Asymmetric'],['Crimson heroine','Crimson vision','Cutout suit','Keyhole'],['Golden warrior','Steel titan','Leotard','V-neck'],['Speed heroine','Speedster','Crop top and shorts','Scoop']])costumes[name]={...costumes[base],gender:'Female',heroCut:cut,neckline,necklineDepth:50,necklineWidth:50};
 function dress(p,name){if(name==='Custom')return {...p,costume:name};const c=costumes[name];if(!c)throw Error('Unknown hero costume.');const {emblem,...look}=c;return {...p,...look,heroCut:look.heroCut||'Full suit',neckline:look.neckline||'Closed',necklineDepth:look.necklineDepth??p.necklineDepth,necklineWidth:look.necklineWidth??p.necklineWidth,costume:name,outfit:'Superhero',shirt:'Uniform',pants:'Leggings',pattern:'Plain',hat:'None',hair:p.hair==='Bald'?'Bald':p.hair,face:'Superhero mask',glasses:'None',facialHair:'None',shoes:'Boots',shoeColor:look.pantsColor,gloves:'Cloth',gloveColor:look.shirtColor,belt:'Utility belt',cape:look.cape||'None',back:'None',held:'None'};}
 const constructs={Hammer:{contact:.50,duration:.95,range:10,radius:3.2,impulse:11},Fist:{contact:.35,duration:.80,range:10,radius:2.7,impulse:12},Sword:{contact:.45,duration:.90,range:10,radius:2.6,impulse:8},Anvil:{contact:.65,duration:1.1,range:12,radius:3.4,impulse:14},Rocket:{contact:.65,duration:1.05,range:18,radius:3.3,impulse:12},Drill:{contact:.55,duration:1,range:12,radius:2.8,impulse:9}};
 return {powers,costumes,dress,constructs};
})();
