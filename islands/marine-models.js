import * as T from './vendor/three.module.min.js';
import {mergeGeometries,mergeVertices} from './vendor/BufferGeometryUtils.js';

// All residents face local +X. Static coloured detail is baked into one mesh;
// only tails or the two flippers/wings remain separate for a species-specific gait.
const AQUATIC_KINDS=['smallFish','clownfish','tang','puffer','boxfish','turtle','stingray','manta','reefShark','whaleShark'];
const WHITE='#fff6dd',INK='#182e36';
// Baked into the shared geometry below, so the arrival animation can keep owning
// root.scale. Accepted small silhouettes and colour details stay unchanged.
const SMALL_SCALE=Object.freeze({smallFish:1.10,clownfish:1.10,tang:1.10,puffer:1.10,boxfish:1.10,turtle:1.08});
const v3=(a)=>new T.Vector3(...a);
function colored(geometry,color,paint){
 const g=geometry.index?geometry.toNonIndexed():geometry;
 if(g!==geometry)geometry.dispose();
 g.deleteAttribute('uv');
 const p=g.attributes.position,colors=new Float32Array(p.count*3),base=new T.Color(color);
 for(let i=0;i<p.count;i++){const c=paint?.(p.getX(i),p.getY(i),p.getZ(i))||base;const cc=c.isColor?c:new T.Color(c);colors[i*3]=cc.r;colors[i*3+1]=cc.g;colors[i*3+2]=cc.b;}
 g.setAttribute('color',new T.BufferAttribute(colors,3));return g;
}
function builder(){const pieces=[];return {
 add(g,color,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0],paint){g=colored(g,color,paint);g.applyMatrix4(new T.Matrix4().compose(v3(position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),v3(scale)));pieces.push(g);return g;},
 ell(color,p,s,paint,segments=12,rings=8){return this.add(new T.SphereGeometry(1,segments,rings),color,p,s,[0,0,0],paint);},
 line(color,points,r=.012){return this.add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v3)),Math.max(5,points.length*3),r,5,false),color);},
 fin(color,points,{p=[0,0,0],r=[0,0,0],depth=.025}={}){const shape=new T.Shape();const n=points.length;for(let i=0;i<=n;i++){const a=points[i%n],b=points[(i+1)%n],prev=points[(i+n-1)%n];if(!i)shape.moveTo((prev[0]+a[0])/2,(prev[1]+a[1])/2);shape.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);}shape.closePath();const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:2,steps:1});g.translate(0,0,-depth/2);return this.add(g,color,p,[1,1,1],r);},
 finish(){const merged=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());merged.computeBoundingBox();merged.computeBoundingSphere();return merged;}
};}
function eyes(b,{x=.22,y=.045,z=.13,size=.052,forward=false}={}){
 for(const side of [-1,1]){
  const p=[x,y,z*side],s=forward?[.018,size,size]:[size,size,.018];
  b.ell(WHITE,p,s,undefined,10,6);b.ell(INK,[x+.008,y+.002,side*(z+.011)],s.map(k=>k*.72),undefined,10,6);
  b.ell('#ffffff',[x+.020,y+size*.25,side*(z+.024)],[size*.18,size*.18,.006],undefined,6,4);
 }
}
function face(b,x,y=0,z=.055){b.line(INK,[[x,y+.013,-z],[x+.007,y-.010,0],[x,y+.013,z]],.008);}
function forkTail(color,edge=undefined){const b=builder();b.fin(color,[[.02,0],[-.11,.12],[-.32,.23],[-.25,.015],[-.32,-.23],[-.11,-.12]],{depth:.026});if(edge)b.fin(edge,[[-.26,.16],[-.32,.23],[-.25,.015],[-.32,-.23],[-.26,-.16],[-.20,0]],{depth:.029});return b.finish();}
function fish(kind){const b=builder(),isTang=kind==='tang',isClown=kind==='clownfish';const body=isTang?'#3166c4':isClown?'#fa913c':'#71b9ce';
 let paint;
 if(isClown)paint=(x,y)=>y<-.55?'#ffc675':body;
 else if(isTang)paint=(x,y,z)=>Math.abs(z)>.7&&x<.28&&x>-.6&&y>.05&&y<.55?'#193b6b':y<-.7?'#80c9df':body;
 else paint=(x,y)=>y<-.20?WHITE:y>.42?'#5a9db6':body;
 b.ell(body,[.005,0,0],[.36,isTang?.24:.185,isTang?.105:.13],paint,20,12);
 if(isClown){for(const center of [-.67,-.07,.56])for(const [half,color,inflate] of [[.15,'#534337',1.009],[.105,WHITE,1.019]]){const positions=[],normals=[];for(let i=0;i<24;i++){const vertices=[];for(const [x,a] of [[center-half,i/24*Math.PI*2],[center+half,i/24*Math.PI*2],[center+half,(i+1)/24*Math.PI*2],[center-half,(i+1)/24*Math.PI*2]]){const rr=Math.sqrt(1-x*x);vertices.push([.005+x*.36,Math.cos(a)*rr*.185*inflate,Math.sin(a)*rr*.13*inflate]);}for(const j of [0,2,1,0,3,2]){const v=vertices[j];positions.push(...v);const n=new T.Vector3((v[0]-.005)/.36**2,v[1]/.185**2,v[2]/.13**2).normalize();normals.push(...n);}}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));b.add(g,color);}}
 b.fin(isTang?'#315cc2':isClown?'#f89b46':'#58a7c2',[[-.20,.09],[-.15,.25],[.10,.25],[.23,.12]],{depth:.031});
 b.fin(isTang?'#f5d85a':isClown?'#fff3d7':'#aedcdb',[[-.13,-.10],[-.15,-.24],[.10,-.20],[.15,-.12]],{depth:.025});
 for(const side of [-1,1])b.fin(isTang?'#ffdf69':isClown?'#ffd5a2':'#b7e2df',[[.08,0],[-.06,.17],[-.17,.10],[-.04,-.02]],{p:[.03,-.04,side*.105],r:[side*Math.PI/2,0,0],depth:.018});
 eyes(b,{x:.19,y:.035,z:isTang?.10:.117,size:isTang?.055:.049});face(b,.35,-.035,.047);
 return {parts:[b.finish(),forkTail(isTang?'#f9d34d':isClown?'#f99a47':'#6bbaca',isClown?WHITE:undefined)],pivots:[[0,0,0],[-.30,0,0]],motion:'tail',dimensions:isTang?[.225,.088,.070]:isClown?[.22,.088,.076]:[.18,.071,.061]};
}
function roundFish(kind){const b=builder(),puffer=kind==='puffer';
 if(puffer){b.ell('#e8c47b',[0,0,0],[.32,.30,.27],(x,y,z)=>y<-.10?WHITE:y>.60?'#b3aa6d':'#d9c184',20,12);
  for(let i=0;i<13;i++){const a=i*2.399963,y=-.15+(i/12)*.97,rad=Math.sqrt(1-y*y),x=Math.cos(a)*rad,z=Math.sin(a)*rad;const g=new T.ConeGeometry(.023,.075,5);const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(x,y,z));g.applyQuaternion(q);b.add(g,'#ac9d61',[x*.321,y*.301,z*.274]);}
 }else{
  const geo=new T.BoxGeometry(2,2,2,5,5,5),p=geo.attributes.position;
  for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i),core=v.clone().clampScalar(-.69,.69);v.sub(core).normalize().multiplyScalar(.31).add(core);p.setXYZ(i,v.x,v.y,v.z);}geo.computeVertexNormals();
  b.add(geo,'#f1cd54',[0,0,0],[.29,.24,.24]);
  for(const side of [-1,1])for(const [x,y] of [[-.17,.10],[-.015,.125],[.14,.10],[-.12,-.08],[.07,-.055]])b.ell('#7e6a3d',[x,y,side*.242],[.023,.023,.003],undefined,8,4);
  for(const [x,z] of [[-.17,0],[.02,.115],[.14,-.06],[-.045,-.11]])b.ell('#7e6a3d',[x,.242,z],[.022,.003,.022],undefined,8,4);
 }
 const z=puffer?.246:.24;eyes(b,{x:.205,y:.065,z,size:.064});face(b,puffer?.318:.30,-.048,.045);
 for(const side of [-1,1])b.fin(puffer?'#f1dca8':'#fbe5a0',[[.07,0],[-.10,.16],[-.16,.02],[-.06,-.05]],{p:[-.14,0,side*z*.95],r:[side*Math.PI/2,0,0],depth:.022});
 return {parts:[b.finish(),forkTail(puffer?'#d8b66f':'#e9aa40')],pivots:[[0,0,0],[-.26,0,0]],motion:'tail',dimensions:puffer?[.20,.167,.17]:[.196,.142,.155]};
}
function turtle(){const b=builder();b.ell('#658c60',[-.025,.02,0],[.33,.153,.255],undefined,20,12);b.ell('#e4d39a',[0,-.069,0],[.31,.065,.24]);
 // Curved shell scutes sit on the shell surface rather than floating decals.
 const scutes=[[0,0,.115],[.17,0,.075],[-.18,0,.078],[.085,.139,.075],[-.105,.139,.077],[.085,-.139,.075],[-.105,-.139,.077]];
 for(let i=0;i<scutes.length;i++){const [x,z,r]=scutes[i];const pts=[];for(let j=0;j<6;j++){const a=j*Math.PI/3;pts.push([x+Math.cos(a)*r,z+Math.sin(a)*r*.76]);}const p=[];const emit=(a,b,c)=>{for(const [xx,zz] of [a,b,c])p.push(xx,.026+.154*Math.sqrt(Math.max(.025,1-((xx+.025)/.333)**2-(zz/.26)**2)),zz);};for(let j=0;j<6;j++){const A=[x,z],B=pts[(j+1)%6],C=pts[j],at=(u,v)=>[A[0]+(B[0]-A[0])*u+(C[0]-A[0])*v,A[1]+(B[1]-A[1])*u+(C[1]-A[1])*v];for(let u=0;u<3;u++)for(let v=0;v<3-u;v++){emit(at(u/3,v/3),at((u+1)/3,v/3),at(u/3,(v+1)/3));if(u+v<2)emit(at((u+1)/3,v/3),at((u+1)/3,(v+1)/3),at(u/3,(v+1)/3));}}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.computeVertexNormals();b.add(g,i%2?'#8ca871':'#9cae77');}
 b.ell('#a1b977',[.325,-.025,0],[.14,.10,.105]);eyes(b,{x:.37,y:.011,z:.082,size:.035});face(b,.455,-.040,.027);
 b.fin('#849e67',[[-.23,0],[-.44,.05],[-.42,-.015],[-.25,-.06]],{r:[Math.PI/2,0,0],p:[0,-.060,0],depth:.038});
 const parts=[b.finish()],pivots=[[0,0,0]];
 for(const side of [-1,1]){const f=builder();f.fin('#8ba967',[[.22,0],[.17,.12],[.07,.23],[-.02,.19],[.025,.03]],{r:[side*Math.PI/2,0,0],depth:.035});f.fin('#91ab6a',[[-.14,0],[-.19,.14],[-.28,.16],[-.28,.08],[-.25,0]],{r:[side*Math.PI/2,0,0],depth:.03});parts.push(f.finish());pivots.push([0,-.045,side*.16]);}
 return {parts,pivots,motion:'flippers',dimensions:[.36,.132,.296]};
}
function wingGeometry(side,manta){const positions=[],colors=[],nx=8,nz=10;const top=manta?'#477e8e':'#759b9f',bottom=WHITE;const sample=(u,v,under)=>{const leading=(manta?.29:.25)*(1-v)-.10*v;const trailing=-(manta?.37:.40)*(1-v)-.12*v;return [T.MathUtils.lerp(trailing,leading,u),Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*.035+(under?-.018:.009),side*(.025+v*(manta?.66:.43))];};const tri=(a,b,c,col)=>{const p=side===1?[a,c,b]:[a,b,c];const cc=new T.Color(col);for(const v of p){positions.push(...v);colors.push(cc.r,cc.g,cc.b);}};
 for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const u=i/nx,v=j/nz,U=(i+1)/nx,V=(j+1)/nz;tri(sample(u,v,false),sample(U,v,false),sample(U,V,false),top);tri(sample(u,v,false),sample(U,V,false),sample(u,V,false),top);tri(sample(u,v,true),sample(U,V,true),sample(U,v,true),bottom);tri(sample(u,v,true),sample(u,V,true),sample(U,V,true),bottom);}
 for(let i=0;i<nx;i++)for(const v of [0,1]){const a=sample(i/nx,v,false),b=sample((i+1)/nx,v,false),c=sample((i+1)/nx,v,true),d=sample(i/nx,v,true);tri(a,b,c,top);tri(a,c,d,top);}
 for(let j=0;j<nz;j++)for(const u of [0,1]){const a=sample(u,j/nz,false),b=sample(u,(j+1)/nz,false),c=sample(u,(j+1)/nz,true),d=sample(u,j/nz,true);tri(a,b,c,top);tri(a,c,d,top);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));const smooth=mergeVertices(g,.00001);g.dispose();smooth.computeVertexNormals();return smooth;
}
function ray(kind){const manta=kind==='manta',b=builder(),color=manta?'#477e8e':'#789da0';b.ell(color,[.015,0,0],[manta?.31:.27,.065,manta?.14:.16],(x,y)=>y<-.25?WHITE:color,18,10);eyes(b,{x:.19,y:.035,z:.109,size:.035});
 b.line(color,[[-.23,0,0],[-.40,-.005,0],[-.62,.015,.015],[-.78,.038,.040]],manta?.014:.011);
 if(manta){for(const side of [-1,1])b.line('#528a97',[[.21,0,side*.075],[.37,-.016,side*.098],[.39,.025,side*.116],[.32,.040,side*.14]],.032);face(b,.309,-.026,.045);}
 else face(b,.274,-.030,.047);
 return {parts:[b.finish(),wingGeometry(-1,manta),wingGeometry(1,manta)],pivots:[[0,0,0],[0,0,0],[0,0,0]],motion:'wings',dimensions:manta?[.61,.095,.69]:[.37,.065,.33]};
}
function shark(kind){const whale=kind==='whaleShark',b=builder(),body=whale?'#5b92a2':'#79a7b4';
 const spots=[];for(let row=0;row<5;row++)for(let i=0;i<9;i++)spots.push([-.75+i*.18+(row%2)*.08,-.7+row*.34]);
 // Vertex-coloured spot rows follow the back and both flanks; no transparent decals.
 const paint=(x,y,z)=>{if(y<-.30)return WHITE;if(whale){const az=Math.atan2(z,y);const dotted=spots.some(([a,c])=>Math.hypot((x-a)*1.20,(az-c)/2)<.045);return dotted?'#edf7de':body;}return y>.5?'#6596a9':body;};
 if(whale){const g=new T.SphereGeometry(1,52,28);const p=g.attributes.position;
  // A broad, gently rounded frontal cap gives the whale shark its wide mouth;
  // the reef shark below keeps its pointed snout. This is opaque body geometry.
  for(let i=0;i<p.count;i++)p.setX(i,Math.min(p.getX(i),.68));
  g.computeVertexNormals();b.add(g,body,[.015,0,0],[.42,.128,.166],[0,0,0],paint);
 }
 else b.ell(body,[.05,0,0],[.42,.13,.137],paint,24,14);
 b.ell(body,[-.365,-.013,0],[.14,.055,.046],undefined,12,8);
 b.fin(body,[[-.11,.07],[-.035,.26],[.04,.235],[.16,.065]],{depth:.034});
 b.fin(body,[[-.27,.035],[-.245,.108],[-.19,.029]],{depth:.02});
 for(const side of [-1,1])b.fin(body,[[.20,0],[.13,.055],[-.035,.29],[-.14,.29],[-.13,.02]],{p:[.012,-.044,side*.095],r:[side*Math.PI/2,0,0],depth:.024});
 eyes(b,{x:whale?.25:.32,y:.014,z:whale?.140:.093,size:whale?.035:.038});
 face(b,whale?.304:.455,-.043,whale?.105:.039);
 if(whale)for(const side of [-1,1])b.ell('#577f89',[.303,.008,side*.071],[.003,.004,.009],undefined,8,4);
 for(const side of [-1,1])for(let i=0;i<3;i++)b.line('#577f89',[[.155-i*.03,.023,side*(whale?.159:.120)],[.158-i*.03,-.046,side*(whale?.152:.113)]],.0045);
 const tail=builder();tail.fin(body,[[.015,0],[-.070,.055],[-.19,.22],[-.215,.23],[-.165,.055],[-.09,0],[-.18,-.105],[-.15,-.12],[-.07,-.055]],{depth:.027});
 return {parts:[b.finish(),tail.finish()],pivots:[[0,0,0],[-.44,-.015,0]],motion:'shark',dimensions:whale?[1.30,.290,.520]:[.68,.198,.295]};
}
function recipe(kind){
 let r;if(['smallFish','clownfish','tang'].includes(kind))r=fish(kind);else if(['puffer','boxfish'].includes(kind))r=roundFish(kind);else if(kind==='turtle')r=turtle();else if(['stingray','manta'].includes(kind))r=ray(kind);else r=shark(kind);
 const factor=SMALL_SCALE[kind]||1;r.dimensions=r.dimensions.map(v=>v*factor);return r;
}
// Exact sinusoid extrema over each part's bounded stroke; no sampling gap can
// miss the widest tail or wing pose. The margin is added only after this union.
function rotationRange(a,b,limit){
 const value=t=>a*Math.cos(t)+b*Math.sin(t),left=value(-limit),right=value(limit);let low=Math.min(left,right),high=Math.max(left,right);const peak=Math.atan2(b,a);
 for(const t of [peak,peak-Math.PI,peak+Math.PI])if(t>=-limit&&t<=limit){const v=value(t);low=Math.min(low,v);high=Math.max(high,v);}return [low,high];
}
function animatedEnvelope(parts,pivots,motion){
 const envelope=new T.Box3(),axis=['wings','flippers'].includes(motion)?'x':'y',limit=motion==='tail'?.335:motion==='shark'?.265:motion==='wings'?.095:.30;
 parts.forEach((g,i)=>{const pivot=pivots[i];if(!i){envelope.union(g.boundingBox.clone().translate(v3(pivot)));return;}const p=g.attributes.position;
  for(let n=0;n<p.count;n++){const x=p.getX(n),y=p.getY(n),z=p.getZ(n),a=axis==='x'?rotationRange(y,-z,limit):rotationRange(x,z,limit),b=axis==='x'?rotationRange(z,y,limit):rotationRange(z,-x,limit);
   const low=axis==='x'?[x,a[0],b[0]]:[a[0],y,b[0]],high=axis==='x'?[x,a[1],b[1]]:[a[1],y,b[1]];
   for(let j=0;j<3;j++){envelope.min.setComponent(j,Math.min(envelope.min.getComponent(j),low[j]+pivot[j]));envelope.max.setComponent(j,Math.max(envelope.max.getComponent(j),high[j]+pivot[j]));}
  }
 });return envelope;
}

