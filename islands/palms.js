import * as T from './vendor/three.module.min.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {bedHeight} from './terrain.js';

const v=(x,y,z)=>new T.Vector3(x,y,z);
function seededRandom(seed){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};}
// [base x, base z, height, crown bend, yaw]. Sideways crowns leave a dry
// downslope route beside the trunk instead of sending fruit through its base.
export const PALM_PLACEMENTS=Object.freeze([
 Object.freeze([-1.02,-.49,1.60,.32,-Math.PI/2]),
 Object.freeze([.70,-.88,1.84,.42,-Math.PI/2]),
 Object.freeze([1.14,-.10,1.26,Math.hypot(.20,.30),Math.atan2(.30,-.20)]),
]);

function trunkGeometry(height,bend){
 const positions=[],uv=[],indices=[],rings=84,sides=16;
 for(let j=0;j<=rings;j++){
  const t=j/rings;
  for(let k=0;k<=sides;k++){
   const angle=k/sides*Math.PI*2;
   // Old leaf scars wrap unevenly around a tapered, gently bent stem.
   const scars=1+.028*Math.cos(t*height*57+Math.sin(angle*3)*.22);
   const radius=(.081*(1-t)+.029*t)*scars*(1+.018*Math.sin(angle*5+t*8));
   positions.push(bend*t*t+Math.cos(angle)*radius,t*height,Math.sin(angle)*radius+.012*Math.sin(t*Math.PI));
   uv.push(k/sides,t);
   if(j<rings&&k<sides){const n=j*(sides+1)+k;indices.push(n,n+sides+1,n+1,n+1,n+sides+1,n+sides+2)}
  }
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export function makePalms(scene){
 const textureCanvas=document.createElement('canvas');textureCanvas.width=256;textureCanvas.height=1024;
 const ctx=textureCanvas.getContext('2d'),barkRandom=seededRandom(34);
 ctx.fillStyle='#b79b76';ctx.fillRect(0,0,256,1024);
 // Fine fibres and soft irregular scars remain a single shared texture.
 for(let i=0;i<6500;i++){
  ctx.fillStyle=barkRandom()>.48?'#e3c9a124':'#66574222';
  ctx.fillRect(barkRandom()*256,barkRandom()*1024,.35+barkRandom()*.65,2+barkRandom()*9);
 }
 for(let y=5;y<1024;y+=20+barkRandom()*8){
  const phase=barkRandom()*Math.PI*2;
  for(let x=0;x<256;x++){
   const sy=y+Math.sin(x*.028+phase)*1.6+Math.sin(x*.08+phase)*.6;
   ctx.fillStyle=`rgba(78,63,43,${.09+barkRandom()*.055})`;ctx.fillRect(x,sy,1,1.4);
   ctx.fillStyle='rgba(236,215,173,.13)';ctx.fillRect(x,sy+2,1,.8);
  }
 }
 const bark=new T.CanvasTexture(textureCanvas);bark.colorSpace=T.SRGBColorSpace;
 const trunkMat=new T.MeshStandardMaterial({map:bark,bumpMap:bark,bumpScale:.006,roughness:.96,color:'#eee6d4'});
 const leafMat=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.78,metalness:0});
 const ribMat=new T.MeshStandardMaterial({color:'#657942',roughness:.88});
 const huskCanvas=document.createElement('canvas');huskCanvas.width=128;huskCanvas.height=128;
 const husk=huskCanvas.getContext('2d'),huskRandom=seededRandom(2307);
 husk.fillStyle='#e8dcc4';husk.fillRect(0,0,128,128);
 for(let i=0;i<210;i++){
  const x=huskRandom()*128,y=huskRandom()*128;
  husk.strokeStyle=huskRandom()>.5?'#69573735':'#fff0c22b';husk.lineWidth=.35+huskRandom()*.8;
  husk.beginPath();husk.moveTo(x,y);husk.bezierCurveTo(x+2,y+8,x-2,y+19,x+1,y+27);husk.stroke();
 }
 // Three small husk pores give the rolling shell a readable orientation.
 husk.fillStyle='#5e4b36';for(const [x,y] of [[39,51],[47,50],[44,58]]){husk.beginPath();husk.ellipse(x,y,2,2.5,-.2,0,Math.PI*2);husk.fill();}
 const huskTexture=new T.CanvasTexture(huskCanvas);huskTexture.colorSpace=T.SRGBColorSpace;huskTexture.wrapS=T.RepeatWrapping;
 const coconutMats=['#8a7752','#7d7752'].map(color=>new T.MeshStandardMaterial({color,map:huskTexture,bumpMap:huskTexture,bumpScale:.001,roughness:.9}));
 const coconutGeometry=new T.SphereGeometry(1,16,12),frondGroups=[];

 function palm(x,z,height,bend,seedIndex,yaw=0){
  const random=seededRandom(1941+seedIndex*891),tree=new T.Group();
  tree.position.set(x,bedHeight(x,z)-.018,z);tree.rotation.y=yaw;scene.add(tree);
  const trunk=new T.Mesh(trunkGeometry(height,bend),trunkMat);trunk.castShadow=true;trunk.receiveShadow=true;tree.add(trunk);
  const crown=new T.Group();crown.position.set(bend,height,0);tree.add(crown);frondGroups.push(crown);
  const positions=[],colors=[],indices=[],stemParts=[];

  function leaflet(root,tip,width,color,twist){
   const along=tip.clone().sub(root);
   const side=v(-along.z,0,along.x).normalize().applyAxisAngle(along.clone().normalize(),twist).multiplyScalar(width);
   const p1=root.clone().lerp(tip,.34),p2=root.clone().lerp(tip,.76);
   p1.y+=.037;p2.y+=.025;
   const curve=new T.CubicBezierCurve3(root,p1,p2,tip),start=positions.length/3;
   const segments=7;
   for(let j=0;j<=segments;j++){
    const t=j/segments,center=curve.getPoint(t),spread=Math.pow(Math.sin(t*Math.PI),.86);
    const left=center.clone().addScaledVector(side,spread),right=center.clone().addScaledVector(side,-spread);
    const ridge=center.clone().add(v(0,.0038*spread,0));
    positions.push(...left.toArray(),...ridge.toArray(),...right.toArray());
    for(let k=0;k<3;k++){
     const c=color.clone().multiplyScalar((.96+t*.09)*(k===1?1.038:k===0?.98:1.012));colors.push(c.r,c.g,c.b);
    }
    if(j<segments){const n=start+j*3;indices.push(n,n+3,n+1,n+1,n+3,n+4,n+1,n+4,n+2,n+2,n+4,n+5)}
   }
  }

  for(let k=0;k<9;k++){
   const young=k===8,angle=k*Math.PI*2/9+seedIndex*.43+(random()-.5)*.25;
   const length=young?.61:.85+random()*.21;
   const direction=v(Math.cos(angle),0,Math.sin(angle)),across=v(-Math.sin(angle),0,Math.cos(angle));
   const lift=young?.46:.23+random()*.18,drop=young?.12:.29+random()*.23,sweep=(random()-.5)*.22;
   const point=t=>direction.clone().multiplyScalar(t*length)
    .addScaledVector(across,Math.sin(t*Math.PI*.8)*sweep)
    .add(v(0,lift*Math.sin(t*Math.PI*.87)-drop*t*t,0));
   const curve=new T.CatmullRomCurve3(Array.from({length:15},(_,i)=>point(i/14)));
   stemParts.push(new T.TubeGeometry(curve,20,young?.0045:.0058,4,false));
   // Broad, softly folded leaflets read as a cohesive frond on a phone.
   const pairs=young?12:18;
   const hue=.265+random()*.012,saturation=.47+random()*.045,lightness=.143+random()*.014+(young?.012:0);
   for(let j=0;j<pairs;j++){
    for(const sign of [-1,1]){
     // Alternating insertion, length and roll break the previous symmetric comb.
     const t=.085+(j+(sign===1?.4:0)+(random()-.5)*.2)/(pairs+.8)*.86;
     const root=point(t),lengthScale=young?.72:1;
     const leafletLength=(.105+Math.pow(Math.sin(t*Math.PI),.8)*.16)*(1-t*.36)*(.84+random()*.28)*lengthScale;
     const tip=root.clone().addScaledVector(across,leafletLength*sign)
      .addScaledVector(direction,.055+t*.10+(random()-.5)*.045);
     tip.y-=.045+t*.14+random()*.033;
     const color=new T.Color().setHSL(hue,saturation,lightness+(random()-.5)*.008);
     leaflet(root,tip,(.0175+Math.sin(t*Math.PI)*.007)*(young?.8:1),color,(random()-.5)*.55+sign*.12);
    }
   }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const leaves=new T.Mesh(geometry,leafMat);leaves.castShadow=true;leaves.receiveShadow=true;crown.add(leaves);
  const ribs=new T.Mesh(mergeGeometries(stemParts),ribMat);ribs.castShadow=true;ribs.receiveShadow=true;crown.add(ribs);
  stemParts.forEach(g=>g.dispose());
  for(let i=0;i<3;i++){
   const coconut=new T.Mesh(coconutGeometry,coconutMats[i%2]);coconut.scale.set(.064,.081,.066);
   coconut.name=`coconut-${seedIndex}-${i}`;
   Object.assign(coconut.userData,{role:'coconut',coconutId:coconut.name,treeIndex:seedIndex,slot:i});
   coconut.position.set(Math.cos(i*2.1)*.06,-.055,Math.sin(i*2.1)*.065);coconut.rotation.z=(i-1)*.19;coconut.castShadow=true;coconut.receiveShadow=true;crown.add(coconut);
  }
  const root=new T.Mesh(new T.CylinderGeometry(.065,.108,.13,12),trunkMat);
  root.position.y=.042;root.castShadow=true;root.receiveShadow=true;tree.add(root);
 }
 PALM_PLACEMENTS.forEach(([x,z,height,bend,yaw],i)=>palm(x,z,height,bend,i,yaw));
 return frondGroups;
}
