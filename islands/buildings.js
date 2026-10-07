import * as T from './vendor/three.module.min.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Local coordinates: ground y=0, entrance +z. No score data or remote assets.
export const BUILDING_LEVELS = Object.freeze([
 {stars:0,title:'空地',description:'留一片沙地，等一座小屋。'},
 {stars:.5,title:'茅草小棚',description:'编织草墙、圆锥草顶和朴素的木门。'},
 {stars:1,title:'暖暖茅草屋',description:'整齐双坡草顶，带小门廊的完整草屋。'},
 {stars:1.5,title:'修补木屋',description:'斜顶旧木板，补丁与木撑也有可爱的秩序。'},
 {stars:2,title:'海风木屋',description:'整洁木板、瓦顶、百叶窗与小花箱。'},
 {stars:2.5,title:'旧石小屋',description:'圆润斑驳石墙，修补过的屋顶和拱门。'},
 {stars:3,title:'温暖石屋',description:'完整石墙与烟囱，陶瓦顶下的蓝色拱窗。'},
 {stars:3.5,title:'海边砖屋',description:'砖砌主屋配平屋顶门廊，简洁又明亮。'},
 {stars:4,title:'现代小屋',description:'错落白墙、宽窗与带木格栅的露台。'},
 {stars:4.5,title:'小院别墅',description:'双层小体量、朴素阳台和浅色庭院。'},
 {stars:5,title:'花庭小别墅',description:'精细拱廊、陶瓦、花园和金色小灯。'}
].map(Object.freeze));

const V=(x,y,z)=>new T.Vector3(x,y,z);
const mat4=new T.Matrix4(),quat=new T.Quaternion(),unit=V(1,1,1);
const UP=V(0,1,0);
function random(seed){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}

function surfaceTexture(kind){
 if(typeof document==='undefined')return null;
 const cv=document.createElement('canvas');cv.width=cv.height=256;
 const ctx=cv.getContext('2d'),rng=random(918+kind.length*117);
 ctx.fillStyle='#e6decf';ctx.fillRect(0,0,256,256);
 for(let i=0;i<1600;i++){
  ctx.fillStyle=rng()>.48?'rgba(255,255,255,.14)':'rgba(71,54,34,.065)';
  const x=rng()*256,y=rng()*256;
  if(kind==='wood')ctx.fillRect(x,y,.5+rng()*.8,5+rng()*29);
  else if(kind==='straw')ctx.fillRect(x,y,.5+rng()*.8,11+rng()*37);
  else ctx.fillRect(x,y,.4+rng()*1.7,.4+rng()*1.6);
 }
 if(kind==='wood'){
  for(let i=0;i<18;i++){
   const x=rng()*256,y=rng()*256;ctx.strokeStyle='rgba(91,63,38,.09)';ctx.lineWidth=.7;
   ctx.beginPath();ctx.ellipse(x,y,1.8+rng()*3,10+rng()*18,-.04,0,Math.PI*2);ctx.stroke();
  }
 }
 const texture=new T.CanvasTexture(cv);texture.colorSpace=T.SRGBColorSpace;
 texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;return texture;
}

function roundedGeometry(w,h,d,r=.012){
 r=Math.min(r,w*.23,h*.23,d*.23);
 const x=w/2-r,y=h/2-r,shape=new T.Shape();
 shape.moveTo(-x,-y);shape.lineTo(x,-y);shape.lineTo(x,y);shape.lineTo(-x,y);shape.closePath();
 const g=new T.ExtrudeGeometry(shape,{depth:d-r*2,bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:2,steps:1,curveSegments:1});
 g.translate(0,0,-d/2+r);return g;
}

