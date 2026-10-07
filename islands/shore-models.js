import * as T from './vendor/three.module.min.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Small shore inhabitants. +X is forward, +Y is up and the resting sole is y=0.
// Geometry/materials belong to the factory; removing an animal must NOT dispose
// them. Only four templates are ever cached (two shells, one crab, one hermit).
const V = p => new T.Vector3(...p);
const UP = new T.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

function builder() {
  const parts = [];
  function add(geometry, color, position=[0,0,0], rotation=[0,0,0]) {
    geometry.applyMatrix4(new T.Matrix4().compose(V(position),
      new T.Quaternion().setFromEuler(new T.Euler(...rotation)), new T.Vector3(1,1,1)));
    let g=geometry;
    if(g.index){g=geometry.toNonIndexed();geometry.dispose();}
    for(const name of Object.keys(g.attributes))if(name!=='position'&&name!=='normal'&&name!=='color')g.deleteAttribute(name);
    if(!g.attributes.color){
      const c=new T.Color(color),a=new Float32Array(g.attributes.position.count*3);
      for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}
      g.setAttribute('color',new T.BufferAttribute(a,3));
    }
    parts.push(g);
  }
  function ell(color,x,y,z,rx,ry,rz,segments=8,rings=6) {
    const g=new T.SphereGeometry(1,segments,rings);g.scale(rx,ry,rz);add(g,color,[x,y,z]);
  }
  function rod(color,a,b,r1,r2=r1,sides=5) {
    const start=V(a),end=V(b),axis=end.clone().sub(start);
    const g=new T.CylinderGeometry(r2,r1,axis.length(),sides,1);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(UP,axis.normalize()));
    add(g,color,start.add(end).multiplyScalar(.5).toArray());
  }
  function curve(color,points,radius,segments=10,sides=4) {
    add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(V)),segments,radius,sides,false),color);
  }
  function finish() {
    const result=mergeGeometries(parts,false);
    for(const g of parts)g.dispose();
    result.computeBoundingBox();result.computeBoundingSphere();
    return result;
  }
  return {add,ell,rod,curve,finish};
}

