// Celestial directions belong to the world, independent of camera position,
// orbit, pitch and zoom. A full sandbox day takes twenty minutes.
const SkyCycle=(()=>{
 'use strict';
 const duration=1200,starts={day:Math.PI/4,noon:Math.PI/2,evening:Math.PI-.15,night:Math.PI*1.5};
 const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t),smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 const colors={day:{zenith:[.20,.49,.86],horizon:[.72,.87,.97],ambient:[.34,.37,.42]},noon:{zenith:[.12,.44,.88],horizon:[.78,.9,1],ambient:[.39,.41,.44]},evening:{zenith:[.22,.22,.46],horizon:[.98,.54,.28],ambient:[.32,.25,.27]},night:{zenith:[.018,.029,.09],horizon:[.12,.17,.29],ambient:[.16,.20,.30]}};
 function sample(time='day',elapsed=0,rain=false,snowing=false){
  const angle=(starts[time]??starts.day)+Math.max(0,elapsed)/duration*Math.PI*2,sun=[Math.cos(angle),Math.sin(angle)*.94,Math.sin(angle)*.341174],moon=sun.map(v=>-v),elevation=sun[1],night=1-smooth(-.16,.06,elevation),overcast=rain?.78:snowing?.40:0;
  const p={};for(const key of ['zenith','horizon','ambient']){const daylight=mix(colors.day[key],colors.noon[key],smooth(.45,.94,elevation)),dusk=mix(colors.evening[key],daylight,smooth(.06,.40,elevation));p[key]=mix(dusk,colors.night[key],night);}
  p.zenith=p.zenith.map(v=>v*(1-overcast*.45));p.horizon=p.horizon.map((v,k)=>v*(1-overcast*.45)+[.22,.25,.30][k]*overcast*.25);p.ambient=p.ambient.map(v=>v*(1-overcast*.25));
  return {...p,sun,moon,light:elevation>0?sun:moon,night,overcast};
 }
 return {sample,duration};
})();