function builder(stars){
 const parts=new Map(),materials=new Map(),textures=new Map(),rng=random(711+stars*127);
 let pieceCount=0;
 const material=(name,color,kind='plaster',options={})=>{
  if(!materials.has(name)){
   if(!textures.has(kind))textures.set(kind,surfaceTexture(kind));
   const map=textures.get(kind);
   materials.set(name,new T.MeshStandardMaterial({color,map,roughness:.84,bumpMap:map,bumpScale:kind==='wood'?.0022:kind==='straw'?.003:.0011,...options}));
  }
  return name;
 };
 const M={
  wall:material('wall','#e8dab8'),trim:material('trim','#fff1d8'),
  wood:material('wood','#ba8c5c','wood'),dark:material('dark','#755840','wood'),
  lightwood:material('lightwood','#d8b17c','wood'),
  roof:material('roof',stars>=3?'#bb755e':'#be8363','clay'),
  roofLight:material('roofLight',stars>=3?'#d09377':'#d6a181','clay'),
  straw:material('straw','#cbb078','straw'),strawLight:material('strawLight','#e5cd98','straw'),
  stone:material('stone','#b6aa94'),stoneLight:material('stoneLight','#d5c6aa'),
  glass:material('glass','#66959e','glass',{roughness:.26,metalness:.18,bumpScale:0}),
  glint:material('glint','#d1e3dd','glass',{roughness:.3,bumpScale:0}),
  foliage:material('foliage','#718558'),flower:material('flower','#d9979e'),
  gold:material('gold','#b29a62','metal',{metalness:.5,roughness:.38}),
  shadow:material('shadow','#5b625a','wood')
 };
 function add(geo,key,x=0,y=0,z=0,rx=0,ry=0,rz=0){
  quat.setFromEuler(new T.Euler(rx,ry,rz));mat4.compose(V(x,y,z),quat,unit);geo.applyMatrix4(mat4);
  if(geo.index){const flat=geo.toNonIndexed();geo.dispose();geo=flat;}
  // Every part has the same attributes, so one merged mesh per material is enough.
  for(const name of Object.keys(geo.attributes))if(!['position','normal','uv'].includes(name))geo.deleteAttribute(name);
  if(!geo.getAttribute('uv'))geo.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count*2),2));
  if(!parts.has(key))parts.set(key,[]);parts.get(key).push(geo);pieceCount++;return geo;
 }
 const box=(key,w,h,d,x,y,z,rz=0,ry=0,r=.009)=>add(roundedGeometry(w,h,d,r),key,x,y,z,0,ry,rz);
 const cylinder=(key,rt,rb,h,x,y,z,sides=12)=>add(new T.CylinderGeometry(rt,rb,h,sides,1),key,x,y,z);
 function beam(key,a,b,r=.012,sides=7){
  const av=V(...a),bv=V(...b),length=av.distanceTo(bv),g=new T.CylinderGeometry(r,r,length,sides,1);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(UP,bv.clone().sub(av).normalize()));g.translate(...av.add(bv).multiplyScalar(.5).toArray());add(g,key);
 }
 function ball(key,x,y,z,sx,sy=sx,sz=sx){const g=new T.SphereGeometry(1,10,7);g.scale(sx,sy,sz);add(g,key,x,y,z);}
 function arch(key,w,h,d,x,y,z,ry=0){
  const r=w/2,s=new T.Shape();s.moveTo(-r,0);s.lineTo(r,0);s.lineTo(r,h-r);s.absarc(0,h-r,r,0,Math.PI,false);s.lineTo(-r,0);
  const g=new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:1,curveSegments:10,steps:1});
  g.translate(0,0,-d/2);add(g,key,x,y,z,0,ry,0);
 }
 function window(x,y,z,w=.18,h=.19,ry=0,arched=false){
  const point=(dx,dz)=>[x+Math.cos(ry)*dx+Math.sin(ry)*dz,y,z-Math.sin(ry)*dx+Math.cos(ry)*dz];
  if(arched){arch(M.trim,w+.042,h+.035,.036,x,y-h/2-.012,z,ry);arch(M.glass,w,h,.014,...point(0,.024).map((v,i)=>i===1?v-h/2:v),ry);}
  else{
   box(M.trim,w+.044,h+.044,.034,x,y,z,0,ry,.008);const p=point(0,.023);box(M.glass,w,h,.012,...p,0,ry,.004);
  }
  let p=point(0,.034);box(M.trim,.011,h-.012,.008,...p,0,ry,.002);
  p=point(0,.034);box(M.trim,w-.005,.009,.008,p[0],p[1]-.017,p[2],0,ry,.002);
  p=point(-w*.23,.032);box(M.glint,w*.12,h*.62,.004,p[0],p[1]+h*.04,p[2],-.10,ry,.001);
 }
 function door(x,z,w=.19,h=.35,arched=false,key=M.wood){
  if(arched){arch(M.trim,w+.07,h+.035,.055,x,.063,z);arch(key,w,h,.028,x,.061,z+.036);}
  else{box(M.trim,w+.052,h+.032,.049,x,h/2+.065,z);box(key,w,h,.026,x,h/2+.064,z+.033);}
  for(let i=-1;i<=1;i++)box(M.dark,.005,h*.78,.004,x+i*w*.25,h*.46+.065,z+.052,0,0,.001);
  ball(M.gold,x+w*.29,h*.46+.065,z+.055,.011,.011,.008);
 }
 function steps(x,z,w=.28){
  box(M.stoneLight,w,.035,.14,x,.018,z+.085,0,0,.01);
  box(M.trim,w*.88,.032,.09,x,.046,z+.04,0,0,.008);
 }
 function planter(x,z,w=.18,y=.02,flowers=false){
  box(M.roof,w,.07,.10,x,y+.035,z,0,0,.012);box(M.dark,w*.88,.009,.086,x,y+.072,z,0,0,.004);
  for(let i=0;i<3;i++){
   ball(M.foliage,x+(i-1)*w*.26,y+.10,z,.04,.045,.036);
   if(flowers)for(let j=0;j<3;j++)ball(j===1?M.trim:M.flower,x+(i-1)*w*.26+(j-1)*.017,y+.139-j*.003,z+.012*Math.sin(j*3),.014);
  }
 }
 function pot(x,z,y=.0,flower=false){
  cylinder(M.roof,.043,.033,.068,x,y+.034,z,12);cylinder(M.roofLight,.049,.049,.012,x,y+.069,z,12);
  for(let i=0;i<5;i++){const a=i*Math.PI*.4;ball(M.foliage,x+Math.cos(a)*.02,y+.102,z+Math.sin(a)*.02,.028,.047,.024);}
  if(flower)for(let i=0;i<4;i++){const a=i*Math.PI*.5;ball(M.flower,x+Math.cos(a)*.023,y+.149,z+Math.sin(a)*.023,.015);}
 }
 function planks(w,h,d,cx=0,base=.055,cz=0,rough=false){
  box(M.dark,w-.015,h-.018,d-.015,cx,base+h/2,cz);
  const rows=Math.ceil(h/.067);
  for(let j=0;j<rows;j++){
   const yy=base+(j+.5)*h/rows,hh=h/rows-.007,key=j%4===1?M.lightwood:M.wood;
   const shift=rough?(rng()-.5)*.01:0;
   for(const side of [-1,1]){
    box(key,w+(rough?(rng()-.5)*.018:0),hh,.025,cx+shift,yy,cz+side*d/2,rough?(rng()-.5)*.028:0,0,.004);
    box(key,.025,hh,d,cx+side*w/2,yy,cz+shift,0,0,.004);
   }
  }
 }
 function gable(w,d,eave,rise,cx=0,cz=0,key=M.wall){
  const s=new T.Shape();s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(0,rise);s.closePath();
  const geo=new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:false,steps:1});geo.translate(0,0,-d/2);add(geo,key,cx,eave,cz);
 }
 function pitchedRoof(w,d,eave,rise,cx=0,cz=0,thatch=false){
  const angle=Math.atan2(rise,w/2),length=Math.hypot(w/2,rise),key=thatch?M.straw:M.roof;
  for(const side of [-1,1])box(key,length+.025,thatch?.065:.044,d,cx+side*w/4,eave+rise/2,cz,-side*angle,0,.010);
  beam(thatch?M.strawLight:M.roofLight,[cx,eave+rise+.026,cz-d/2-.012],[cx,eave+rise+.026,cz+d/2+.012],thatch?.034:.028,10);
  if(thatch){
   for(const side of [-1,1])for(let j=0;j<26;j++){
    const zz=cz-d/2+(j+.5)*d/26;
    beam(j%3?M.strawLight:M.straw,[cx+side*.023,eave+rise+.023,zz],[cx+side*(w/2+.018),eave+.006+(rng()-.5)*.01,zz+(rng()-.5)*.014],.0065,5);
   }
   for(let j=0;j<11;j++)beam(M.wood,[cx-.036,eave+rise+.018,cz-d/2+.032+j*d/11],[cx+.035,eave+rise+.018,cz-d/2+.032+j*d/11],.006,5);
  }else{
   // Rounded barrel rows give the roof an actual silhouette at every angle.
   const rows=12;
   for(const side of [-1,1])for(let j=0;j<rows;j++){
    const zz=cz-d/2+(j+.5)*d/rows;
    beam(j%3===0?M.roofLight:M.roof,[cx+side*.025,eave+rise+.026,zz],[cx+side*(w/2+.01),eave+.025,zz],.014,7);
   }
   for(const side of [-1,1])for(let row=1;row<=3;row++){
    const t=row/4,xx=cx+side*w/2*t,yy=eave+rise*(1-t)+.022;
    beam(M.roofLight,[xx,yy,cz-d/2],[xx,yy,cz+d/2],.005,5);
   }
  }
 }
 function stoneWalls(w,h,d,broken=false){
  box(M.wall,w-.025,h,d-.025,0,h/2+.045,0,0,0,.02);
  const rows=5,columns=5;
  for(let row=0;row<rows;row++){
   const hh=h/rows-.009,yy=.045+(row+.5)*h/rows;
   for(const side of [-1,1]){
    for(let col=0;col<columns;col++){
     const ww=w/columns-.007,x=-w/2+(col+.5)*w/columns;
     const color=(row+col)%3===0?M.stoneLight:M.stone;
     box(color,ww,hh,.034,x,yy,side*d/2,broken?(rng()-.5)*.07:0,0,.011);
    }
    for(let col=0;col<4;col++){
     const dd=d/4-.008,z=-d/2+(col+.5)*d/4;
     box((row+col)%3===0?M.stoneLight:M.stone,.034,hh,dd,side*w/2,yy,z,0,0,.01);
    }
   }
  }
 }
 function rail(x,y,z,w,posts=7,ry=0,gold=false){
  const p=(xx,yy,zz)=>[x+Math.cos(ry)*xx+Math.sin(ry)*zz,y+yy,z-Math.sin(ry)*xx+Math.cos(ry)*zz];
  box(M.trim,w+.04,.025,.034,...p(0,.14,0),0,ry,.005);
  box(gold?M.gold:M.trim,w,.014,.019,...p(0,.025,0),0,ry,.003);
  for(let i=0;i<posts;i++){
   const xx=-w/2+i*w/(posts-1);box(M.trim,.023,.138,.027,...p(xx,.074,0),0,ry,.004);
   if(gold)ball(M.gold,...p(xx,.157,0),.017,.014,.017);
  }
 }
 function lantern(x,y,z){
  box(M.gold,.042,.01,.039,x,y+.033,z,0,0,.004);box(M.trim,.028,.046,.026,x,y,z,0,0,.006);
  box(M.gold,.039,.012,.035,x,y-.03,z,0,0,.004);beam(M.gold,[x,y+.048,z],[x,y+.08,z],.004,5);
 }

 if(stars===.5){
  // Woven round hut; a softly irregular cone is distinct from every later roof.
  const wall=new T.CylinderGeometry(.285,.31,.39,36,1);wall.scale(1,1,.88);add(wall,M.straw,0,.235,0);
  for(let j=0;j<7;j++){
   const ring=new T.TorusGeometry(.30-j*.003,.005,4,40);ring.rotateX(Math.PI/2);ring.scale(1,1,.88);add(ring,M.wood,0,.07+j*.054,0);
  }
  for(let j=0;j<26;j++){
   const a=j*Math.PI*2/26;beam(M.strawLight,[Math.cos(a)*.3,.05,Math.sin(a)*.265],[Math.cos(a)*.284,.42,Math.sin(a)*.25],.0055,5);
  }
  const cone=new T.CylinderGeometry(.02,.49,.39,40,1);cone.scale(1,1,.82);add(cone,M.straw,0,.62,-.012);
  for(let row=0;row<4;row++)for(let j=0;j<36;j++){
   const a=(j+row*.31)*Math.PI*2/36,t1=row/4,t2=(row+1)/4;
   beam(j%4===0?M.straw:M.strawLight,[Math.cos(a)*(.025+.46*t1),.815-.39*t1,Math.sin(a)*(.025+.46*t1)*.82-.012],[Math.cos(a+.009)*(.031+.469*t2),.815-.39*t2,Math.sin(a+.009)*(.031+.469*t2)*.82-.012],.0048,5);
  }
  door(0,.268,.17,.30,true,M.dark);steps(0,.30,.24);
  cylinder(M.wood,.016,.021,.064,0,.847,-.012,8);pot(-.37,.17,.0);
 }else if(stars===1){
  box(M.wall,.63,.43,.51,0,.265,0,0,0,.024);
  for(let side of [-1,1])for(let i=0;i<6;i++)box(M.straw,.015,.39,.035,side*(.105+i*.042),.263,.268,0,0,.003);
  for(const x of [-.305,.305])for(const z of [-.245,.245])cylinder(M.wood,.017,.018,.45,x,.276,z,8);
  gable(.64,.52,.48,.26,0,0,M.straw);pitchedRoof(.85,.73,.47,.30,0,-.015,true);
  box(M.wood,.69,.032,.18,0,.051,.324,0,0,.007);door(-.075,.27,.18,.33);
  window(.19,.302,.274,.13,.15);window(-.325,.3,-.01,.15,.16,-Math.PI/2);
  steps(-.075,.403,.28);pot(-.40,.23,0,true);planter(.26,.361,.13,.06,true);
  for(const x of [-.29,.29])cylinder(M.wood,.014,.019,.24,x,.19,.38,8);
 }else if(stars===1.5){
  planks(.66,.45,.53,0,.066,0,true);
  const attic=new T.Shape();attic.moveTo(-.33,.50);attic.lineTo(.33,.50);attic.lineTo(.33,.639);attic.lineTo(-.33,.514);attic.closePath();
  const atticGeo=new T.ExtrudeGeometry(attic,{depth:.53,bevelEnabled:false,steps:1});atticGeo.translate(0,0,-.265);add(atticGeo,M.wood);
  // Low asymmetrical roof and a small visible repair, never a jagged ruin.
  box(M.shadow,.80,.036,.70,-.01,.592,-.015,.19,0,.010);
  for(let j=0;j<13;j++)box(j%3?M.wood:M.lightwood,.062,.023,.70,-.395+(j+.5)*.80/13,.621+(-.395+(j+.5)*.80/13)*.192,-.015,.19,0,.004);
  for(const z of [-.24,.24])beam(M.dark,[-.31,.05,z],[-.31,.56,z],.024,7);
  beam(M.dark,[.32,.04,-.25],[.32,.65,-.25],.024,7);beam(M.dark,[.32,.05,.24],[.32,.64,.24],.024,7);
  box(M.lightwood,.26,.046,.027,.145,.192,.302,.36,0,.005);
  box(M.wood,.28,.037,.029,.15,.272,.306,-.29,0,.005);
  for(const x of [.06,.23])ball(M.dark,x,.229,.326,.007,.007,.004);
  door(-.13,.286,.17,.31);window(.172,.388,.284,.13,.13);
  // Old shutter and boarded side window remain readable when rotated.
  window(-.354,.313,-.02,.17,.15,-Math.PI/2);
  box(M.lightwood,.025,.047,.25,-.374,.31,-.02,0,0,.004);
  box(M.roof,.23,.012,.25,.16,.682,-.18,.19,0,.004);
  steps(-.13,.31,.27);pot(-.41,.18);box(M.lightwood,.16,.021,.10,.27,.018,.38,.06,0,.003);
 }else if(stars===2){
  planks(.71,.47,.57);gable(.71,.58,.525,.245,0,0,M.lightwood);pitchedRoof(.88,.76,.52,.27);
  for(const x of [-.34,.34])for(const z of [-.275,.275])box(M.trim,.036,.475,.036,x,.298,z,0,0,.005);
  door(-.10,.312,.18,.355);window(.198,.325,.310,.15,.18);window(-.375,.32,-.025,.2,.18,-Math.PI/2);
  for(const x of [.073,.323]){box(M.wood,.07,.208,.024,x,.325,.338,0,0,.004);for(let j=0;j<5;j++)box(M.lightwood,.055,.011,.007,x,.254+j*.033,.355,0,0,.001);}
  box(M.wood,.38,.036,.17,-.10,.043,.386,0,0,.005);steps(-.10,.437,.29);planter(.202,.356,.19,.17,true);pot(-.44,.20,0,true);
  box(M.trim,.09,.09,.026,0,.655,.308,Math.PI/4,0,.006);box(M.glass,.059,.059,.017,0,.655,.329,Math.PI/4,0,.003);
 }else if(stars===2.5){
  stoneWalls(.72,.46,.56,true);gable(.72,.57,.505,.23,0,0,M.wall);pitchedRoof(.88,.74,.50,.255);
  // Lime patches soften the aged facade; the stone structure stays complete.
  box(M.wall,.19,.135,.014,-.228,.325,.307,-.06,0,.017);box(M.wall,.135,.087,.017,.241,.137,.31,.05,0,.014);
  box(M.lightwood,.22,.023,.19,-.20,.734,.16,-.525,0,.006);box(M.wood,.20,.014,.021,-.20,.751,.16,-.525,0,.003);
  door(-.09,.313,.19,.34,true);window(.21,.329,.319,.135,.163,0,true);window(-.383,.323,-.015,.16,.17,-Math.PI/2,true);
  box(M.stone,.105,.19,.116,.222,.717,-.14,.025,0,.014);box(M.stoneLight,.135,.035,.141,.224,.824,-.14,0,0,.009);
  steps(-.09,.35,.31);pot(-.45,.17,0,true);
  for(let i=0;i<3;i++)ball(M.foliage,-.28-i*.035,.038,.32+i*.018,.035,.021,.030);
 }else if(stars===3){
  stoneWalls(.75,.49,.59,false);gable(.76,.59,.535,.255,0,0,M.stoneLight);pitchedRoof(.94,.80,.53,.28);
  for(const x of [-.38,.38])for(let j=0;j<5;j++)box(M.trim,.052,.074,.052,x,.10+j*.092,.294,0,0,.008);
  door(-.11,.326,.19,.372,true);window(.223,.357,.333,.15,.19,0,true);window(-.40,.34,-.025,.19,.2,-Math.PI/2,true);
  box(M.stone,.125,.265,.139,-.237,.747,-.16,0,0,.014);box(M.trim,.166,.033,.174,-.237,.888,-.16,0,0,.008);box(M.dark,.097,.005,.105,-.237,.908,-.16,0,0,.003);
  box(M.trim,.73,.031,.125,0,.05,.359,0,0,.012);steps(-.11,.42,.32);planter(.235,.399,.20,.0,true);pot(-.46,.17,0,true);lantern(-.271,.395,.37);
  ball(M.glass,0,.668,.319,.045,.047,.008);ball(M.trim,0,.671,.308,.055,.057,.006);
 }else if(stars===3.5){
  // Offset brick volume with a flat porch makes the modern transition explicit.
  box(M.wall,.73,.51,.58,-.015,.301,-.028,0,0,.019);
  for(let row=0;row<7;row++)for(const side of [-1,1])for(let j=0;j<6;j++){
   const x=-.375+(j+.5)*.12;
   box((j+row)%4?M.roof:M.roofLight,.111,.061,.014,x,.09+row*.066,side*.294-.028,0,0,.003);
  }
  for(let row=0;row<7;row++)for(const side of [-1,1])for(let j=0;j<5;j++)box((j+row)%4?M.roof:M.roofLight,.014,.061,.105,side*.371-.015,.09+row*.066,-.266+j*.118,0,0,.003);
  box(M.trim,.89,.085,.72,-.015,.574,-.03,0,0,.014);box(M.shadow,.78,.013,.61,-.015,.624,-.03,0,0,.005);
  box(M.trim,.37,.048,.35,-.245,.437,.30,0,0,.010);for(const x of [-.405,-.086])box(M.trim,.028,.38,.028,x,.233,.43,0,0,.005);
  door(-.22,.290,.17,.33,false,M.glass);window(.169,.315,.298,.24,.245);window(-.402,.324,-.053,.23,.236,-Math.PI/2);
  box(M.stoneLight,.47,.040,.20,-.23,.037,.36,0,0,.010);steps(-.23,.421,.29);planter(.194,.405,.23,0,true);pot(-.485,.27,0);
  box(M.wall,.124,.108,.136,.213,.678,-.189,0,0,.011);box(M.trim,.148,.025,.159,.213,.737,-.189,0,0,.006);
 }else if(stars===4){
  box(M.trim,.60,.57,.55,-.115,.328,-.078,0,0,.025);
  box(M.wall,.37,.385,.43,.288,.237,.001,0,0,.023);
  box(M.trim,.69,.060,.64,-.115,.638,-.078,0,0,.014);box(M.shadow,.60,.013,.55,-.115,.674,-.078,0,0,.005);
  box(M.trim,.45,.055,.50,.288,.455,.001,0,0,.012);
  for(let j=0;j<7;j++)box(M.lightwood,.021,.427,.017,-.370+j*.042,.310,.210,0,0,.003);
  window(-.061,.349,.208,.254,.36);window(.285,.249,.233,.242,.255);window(-.435,.352,-.115,.30,.35,-Math.PI/2);
  box(M.wood,.78,.05,.28,-.06,.057,.332,0,0,.010);
  for(let j=0;j<11;j++)box(M.lightwood,.057,.011,.264,-.415+(j+.5)*.71/11,.09,.332,0,0,.002);
  for(const x of [-.42,.02])box(M.wood,.024,.40,.025,x,.287,.432,0,0,.004);
  for(let j=0;j<6;j++)box(M.wood,.50,.019,.025,-.20,.49,.195+j*.05,0,0,.003);
  steps(-.05,.441,.28);planter(-.46,.245,.16,0,true);pot(.456,-.17,0);
  box(M.glass,.36,.012,.215,.284,.491,-.003,0,0,.003);
 }else{
  const grand=stars===5;
  // Same restrained two-storey envelope. Five stars invests in the arcade,
  // terracotta roof, gardens and gold details instead of a much larger house.
  const trim=grand?M.trim:M.wall;
  box(trim,.77,.44,.57,-.035,.267,-.045,0,0,.022);
  box(M.trim,.58,.31,.45,-.13,.641,-.09,0,0,.020);
  box(M.stoneLight,1.08,.045,.88,-.048,.024,-.006,0,0,.020);
  for(let i=0;i<6;i++)box(M.wall,.009,.003,.78,-.50+i*.174,.049,-.004,0,0,.001);
  if(grand){
   gable(.62,.49,.796,.16,-.13,-.09,M.wall);pitchedRoof(.74,.64,.786,.17,-.13,-.095);
   box(M.trim,.32,.055,.47,.309,.498,-.04,0,0,.008);box(M.roof,.32,.027,.41,.31,.529,-.04,0,0,.008);
   for(let j=0;j<6;j++)beam(M.roofLight,[.165+j*.056,.55,-.241],[.165+j*.056,.55,.165],.011,6);
   // An arcade in front of the house: real open arches, no painted-on holes.
   for(const x of [-.36,-.045,.27]){
    cylinder(M.trim,.027,.030,.342,x,.25,.386,10);box(M.trim,.071,.028,.069,x,.089,.386,0,0,.006);box(M.trim,.065,.023,.067,x,.427,.386,0,0,.006);
   }
   for(const x of [-.2025,.1125]){
    const arc=new T.TorusGeometry(.1575,.024,6,18,Math.PI);add(arc,M.trim,x,.407,.386);
   }
   box(M.trim,.80,.035,.22,-.045,.575,.308,0,0,.008);
   rail(-.054,.584,.405,.73,8,0,true);rail(-.412,.584,.315,.18,3,Math.PI/2,true);
   window(-.254,.676,.161,.16,.21,0,true);window(.00,.676,.161,.16,.21,0,true);
   door(-.20,.263,.18,.345,true);window(.157,.286,.272,.19,.23,0,true);
   window(-.44,.29,-.058,.21,.24,-Math.PI/2,true);window(-.437,.668,-.11,.21,.18,-Math.PI/2,true);
   planter(-.511,-.202,.14,.05,true);planter(-.508,.128,.14,.05,true);planter(.399,-.283,.21,.05,true);
   for(const x of [-.49,.46]){cylinder(M.trim,.025,.03,.142,x,.12,.413,10);lantern(x,.245,.413);}
   for(const z of [-.325,-.105,.13])pot(-.55,z,.048,true);
   rail(-.56,.045,-.104,.47,6,Math.PI/2,false);rail(.045,.045,-.417,.94,9,0,false);
   box(M.trim,.13,.16,.115,-.274,.885,-.24,0,0,.009);box(M.roofLight,.154,.035,.14,-.274,.975,-.24,0,0,.006);
  }else{
   pitchedRoof(.74,.62,.789,.16,-.13,-.09);
   box(M.trim,.35,.045,.48,.283,.505,-.045,0,0,.008);
   box(M.wood,.72,.032,.21,-.05,.495,.289,0,0,.007);
   for(const x of [-.366,.257])box(M.trim,.036,.39,.036,x,.28,.375,0,0,.006);
   rail(-.054,.514,.37,.66,6);rail(-.379,.514,.292,.16,3,Math.PI/2);
   window(-.25,.658,.158,.14,.20);window(.008,.658,.158,.14,.20);
   door(-.18,.262,.17,.34);window(.173,.294,.270,.20,.235);window(-.441,.30,-.065,.20,.24,-Math.PI/2);
   pot(-.512,-.21,.048);planter(-.501,.166,.14,.045,true);
   box(M.trim,.055,.135,.055,.455,.114,-.339,0,0,.008);
  }
  steps(-.16,.395,.31);
 }

 // The island can be turned all the way around: side and rear elevations
 // have their own framed openings, rather than a detailed facade on a box.
 if(stars===.5){window(.292,.269,-.038,.10,.13,Math.PI/2,true);}
 else if(stars===1){window(.331,.289,-.012,.15,.17,Math.PI/2);window(.02,.303,-.278,.19,.16,Math.PI);}
 else if(stars===1.5){window(.356,.315,-.015,.15,.16,Math.PI/2);window(.06,.304,-.286,.15,.14,Math.PI);}
 else if(stars===2){window(.383,.326,-.03,.20,.185,Math.PI/2);window(.02,.326,-.315,.22,.18,Math.PI);}
 else if(stars===2.5){window(.387,.321,-.025,.17,.17,Math.PI/2,true);window(.03,.32,-.312,.18,.175,Math.PI,true);}
 else if(stars===3){window(.403,.343,-.024,.20,.20,Math.PI/2,true);window(.025,.341,-.328,.22,.20,Math.PI,true);}
 else if(stars===3.5){window(.383,.32,-.04,.245,.232,Math.PI/2);window(.005,.33,-.343,.29,.23,Math.PI);}
 else if(stars===4){window(.485,.264,-.02,.23,.24,Math.PI/2);window(-.10,.365,-.364,.30,.32,Math.PI);}
 else if(stars>=4.5){
  const a=stars===5;window(.367,.288,-.07,.22,.23,Math.PI/2,a);window(.18,.666,-.092,.19,.18,Math.PI/2,a);
  window(-.04,.29,-.347,.24,.23,Math.PI,a);window(-.127,.663,-.333,.25,.19,Math.PI,a);
 }

 const group=new T.Group();group.name='building-'+stars;group.userData.role='building-level';group.userData.stars=stars;
 let triangles=0;
 for(const [key,list] of parts){
  const merged=mergeGeometries(list,false);list.forEach(g=>g.dispose());
  merged.computeBoundingBox();merged.computeBoundingSphere();triangles+=merged.getAttribute('position').count/3;
  const mesh=new T.Mesh(merged,materials.get(key));mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=key;group.add(mesh);
 }
 // Unused palette entries are released now; only active objects stay allocated.
 for(const [key,mat] of materials)if(!parts.has(key)){mat.dispose();materials.delete(key);}
 const usedTextures=new Set();for(const mat of materials.values())for(const key of ['map','bumpMap'])if(mat[key])usedTextures.add(mat[key]);
 for(const tex of textures.values())if(tex&&!usedTextures.has(tex))tex.dispose();
 const bounds=new T.Box3().setFromObject(group),size=bounds.getSize(new T.Vector3());
 return {group,triangles,calls:group.children.length,pieceCount,materials:[...materials.values()],textures:[...usedTextures],bounds:{min:bounds.min.toArray(),max:bounds.max.toArray(),size:size.toArray()}};
}

