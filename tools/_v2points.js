const vm=require('vm'),fs=require('fs');const THREE=require('three');
const ctx={console,Math,Date,JSON,Object,Array,Float32Array,Uint32Array,Uint16Array,Uint8ClampedArray,THREE,performance:{now:()=>Date.now()},document:{createElement:t=>({getContext:()=>new Proxy({},{get:()=>()=>({addColorStop(){},width:10,data:new Uint8ClampedArray(4)})}),style:{}}),getElementById:()=>null,addEventListener(){}},navigator:{},setTimeout,setInterval,clearTimeout,clearInterval};
ctx.self=ctx;ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
const bsrc=fs.readFileSync('server/lib/bots.js','utf8');const files=[...bsrc.matchAll(/'(public\/src\/[^']+\.js)'/g)].map(m=>m[1]).filter((v,i,a)=>a.indexOf(v)===i);
for(const f of files) vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
ctx.__sc=new THREE.Scene(); vm.runInContext('World.buildMap(__sc, "urban")',ctx);
const cols=ctx.World._colliders(); const V=ctx.World.V2; const E=V.ext;
function overlap(x,y,z,hx,hy,hz,c){return x+hx>c[0]&&x-hx<c[3]&&y+hy>c[1]&&y-hy<c[4]&&z+hz>c[2]&&z-hz<c[5];}
function supportAt(x,y,z){ // collider top between y-0.85 and y-0.30 covering (x,z)
  for(const c of cols){ if(x<=c[0]||x>=c[3]||z<=c[2]||z>=c[5])continue; if(c[4]>=y-0.85&&c[4]<=y-0.30) return true;} return false;}
function itemClear(x,y,z){ for(const c of cols){ if(overlap(x,y+0.2,z,0.25,0.25,0.25,c)) return false;} return true;}
function standingClear(x,z){ for(const c of cols) if(c[4]>0.35&&overlap(x,0.95,z,0.34,0.86,0.34,c)) return false; return true;}
function groundFlat(x,z){ for(const c of cols){ if(x<=c[0]||x>=c[3]||z<=c[2]||z>=c[5])continue; if(c[4]>0.35) return false;} return true;}
function skyClear(x,z,r){ for(const c of cols){ if(c[4]<0.5) continue; if(x+r>c[0]&&x-r<c[3]&&z+r>c[2]&&z-r<c[5]) return false;} return true;}
const loot=[], bad=[];
V.blocks.forEach((b,i)=>{ const cx=(b[0]+b[1])/2, cz=(b[2]+b[3])/2, H=3.3*b[4];
  // interior: centre (y 0.70)
  const iy=0.70; if(supportAt(cx,iy,cz)&&itemClear(cx,iy,cz)) loot.push([cx,iy,cz,'h',b[7]]); else bad.push(['int',b]);
  // roof on every third block, near the far corner from the stair landing
  if(i%3===0){ const ry=H+0.85, rx=b[1]-2.5, rz=b[3]-2.5; if(supportAt(rx,ry,rz)&&itemClear(rx,ry,rz)) loot.push([rx,ry,rz,'h',b[7]]); else bad.push(['roof',b]); }
});
V.towers.forEach(t=>{ const X0=t[0],Z0=t[1],mir=t[2]; const lx=mir?2:6; 
  [[X0+lx,4.75,Z0+9,'h'],[X0+lx,8.95,Z0+9,'h'],[X0+4,21.80,Z0+6,'s']].forEach(p=>{ if(supportAt(p[0],p[1],p[2])&&itemClear(p[0],p[1],p[2])) loot.push([p[0],p[1],p[2],p[3],'tower']); else bad.push(['tower',p]); });
});
console.log('loot ok',loot.length,'bad',bad.length); bad.forEach(b=>console.log('  BAD',JSON.stringify(b)));
// spawns: on cross streets (mid), plazas, and the inner avenue
const spawnCand=[];
V.streets.forEach(st=>{ if(st[0]==='x'){ const z=(st[2]+st[3])/2; spawnCand.push([st[1],z, st[2]<0?Math.PI:0]); } else { const x=(st[2]+st[3])/2; spawnCand.push([x,st[1], st[2]<0?-Math.PI/2:Math.PI/2]); } });
V.plazas.forEach(p=>spawnCand.push([(p[0]+p[1])/2,(p[2]+p[3])/2, 0]));
[[-30,-124],[60,-124],[-30,124],[60,124],[124,-60],[124,60],[-184,-60],[-184,60]].forEach(p=>spawnCand.push([p[0],p[1],0]));
const spawns=spawnCand.filter(s=>standingClear(s[0],s[1])&&groundFlat(s[0],s[1])&&s[0]>E.x0+3&&s[0]<E.x1-3&&s[1]>E.z0+3&&s[1]<E.z1-3);
console.log('spawns ok',spawns.length,'of',spawnCand.length);
// drops: sky clear within 3.5 m; on plazas, street midpoints and boulevard mid-points
const dropCand=[...V.plazas.map(p=>[(p[0]+p[1])/2,(p[2]+p[3])/2]), ...V.streets.map(st=>st[0]==='x'?[st[1],(st[2]+st[3])/2]:[(st[2]+st[3])/2,st[1]]),
  [-230,-210],[-60,-210],[110,-210],[-230,210],[-60,210],[110,210],[210,-120],[210,120],[-270,-120],[-270,120],
  [-190,-166],[100,-170],[-82,178],[86,180],[170,-70],[190,60],[-236,-66],[-212,60]];
const drops=dropCand.filter(p=>skyClear(p[0],p[1],3.0)&&p[0]>E.x0+6&&p[0]<E.x1-6&&p[1]>E.z0+6&&p[1]<E.z1-6);
console.log('drops ok',drops.length,'of',dropCand.length, JSON.stringify(dropCand.filter(p=>!drops.includes(p))));
fs.writeFileSync('/tmp/v2out.json',JSON.stringify({loot,spawns,drops}));