export function createAquaticModelFactory({whaleAsset:initialWhaleAsset=null}={}){
 const cache=new Map(),ownedWhaleAssets=new Set(),marineAssets=new Map(),ownedMarineAssets=new Set();let disposed=false,whaleAsset=null,assetError=null;
 // The controller owns stable actor wrappers. Registering a loaded source does
 // not rebuild existing residents; it changes only later whale create() calls.
 function setWhaleAsset(asset){
  if(disposed||!asset||typeof asset.create!=='function'||typeof asset.dispose!=='function'||typeof asset.getStats!=='function')return false;
  try{const b=asset.bounds;if(asset.getStats().disposed||!b||!['length','width','halfHeight','radius'].every(k=>Number.isFinite(b[k])&&b[k]>0))return false;}catch{return false;}
  whaleAsset=asset;ownedWhaleAssets.add(asset);assetError=null;return true;
 }
 setWhaleAsset(initialWhaleAsset);
 function setAsset(kind,asset,{variants=kind==='smallFish'?[0,1]:null}={}){
  if(disposed||!['manta','turtle','reefShark','smallFish'].includes(kind)||!asset||asset.kind!==kind||typeof asset.create!=='function'||typeof asset.dispose!=='function'||typeof asset.getStats!=='function')return false;
  if(variants!==null){if(!Array.isArray(variants)||!variants.length||variants.some(v=>!Number.isInteger(v)||v<0))return false;variants=[...new Set(variants)].sort((a,b)=>a-b);if(kind==='smallFish'&&variants.length>2)return false;}
  if(kind==='smallFish'&&variants===null)return false;
  try{const b=asset.bounds;if(asset.getStats().disposed||!b||!['length','width','halfHeight','radius'].every(k=>Number.isFinite(b[k])&&b[k]>0))return false;}catch{return false;}
  marineAssets.set(kind,{asset,variants,error:null});ownedMarineAssets.add(asset);return true;
 }
 function clearAsset(kind,asset){
  const registered=marineAssets.get(kind);if(disposed||!registered||registered.asset!==asset)return false;
  marineAssets.delete(kind);if(![...marineAssets.values()].some(record=>record.asset===asset))ownedMarineAssets.delete(asset);
  // Transaction rollback transfers the rejected source back to the caller,
  // who releases staged instances before disposing that source.
  return true;
 }
 const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.66,metalness:0});
 function acquire(kind){if(cache.has(kind))return cache.get(kind);const r=recipe(kind),box=new T.Box3();r.parts.forEach((g,i)=>{g.computeBoundingBox();box.union(g.boundingBox.clone().translate(v3(r.pivots[i])));});const size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3()),scale=new T.Vector3(r.dimensions[0]/size.x,r.dimensions[1]/size.y,r.dimensions[2]/size.z);for(let i=0;i<r.parts.length;i++){r.parts[i].translate(-center.x,-center.y,-center.z);r.parts[i].scale(scale.x,scale.y,scale.z);r.parts[i].computeBoundingBox();r.parts[i].computeBoundingSphere();r.pivots[i]=r.pivots[i].map((x,k)=>x*[scale.x,scale.y,scale.z][k]);}
  const envelope=animatedEnvelope(r.parts,r.pivots,r.motion);
  const ex=Math.max(Math.abs(envelope.min.x),Math.abs(envelope.max.x)),ez=Math.max(Math.abs(envelope.min.z),Math.abs(envelope.max.z));
  r.bounds={length:ex*2+.001,width:ez*2+.001,halfHeight:Math.max(Math.abs(envelope.min.y),Math.abs(envelope.max.y))+.001,radius:Math.hypot(ex,ez)+.004};r.triangles=r.parts.reduce((n,g)=>n+(g.index?g.index.count:g.attributes.position.count)/3,0);cache.set(kind,r);return r;
 }
 return {
  kinds:[...AQUATIC_KINDS],setWhaleAsset,setAsset,clearAsset,
  create(kind,{seed=0,variant=0}={}){if(disposed)throw new Error('Aquatic model factory is disposed');if(!AQUATIC_KINDS.includes(kind))throw new Error(`Unknown aquatic kind: ${kind}`);
   if(kind==='whaleShark'&&whaleAsset){try{return whaleAsset.create({seed});}catch{assetError='create-failed';}}
   const registered=marineAssets.get(kind);if(registered&&(registered.variants===null||registered.variants.includes(variant))){try{const model=registered.asset.create({seed,variant,kind});registered.error=null;return model;}catch{registered.error='create-failed';}}
   const r=acquire(kind),root=new T.Group();root.name=`marine-${kind}`;const parts=r.parts.map((geometry,i)=>{const mesh=new T.Mesh(geometry,material);mesh.position.fromArray(r.pivots[i]);mesh.castShadow=false;mesh.receiveShadow=true;root.add(mesh);return mesh;});const phase=Number.isFinite(seed)?seed*2.399963:0;root.userData.marineKind=kind;root.userData.modelTriangles=r.triangles;root.userData.marineSource='procedural';
   return {root,kind,source:'procedural',animationClip:null,bounds:{...r.bounds},animate(time,speed=1){const t=(Number.isFinite(time)?time:0)+phase,s=T.MathUtils.clamp(Number.isFinite(speed)?speed:1,0,3);if(r.motion==='tail'){parts[1].rotation.y=Math.sin(t*(5.4+s*3.2))*(.17+s*.055);}else if(r.motion==='shark'){parts[1].rotation.y=Math.sin(t*(2.4+s*1.6))*(.16+s*.035);}else if(r.motion==='wings'){const a=Math.sin(t*(1.3+s*.7))*.095;parts[1].rotation.x=a;parts[2].rotation.x=-a;}else if(r.motion==='flippers'){const a=Math.sin(t*(2+s*.8))*.30;parts[1].rotation.x=a;parts[2].rotation.x=-a;}}};
  },
  getStats(){return {assetStatus:disposed?'disposed':whaleAsset&&!assetError?'ready':'fallback',assetError,whaleAsset:whaleAsset?.getStats()||null,ownedWhaleAssets:ownedWhaleAssets.size,marineAssets:Object.fromEntries([...marineAssets].map(([kind,r])=>[kind,{...r.asset.getStats(),status:disposed?'disposed':r.error?'fallback':'ready',error:r.error,variants:r.variants?[...r.variants]:null}])),ownedMarineAssets:ownedMarineAssets.size,cachedKinds:cache.size,geometries:[...cache.values()].reduce((n,r)=>n+r.parts.length,0),materials:disposed?0:1,disposed,kinds:[...cache].map(([kind,r])=>({kind,meshes:r.parts.length,triangles:r.triangles,bounds:{...r.bounds}}))};},
  dispose(){if(disposed)return;disposed=true;for(const r of cache.values())r.parts.forEach(g=>g.dispose());cache.clear();material.dispose();for(const asset of ownedWhaleAssets)asset.dispose();ownedWhaleAssets.clear();for(const asset of ownedMarineAssets)asset.dispose();ownedMarineAssets.clear();}
 };
}