export function createBuildingSeries(parent,{position=[0,0,0],rotation=0,scale=1,initialLevel=0,onChange}={}){
 const root=new T.Group();root.name='building-series';root.userData.role='building-series';root.userData.stars=0;root.position.fromArray(position);root.rotation.y=rotation;root.scale.setScalar(scale);parent.add(root);
 let current=null,level=0,disposed=false,switches=0,geometriesCreated=0,geometriesDisposed=0;
 function release(){
  if(!current)return;
  root.remove(current.group);current.group.children.forEach(mesh=>{mesh.geometry.dispose();geometriesDisposed++;});
  current.materials.forEach(m=>m.dispose());current.textures.forEach(t=>t.dispose());current=null;
 }
 function getState(){
  const meta=BUILDING_LEVELS.find(v=>v.stars===level);
  return {stars:level,title:meta.title,description:meta.description,switches,disposed,triangles:current?.triangles||0,calls:current?.calls||0,pieces:current?.pieceCount||0,bounds:current?.bounds||null,
   resources:{geometries:current?.calls||0,materials:current?.materials.length||0,textures:current?.textures.length||0,geometriesCreated,geometriesDisposed}};
 }
 function setLevel(value){
  if(disposed)throw new Error('Building series is disposed');
  const next=Math.round(Number(value)*2)/2;
  if(!Number.isFinite(next)||next<0||next>5)throw new RangeError('Building stars must be from 0 to 5');
  if(next===level&&(current||next===0))return getState();
  const replacement=next===0?null:builder(next); // Complete before releasing the visible model.
  release();level=next;current=replacement;switches++;
  if(current){root.add(current.group);geometriesCreated+=current.calls;}
  root.userData.stars=level;const state=getState();onChange?.(state);return state;
 }
 function dispose(){if(disposed)return;release();parent.remove(root);disposed=true;}
 setLevel(initialLevel);
 return {root,setLevel,getState,dispose};
}
