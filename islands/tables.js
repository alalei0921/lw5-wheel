import * as T from './vendor/three.module.min.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {bedHeight} from './terrain.js';

// Tables are presentation furniture. Food owns the stable anchors below and can
// be driven by a separate score; changing a building level never replaces food.
const LEVELS = [
  {stars:0,name:'空地',width:0,depth:0,height:0,clearWidth:0,clearDepth:0},
  {stars:.5,name:'修补草编桌',width:.39,depth:.32,height:.225,clearWidth:.27,clearDepth:.23},
  {stars:1,name:'整齐草编桌',width:.42,depth:.34,height:.235,clearWidth:.30,clearDepth:.25},
  {stars:1.5,name:'修补木桌',width:.42,depth:.33,height:.245,clearWidth:.30,clearDepth:.25},
  {stars:2,name:'好木桌',width:.45,depth:.35,height:.25,clearWidth:.33,clearDepth:.27},
  {stars:2.5,name:'修补石桌',width:.44,depth:.35,height:.25,clearWidth:.30,clearDepth:.25},
  {stars:3,name:'圆角石桌',width:.46,depth:.36,height:.26,clearWidth:.32,clearDepth:.26},
  {stars:3.5,name:'砖木餐桌',width:.46,depth:.36,height:.26,clearWidth:.34,clearDepth:.28},
  {stars:4,name:'现代陶面餐桌',width:.47,depth:.37,height:.265,clearWidth:.32,clearDepth:.26},
  {stars:4.5,name:'别墅细木餐桌',width:.48,depth:.38,height:.27,clearWidth:.34,clearDepth:.28},
  {stars:5,name:'雕饰石面餐桌',width:.50,depth:.40,height:.28,clearWidth:.34,clearDepth:.28},
];
const vector = a => new T.Vector3(...a);

function roundedSlab(width,depth,height,radius,bevel=.002) {
  const r=Math.min(radius,width/2,depth/2),x=-width/2,z=-depth/2;
  const shape=new T.Shape();
  shape.moveTo(x+r,z);shape.lineTo(x+width-r,z);
  shape.quadraticCurveTo(x+width,z,x+width,z+r);shape.lineTo(x+width,z+depth-r);
  shape.quadraticCurveTo(x+width,z+depth,x+width-r,z+depth);shape.lineTo(x+r,z+depth);
  shape.quadraticCurveTo(x,z+depth,x,z+depth-r);shape.lineTo(x,z+r);
  shape.quadraticCurveTo(x,z,x+r,z);
  // The plan outline is inset before beveling so the stated footprint is exact.
  const geo=new T.ExtrudeGeometry(shape,{depth:Math.max(.0005,height-2*bevel),bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,curveSegments:4,steps:1});
  geo.rotateX(-Math.PI/2);geo.center();
  const bounds=new T.Box3().setFromBufferAttribute(geo.attributes.position),s=bounds.getSize(new T.Vector3());
  geo.scale(width/s.x,height/s.y,depth/s.z);
  return geo;
}