function makeScallop() {
  const b=builder(),positions=[],colors=[],indices=[];
  const radial=9,angular=36,a0=-1.13,a1=1.13;
  const peach=new T.Color('#e9a892'),cream=new T.Color('#ffe3bd');
  // The ridges are actual rounded relief, with a scalloped outer lip. They run
  // from the hinge through the complete fan rather than sitting as loose lines.
  function point(t,a,lower=false) {
    const ridge=(Math.cos(a*25)+1)*.5;
    const r=.123*t*(1+.016*Math.cos(a*25)*t);
    return [-.055+r*Math.cos(a),lower?.003+.002*t:
      .008+.025*Math.sin(t*Math.PI*.84)+.0026*ridge*Math.sin(t*Math.PI*.88),r*Math.sin(a)*.65];
  }
  for(let j=0;j<=radial;j++)for(let i=0;i<=angular;i++){
    const t=j/radial,a=a0+(a1-a0)*i/angular,p=point(t,a);
    positions.push(...p);
    const c=peach.clone().lerp(cream,.22+.58*Math.pow((1+Math.cos(a*25))*.5,3)+.12*(1-t));
    colors.push(c.r,c.g,c.b);
  }
  for(let j=0;j<radial;j++)for(let i=0;i<angular;i++){
    const k=j*(angular+1)+i;
    indices.push(k,k+1,k+angular+1,k+1,k+angular+2,k+angular+1);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
  b.add(g,'#ffe1bd');
  const outline=[];
  for(let i=0;i<=angular;i++)outline.push(point(1,a0+(a1-a0)*i/angular));
  const hinge=point(0,0),bottom=[],bottomIndex=[];
  bottom.push(hinge[0],.003,hinge[2]);
  for(const p of outline)bottom.push(p[0],.003,p[2]);
  for(let i=1;i<outline.length;i++)bottomIndex.push(0,i,i+1);
  const base=new T.BufferGeometry();base.setAttribute('position',new T.Float32BufferAttribute(bottom,3));base.setIndex(bottomIndex);base.computeVertexNormals();b.add(base,'#edb697');
  const border=[];
  for(let j=0;j<=radial;j++)border.push(point(j/radial,a0));
  for(let i=1;i<=angular;i++)border.push(point(1,a0+(a1-a0)*i/angular));
  for(let j=radial-1;j>=0;j--)border.push(point(j/radial,a1));
  const sidePosition=[],sideIndex=[];
  for(const p of border)sidePosition.push(...p,p[0],.003,p[2]);
  for(let i=0;i<border.length-1;i++){
    const k=i*2;sideIndex.push(k,k+2,k+1,k+2,k+3,k+1);
  }
  const sides=new T.BufferGeometry();sides.setAttribute('position',new T.Float32BufferAttribute(sidePosition,3));sides.setIndex(sideIndex);sides.computeVertexNormals();b.add(sides,'#f2cbaa');
  // A soft closed rim conceals the side seam, including the two hinge edges.
  b.curve('#f8d9b4',[hinge,...outline,hinge],.0026,42,4);
  b.ell('#e9ae96',-.047,.007,-.019,.020,.007,.013);
  b.ell('#e9ae96',-.047,.007,.019,.020,.007,.013);
  return [{geometry:b.finish(),pivot:[0,0,0]}];
}

function makeConch() {
  const b=builder();
  b.ell('#f0d5ad',.009,.031,0,.049,.031,.034,12,8);
  // Three overlapping whorls narrow towards the slightly lifted spiral tip.
  b.ell('#eac79e',-.023,.037,0,.036,.027,.028,10,7);
  b.ell('#e7c098',-.047,.043,0,.024,.020,.022,10,7);
  b.ell('#efd5ae',-.068,.048,0,.018,.013,.014,8,6);
  const spiral=[];
  for(let i=0;i<=54;i++){
    const t=i/54,a=t*TAU*3.0,r=.009+.025*t;
    spiral.push([-.076+.105*t,.048-.017*t+Math.sin(a)*r,Math.cos(a)*r]);
  }
  b.curve('#c99071',spiral,.0023,46,4);
  // The dark peach aperture and the thick cream lip give the conch a clear
  // opening instead of a generic sphere. Both face forward and slightly up.
  b.ell('#ce977f',.049,.026,0,.007,.024,.024,10,7);
  const lip=new T.TorusGeometry(.024,.0044,4,18);lip.scale(1,.94,1);
  b.add(lip,'#ffe6c3',[.054,.026,0],[0,Math.PI/2,0]);
  b.curve('#ffe6c3',[[.045,.010,-.015],[.063,.008,-.012],[.073,.014,-.004]],.0055,7,5);
  return [{geometry:b.finish(),pivot:[0,0,0]}];
}

function eye(b,x,y,z,size,stalkStart) {
  b.rod('#d78961',stalkStart,[x,y-.003,z],.0038,.0034,6);
  b.ell('#fff2d4',x,y,z,size,size,size,8,6);
  b.ell('#343734',x+size*.81,y+.0007,z,size*.40,size*.55,size*.52,6,4);
  b.ell('#fff9e5',x+size*.99,y+size*.23,z-size*.10,size*.13,size*.17,size*.17,6,4);
}

function crabLegs(sign,hermit=false) {
  const b=builder(),color=hermit?'#d68d60':'#e98460';
  const pivot=[hermit?.032:0,.029,sign*(hermit?.029:.047)];
  const local=p=>p.map((x,i)=>x-pivot[i]);
  // All four feet and a pincer form one mesh on each side. Sideways alternating
  // steps remain legible at phone size without one draw call for every joint.
  const feet=hermit?3:4;
  for(let i=0;i<feet;i++){
    const x=hermit?.034-i*.022:.033-i*.024;
    const spread=hermit?.027:.047;
    const knee=[x-.004,.030,sign*(spread+.037-(i===feet-1?.006:0))];
    const foot=[x-.022,.004,sign*(spread+(hermit?.054:.078)-i*.003)];
    b.rod(color,local([x,.037,sign*spread]),local(knee),.005,.0045);
    b.rod(color,local(knee),local(foot),.0045,.0019);
  }
  const cx=hermit?.081:.073,cy=hermit?.042:.056,cz=sign*(hermit?.052:.087);
  b.rod(color,local([hermit?.052:.036,.036,sign*(hermit?.028:.053)]),local([cx-.012,cy-.006,cz]),.007,.008,6);
  const palm=local([cx,cy,cz]);
  b.ell(hermit?'#df9766':'#ee9470',...palm,hermit?.017:.023,hermit?.018:.022,hermit?.016:.019,8,6);
  const xsize=hermit?.023:.030,zsize=hermit?.013:.016;
  b.curve(hermit?'#edb886':'#ffc098',[
    local([cx+.005,cy+.003,cz+sign*zsize*.65]),
    local([cx+xsize*.68,cy+.003,cz+sign*zsize]),
    local([cx+xsize,cy+.003,cz+sign*zsize*.30])],hermit?.0045:.006,6,5);
  b.curve(color,[local([cx+.001,cy-.001,cz-sign*zsize*.55]),
    local([cx+xsize*.66,cy,cz-sign*zsize*.70]),
    local([cx+xsize*.87,cy+.001,cz-sign*zsize*.08])],hermit?.0045:.006,6,5);
  return {geometry:b.finish(),pivot};
}

function makeCrab() {
  const b=builder();
  b.ell('#e77959',-.004,.048,0,.048,.031,.065,12,8);
  b.ell('#f3946d',.000,.059,0,.043,.022,.060,10,7);
  b.ell('#ffcca0',.042,.041,0,.010,.014,.030,8,6);
  for(const s of [-1,1]){
    eye(b,.037,.098,s*.030,.0116,[.026,.065,s*.025]);
    b.ell('#e46854',.045,.052,s*.043,.004,.005,.009,6,4);
  }
  b.curve('#864d3b',[[.052,.046,-.014],[.055,.041,0],[.052,.046,.014]],.0018,7,4);
  // Two pale shell dimples, deliberately sparse so its orange silhouette reads.
  for(const s of [-1,1])b.ell('#ffbb8c',-.013,.077,s*.024,.008,.002,.005,6,4);
  return [{geometry:b.finish(),pivot:[0,0,0]},crabLegs(-1),crabLegs(1)];
}

function makeHermit() {
  const b=builder();
  b.ell('#c59770',-.031,.086,0,.061,.064,.055,12,8);
  b.ell('#d6ad7d',-.060,.108,-.007,.037,.037,.039,10,7);
  b.ell('#e2c38e',-.080,.119,-.008,.025,.027,.026,8,6);
  // A raised golden spiral faces both visible flanks of the shell. The rear
  // tip and forward aperture distinguish it from a crab carrying a round ball.
  for(const s of [-1,1]){
    const spiral=[];
    for(let i=0;i<=36;i++){
      const t=i/36,a=t*TAU*1.65,r=.004+.045*t;
      const x=-.034+Math.cos(a)*r,y=.089+Math.sin(a)*r;
      const nx=(x+.031)/.061,ny=(y-.086)/.064;
      const z=s*(.055*Math.sqrt(Math.max(.06,1-nx*nx-ny*ny))+.0015);
      spiral.push([x,y,z]);
    }
    b.curve('#f0d7a2',spiral,.0031,31,4);
  }
  const lip=new T.TorusGeometry(.031,.005,4,16);lip.scale(1,1.05,1);
  b.add(lip,'#edc68f',[.016,.040,0],[0,Math.PI/2,0]);
  b.ell('#cc865e',.032,.031,0,.041,.023,.038,10,7);
  b.ell('#eaaa77',.063,.044,0,.023,.022,.030,8,6);
  for(const s of [-1,1])eye(b,.073,.078,s*.020,.0094,[.060,.054,s*.017]);
  b.curve('#85583f',[[.085,.044,-.008],[.087,.040,0],[.085,.044,.008]],.0016,6,4);
  return [{geometry:b.finish(),pivot:[0,0,0]},crabLegs(-1,true),crabLegs(1,true)];
}

export function createShoreModelFactory() {
  const cache=new Map();
  const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.71,metalness:0});
  let disposed=false;
  function getTemplate(kind,variant) {
    const key=kind==='shell'?`shell-${variant}`:kind;
    if(cache.has(key))return cache.get(key);
    const entries=kind==='shell'?(variant?makeConch():makeScallop()):kind==='crab'?makeCrab():makeHermit();
    const box=new T.Box3();
    for(const e of entries)box.union(e.geometry.boundingBox.clone().translate(V(e.pivot)));
    const floor=box.min.y;
    for(const e of entries)e.pivot[1]-=floor;
    box.min.y-=floor;box.max.y-=floor;
    const size=box.getSize(new T.Vector3());
    // Radius includes each extremity and a small margin for articulated feet.
    const radius=Math.hypot(Math.max(Math.abs(box.min.x),Math.abs(box.max.x)),Math.max(Math.abs(box.min.z),Math.abs(box.max.z)))+.004;
    const bounds=Object.freeze({radius,halfHeight:size.y/2,length:size.x,width:size.z,height:size.y});
    const triangles=entries.reduce((sum,e)=>sum+e.geometry.attributes.position.count/3,0);
    const template={entries,bounds,triangles};cache.set(key,template);return template;
  }
  function create(kind,{variant=0,seed=0}={}) {
    if(disposed)throw new Error('Shore model factory has been disposed');
    if(!['shell','crab','hermit'].includes(kind))throw new Error(`Unknown shore model kind: ${kind}`);
    // Only two fixed shell variants; arbitrary seeds never allocate new caches.
    const v=kind==='shell'?(variant==='conch'||Math.abs(Math.trunc(Number(variant)||0))%2===1?1:0):0;
    const t=getTemplate(kind,v),root=new T.Group();root.name=`shore-${kind}${kind==='shell'?`-${v?'conch':'scallop'}`:''}`;
    const limbs=[];
    for(let i=0;i<t.entries.length;i++){
      const e=t.entries[i],mesh=new T.Mesh(e.geometry,material);mesh.position.fromArray(e.pivot);
      mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);if(i>0)limbs.push(mesh);
    }
    root.userData.shoreModel={kind,variant:v,triangles:t.triangles,drawCalls:t.entries.length};
    const phase=(Number.isFinite(Number(seed))?Number(seed):0)*2.399963229728653;
    function animate(time,speed=0) {
      if(kind==='shell')return;
      const movement=Math.min(1,Math.max(0,Number.isFinite(speed)?Math.abs(speed):0)/.065);
      const clock=(Number.isFinite(time)?time:0)*(1.5+movement*5.5)+phase;
      for(let i=0;i<limbs.length;i++){
        const sign=i===0?-1:1;
        limbs[i].rotation.x=Math.sin(clock+i*Math.PI)*(.010+movement*.030);
        limbs[i].rotation.y=sign*Math.sin(clock*.72+i*Math.PI*.4)*(.012+movement*.040);
      }
    }
    return {root,animate,bounds:t.bounds,kind};
  }
  function dispose() {
    if(disposed)return;
    for(const t of cache.values())for(const e of t.entries)e.geometry.dispose();
    cache.clear();material.dispose();disposed=true;
  }
  return {create,dispose};
}
