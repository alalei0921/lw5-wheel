import * as T from './vendor/three.module.min.js';
import {noiseGLSL} from './shaders.js';
export const WATER=.38,SIZE=5.6;
// Only the rear shoulder widens for the building plot. Front beach and deep
// water remain open; the identical radius is used by the optical shader.
export function bedHeight(x,z){const t=Math.max(0,Math.min(1,(z+.12)/.60)),back=1-t*t*(3-2*t),a=Math.atan2(z,x),r=Math.hypot(x/(1.45+.13*back),z/(1.16+.30*back))*(1+.042*Math.sin(a*3+.4)+.026*Math.sin(a*5-.8));let h=-.32+.98*Math.exp(-Math.pow(r,5))+.014*Math.sin(x*8+z*3)*Math.sin(z*9)*Math.exp(-r*r);const clear=(cx,cz,hw,hd,y,margin)=>{const d=Math.hypot(Math.max(0,Math.abs(x-cx)-hw),Math.max(0,Math.abs(z-cz)-hd)),t=Math.max(0,Math.min(1,d/margin)),blend=1-t*t*(3-2*t);h=Math.max(h,h+(y-h)*blend)};clear(-.16,-.40,.58,.46,.638,.28);clear(.84,.15,.255,.205,.615,.20);return h}
function seeded(n){let a=n;return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function makeTerrain(scene,time,causticTexture){
 const rng=seeded(194),cv=document.createElement('canvas');cv.width=cv.height=512;const cx=cv.getContext('2d'),im=cx.createImageData(512,512);for(let i=0;i<im.data.length;i+=4){const v=210+rng()*45;im.data[i]=v;im.data[i+1]=v*.94;im.data[i+2]=v*.81;im.data[i+3]=255}cx.putImageData(im,0,0);const tex=new T.CanvasTexture(cv);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(6,6);tex.colorSpace=T.SRGBColorSpace;
 const sand=new T.MeshStandardMaterial({color:'#e6cda2',map:tex,bumpMap:tex,bumpScale:.013,roughness:.93});
 sand.onBeforeCompile=s=>{s.uniforms.uTime=time;s.uniforms.uCaustic={value:causticTexture};s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWorld=(modelMatrix*vec4(position,1.)).xyz;');s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform float uTime;varying vec3 vWorld;\n'+noiseGLSL).replace('#include <color_fragment>',`#include <color_fragment>
 float wet=1.-smoothstep(.34,.46,vWorld.y);diffuseColor.rgb*=mix(vec3(1.),vec3(.77,.89,.81),wet*.7);
 float waveSand=sin(vWorld.x*27.+sin(vWorld.z*6.)*.8)*.018*(1.-smoothstep(-.18,.15,vWorld.y));diffuseColor.rgb+=waveSand;
 `).replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
 float under=1.-smoothstep(.29,.38,vWorld.y);float ca=caustics(vWorld.xz,uTime);totalEmissiveRadiance+=under*vec3(.33,.43,.32)*ca*.45;
 `);};
 const geo=new T.PlaneGeometry(SIZE,SIZE,160,160);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position;for(let i=0;i<pos.count;i++)pos.setY(i,bedHeight(pos.getX(i),pos.getZ(i)));geo.computeVertexNormals();const ground=new T.Mesh(geo,sand);ground.receiveShadow=true;ground.castShadow=false;scene.add(ground);
 // Sediment cut-away uses continuous coordinates around all four faces.
 const strata=new T.ShaderMaterial({uniforms:{},vertexShader:`varying vec3 p;varying vec3 n;void main(){p=position;n=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:noiseGLSL+`
 varying vec3 p;varying vec3 n;
 void main(){float u=(abs(n.x)>.5?p.z:p.x);float y=p.y;
 float edge=.035*sin(u*3.2)+.018*sin(u*7.3)+.017*noise2(vec2(u*14.,1.));
 vec3 c=vec3(.40,.28,.20);c=mix(c,vec3(.66,.47,.33),smoothstep(-.84+edge,-.825+edge,y));c=mix(c,vec3(.80,.61,.43),smoothstep(-.66+edge,-.648+edge,y));c=mix(c,vec3(.89,.74,.54),smoothstep(-.55+edge*.7,-.54+edge*.7,y));c=mix(c,vec3(.68,.53,.39),smoothstep(-.445+edge*.6,-.44+edge*.6,y));c=mix(c,vec3(.87,.77,.60),smoothstep(-.415+edge*.6,-.398+edge*.6,y));
 float grain=hash12(floor(vec2(u,y)*760.));c*=.94+.13*grain;float bands=sin(y*480.+noise2(vec2(u*14.,y*8.))*4.);c*=1.+bands*.024;
 vec2 q=vec2(u*23.,y*32.);vec2 id=floor(q),f=fract(q)-.5;vec2 off=(hash22(id)-.5)*.45;float r=mix(.045,.23,hash12(id+9.));float peb=1.-smoothstep(r*.8,r,length((f-off)*vec2(1.,1.35)));float keep=step(.71,hash12(id+23.));c=mix(c,mix(vec3(.41,.32,.27),vec3(.97,.87,.68),hash12(id+8.)),peb*keep*.9);
 float light=.76+.24*max(dot(normalize(n),normalize(vec3(-.6,.6,1.))),0.);gl_FragColor=vec4(c*light*.74,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const box=new T.BoxGeometry(SIZE,.68,SIZE,1,1,1);box.translate(0,-.66,0);const sides=new T.Mesh(box,[strata,strata,new T.MeshBasicMaterial({visible:false}),strata,strata,strata]);sides.castShadow=true;sides.receiveShadow=true;scene.add(sides);
 // Tiny real stones on the beach; one instanced draw call, deterministic placement.
 const stones=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshStandardMaterial({color:'#debf98',roughness:.93}),75);const dummy=new T.Object3D();let n=0;for(let i=0;i<400&&n<75;i++){const a=rng()*Math.PI*2,r=.9+rng()*.44,x=Math.cos(a)*r,z=Math.sin(a)*r*.77,y=bedHeight(x,z);if(y<.385||Math.abs(x)<.72&&z>.14)continue;const s=.012+rng()*.023;dummy.position.set(x,y+s*.25,z);dummy.scale.set(s,s*.42,s*.75);dummy.rotation.set(rng()*3,rng()*6,rng()*2);dummy.updateMatrix();stones.setMatrixAt(n,dummy.matrix);stones.setColorAt(n,new T.Color().setHSL(.095+rng()*.04,.22,.56+rng()*.26));n++}stones.count=n;stones.castShadow=true;stones.receiveShadow=true;scene.add(stones);
 return {ground,sides};
}