function buildTable(def) {
  const group=new T.Group();group.name=`table-${def.stars}`;
  const parts=new Map(),materials=new Map();
  function material(key,color,roughness=.78,metalness=0) {
    if(!materials.has(key)) materials.set(key,new T.MeshStandardMaterial({color,roughness,metalness}));
    return key;
  }
  const straw=material('straw','#cfac72',.94),reed=material('reed','#e4c790',.9);
  const bamboo=material('bamboo','#ae8854',.84),rope=material('rope','#eee0b3',.98);
  const wood=material('wood','#a8774d',.76),lightWood=material('light-wood','#c29868',.76);
  const darkWood=material('dark-wood','#75543d',.82),grain=material('grain','#8e6949',.85);
  const stone=material('stone','#d1c4ad',.88),stoneLight=material('stone-light','#e4d8c1',.84);
  const repair=material('repair','#b7aa96',.98),shadow=material('edge-mark','#827568',.91);
  const brick=material('brick','#b98266',.86),brickLight=material('brick-light','#c99375',.9);
  const metal=material('metal','#596368',.47,.48),gold=material('gold','#bb9c64',.36,.62);
  const ceramic=material('ceramic','#efe7d4',.42),marble=material('marble','#f0e9da',.34);

  function part(geometry,key,position=[0,0,0],rotation=[0,0,0]) {
    const m=new T.Matrix4().compose(vector(position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(1,1,1));
    geometry.applyMatrix4(m);
    // A common attribute layout permits one draw call for each visible material.
    let g=geometry;
    if(g.index){g=geometry.toNonIndexed();geometry.dispose();}
    for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);
    if(!parts.has(key))parts.set(key,[]);parts.get(key).push(g);
  }
  const slab=(w,d,h,r,key,x,y,z,rotation=0)=>part(roundedSlab(w,d,h,r,Math.min(.002,h/5)),key,[x,y,z],[0,rotation,0]);
  function rod(a,b,r1,r2,key,sides=10) {
    const start=vector(a),end=vector(b),axis=end.clone().sub(start),geo=new T.CylinderGeometry(r2,r1,axis.length(),sides,1);
    geo.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize()));
    part(geo,key,start.add(end).multiplyScalar(.5).toArray());
  }
  function sphere(x,y,z,rx,ry,rz,key) {const g=new T.SphereGeometry(1,10,7);g.scale(rx,ry,rz);part(g,key,[x,y,z]);}
  function ring(x,y,z,r,t,key,rotation=[Math.PI/2,0,0]) {part(new T.TorusGeometry(r,t,4,12),key,[x,y,z],rotation);}
  function curve(points,r,key) {part(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(vector)),12,r,5,false),key);}
  const w=def.width,d=def.depth,h=def.height;

  if(def.stars===.5||def.stars===1) {
    const good=def.stars===1,top=h-.013,legTop=h-.028;
    slab(w-.024,d-.024,.02,.012,straw,0,top,0);
    // Flat woven strips, rather than a spiky thatch surface: food sits level.
    for(let i=0;i<19;i++)part(new T.BoxGeometry(.008,.0011,d-.034),i%2?reed:straw,[-(w-.045)/2+i*(w-.045)/18,h-.002,0]);
    for(let i=0;i<14;i++)part(new T.BoxGeometry(w-.034,.001,.004),i%2?straw:reed,[0,h-.001,(i/13-.5)*(d-.045)]);
    for(const sign of [-1,1]) {
      rod([-w/2+.009,top,sign*(d/2-.009)],[w/2-.009,top,sign*(d/2-.009)],.009,.009,bamboo);
      rod([sign*(w/2-.009),top,-d/2+.009],[sign*(w/2-.009),top,d/2-.009],.009,.009,bamboo);
    }
    for(const sx of [-1,1])for(const sz of [-1,1]) {
      const x=sx*(w/2-.048),z=sz*(d/2-.048);
      rod([x+sx*.012,.009,z+sz*.01],[x,legTop,z],.012,good?.010:.009,bamboo);
      for(const y of [.052,legTop-.029,legTop-.021])ring(x,y,z,.012,.0022,rope);
      // Fine bamboo node rings are structural, with warm rounded feet.
      sphere(x+sx*.012,.012,z+sz*.01,.013,.012,.013,bamboo);
    }
    for(const sign of [-1,1])rod([-w/2+.048,.070,sign*(d/2-.048)],[w/2-.048,.070,sign*(d/2-.048)],.007,.007,bamboo);
    if(good) {
      for(const sign of [-1,1])rod([sign*(w/2-.048),.075,-d/2+.048],[sign*(w/2-.048),.075,d/2-.048],.007,.007,bamboo);
      // Neat side apron retains the handwoven silhouette.
      slab(w-.034,.014,.024,.004,reed,0,top-.022,d/2-.013);
      for(let i=0;i<20;i++)rod([(i/19-.5)*(w-.050),top-.033,d/2-.005],[(i/19-.5)*(w-.050),top-.012,d/2-.005],.0017,.0017,straw,6);
    } else {
      rod([-.14,.050,.10],[.14,legTop-.035,.10],.007,.007,lightWood);
      slab(.065,.013,.033,.005,reed,-.095,top-.020,d/2-.006,-.07);
      for(let i=0;i<5;i++)rod([-.119+i*.011,top-.037,d/2+.001],[-.119+i*.011,top-.004,d/2+.001],.0018,.0018,rope,6);
      for(let i=0;i<9;i++)rod([w/2-.01,top-.003,-.11+i*.026],[w/2-.008,top-.026-(i%3)*.004,-.11+i*.026],.0018,.0015,straw,6);
    }
  } else if(def.stars===1.5||def.stars===2) {
    const good=def.stars===2,thickness=.035,legTop=h-thickness;
    for(let i=0;i<4;i++)slab(w,(d-.009)/4,thickness,.008,i%2?lightWood:wood,0,h-thickness/2,(i-1.5)*d/4);
    for(const sx of [-1,1])for(const sz of [-1,1]) {
      const x=sx*(w/2-.042),z=sz*(d/2-.040);
      if(good) {
        rod([x,.008,z],[x,legTop,z],.012,.021,wood,8);
        ring(x,.034,z,.014,.0025,darkWood);ring(x,legTop-.024,z,.020,.0023,lightWood);
      } else {
        slab(.030,.030,legTop,.006,wood,x,legTop/2,z);
        if(sx===-1&&sz===1){slab(.039,.012,.068,.004,lightWood,x,.078,z+.018);for(const y of [.054,.099])sphere(x,y,z+.025,.003,.003,.0018,metal);}
      }
    }
    for(const sign of [-1,1])slab(w-.054,.018,.044,.004,wood,0,legTop-.022,sign*(d/2-.029));
    for(const sign of [-1,1])slab(.018,d-.057,.043,.004,wood,sign*(w/2-.029),legTop-.022,0);
    rod([-w/2+.04,.062,0],[w/2-.04,.062,0],.008,.008,darkWood);
    if(good) {
      slab(.145,.013,.031,.005,lightWood,0,legTop-.022,d/2-.014);
      sphere(0,legTop-.022,d/2-.005,.009,.005,.005,gold);
      // Subtle incised grain is on the edge, leaving the entire top clear.
      for(const sign of [-1,1])curve([[-.16,h-.023,sign*(d/2+.0003)],[-.04,h-.025,sign*(d/2+.0003)],[.14,h-.023,sign*(d/2+.0003)]],.0009,grain);
    } else {
      slab(.072,.014,.044,.004,lightWood,-.10,h-.034,d/2-.005,-.12);
      for(const x of [-.124,-.076])sphere(x,h-.034,d/2+.003,.003,.003,.0016,metal);
      curve([[.115,h-.006,d/2+.0005],[.092,h-.017,d/2+.0005],[.105,h-.032,d/2+.0005]],.0012,darkWood);
    }
  } else if(def.stars===2.5||def.stars===3) {
    const good=def.stars===3,thick=good?.049:.052;
    slab(w,d,thick,good?.073:.039,stoneLight,0,h-thick/2,0);
    if(good) {
      slab(.25,.20,.033,.026,stone,0,.0165,0);
      slab(.20,.15,.020,.024,stoneLight,0,.043,0);
      rod([0,.055,0],[0,h-thick-.018,0],.061,.046,stone,16);
      for(let i=0;i<12;i++){const a=i*Math.PI/6;rod([Math.cos(a)*.054,.065,Math.sin(a)*.054],[Math.cos(a)*.044,h-thick-.018,Math.sin(a)*.044],.0022,.0022,stoneLight,6);}
      slab(.19,.14,.028,.025,stone,0,h-thick-.014,0);
      slab(w-.017,d-.017,.008,.069,stone,0,h-thick+.006,0);
    } else {
      for(const sx of [-1,1])for(let j=0;j<3;j++) {
        slab(.100+(j%2)*.006,.17-(j%2)*.004,.059,.013,j===1?repair:stone,sx*.135,.032+j*.056,(j%2)*.003,sx*(j-1)*.015);
      }
      slab(.12,.012,.024,.007,repair,-.084,h-.030,d/2-.003);
      curve([[.04,h-.004,d/2+.0005],[.023,h-.019,d/2+.0005],[.031,h-.042,d/2+.0005]],.0012,shadow);
      curve([[.024,h-.019,d/2+.0005],[.006,h-.023,d/2+.0005]],.0010,shadow);
      slab(.042,.007,.025,.008,stoneLight,-.136,.095,.089);
      slab(.029,.010,.019,.006,repair,.158,.042,.089);
    }
  } else if(def.stars===3.5) {
    // Two warm brick piers and a slender metal stretcher support the timber slab.
    for(let i=0;i<5;i++)slab(w,(d-.008)/5,.031,.005,i%2?wood:lightWood,0,h-.0155,(i-2)*d/5);
    for(const sx of [-1,1]) {
      slab(.104,.235,.015,.009,repair,sx*.148,.0075,0);
      for(let row=0;row<4;row++)for(const sz of [-1,1])slab(.079,.091,.050,.005,(row+sz)%2?brick:brickLight,sx*.148,.040+row*.046,sz*.047+(row%2)*.002);
      slab(.091,.214,.014,.006,metal,sx*.148,h-.037,0);
    }
    rod([-.145,.087,0],[.145,.087,0],.007,.007,metal);
    for(const sx of [-1,1])for(const sz of [-1,1])sphere(sx*.150,h-.026,sz*(d/2-.015),.004,.004,.003,metal);
  } else if(def.stars===4) {
    // Open U frames and an oval ceramic top read clearly as a modern table.
    slab(w,d,.031,.15,ceramic,0,h-.0155,0);
    slab(w-.013,d-.013,.010,.145,lightWood,0,h-.032,0);
    for(const sx of [-1,1]) {
      const x=sx*.15;
      curve([[x,h-.039,-.113],[x,.039,-.122],[x,.018,-.09],[x,.018,.09],[x,.039,.122],[x,h-.039,.113]],.011,metal);
      for(const sz of [-1,1])slab(.026,.030,.009,.006,darkWood,x,.006,sz*.09);
    }
    rod([-.15,h-.065,0],[.15,h-.065,0],.007,.007,metal);
  } else if(def.stars===4.5) {
    slab(w,d,.037,.053,lightWood,0,h-.0185,0);
    slab(w-.010,d-.010,.008,.050,darkWood,0,h-.033,0);
    for(const sign of [-1,1])slab(w-.045,.019,.034,.008,wood,0,h-.050,sign*(d/2-.025));
    for(const sign of [-1,1])slab(.019,d-.043,.034,.008,wood,sign*(w/2-.024),h-.050,0);
    for(const sx of [-1,1])for(const sz of [-1,1]) {
      const x=sx*(w/2-.052),z=sz*(d/2-.052);
      rod([x,.021,z],[x,h-.059,z],.012,.018,wood,12);
      sphere(x,h-.073,z,.022,.021,.022,lightWood);
      ring(x,.038,z,.014,.0026,gold);rod([x,.006,z],[x,.025,z],.014,.013,gold);
      for(let i=0;i<6;i++){const a=i*Math.PI/3;rod([x+Math.cos(a)*.013,.048,z+Math.sin(a)*.013],[x+Math.cos(a)*.016,h-.10,z+Math.sin(a)*.016],.0012,.0012,lightWood,5);}
    }
    for(const sign of [-1,1]) {
      slab(.091,.005,.023,.007,lightWood,0,h-.050,sign*(d/2-.014));
      sphere(0,h-.050,sign*(d/2-.010),.007,.005,.003,gold);
    }
  } else if(def.stars===5) {
    // More craft rather than more size: layered stone edge, twin sculpted
    // pedestals and restrained brass rosettes below the empty serving surface.
    slab(w,d,.036,.17,marble,0,h-.018,0);
    slab(w-.007,d-.007,.005,.166,gold,0,h-.035,0);
    slab(w-.028,d-.028,.017,.15,stoneLight,0,h-.046,0);
    for(const sx of [-1,1]) {
      const x=sx*.127;
      slab(.157,.232,.020,.060,stoneLight,x,.010,0);
      slab(.133,.204,.007,.056,gold,x,.0235,0);
      slab(.114,.177,.018,.049,stoneLight,x,.036,0);
      const profile=[new T.Vector2(.038,0),new T.Vector2(.048,.009),new T.Vector2(.039,.022),new T.Vector2(.028,.070),new T.Vector2(.034,.124),new T.Vector2(.051,.143),new T.Vector2(.052,.152)];
      part(new T.LatheGeometry(profile,20),stoneLight,[x,.045,0]);
      ring(x,.059,0,.043,.0024,gold);ring(x,.188,0,.048,.0024,gold);
      slab(.129,.165,.025,.039,stoneLight,x,h-.066,0);
      for(const sz of [-1,1]) {
        sphere(x,h-.058,sz*.080,.015,.012,.003,gold);
        for(let k=0;k<5;k++){const a=k*Math.PI*2/5;sphere(x+Math.cos(a)*.008,h-.058+Math.sin(a)*.007,sz*.083,.004,.004,.002,stoneLight);}
      }
    }
    // A delicate edge vein stays below the flat tabletop and never competes
    // with future food or the two little characters.
    curve([[-.125,h-.014,.185],[-.065,h-.018,.196],[.012,h-.013,.20],[.078,h-.016,.191]],.0008,repair);
  }

  let triangles=0;
  for(const [key,geometries] of parts) {
    const geometry=mergeGeometries(geometries,false);
    geometries.forEach(g=>g.dispose());
    const mesh=new T.Mesh(geometry,materials.get(key));mesh.castShadow=true;mesh.receiveShadow=true;
    triangles+=geometry.attributes.position.count/3;group.add(mesh);
  }
  for(const [key,mat] of materials)if(!parts.has(key)){mat.dispose();materials.delete(key);}
  group.userData={role:'building-table',stars:def.stars,triangles,drawCalls:group.children.length};
  return group;
}

