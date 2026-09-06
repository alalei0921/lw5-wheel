import * as THREE from './vendor/three.module.min.js';

// Photo geometry is rendered before the physical wheel. Its camera and world scale
// are shared with that wheel; source pixels remain exact at the reference view.
export function salonCamera(aspect=9/16){
 const distance=aspect>1?18:22;
 return {position:new THREE.Vector3(0,11,distance),target:new THREE.Vector3(0,4.2,0),fov:48};
}
export class SpatialRoom {
 constructor(){this.scene=new THREE.Scene();this.ready=this.load();this.aspect=0;}
 async load(){
  const [meta,raw,texture]=await Promise.all([
   fetch('./assets/salon/depth.json').then(r=>{if(!r.ok)throw Error('Room depth unavailable');return r.json()}),
   fetch('./assets/salon/depth.bin').then(r=>{if(!r.ok)throw Error('Room depth unavailable');return r.arrayBuffer()}),
   new THREE.TextureLoader().loadAsync('./assets/salon/room-v2.png')
  ]);
  if(raw.byteLength!==meta.width*meta.height*2)throw Error('Incomplete room depth');
  this.meta=meta;this.depth=new DataView(raw);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;texture.anisotropy=4;
  this.material=new THREE.ShaderMaterial({uniforms:{map:{value:texture},fade:{value:1}},
   vertexShader:'attribute float sourceDistance;varying vec3 vSource;void main(){vSource=vec3(uv*sourceDistance,sourceDistance);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:'uniform sampler2D map;uniform float fade;varying vec3 vSource;void main(){vec3 c=texture2D(map,vSource.xy/vSource.z).rgb;gl_FragColor=vec4(mix(vec3(.008,.006,.004),c,fade),1.);\n#include <colorspace_fragment>}',
   side:THREE.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});
  this.mesh=new THREE.Mesh(new THREE.BufferGeometry(),this.material);this.mesh.frustumCulled=false;this.scene.add(this.mesh);this.resize(this.aspect||9/16);
 }
 sample(u,v){const {width:w,height:h}=this.meta,x=u*(w-1),y=v*(h-1),a=Math.floor(x),b=Math.floor(y),tx=x-a,ty=y-b;
  const s=(i,j)=>this.depth.getUint16((Math.min(j,h-1)*w+Math.min(i,w-1))*2,true)/65535;
  return (s(a,b)*(1-tx)+s(a+1,b)*tx)*(1-ty)+(s(a,b+1)*(1-tx)+s(a+1,b+1)*tx)*ty;
 }
 resize(aspect){this.aspect=aspect;if(!this.mesh)return;
  const ref=salonCamera(aspect),cam=new THREE.PerspectiveCamera(ref.fov,aspect,.1,100);cam.position.copy(ref.position);cam.lookAt(ref.target);cam.updateMatrixWorld();
  const photoAspect=this.meta.sourceWidth/this.meta.sourceHeight;
  const height=2*Math.tan(ref.fov*Math.PI/360)*Math.max(1,Math.min(aspect,.8)/photoAspect)*1.09;
  const width=height*photoAspect,cols=256,rows=Math.round(cols/photoAspect),positions=[],uv=[],distances=[],index=[],point=new THREE.Vector3();
  for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
   const u=x/cols,v=y/rows,d=36-(this.sample(u,v)-.5)*10;
   point.set((u-.5)*width*d,(.5-v)*height*d,-d).applyMatrix4(cam.matrixWorld);
   positions.push(...point.toArray());uv.push(u,1-v);distances.push(d);
   if(x<cols&&y<rows){const k=y*(cols+1)+x;index.push(k,k+cols+1,k+1,k+1,k+cols+1,k+cols+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('sourceDistance',new THREE.Float32BufferAttribute(distances,1));g.setIndex(index);
  this.mesh.geometry.dispose();this.mesh.geometry=g;
 }
 render(renderer,camera,progress){if(!this.mesh)return;this.material.uniforms.fade.value=1-THREE.MathUtils.smoothstep(progress,.3,.95)*.96;renderer.render(this.scene,camera);}
}
