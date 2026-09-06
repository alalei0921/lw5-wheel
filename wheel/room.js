import * as THREE from './vendor/three.module.min.js';
const TAU=Math.PI*2;
// Architectural meshes, furniture, fixtures and a sculpted rear-view character.
// The reference photograph is not loaded or projected anywhere in this scene.
export class CasinoRoom {
 constructor(scene,brass){
  this.scene=scene;this.root=new THREE.Group();this.root.name='casino-architecture';scene.add(this.root);this.geometry=new Map();this.materials={};this.brass=brass;
  const mat=(name,color,roughness,metalness=0,extras={})=>this.materials[name]=new THREE.MeshStandardMaterial({color,roughness,metalness,...extras});
  mat('gold',0xb99450,.26,.92);mat('edge',0x5a3b18,.35,.8);mat('black',0x090c0c,.3,.42);mat('wood',0x29150f,.4,.04);mat('wine',0x300d13,.65);mat('leather',0x3f141b,.4,.04);mat('cream',0xd6c1a0,.67);mat('cloth',0x111217,.91);mat('seam',0x30313b,.93);mat('skin',0xc7957e,.7);mat('hair',0x491526,.49);mat('hairLight',0x682536,.46);mat('hairDark',0x280e18,.58);mat('warm',0xffdea0,.4,0,{emissive:0xffb955,emissiveIntensity:1.7});mat('red',0x671326,.27,.3,{emissive:0x350511,emissiveIntensity:.22});
  const marble=this.marbleTexture();mat('marble',0xe3ded0,.29,.28,{map:marble});mat('rug',0x2d0912,.92);mat('rugPattern',0x685035,.85);this.addFabric();
  // Expand the architecture independently of the roulette and human scale.
  const world=this.root,architecture=new THREE.Group();architecture.name='grand-salon';world.add(architecture);this.root=architecture;
  const lightStart=scene.children.length;this.buildArchitecture();this.buildOrnament();architecture.scale.set(1.22,1,1.3);
  for(const light of scene.children.slice(lightStart))if(light.isLight){light.position.x*=1.22;light.position.z*=1.3;}
  this.root=world;mat('shirt',0xa49d90,.86);mat('steel',0xb9c3cb,.19,.98);mat('ivory',0x958369,.55,.15);mat('field',0x36161a,.38,.18);mat('hem',0x242329,.92);
  this.materials.shirt.bumpMap=this.materials.cream.bumpMap;this.materials.shirt.bumpScale=.008;
  this.buildMachines();this.buildFurniture();this.buildCharacter();this.buildChandeliers();this.batchOpaque();
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
  // Mechanical pachinko: a vertical pin field, steel guide rails, catchers and a launch dial.
  // Every visible pin and ball is geometry; there are no slot reels or photo billboards.
  for(let i=0;i<5;i++){
   const g=new THREE.Group();g.name=`pachinko-${i}`;g.position.set(3.1+i*2.58,-3.6,-12.2-i*.48);g.rotation.y=-.06;this.root.add(g);
   this.box(2.26,2.45,1.40,0,1.23,-.1,'wood',g);this.box(2.10,2.19,.09,0,1.25,.65,'black',g);
   for(const x of [-1.04,1.04])this.box(.035,2.15,.06,x,1.25,.72,'gold',g);
   for(const y of [.18,2.3])this.box(2.13,.045,.06,0,y,.72,'gold',g);
   this.box(2.28,4.50,1.13,0,4.52,-.11,'black',g);
   this.box(2.13,4.24,.09,0,4.52,.50,'gold',g);this.box(1.98,4.08,.07,0,4.52,.56,'red',g);
   for(const x of [-1.08,1.08]){this.box(.075,4.40,.17,x,4.52,.58,'gold',g);this.box(.026,4.26,.04,x*.90,4.52,.68,'edge',g);}
   this.box(2.30,.18,1.21,0,6.84,-.08,'gold',g);this.box(1.85,.38,.09,0,6.42,.63,'black',g);
   this.mesh(new THREE.PlaneGeometry(1.63,.33),this.plaque(i===0?'沼 沢  •  NUMA':'P A C H I N K O',1.63,.33,'cream'),0,6.42,.69,g);
   // Inset circular board framed by two polished steel rails.
   this.cyl(.96,.96,.09,0,4.93,.66,'field',g,64).rotation.x=Math.PI/2;
   const field=this.cyl(.90,.90,.02,0,4.93,.72,'black',g,64);field.rotation.x=Math.PI/2;field.scale.y=1;
   for(const r of [.96,.90])this.ring(r,.023,0,4.93,.76,'steel',g,true);
   // Staggered rows of headed nails leave space for the center ornament.
   for(let row=0;row<12;row++)for(let col=0;col<13;col++){
    const x=(col-6)*.132+(row%2)*.066,y=(row-5.5)*.132;
    if(x*x+y*y>.74||Math.abs(x)<.23&&Math.abs(y)<.30)continue;
    const pin=this.cyl(.008,.010,.054,x,4.93+y,.78,'steel',g,6);pin.rotation.x=Math.PI/2;this.sphere(.018,.018,.012,x,4.93+y,.812,'gold',g);
   }
   this.ring(.26,.026,0,4.99,.79,'gold',g,true);this.ring(.21,.012,0,4.99,.80,'edge',g,true);
   const star=new THREE.Shape();for(let k=0;k<16;k++){const a=k/16*TAU,r=k%2?.12:.20,x=Math.sin(a)*r,y=Math.cos(a)*r;k?star.lineTo(x,y):star.moveTo(x,y);}star.closePath();this.mesh(new THREE.ExtrudeGeometry(star,{depth:.035,bevelEnabled:true,bevelSize:.009,bevelThickness:.009,bevelSegments:1,steps:1}),'red',0,4.99,.81,g);
   for(const [x,y] of [[-.48,4.65],[.48,4.65],[0,4.22]]){
    this.box(.22,.15,.065,x,y,.79,'gold',g);this.box(.155,.073,.032,x,y+.02,.835,'black',g);
    this.line([[x-.16,y+.09,.84],[x-.10,y+.16,.84],[x+.10,y+.16,.84],[x+.16,y+.09,.84]],.017,'steel',g);
   }
   this.line([[.83,3.38,.80],[1.00,4.29,.80],[.93,5.40,.80],[.52,5.78,.80]],.017,'steel',g);
   this.line([[-.83,4.27,.80],[-.68,3.99,.80],[0,3.89,.80],[.73,4.10,.80]],.022,'gold',g);
   // Two shallow metal-lined ball trays with a visible stock of steel balls.
   for(const y of [3.45,2.80]){
    this.box(1.89,.09,.57,0,y,.78,'black',g);this.box(1.90,.13,.045,0,y+.04,1.05,'gold',g);
    for(const x of [-.94,.94])this.box(.045,.15,.56,x,y+.04,.80,'gold',g);
    for(let j=0;j<(y>3?36:18);j++)this.sphere(.034,.034,.034,-.76+(j%12)*.125,y+.075,.64+Math.floor(j/12)*.125,'steel',g);
   }
   this.box(1.83,.38,.06,0,3.98,.69,'red',g);this.mesh(new THREE.PlaneGeometry(1.30,.26),this.plaque('STEEL BALL • SALON',1.3,.26),0,3.98,.73,g);
   const dial=this.cyl(.20,.20,.13,.78,3.08,.89,'gold',g,32);dial.rotation.x=Math.PI/2;
   const knob=this.cyl(.145,.17,.13,.78,3.08,.99,'black',g,32);knob.rotation.x=Math.PI/2;
   for(let j=0;j<12;j++){const a=j/12*TAU;this.sphere(.019,.019,.014,.78+Math.cos(a)*.147,3.08+Math.sin(a)*.147,1.06,'steel',g);}
   this.box(.045,.14,.06,.78,3.14,1.08,'gold',g);
   for(const x of [-1.035,1.035])for(let j=0;j<17;j++)this.sphere(.019,.025,.015,x,3.77+j*.142,.70,'warm',g);
   for(let j=0;j<6;j++)this.box(.22,.015,.035,-.58+j*.23,2.05,.74,'edge',g);
   // Restrained cabinet glow lights the hands/front; the viewer sees a dark back silhouette.
   if(i<3){const l=new THREE.PointLight(0xffbd83,i===0?3.4:2.2,4.5,2);l.position.set(g.position.x,1.5,g.position.z+1.45);this.scene.add(l);}
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
 // Closed elliptical lofts give clothing a continuous tailored silhouette.
 loft(profile,mat,parent){
  const p=[],uv=[],idx=[],segments=40;
  for(let i=0;i<profile.length;i++){const [y,rx,rz,cx=0,cz=0]=profile[i];for(let j=0;j<=segments;j++){const a=j/segments*TAU;p.push(cx+Math.sin(a)*rx,y,cz+Math.cos(a)*rz);uv.push(j/segments,i/(profile.length-1));if(i<profile.length-1&&j<segments){const k=i*(segments+1)+j;idx.push(k,k+1,k+segments+1,k+1,k+segments+2,k+segments+1);}}}
  const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geom.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geom.setIndex(idx);geom.computeVertexNormals();return this.mesh(geom,mat,0,0,0,parent);
 }
 buildCharacter(){
  const g=new THREE.Group();g.name='red-haired-guest';g.position.set(3.26,-3.6,-9.9);g.rotation.y=-.06;this.root.add(g);
  // Long-legged, relaxed contrapposto, about eight heads tall; face points toward the cabinet.
  for(const sign of [-1,1]){
   const cx=sign*.28,shift=sign===1?.11:-.04;
   this.loft([[.26,.14,.14,cx+.06,shift],[.44,.16,.17,cx+.06,shift],[1.2,.18,.19,cx+.03,shift],[2.12,.205,.21,cx,-.03],[2.55,.225,.235,cx,-.025],[3.48,.25,.265,cx,0],[4.02,.27,.28,cx,0],[4.18,.18,.20,cx,0]],'cloth',g);
   this.line([[cx+.06,.50,.17+shift],[cx,2.10,.185],[cx,3.7,.255]],.005,'hem',g);
   this.sphere(.177,.13,.38,cx+.06,.145,-.18+shift,'black',g);this.box(.32,.068,.62,cx+.06,.066,-.12+shift,'black',g);this.box(.29,.12,.22,cx+.06,.09,.12+shift,'black',g);
  }
  this.loft([[3.88,.50,.27],[4.14,.48,.28],[4.47,.43,.255],[4.78,.445,.265],[5.17,.51,.285],[5.53,.59,.29],[5.74,.65,.27],[5.9,.49,.23],[6.02,.27,.18],[6.05,.18,.14]],'cloth',g);
  // Waistcoat's center seam, side darts, rear adjuster and rolled armhole piping.
  this.line([[0,3.91,.275],[0,4.48,.262],[0,5.17,.29],[0,5.83,.252]],.006,'hem',g);
  for(const side of [-1,1]){
   this.line([[side*.30,3.92,.219],[side*.26,4.49,.209],[side*.38,5.21,.209],[side*.48,5.62,.176]],.005,'hem',g);
   this.line([[side*.50,5.18,.11],[side*.62,5.61,.14],[side*.49,5.87,.16]],.015,'hem',g);
  }
  this.box(.57,.065,.025,0,4.47,.272,'black',g);this.box(.074,.080,.020,.08,4.47,.291,'edge',g);
  this.cyl(.137,.17,.40,0,6.16,-.055,'skin',g);this.loft([[5.93,.23,.175,0,-.03],[6.10,.205,.17,0,-.03],[6.19,.175,.15,0,-.03]],'shirt',g);
  // Right wrist reaches the launch dial, left hand rests naturally at the upper ball tray.
  const sleeves=[[[.59,5.74,-.025],[.79,5.20,-.10],[.90,4.52,-.29],[.89,3.48,-.97]],[[-.59,5.73,-.025],[-.83,5.16,-.08],[-.95,4.58,-.23],[-.69,3.87,-1.02]]];
  sleeves.forEach((points,i)=>{
   this.tapered(points,[.205,.19,.153,.105],'shirt',g,24);
   const end=points[3],direction=new THREE.Vector3(...end).sub(new THREE.Vector3(...points[2])).normalize(),cuff=this.cyl(.112,.12,.19,...end,'shirt',g,24);cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
   const hand=new THREE.Vector3(...end).addScaledVector(direction,.19);this.sphere(.093,.15,.075,hand.x,hand.y,hand.z,'skin',g);
   for(let k=0;k<4;k++)this.tapered([[hand.x-.067+k*.040,hand.y-.06,hand.z],[hand.x-.058+k*.037,hand.y-.19,hand.z-.05],[hand.x-.05+k*.032,hand.y-.17,hand.z-.12]],[.018,.017,.011],'skin',g,8);
   this.tapered([[hand.x+(i===0?-.09:.09),hand.y+.025,hand.z],[hand.x+(i===0?-.12:.12),hand.y-.08,hand.z-.08]],[.03,.019],'skin',g,8);
   this.sphere(.020,.025,.013,end[0],end[1]+.025,end[2]+.106,'edge',g);
   const e=points[2];for(let j=0;j<3;j++)this.line([[e[0]-.10,e[1]+j*.046,e[2]+.095],[e[0],e[1]-.018+j*.046,e[2]+.151],[e[0]+.10,e[1]+j*.046,e[2]+.085]],.004,'shirt',g);
  });
  // Small head and ears, a fitted nape and combed-back burgundy hair, not bulbous spikes.
  this.sphere(.282,.415,.289,0,6.61,-.065,'skin',g);
  for(const side of [-1,1]){this.sphere(.046,.096,.060,side*.279,6.52,-.028,'skin',g);this.sphere(.020,.057,.027,side*.308,6.52,-.006,'hairDark',g);}
  this.sphere(.293,.360,.294,0,6.74,-.028,'hairDark',g);
  this.loft([[6.25,.12,.14,0,.02],[6.36,.21,.22,0,.005],[6.59,.283,.284,0,-.025],[6.80,.29,.286,0,-.024],[6.99,.215,.195,0,.015],[7.07,.03,.025,0,.06]],'hair',g);
  // Fine swept ribbons ride directly on the scalp and converge toward the nape.
  for(let i=0;i<25;i++){
   const u=(i-12)/12,x=u*.264,side=Math.sqrt(Math.max(0,1-u*u));
   this.tapered([[x,6.77+side*.13,-.025-side*.24],[x*.98+.022,6.90+side*.18,-.04],[x*.86+.022,6.82+side*.14,.08+side*.19],[x*.68,6.44+Math.abs(u)*.03,.14+side*.10],[x*.38,6.28,.15]],[.019,.025,.023,.014,.002],i%5===0?'hairLight':i%3===0?'hairDark':'hair',g,8);
  }
  // A dim grazing light distinguishes the silhouette without exposing a brightly lit mannequin.
  const rim=new THREE.PointLight(0xb59ec7,1.1,4.2,2);rim.position.set(5.1,4.0,-10.8);this.scene.add(rim);
 }
 buildChandeliers(){
  for(const [x,z,size] of [[-.8,1.8,1.28],[-3.5,-8,1.18],[7.5,-17,1.0]]){
   const g=new THREE.Group();g.position.set(x,0,z);this.root.add(g);this.cyl(.06,.06,2.1,0,10.65,0,'gold',g,12);this.cyl(size,size,.48,0,9.35,0,'black',g,64);for(const y of [9.12,9.59])this.ring(size,.055,0,y,0,'gold',g);this.cyl(size*.92,size*.92,.045,0,9.1,0,'warm',g,64);
   for(let i=0;i<24;i++){const a=i/24*TAU;this.box(.035,.37,.035,Math.sin(a)*size,9.35,Math.cos(a)*size,'gold',g)}
   if(z<0){for(let tier=0;tier<3;tier++){const r=size*(1-tier*.27),y=8.9-tier*.52;this.ring(r,.038,0,y,0,'gold',g);for(let i=0;i<16;i++){const a=i/16*TAU;this.tapered([[Math.sin(a)*r,y,Math.cos(a)*r],[Math.sin(a)*r,y-.30,Math.cos(a)*r],[Math.sin(a)*r,y-.43,Math.cos(a)*r]],[.055,.073,.005],'cream',g,6)}}const l=new THREE.PointLight(0xffbc7b,z<-15?12:25,13,2);l.position.set(x,7.3,z);this.scene.add(l)}
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