function disposeModel(model) {
  if(!model)return;
  const materials=new Set();
  model.traverse(object=>{if(object.isMesh){object.geometry.dispose();materials.add(object.material);}});
  for(const material of materials)material.dispose();
  model.removeFromParent();
}

export function createTableSeries(parent,options={}) {
  const {x=.8,z=.1,rotation=0,level=0}=options;
  const root=new T.Group();root.name='building-table-series';root.userData.role='table-series';
  root.position.set(x,options.y??bedHeight(x,z)-.006,z);root.rotation.y=rotation;parent.add(root);
  const anchorRoot=new T.Group();anchorRoot.name='independent-food-anchors';root.add(anchorRoot);
  const anchors=Array.from({length:3},(_,index)=>{
    const anchor=new T.Group();anchor.name=`food-anchor-${index}`;
    anchor.userData={role:'food-anchor',index,available:false};anchorRoot.add(anchor);return anchor;
  });
  let current=-1,model=null,disposed=false,def=LEVELS[0],revision=0;

  function setLevel(stars) {
    if(disposed)throw new Error('Cannot set a disposed table series');
    const number=Number(stars),index=Math.min(10,Math.max(0,Math.round((Number.isFinite(number)?number:0)*2)));
    if(index===current)return getState();
    const nextDef=LEVELS[index],nextModel=index?buildTable(nextDef):null;
    disposeModel(model);model=nextModel;def=nextDef;current=index;revision++;
    if(model)root.add(model);
    anchorRoot.visible=index>0;
    // Three compact locations fit completely within the guaranteed clear area.
    const positions=[[-def.clearWidth*.25,-def.clearDepth*.20],[def.clearWidth*.25,-def.clearDepth*.20],[0,def.clearDepth*.22]];
    anchors.forEach((anchor,i)=>{
      anchor.position.set(positions[i][0],def.height+.002,positions[i][1]);
      Object.assign(anchor.userData,{available:index>0,tableStars:def.stars,tabletopY:def.height,maxRadius:index?Math.min(def.clearWidth*.19,def.clearDepth*.23):0});
    });
    root.updateWorldMatrix(true,true);
    return getState();
  }

  function getState() {
    root.updateWorldMatrix(true,true);
    const box=model?new T.Box3().setFromObject(model):null;
    const top=root.localToWorld(new T.Vector3(0,def.height,0));
    return {
      stars:def.stars,name:def.name,disposed,revision,visible:!!model,
      position:root.position.toArray(),rotation:root.rotation.y,
      tabletop:{localY:def.height,world:top.toArray(),worldY:top.y,width:def.width,depth:def.depth,clearWidth:def.clearWidth,clearDepth:def.clearDepth},
      usableArea:{center:[0,def.height,0],width:def.clearWidth,depth:def.clearDepth},
      bounds:box?{min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new T.Vector3()).toArray()}:null,
      drawCalls:model?.userData.drawCalls??0,triangles:model?.userData.triangles??0,
      anchors:anchors.map(a=>({name:a.name,available:a.userData.available,local:a.position.toArray(),world:a.getWorldPosition(new T.Vector3()).toArray(),maxRadius:a.userData.maxRadius})),
    };
  }

  function dispose() {
    if(disposed)return;
    disposeModel(model);model=null;disposed=true;
    // Do not dispose or clear food-owned children. Their owner controls lifetime.
    anchorRoot.visible=false;anchors.forEach(a=>{a.userData.available=false;});root.removeFromParent();
  }
  setLevel(level);
  return {root,setLevel,getState,getFoodAnchors:()=>[...anchors],dispose};
}
