import * as THREE from './vendor/three.module.min.js';
const TAU=Math.PI*2;
// Architectural meshes, furniture, fixtures and a sculpted rear-view character.
// The reference photograph is not loaded or projected anywhere in this scene.
export class CasinoRoom {
 constructor(scene,brass){
  this.scene=scene;this.root=new THREE.Group();this.root.name='casino-architecture';scene.add(this.root);this.geometry=new Map();this.materials={};this.brass=brass;
  const mat=(name,color,roughness,metalness=0,extras={})=>this.materials[name]=new THREE.MeshStandardMaterial({color,roughness,metalness,...extras});
  mat('gold',0xb99450,.26,.92);mat('edge',0x5a3b18,.35,.8);mat('black',0x090c0c,.3,.42);mat('wood',0x29150f,.4,.04);mat('wine',0x300d13,.65);mat('leather',0x3f141b,.4,.04);mat('cream',0xd6c1a0,.67);mat('cloth',0x111217,.91);mat('seam',0x30313b,.93);mat('skin',0xc7957e,.7);mat('hair',0x982b4b,.42);mat('hairLight',0xc1506d,.4);mat('hairDark',0x54172d,.52);mat('warm',0xffdea0,.4,0,{emissive:0xffb955,emissiveIntensity:1.7});mat('red',0x671326,.27,.3,{emissive:0x350511,emissiveIntensity:.22});
  const marble=this.marbleTexture();mat('marble',0xe3ded0,.29,.28,{map:marble});mat('rug',0x2d0912,.92);mat('rugPattern',0x685035,.85);this.addFabric();
  this.buildArchitecture();this.buildOrnament();this.buildMachines();this.buildFurniture();this.buildCharacter();this.buildChandeliers();this.batchOpaque();
 }
 geo(key,make){if(!this.geometry.has(key))this.geometry.set(key,make());return this.geometry.get(key)}
 mesh(geo,material,x=0,y=0,z=0,parent=this.root){const m=new THREE.Mesh(geo,typeof material==='string'?this.materials[material]:material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
 box(w,h,d,x,y,z,mat,parent=this.root){const g=this.geo(`b${w},${h},${d}`,()=>new THREE.BoxGeometry(w,h,d));return this.mesh(g,mat,x,y,z,parent)}
 cyl(rt,rb,h,x,y,z,mat,parent=this.root,segments=32){const g=this.geo(`c${rt},${rb},${h},${segments}`,()=>new THREE.CylinderGeometry(rt,rb,h,segments));return this.mesh(g,mat,x,y,z,parent)}
 sphere(rx,ry,rz,x,y,z,mat,parent=this.root){const m=this.mesh(this.geo(Math.max(rx,ry,rz)<.1?'small-sphere':'sphere',()=>Math.max(rx,ry,rz)<.1?new THREE.SphereGeometry(1,8,6):new THREE.SphereGeometry(1,24,16)),mat,x,y,z,parent);m.scale.set(rx,ry,rz);return m}
 ring(r,t,x,y,z,mat,parent=this.root,vertical=false){const m=this.mesh(this.geo(`t${r},${t}`,()=>new THREE.TorusGeometry(r,t,8,64)),mat,x,y,z,parent);if(!vertical)m.rotation.x=Math.PI/2;return m}
 line(points,r,mat,parent=this.root){const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return this.mesh(new THREE.TubeGeometry(path,Math.max(10,points.length*5),r,6,false),mat,0,0,0,parent)}
 tapered(points,radii,mat,parent=this.root,sides=16){
  const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),steps=32,frames=path.computeFrenetFrames(steps,false),positions=[],normals=[],uv=[],indices=[];
  for(let i=0;i<=steps;i++){const t=i/steps,p=path.getPointAt(t),ri=t*(radii.length-1),k=Math.min(radii.length-2,Math.floor(ri)),f=ri-k,r=THREE.MathUtils.lerp(radii[k],radii[k+1],f);for(let j=0;j<=sides;j++){const a=j/sides*TAU,n=frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i],Math.sin(a));positions.push(p.x+n.x*r,p.y+n.y*r,p.z+n.z*r);normals.push(n.x,n.y,n.z);uv.push(j/sides,t);if(i<steps&&j<sides){const q=i*(sides+1)+j;indices.push(q,q+sides+1,q+1,q+1,q+sides+1,q+sides+2)}}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);return this.mesh(g,mat,0,0,0,parent);
 }
 addFabric(){
  const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),im=x.createImageData(128,128);for(let y=0;y<128;y++)for(let xx=0;xx<128;xx++){const i=(y*128+xx)*4,n=((xx*19+y*73)%37)*2,v=110+n+((xx%3===0||y%3===0)?30:0);im.data.set([v,v,v,255],i)}x.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(6,6);for(const name of ['cloth','cream','leather','wine','rug']){this.materials[name].bumpMap=t;this.materials[name].bumpScale=name==='leather'?.014:.007;}
 }
 buildOrnament(){
  // Repeated geometric inlay is physical brass relief, not a room image.
  for(const x of [-10,-6.5,-3,.5,4,7.5,11]){
   const z=-14.36;this.line([[x-1.35,7.36,z],[x-1.35,1.05,z],[x,2.1,z],[x+1.35,1.05,z],[x+1.35,7.36,z]],.022,'edge');
   this.line([[x-.77,6.65,z],[x,7.36,z],[x+.77,6.65,z],[x,5.94,z],[x-.77,6.65,z]],.028,'gold');
   for(let j=0;j<3;j++){const yy=-2.65+j*.46;this.line([[x-.92,yy,z],[x,yy+.34,z],[x+.92,yy,z]],.018,'edge')}
  }
  for(const side of [-1,1])for(const z of [-10,-5,0,5,10]){
   const x=side*12.63;for(const dz of [-2.15,2.15])this.box(.09,9.8,.055,x,3.0,z+dz,'gold');for(const y of [-1.8,7.8])this.box(.09,.055,4.3,x,y,z,'gold');
   this.line([[x,2.0,z-1.2],[x,3.4,z],[x,2.0,z+1.2],[x,.6,z],[x,2.0,z-1.2]],.032,'gold');
  }
  for(const r of [4.5,4.65,5.7,5.82])this.ring(r,.038,0,11.35,-7,'gold');
  for(let i=0;i<32;i++){const a=i/32*TAU;this.line([[Math.sin(a)*4.65,11.35,-7+Math.cos(a)*4.65],[Math.sin(a)*5.7,11.35,-7+Math.cos(a)*5.7]],.023,'edge')}
  // Bordered wine carpet with small raised diamond motifs in the foreground aisle.
  this.box(17,.015,6.6,0,-3.565,8.6,'rug');for(const z of [5.48,5.7,11.5,11.72])this.box(16.5,.012,.038,0,-3.55,z,'rugPattern');
  for(let x=-7.5;x<8;x+=1.2)for(let z=6.2;z<11.5;z+=1.2){const q=this.box(.37,.01,.37,x,-3.548,z,'rugPattern');q.rotation.y=Math.PI/4;const inner=this.box(.26,.012,.26,x,-3.536,z,'rug');inner.rotation.y=Math.PI/4;}
  // A sculpted potted palm adds overlapping depth around the front left column.
  const palm=new THREE.Group();palm.position.set(-8.2,-3.6,.5);this.root.add(palm);this.cyl(.65,.44,1.0,0,.5,0,'black',palm);for(const y of [.09,.89])this.ring(y===.09?.46:.62,.028,0,y,0,'gold',palm);this.tapered([[0,.9,0],[.05,2.1,.01],[-.08,3.5,0]],[.08,.06,.025],'wood',palm);
  const leaf=new THREE.MeshStandardMaterial({color:0x223c27,roughness:.71,side:THREE.DoubleSide});
  for(let j=0;j<13;j++){const a=j/13*TAU,h=2.6+(j%4)*.34;for(let k=0;k<9;k++){const t=.1+k*.095,r=2.15*t,y=h+Math.sin(t*Math.PI)*.75-t*.38,cx=Math.cos(a)*r,cz=Math.sin(a)*r;for(const side of [-1,1]){const p=new THREE.Vector3(cx,y,cz),tip=new THREE.Vector3(cx+Math.cos(a+side*.8)*(.65*(1-t)+.12),y-.19,cz+Math.sin(a+side*.8)*(.65*(1-t)+.12));const v=tip.clone().sub(p),perp=new THREE.Vector3(-v.z,0,v.x).normalize().multiplyScalar(.085);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([...p.toArray(),...p.clone().addScaledVector(v,.55).add(perp).toArray(),...tip.toArray(),...p.clone().addScaledVector(v,.55).sub(perp).toArray()],3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();this.mesh(g,leaf,0,0,0,palm)}}this.line([[0,h,0],[Math.cos(a)*1.1,h+.6,Math.sin(a)*1.1],[Math.cos(a)*2.2,h-.4,Math.sin(a)*2.2]],.014,'wood',palm)}
 }
 marbleTexture(){const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d'),im=ctx.createImageData(512,512);for(let y=0;y<512;y++)for(let x=0;x<512;x++){const f=Math.sin(x*.036+y*.018+2.8*Math.sin(y*.023)+1.9*Math.sin(x*.015+y*.011)),v=Math.pow(1-Math.abs(f),15)*56+Math.sin(x*.49+y*.65)*2,i=(y*512+x)*4;im.data[i]=22+v*.8;im.data[i+1]=26+v*.8;im.data[i+2]=26+v*.7;im.data[i+3]=255}ctx.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t}
 plaque(text,w,h,mat='gold',font='Georgia'){const c=document.createElement('canvas');c.width=512;c.height=Math.round(512*h/w);const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);x.fillStyle=mat==='cream'?'#ffe8bc':'#bfa16a';x.textAlign='center';x.textBaseline='middle';x.font=`${Math.floor(c.height*.27)}px ${font}`;const lines=text.split('\n');lines.forEach((l,i)=>x.fillText(l,c.width/2,c.height*(.5+(i-(lines.length-1)/2)*.32),c.width*.9));const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,toneMapped:false})}
 buildArchitecture(){
  // Continuous room shell prevents revealing missing backs while inspecting the table.
  this.box(38,.22,42,0,-3.72,-3,'black');
  for(let x=-18;x<18;x+=2.6)for(let z=-22;z<18;z+=2.6){const m=this.box(2.57,.025,2.57,x+1.3,-3.594,z+1.3,(Math.round(x/2.6+z/2.6)%2)?'marble':'black');m.rotation.y=(Math.round(x+z)%2)*Math.PI/2;}
  this.box(38,16,.25,0,4.2,-15,'wine');this.box(.25,16,36,-13,4.2,0,'wine');this.box(.25,16,36,13,4.2,0,'wine');this.box(26,.2,34,0,12.15,-1,'black');
  for(const x of [-10,-6.5,-3, .5,4,7.5,11]){
   this.box(3.08,7.8,.17,x,3.4,-14.7,'black');
   for(const dx of [-1.6,1.6])this.box(.045,8.35,.14,x+dx,3.45,-14.53,'gold');for(const y of [-.7,7.62])this.box(3.25,.055,.14,x,y,-14.53,'gold');
   this.box(2.85,2.25,.2,x,-2.1,-14.65,'wood');
  }
  for(const y of [-3.35,-.88,8.1,8.4,11.65]){this.box(26,.09,.2,0,y,-14.48,'gold');this.box(.2,.09,29,-12.8,y,-.5,'gold');this.box(.2,.09,29,12.8,y,-.5,'gold')}
  // Black marble columns with brass collars, fine fluting, and lit Art Deco sconces.
  for(const [x,z,r] of [[-7.4,-6.8,1.05],[-10.4,-10,.78],[9,-9,.72],[11.8,3,.78]]){
   this.cyl(r,r,14,x,3.45,z,'marble');for(const [y,rr,h] of [[-3.3,r+.23,.24],[-2.95,r+.12,.15],[-.85,r+.08,.12],[8.7,r+.22,.18],[9.0,r+.32,.25],[10.1,r+.12,.10]])this.cyl(rr,rr,h,x,y,z,'gold');
   for(let i=0;i<12;i++){const a=i/12*TAU;this.cyl(.012,.012,10.6,x+Math.sin(a)*(r+.013),3.1,z+Math.cos(a)*(r+.013),'edge',this.root,6)}
   this.sconce(x+r*.95,3.3,z+.35);
  }
  // Wine velvet banners are thin front surfaces with actual folded geometry and gold piping.
  for(const [x,z] of [[-4.0,-13.9],[6.7,-13.9],[10.5,-13.9]]){
   const shape=new THREE.Shape();shape.moveTo(-.85,3.4);shape.lineTo(.85,3.4);shape.lineTo(.85,-2.5);shape.lineTo(0,-3.2);shape.lineTo(-.85,-2.5);shape.closePath();this.mesh(new THREE.ExtrudeGeometry(shape,{depth:.05,bevelEnabled:false}),'wine',x,5.8,z);
   this.line([[x-.82,9.15,z+.07],[x-.82,3.34,z+.07],[x,2.63,z+.07],[x+.82,3.34,z+.07],[x+.82,9.15,z+.07]],.025,'gold');
   this.mesh(new THREE.PlaneGeometry(1.55,3.2),this.plaque('ALL IN\n♠\nLW & 5',1.55,3.2),x,6.1,z+.10);
  }
  // Recessed ceiling coffers have visible thickness and nested brass frames.
  for(const z of [-11,-4,3,10]){this.box(26,.32,.35,0,11.85,z,'wood');this.box(26,.055,.075,0,11.64,z+.2,'gold')}
  for(const x of [-10,-5,0,5,10]){this.box(.26,.32,29,x,11.85,-1,'wood');this.box(.06,.08,29,x+.17,11.65,-1,'gold')}
  // A dark woven carpet anchors the quieter lounge at the rear left.
  this.box(8.2,.022,7,-4.8,-3.56,-8,'wine');for(const x of [-8.72,-.88])this.box(.05,.025,6.75,x,-3.54,-8,'edge');for(const z of [-11.27,-4.73])this.box(7.8,.025,.05,-4.8,-3.54,z,'edge');
 }
 sconce(x,y,z){const g=new THREE.Group();g.position.set(x,y,z);this.root.add(g);this.box(.32,1.75,.28,0,0,0,'black',g);this.cyl(.14,.14,1.4,0,0,.23,'warm',g,12);for(const yy of [-.76,.76])this.box(.53,.12,.55,0,yy,.12,'gold',g);for(const xx of [-.23,.23])this.box(.025,1.5,.025,xx,0,.4,'gold',g);const l=new THREE.PointLight(0xffc177,12,5,2);l.position.set(x,y,z+.6);this.scene.add(l)}
 buildMachines(){
  const reels=this.plaque('7',.42,.65,'cream','Georgia');
  for(let i=0;i<4;i++){
   const g=new THREE.Group();g.position.set(3.0+i*2.55,-3.6,-10.0-i*.35);g.rotation.y=-.10;this.root.add(g);
   this.box(2.18,2.1,1.5,0,1.05,0,'black',g);this.box(2.04,2.04,.10,0,1.1,.8,'wood',g);
   this.box(2.2,4.1,1.42,0,4.03,-.10,'black',g);for(const x of [-1.12,1.12])this.box(.10,4.2,1.48,x,4.05,-.1,'gold',g);
   this.cyl(1.16,1.16,.22,0,6.04,-.1,'gold',g,48).rotation.x=Math.PI/2;
   const arch=this.mesh(new THREE.TorusGeometry(1.03,.09,8,48,Math.PI),'gold',0,6.05,.76,g);arch.rotation.z=0;
   this.box(1.98,1.5,.09,0,5.72,.72,'red',g);this.mesh(new THREE.PlaneGeometry(1.8,1.38),this.plaque(i%2?'♠\nROYAL':'♦\nFORTUNE',1.8,1.38,'cream'),0,5.75,.78,g);
   this.box(1.98,1.84,.1,0,3.91,.65,'gold',g);this.box(1.80,1.64,.14,0,3.94,.73,'black',g);
   for(let k=0;k<3;k++){const x=(k-1)*.55;this.cyl(.37,.37,.44,x,4.0,.80,'cream',g,32).rotation.z=Math.PI/2;this.mesh(new THREE.PlaneGeometry(.40,.57),reels,x,4.0,1.16,g);for(const yy of [3.47,4.49])this.box(.47,.024,.05,x,yy,1.14,'gold',g)}
   this.box(2.16,.16,1.08,0,2.88,.60,'gold',g).rotation.x=.15;this.box(2.0,.12,.96,0,2.98,.61,'black',g).rotation.x=.15;
   for(let k=0;k<4;k++)this.cyl(.11,.12,.05,-.65+k*.42,3.10,.83,k===3?'red':'cream',g,16);
   this.box(1.52,.27,.18,0,2.26,.83,'gold',g);this.box(1.31,.08,.22,0,2.31,.94,'black',g);
   for(const x of [-.94,.94])for(let j=0;j<18;j++)this.sphere(.025,.025,.025,x,3.2+j*.17,.85,'warm',g);
   for(const y of [.18,2.08])this.box(2.13,.055,.12,0,y,.88,'gold',g);for(const x of [-.99,.99])this.box(.03,1.86,.08,x,1.12,.87,'gold',g);
   this.line([[1.16,3.7,0],[1.42,3.7,0],[1.45,4.5,.13]],.045,'gold',g);this.sphere(.12,.12,.12,1.45,4.55,.13,'red',g);
   if(i%2===0){const l=new THREE.PointLight(0xffb47b,8,6,2);l.position.set(g.position.x,1.2,-8.2);this.scene.add(l);}
  }
 }
 chair(x,z,rotation=0,scale=1){const g=new THREE.Group();g.position.set(x,-3.6,z);g.rotation.y=rotation;g.scale.setScalar(scale);this.root.add(g);
  for(const xx of [-.57,.57])for(const zz of [-.5,.5]){const leg=this.cyl(.046,.08,1.48,xx,.74,zz,'wood',g,12);leg.rotation.z=xx*.06;this.cyl(.052,.057,.14,xx,.12,zz,'gold',g,12)}
  this.box(1.5,.22,1.45,0,1.48,0,'wood',g);this.sphere(.75,.21,.72,0,1.67,0,'leather',g);
  const back=this.sphere(.78,1.03,.16,0,2.55,-.62,'leather',g);back.rotation.x=-.10;
  this.line([[-.75,1.62,-.62],[-.83,2.62,-.69],[-.65,3.33,-.74],[0,3.56,-.75],[.65,3.33,-.74],[.83,2.62,-.69],[.75,1.62,-.62]],.06,'wood',g);
  for(let i=0;i<25;i++){const a=i/24*Math.PI;this.sphere(.022,.022,.022,Math.cos(a)*.70,2.49+Math.sin(a)*.84,-.465,'gold',g)}
  for(const xx of [-.77,.77]){this.line([[xx,1.6,.45],[xx,2.05,.32],[xx,2.17,-.58]],.085,'leather',g);this.line([[xx,1.55,.39],[xx,2.02,.35]],.025,'gold',g)}
  for(const xx of [-.32,0,.32])for(const yy of [2.4,2.8])this.sphere(.032,.032,.018,xx,yy,-.44,'edge',g);
  return g;
 }
 table(x,z,r=1.5){const g=new THREE.Group();g.position.set(x,-3.6,z);this.root.add(g);this.cyl(.7,.85,.14,0,.09,0,'gold',g);this.cyl(.14,.32,2.15,0,1.15,0,'black',g);this.cyl(r,r,.15,0,2.26,0,'gold',g,64);this.cyl(r-.035,r-.035,.09,0,2.37,0,'marble',g,64);return g}
 tableLamp(parent,x=0,z=0){this.cyl(.24,.32,.08,x,2.48,z,'gold',parent);this.cyl(.033,.053,.92,x,2.96,z,'gold',parent,16);this.sphere(.11,.14,.11,x,3.36,z,'gold',parent);this.cyl(.31,.53,.70,x,3.78,z,'cream',parent,32);this.ring(.52,.02,x,3.43,z,'gold',parent);this.ring(.31,.018,x,4.13,z,'gold',parent);for(let i=0;i<20;i++){const a=i/20*TAU;this.line([[x+Math.cos(a)*.31,4.12,z+Math.sin(a)*.31],[x+Math.cos(a)*.52,3.44,z+Math.sin(a)*.52]],.007,'edge',parent)}const l=new THREE.PointLight(0xffb66d,16,7,2);l.position.set(parent.position.x+x,.0,parent.position.z+z);this.scene.add(l)}
 buildFurniture(){
  for(const [x,z] of [[-4.8,-8.1],[-8.5,-5.8]]){const t=this.table(x,z,1.12);this.tableLamp(t);this.chair(x-1.7,z+.2,-Math.PI/2);this.chair(x+.9,z-1.6,.45)}
  const front=this.table(-5.6,6.2,2.25);this.tableLamp(front,-1.18,-.42);this.chair(6.5,6.2,2.4,1.65);
  // Individual chip stacks, contrasting inlays, and beveled table accessories.
  for(let stack=0;stack<9;stack++){const x=-.85+(stack%3)*.42,z=.1+Math.floor(stack/3)*.42;for(let i=0;i<5+stack%4;i++){const y=2.47+i*.055;this.cyl(.18,.18,.05,x,y,z,stack%3===0?'red':stack%3===1?'black':'cream',front,24);for(let k=0;k<6;k++){const a=k/6*TAU;const q=this.box(.035,.035,.064,x+Math.sin(a)*.17,y,z+Math.cos(a)*.17,'cream',front);q.rotation.y=a}}}
  this.box(.9,.12,1.2,.79,2.51,.70,'black',front).rotation.y=-.24;const book=this.mesh(new THREE.PlaneGeometry(.82,1.1),this.plaque('LW & 5\n♠\nFORTUNE',.82,1.1),.79,2.578,.70,front);book.rotation.set(-Math.PI/2,0,-.24);
  const glass=new THREE.MeshPhysicalMaterial({color:0xf5dfb3,roughness:.1,metalness:.08,transparent:true,opacity:.27,side:THREE.DoubleSide,depthWrite:false});const points=[[.22,0],[.25,.06],[.28,.63],[.255,.65],[.235,.08],[.22,.065]].map(p=>new THREE.Vector2(...p));this.mesh(new THREE.LatheGeometry(points,32),glass,.70,2.44,-.55,front);this.cyl(.235,.22,.22,.70,2.58,-.55,new THREE.MeshStandardMaterial({color:0x955017,roughness:.2,metalness:.25,transparent:true,opacity:.85}),front);this.ring(.28,.012,.70,3.09,-.55,'cream',front);
  this.cyl(.37,.4,.05,1.36,2.46,-.12,'gold',front);this.ring(.37,.05,1.36,2.52,-.12,glass,front);
 }
 buildCharacter(){
  const g=new THREE.Group();g.name='red-haired-guest';g.position.set(4.0,-3.6,-6.4);g.rotation.y=-.16;g.scale.setScalar(1.06);this.root.add(g);const hairLight=new THREE.PointLight(0xffc3a0,9,5,2);hairLight.position.set(4.0,4.2,-3.7);this.scene.add(hairLight);
  // Tailored trousers: bent knees, subtle creases, and separately modeled shoes.
  for(const sign of [-1,1]){
   this.tapered([[sign*.31,3.55,0],[sign*.35,2.65,.015],[sign*.38,1.6,sign*.06],[sign*.39,.38,sign*.05]],[.29,.28,.22,.16],'cloth',g);
   this.line([[sign*.36,3.15,.23],[sign*.38,2.1,.235],[sign*.39,.55,.19]],.009,'seam',g);
   this.sphere(.22,.17,.43,sign*.39,.18,-.15+sign*.05,'black',g);this.box(.42,.085,.70,sign*.39,.085,-.11+sign*.05,'black',g);
  }
  // Vest body follows a waist-to-shoulder silhouette rather than stacked primitives.
  const profile=[[.45,3.15],[.51,3.43],[.47,3.72],[.55,4.12],[.69,4.62],[.65,4.93],[.37,5.14]].map(p=>new THREE.Vector2(...p));const vest=this.mesh(new THREE.LatheGeometry(profile,32),'cloth',0,0,0,g);vest.scale.z=.58;
  this.line([[0,3.19,.267],[0,3.75,.276],[0,4.38,.365],[0,4.89,.36]],.01,'seam',g);
  for(const s of [-1,1])this.line([[s*.16,3.18,.25],[s*.34,3.7,.24],[s*.42,4.32,.29],[s*.56,4.76,.22]],.008,'seam',g);
  this.box(.64,.09,.035,0,3.85,.31,'black',g);this.box(.12,.11,.04,.08,3.85,.335,'gold',g);
  this.cyl(.16,.21,.40,0,5.20,-.035,'skin',g);this.cyl(.26,.34,.20,0,5.10,-.02,'cream',g);this.box(.14,.18,.10,0,5.04,.24,'cream',g);
  // White sleeves bend toward the machine; cuffs, hands and fingers are separate surfaces.
  const sleeves=[[[.58,4.81,0],[.91,4.39,-.10],[.97,3.95,-.17],[.89,3.69,-.45]],[[-.59,4.79,0],[-.93,4.25,-.08],[-1.04,4.03,-.42],[-.91,4.17,-.82]]];
  sleeves.forEach((p,i)=>{this.tapered(p,[.26,.23,.20,.135],'cream',g);const end=p[3];this.sphere(.14,.15,.15,...end,'cream',g);this.sphere(.125,.20,.105,end[0],end[1]-.08,end[2]-.19,'skin',g);for(let k=0;k<4;k++)this.tapered([[end[0]-.07+k*.047,end[1]-.14,end[2]-.19],[end[0]-.065+k*.043,end[1]-.25,end[2]-.24],[end[0]-.06+k*.039,end[1]-.23,end[2]-.30]],[.027,.023,.012],'skin',g,6);this.sphere(.035,.035,.023,end[0],end[1],end[2]+.12,'gold',g);
   const elbow=p[2];for(let j=0;j<3;j++)this.line([[elbow[0]-.15,elbow[1]+j*.065,elbow[2]+.06],[elbow[0],elbow[1]-.035+j*.065,elbow[2]+.15],[elbow[0]+.12,elbow[1]+j*.065,elbow[2]+.05]],.008,'cream',g);
  });
  // Head, ears and burgundy swept-back locks; only the rear silhouette is emphasized.
  this.sphere(.34,.46,.33,0,5.72,-.055,'skin',g);for(const s of [-1,1])this.sphere(.075,.135,.065,s*.335,5.64,-.01,'skin',g);
  this.sphere(.355,.385,.335,0,5.86,.008,'hairDark',g);
  for(let i=0;i<34;i++){const a=i/34*TAU,r=.26+Math.sin(i*3)*.035,x=Math.sin(a)*r,z=Math.cos(a)*r,y=5.84+Math.sin(i*1.7)*.08;this.tapered([[x*.9,y,z-.045],[x*1.03,6.10,z+.07],[x*.64+.05,6.27+Math.sin(a)*.10,z+.27],[x*.3+.07,6.15,z+.42]],[.083,.079,.045,.003],i%4===0?'hairLight':i%3===0?'hairDark':'hair',g,7)}
  for(let i=0;i<9;i++){const a=-1.0+i*.25;this.tapered([[Math.sin(a)*.28,5.75,.24],[Math.sin(a)*.28,5.55,.26],[Math.sin(a)*.22,5.43,.18]],[.066,.042,.003],'hair',g,7)}
 }
 buildChandeliers(){
  for(const [x,z,size] of [[-.8,1.8,1.28],[-3.5,-8,1.18],[5.5,-12,1.0]]){
   const g=new THREE.Group();g.position.set(x,0,z);this.root.add(g);this.cyl(.06,.06,2.1,0,10.65,0,'gold',g,12);this.cyl(size,size,.48,0,9.35,0,'black',g,64);for(const y of [9.12,9.59])this.ring(size,.055,0,y,0,'gold',g);this.cyl(size*.92,size*.92,.045,0,9.1,0,'warm',g,64);
   for(let i=0;i<24;i++){const a=i/24*TAU;this.box(.035,.37,.035,Math.sin(a)*size,9.35,Math.cos(a)*size,'gold',g)}
   if(z<0){for(let tier=0;tier<3;tier++){const r=size*(1-tier*.27),y=8.9-tier*.52;this.ring(r,.038,0,y,0,'gold',g);for(let i=0;i<16;i++){const a=i/16*TAU;this.tapered([[Math.sin(a)*r,y,Math.cos(a)*r],[Math.sin(a)*r,y-.30,Math.cos(a)*r],[Math.sin(a)*r,y-.43,Math.cos(a)*r]],[.055,.073,.005],'cream',g,6)}}const l=new THREE.PointLight(0xffbc7b,35,15,2);l.position.set(x,7.3,z);this.scene.add(l)}
  }
 }
 batchOpaque(){
  // Static opaque meshes are merged by material to keep mobile draw calls bounded.
  this.root.updateMatrixWorld(true);const buckets=new Map(),remove=[];this.root.traverse(o=>{if(!o.isMesh||o.material.transparent)return;const key=o.material.uuid;if(!buckets.has(key))buckets.set(key,{material:o.material,parts:[]});buckets.get(key).parts.push({geometry:o.geometry,matrix:o.matrixWorld.clone()});remove.push(o)});
  for(const {material,parts} of buckets.values()){
   const positions=[],normals=[],uv=[],indices=[];let base=0;
   for(const {geometry,matrix} of parts){const g=geometry.clone().applyMatrix4(matrix),p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv;positions.push(...p.array);normals.push(...n.array);if(u)uv.push(...u.array);else for(let i=0;i<p.count;i++)uv.push(0,0);if(g.index)for(const i of g.index.array)indices.push(base+i);else for(let i=0;i<p.count;i++)indices.push(base+i);base+=p.count;g.dispose()}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeBoundingSphere();this.mesh(g,material);
  }for(const m of remove)m.removeFromParent();
 }
}
