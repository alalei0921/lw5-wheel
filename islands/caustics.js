import * as T from './vendor/three.module.min.js';
import {waveGLSL} from './shaders.js';
// Refract a light-ray grid through the animated surface; area compression gives irradiance.
export function makeCaustics(renderer,time,interactionTexture){
 const span=7.2,target=new T.WebGLRenderTarget(768,768,{type:T.HalfFloatType,depthBuffer:false,minFilter:T.LinearFilter,magFilter:T.LinearFilter});
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-span/2,span/2,span/2,-span/2,.1,10);camera.position.set(0,4,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
 const geometry=new T.PlaneGeometry(8,8,256,256);geometry.rotateX(-Math.PI/2);
 const material=new T.ShaderMaterial({uniforms:{uTime:time,uInteraction:{value:interactionTexture},uInteractionTexel:{value:new T.Vector2(1/interactionTexture.image.width,1/interactionTexture.image.height)}},depthWrite:false,depthTest:false,transparent:true,blending:T.AdditiveBlending,vertexShader:`uniform float uTime;varying vec2 vOld;varying vec2 vNew;${waveGLSL}
 void main(){vec2 p=position.xz;float h=.38+waveHeight(p,uTime);vec2 slope=waveSlope(p,uTime);vec3 n=normalize(vec3(-slope.x,1.,-slope.y));vec3 ray=refract(normalize(vec3(.28,-1.,-.18)),n,1./1.333);vec3 hit=vec3(p.x,h,p.y)+ray*((-.32-h)/ray.y);vOld=p;vNew=hit.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(hit.x,0.,hit.z,1.);}`,fragmentShader:`varying vec2 vOld;varying vec2 vNew;
 void main(){float a=abs(dFdx(vOld.x)*dFdy(vOld.y)-dFdy(vOld.x)*dFdx(vOld.y));float b=abs(dFdx(vNew.x)*dFdy(vNew.y)-dFdy(vNew.x)*dFdx(vNew.y));float focus=clamp(.18*a/max(b,.0000005),.055,1.7);gl_FragColor=vec4(vec3(focus),1.);}`});
 scene.add(new T.Mesh(geometry,material));const clear=new T.Color();return {texture:target.texture,render(){renderer.getClearColor(clear);const alpha=renderer.getClearAlpha();renderer.setClearColor(0x000000,1);renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.setClearColor(clear,alpha);}};
}
