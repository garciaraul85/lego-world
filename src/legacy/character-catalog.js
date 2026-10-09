const CharacterCatalog=(()=>{
'use strict';
const choices={
 height:['Very short','Short','Regular','Taller than average','Tall'],
 gender:['Male','Female'],nippleStyle:['None','Dot','Round','Oval','Flat','Raised'],buttShape:['Rounded','Athletic','Wide','Compact','Pear'],neckline:['Closed','V-neck','Scoop','Sweetheart','Keyhole','Asymmetric'],breastMode:['Sculpted','Printed','Comic'],breastShape:['Rounded','Natural','Angular','Teardrop','Wide','Compact','Perky','Pointy'],head:['Classic','Rounded','Square'],
 hair:['Bald','Buzz cut','Short','Side part','Quiff','Spiky','Curly','Afro','Bob','Long','Ponytail','Pigtails','Bun','Braid','Mohawk','Dreadlocks','Swept','Pixie'],
 hat:['None','Baseball cap','Beanie','Fedora','Cowboy hat','Top hat','Sun hat','Beret','Hard hat','Bike helmet','Space helmet','Knight helmet','Wizard hat','Witch hat','Pirate hat','Crown','Tiara','Visor','Bucket hat','Chef hat'],
 face:['Plain','Freckles','Blush','Makeup','Freckles and blush','Scar','Beauty mark','Robot','Tiger paint','Superhero mask'],
 eyes:['Classic','Oval','Almond','Wide','Sleepy','Closed','Wink','Cartoon'],
 expression:['Smile','Big grin','Neutral','Laughing','Angry','Sad','Surprised','Determined','Sleepy','Smirk','Scared','Peaceful'],
 facialHair:['None','Stubble','Moustache','Goatee','Full beard','Long beard'],
 glasses:['None','Round','Square','Aviator','Sunglasses','Goggles','Monocle','Visor','Eye patch'],
 heroCut:['Full suit','Leotard','Crop top and shorts','Two piece','High cut','Battle skirt','One shoulder','Long sleeve leotard','Cutout suit'],costume:['Custom','Solar champion','Night sentinel','Speedster','Ice guardian','Emerald guardian','Cosmic voyager','Steel titan','Mind oracle','Wild claw','Sky jumper','Crimson vision','Solar heroine','Emerald heroine','Cosmic heroine','Wild heroine','Storm heroine','Night huntress','Star heroine','Crimson heroine','Golden warrior','Speed heroine'],power:['None','Flying','Strength','Laser eyes','Freezing breath','Climbing','Super jumping','Super speed','Energy constructs','Telekinesis','Read minds','Claws'],
 outfit:['Superhero','Separates','Dress','Swimsuit','Bikini','Underwear','Lingerie','Armor'],
 shirt:['T-shirt','Polo','Button-up','Hoodie','Sweater','Jacket','Vest','Tank top','Crop top','Suit','Long coat','Uniform','Jersey','Striped shirt','Graphic tee','Blouse','Tunic','Raincoat','Leather jacket','Bare torso'],
 pants:['Jeans','Cargo pants','Suit pants','Leggings','Joggers','Shorts','Micro shorts','Sports shorts','Swim trunks','Briefs','Boxers','Bikini bottom','Thong','Skirt','Mini skirt','Long skirt','Bare legs'],
 dress:['Casual','Sundress','Evening','Ball gown','Medieval','Wedding','Kimono','Tunic','Party','Uniform'],
 swimwear:['Classic','Sport','Retro','Halter','High waist','Rash guard','Wetsuit'],
 lingerie:['Lace set','Satin set','Bra and thong','Bustier','Bodysuit','Camisole and thong','Lace bodysuit','Corset and briefs','Longline lace set','Halter lingerie','Ribbon set','High waist set'],
 underwear:['Vest and briefs','Boxers and undershirt','Sports set','Camisole and shorts','Thermal set','High waist briefs','Bralette and boyshorts','Balcony set','Triangle bra set','Sport bra and micro shorts','Longline bra and briefs'],
 pattern:['Plain','Stripes','Dots','Star','Lightning','Heart','Flowers','Checkered','Number 7','Pocket'],
 shoes:['Trainers','Boots','Sandals','Loafers','Heels','Armored boots','Bare feet'],
 gloves:['None','Cloth','Leather','Armor','Mittens'],
 back:['None','Backpack','Hiking pack','Messenger bag','Quiver','Scuba tanks','Jetpack','Wings'],
 cape:['None','Short cape','Long cape','Royal cape','Poncho'],
 scarf:['None','Short scarf','Long scarf','Bandana','Bow tie','Tie'],
 neck:['None','Necklace','Pendant','Medal','Pearls'],
 ears:['None','Stud earrings','Hoop earrings','Headphones','Ear defenders'],
 wrist:['None','Watch','Bracelets','Wristbands'],
 belt:['None','Simple belt','Utility belt','Holster'],
 spell:['Ember Burst','Frost Bloom','Arcane Spiral','Thunder Bolt','Verdant Vortex','Prism Nova'],
 held:['None','Hammer','Wrench','Shovel','Sword','Shield','Wand','Umbrella','Torch','Camera','Guitar','Map','Briefcase','Flower','Lantern','Club','Mace','War hammer','Battle axe','Flintlock pistol','Musket','Baton','Baseball bat','Crowbar','Sledgehammer','Handgun','Revolver','Submachine gun','Rifle','Shotgun']
};
const defaults={name:'Builder',height:'Regular',costume:'Custom',power:'None',gender:'Male',nippleStyle:'None',nippleSize:35,nippleColor:'#b6724f',buttSize:0,buttShape:'Rounded',neckline:'Closed',necklineDepth:45,necklineWidth:45,heroCut:'Full suit',breastSize:0,breastMode:'Sculpted',breastShape:'Rounded',paint:{},head:'Classic',hair:'Side part',hat:'None',face:'Plain',eyes:'Classic',expression:'Smile',facialHair:'None',glasses:'None',outfit:'Separates',shirt:'T-shirt',pants:'Jeans',dress:'Casual',swimwear:'Classic',underwear:'Vest and briefs',lingerie:'Lace set',pattern:'Plain',shoes:'Trainers',gloves:'None',back:'None',cape:'None',scarf:'None',neck:'None',ears:'None',wrist:'None',belt:'None',held:'None',spell:'Ember Burst',skinColor:'#f3c744',hairColor:'#654027',eyeColor:'#3b2418',shirtColor:'#d92f42',pantsColor:'#285581',dressColor:'#9b52b5',hatColor:'#285581',shoeColor:'#262b36',accessoryColor:'#5a8048',accentColor:'#f1e5ca',glassesColor:'#202736',gloveColor:'#79513b'};
const colorFields=['nippleColor','skinColor','hairColor','eyeColor','shirtColor','pantsColor','dressColor','hatColor','shoeColor','accessoryColor','accentColor','glassesColor','gloveColor'];
const presets={
 Explorer:{hat:'Fedora',shirt:'Jacket',shirtColor:'#ba995c',pants:'Cargo pants',pantsColor:'#68694e',back:'Hiking pack',held:'Map'},
 Knight:{outfit:'Armor',hat:'Knight helmet',hatColor:'#89929a',shirtColor:'#8a949e',pantsColor:'#656e76',shoes:'Armored boots',held:'Sword',cape:'Short cape',accessoryColor:'#b42b3d'},
 Astronaut:{hat:'Space helmet',shirt:'Uniform',shirtColor:'#eceff3',pantsColor:'#eceff3',pattern:'Pocket',back:'Jetpack',gloves:'Cloth',gloveColor:'#eceff3'},
 Pirate:{hat:'Pirate hat',hatColor:'#262b36',shirt:'Striped shirt',shirtColor:'#ece1c3',accentColor:'#bd293b',pantsColor:'#503c2d',glasses:'Eye patch',held:'Sword',belt:'Simple belt'},
 Wizard:{hat:'Wizard hat',hatColor:'#3f4388',shirt:'Long coat',shirtColor:'#3f4388',pantsColor:'#3f4388',pattern:'Star',held:'Wand',facialHair:'Long beard',hairColor:'#d7d7d1',cape:'Long cape'},
 Princess:{gender:'Female',outfit:'Dress',dress:'Ball gown',dressColor:'#d981b7',hair:'Bun',hat:'Tiara',hatColor:'#f3c744',neck:'Pendant'},
 'City worker':{hat:'Hard hat',hatColor:'#f3c744',shirt:'Vest',shirtColor:'#ed8a2e',pattern:'Stripes',pants:'Cargo pants',pantsColor:'#46506c',held:'Hammer',belt:'Utility belt'},
 'Beach swimmer':{gender:'Female',outfit:'Swimsuit',swimwear:'Sport',shirtColor:'#c83c6d',pantsColor:'#c83c6d',hair:'Ponytail',shoes:'Bare feet',glasses:'Sunglasses'},
 Runner:{shirt:'Jersey',pants:'Sports shorts',pattern:'Number 7',shirtColor:'#58b8bb',pantsColor:'#263b52',shoes:'Trainers',wrist:'Wristbands',hair:'Short'},
 Rockstar:{hair:'Mohawk',hairColor:'#934bd3',shirt:'Leather jacket',shirtColor:'#242730',pantsColor:'#242730',held:'Guitar',ears:'Hoop earrings'},
 Skier:{hat:'Beanie',hatColor:'#e87430',shirt:'Jacket',shirtColor:'#e87430',pantsColor:'#253c73',glasses:'Goggles',scarf:'Long scarf',gloves:'Mittens',shoes:'Boots'},
 Cowboy:{hat:'Cowboy hat',hatColor:'#a87b4b',shirt:'Button-up',shirtColor:'#ae3432',pattern:'Checkered',pants:'Jeans',shoes:'Boots',belt:'Simple belt'},
 Detective:{hat:'Fedora',hatColor:'#56565b',shirt:'Long coat',shirtColor:'#97826d',pants:'Suit pants',held:'Camera',facialHair:'Stubble'},
 Chef:{hat:'Chef hat',hatColor:'#eef0f2',shirt:'Uniform',shirtColor:'#eef0f2',pants:'Suit pants',pantsColor:'#343541',pattern:'Pocket'},
 'Rainforest guide':{shirt:'Tank top',shirtColor:'#758545',pants:'Cargo pants',pantsColor:'#5b6343',back:'Hiking pack',held:'Map',hat:'Bucket hat',hatColor:'#c0b287'},
 'Summer outfit':{gender:'Female',shirt:'Crop top',shirtColor:'#efb460',pants:'Shorts',pantsColor:'#377bae',hair:'Pigtails',hat:'Sun hat',hatColor:'#deb983',shoes:'Sandals'},
 'Bikini set':{gender:'Female',outfit:'Bikini',swimwear:'Halter',shirtColor:'#d8558e',pantsColor:'#d8558e',hair:'Long',shoes:'Bare feet'},
 'Loungewear':{outfit:'Underwear',underwear:'Boxers and undershirt',shirtColor:'#e2e6ee',pantsColor:'#6087a8',shoes:'Bare feet'}
};
presets['Micro shorts outfit']={gender:'Female',outfit:'Separates',shirt:'Crop top',pants:'Micro shorts',shirtColor:'#6f57b9',pantsColor:'#31577c',shoes:'Trainers'};
for(const [name,lingerie,color] of [['Lace lingerie','Lace set','#71375c'],['Satin lingerie','Satin set','#a33b5a'],['Thong lingerie','Bra and thong','#3f526a'],['Bustier set','Bustier','#443052'],['Bodysuit lingerie','Bodysuit','#314a70'],['Camisole and thong','Camisole and thong','#a85882']])presets[name]={gender:'Female',outfit:'Lingerie',lingerie,shirtColor:color,pantsColor:color,shoes:'Bare feet',neckline:'Sweetheart',necklineDepth:25,necklineWidth:45};
for(const [name,outfit,style,color] of [['High waist underwear','Underwear','High waist briefs','#a64d71'],['Bralette and boyshorts','Underwear','Bralette and boyshorts','#56769b'],['Balcony underwear','Underwear','Balcony set','#a14550'],['Triangle underwear','Underwear','Triangle bra set','#698258'],['Sport micro shorts set','Underwear','Sport bra and micro shorts','#454c8b'],['Longline underwear','Underwear','Longline bra and briefs','#90647b'],['Lace bodysuit','Lingerie','Lace bodysuit','#68496f'],['Corset and briefs','Lingerie','Corset and briefs','#973e5a'],['Longline lace lingerie','Lingerie','Longline lace set','#335b6a'],['Halter lingerie','Lingerie','Halter lingerie','#ba586a'],['Ribbon lingerie','Lingerie','Ribbon set','#916071'],['High waist lingerie','Lingerie','High waist set','#405875']])presets[name]={gender:'Female',outfit,[outfit==='Underwear'?'underwear':'lingerie']:style,shirtColor:color,pantsColor:color,shoes:'Bare feet',neckline:'Scoop',necklineDepth:25,necklineWidth:40};
for(const name of typeof SuperPowers==='undefined'?[]:Object.keys(SuperPowers.costumes))presets[name]=SuperPowers.dress(defaults,name);
const paintParts={head:'Head / face',hair:'Hair',hat:'Hat',torso:'Torso / shirt',dress:'Dress / skirt',leftArm:'Left arm',rightArm:'Right arm',leftHand:'Left hand',rightHand:'Right hand',leftLeg:'Left leg',rightLeg:'Right leg',leftFoot:'Left foot',rightFoot:'Right foot',glasses:'Glasses',back:'Back gear',cape:'Cape',accessory:'Scarf / jewelry',held:'Held item'};
function validatePaint(paint){if(paint===undefined)return {};if(!paint||typeof paint!=='object'||Array.isArray(paint))throw Error('Invalid custom artwork.');const result={};let bytes=0;for(const [part,data] of Object.entries(paint)){if(!paintParts[part]||typeof data!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)||data.length>350000)throw Error('Invalid character artwork.');bytes+=data.length;result[part]=data;}if(bytes>1400000)throw Error('Custom artwork is too large.');return result;}
function validate(input){if(!input||typeof input!=='object')throw Error('Invalid character.');const p={...defaults,...input};if(typeof p.name!=='string'||p.name.length>32)throw Error('Use a character name of 32 characters or less.');p.name=p.name.trim()||'Builder';for(const [key,options] of Object.entries(choices))if(!options.includes(p[key]))throw Error('Unknown '+key+' option.');for(const key of colorFields)if(typeof p[key]!=='string'||!/^#[0-9a-fA-F]{6}$/.test(p[key]))throw Error('Choose a valid '+key+'.');if(!Number.isInteger(p.breastSize)||p.breastSize<0||p.breastSize>150)throw Error('Choose breast size from 0 to 150.');if(!Number.isInteger(p.buttSize)||p.buttSize<0||p.buttSize>100)throw Error('Choose butt size from 0 to 100.');for(const key of ['nippleSize','necklineDepth','necklineWidth'])if(!Number.isInteger(p[key])||p[key]<0||p[key]>100)throw Error('Choose '+key+' from 0 to 100.');const paint=validatePaint(p.paint);const result={name:p.name,breastSize:p.breastSize,nippleSize:p.nippleSize,buttSize:p.buttSize,necklineDepth:p.necklineDepth,necklineWidth:p.necklineWidth,paint};for(const key of Object.keys(choices))result[key]=p[key];for(const key of colorFields)result[key]=p[key].toLowerCase();return result;}
function preset(name){if(!presets[name])throw Error('Unknown character preset.');return validate({...defaults,...presets[name],name});}
const rangeFields={nippleSize:{max:100},breastSize:{max:150},buttSize:{max:100},necklineDepth:{max:100},necklineWidth:{max:100}};
const heightScales={'Very short':.7,Short:.85,Regular:1,'Taller than average':1.12,Tall:1.25},heightScale=p=>heightScales[p?.height]||1;
return {rangeFields,choices,defaults,colorFields,presets,validate,preset,paintParts,validatePaint,heightScale,heightScales};
})();
