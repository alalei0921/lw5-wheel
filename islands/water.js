import * as T from './vendor/three.module.min.js';
import {noiseGLSL,waveGLSL} from './shaders.js';
import {WATER,SIZE} from './terrain.js';
export function makeWater(scene,camera,renderer,time,causticTexture,interactionTexture){
 const refraction=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true});refraction.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
 const reflection=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,minFilter:T.LinearFilter,magFilter:T.LinearFilter});
 const mirrorCamera=camera.clone(),mirrorMatrix=new T.Matrix4(),clip=new T.Plane(new T.Vector3(0,1,0),-WATER+.01),underClip=new T.Plane(new T.Vector3(0,-1,0),WATER+.235);
 const uniforms={uInteraction:{value:interactionTexture},uInteractionTexel:{value:new T.Vector2(1/interactionTexture.image.width,1/interactionTexture.image.height)},uTime:time,uCaustic:{value:causticTexture},uScene:{value:refraction.texture},uDepth:{value:refraction.depthTexture},uReflection:{value:reflection.texture},uSize:{value:new T.Vector2()},uNear:{value:camera.near},uFar:{value:camera.far},uMirror:{value:mirrorMatrix},uCameraVP:{value:new T.Matrix4()},uCameraInvVP:{value:new T.Matrix4()},uMarineActive:{value:false}};
 const vertex=`uniform float uTime;uniform mat4 uMirror;varying vec3 vWorld;varying float vEyeDepth;varying vec4 vReflect;varying vec3 vN;${waveGLSL}
 void main(){vec3 p=position;if(normal.y>.5){p.y+=waveHeight(p.xz,uTime);}else {float k=smoothstep(-.32,.38,p.y);p.y+=waveHeight(p.xz,uTime)*k;}vWorld=(modelMatrix*vec4(p,1.)).xyz;vN=normal;vec4 eye=modelViewMatrix*vec4(p,1.);vEyeDepth=-eye.z;vReflect=uMirror*vec4(vWorld,1.);gl_Position=projectionMatrix*eye;}`;
 const fragment=`uniform float uTime;uniform sampler2D uScene,uDepth,uReflection;uniform vec2 uSize;uniform float uNear,uFar;uniform mat4 uCameraVP,uCameraInvVP;uniform bool uMarineActive;varying vec3 vWorld;varying float vEyeDepth;varying vec4 vReflect;varying vec3 vN;${noiseGLSL}${waveGLSL}
 float linearDepth(float z){return uNear*uFar/(uFar-z*(uFar-uNear));}
 vec3 sky(vec3 r){vec3 c=mix(vec3(.56,.70,.72),vec3(.96,.94,.84),smoothstep(-.1,.85,r.y));float sun=pow(max(dot(r,normalize(vec3(-.35,.86,-.9))),0.),180.);return c+sun*.85;}
 // Reuse the existing color/depth capture: no animal-only pass or random samples.
 // A candidate must be real geometry between the moving surface and the bed.
 // Empty water retains the original procedural/bed path exactly.
 vec3 scenePoint(vec2 uv,float depth){vec4 p=uCameraInvVP*vec4(uv*2.-1.,depth*2.-1.,1.);return p.xyz/p.w;}
 float submergedGeometry(vec3 p){float bounds=1.-smoothstep(2.775,2.8,max(abs(p.x),abs(p.z)));if(bounds<=0.)return 0.;float aboveBed=smoothstep(.03,.065,p.y-bedHeight(p.xz));if(aboveBed<=0.)return 0.;float surface=.38+waveHeight(p.xz,uTime);return aboveBed*(1.-smoothstep(-.006,.018,p.y-surface))*bounds;}
 // Color/depth captures contain an animal instead of the hidden bed beneath it.
 // Reconstruct only that occluded bed from nearby verified bed samples, so the
 // original bright emergency fallback cannot produce a detached cyan silhouette.
 vec3 exposedBed(vec3 source,vec3 fallback){vec3 sum=vec3(0.);float total=0.;
 for(int j=0;j<2;j++){float radius=j==0?.30:.58;for(int i=0;i<8;i++){float a=float(i)*.7853981634;vec3 p=source;p.xz+=vec2(cos(a),sin(a))*radius;p.y=bedHeight(p.xz);vec4 clipP=uCameraVP*vec4(p,1.);vec2 uv=clipP.xy/clipP.w*.5+.5;
 if(max(abs(p.x),abs(p.z))<2.77&&p.y<.32&&uv.x>.002&&uv.x<.998&&uv.y>.002&&uv.y<.998){vec3 actual=scenePoint(uv,texture2D(uDepth,uv).x);float valid=1.-smoothstep(.008,.027,abs(actual.y-bedHeight(actual.xz)));valid*=1.-smoothstep(.15,.45,length(actual.xz-p.xz));valid*=j==0?1.:.38;sum+=texture2D(uScene,uv).rgb*valid;total+=valid;}}}
 return total>.02?sum/total:fallback;
 }
 vec4 marineRay(vec3 origin,vec3 direction,float maxDistance,out float waterPath){
 waterPath=maxDistance;if(!uMarineActive)return vec4(0.);
 float stride=maxDistance/10.;float hitLo=0.,hitHi=0.;bool found=false;
 // Ten deterministic coarse steps, then four bracket refinements. Depth from
 // foreground land cannot reveal an animal behind it, preserving real occlusion.
 for(int i=0;i<10;i++){float t=(float(i)+.5)*stride;vec3 p=origin+direction*t;vec4 clipP=uCameraVP*vec4(p,1.);vec2 uv=clipP.xy/clipP.w*.5+.5;
 if(clipP.w>0.&&uv.x>.001&&uv.x<.999&&uv.y>.001&&uv.y<.999&&max(abs(p.x),abs(p.z))<2.8){float depth=texture2D(uDepth,uv).x;vec3 actual=scenePoint(uv,depth);float gap=-(viewMatrix*vec4(p,1.)).z-linearDepth(depth);
 if(submergedGeometry(actual)>.01&&gap>=0.&&gap<stride*1.25+.12){hitLo=max(0.,t-stride);hitHi=t;found=true;break;}}}
 if(!found)return vec4(0.);
 for(int i=0;i<4;i++){float mid=(hitLo+hitHi)*.5;vec3 p=origin+direction*mid;vec4 clipP=uCameraVP*vec4(p,1.);vec2 uv=clamp(clipP.xy/clipP.w*.5+.5,vec2(.001),vec2(.999));float gap=-(viewMatrix*vec4(p,1.)).z-linearDepth(texture2D(uDepth,uv).x);if(gap>=0.)hitHi=mid;else hitLo=mid;}
 vec3 p=origin+direction*hitHi;vec4 clipP=uCameraVP*vec4(p,1.);vec2 uv=clamp(clipP.xy/clipP.w*.5+.5,vec2(.001),vec2(.999));vec3 actual=scenePoint(uv,texture2D(uDepth,uv).x);
 float along=dot(actual-origin,direction);float miss=length(actual-origin-direction*along);float confidence=submergedGeometry(actual)*(1.-smoothstep(.015,.045,miss));
 confidence*=smoothstep(-.015,.015,along)*(1.-smoothstep(maxDistance-.015,maxDistance+.035,along));waterPath=clamp(along,0.,maxDistance);return vec4(texture2D(uScene,uv).rgb,confidence);
 }
 void main(){vec2 uv=gl_FragCoord.xy/uSize;vec2 slope=waveSlope(vWorld.xz,uTime);vec3 n=normalize(vec3(-slope.x,1.,-slope.y));vec3 V=normalize(cameraPosition-vWorld);bool top=vN.y>.5;vec3 color;
 if(top){float depth=max(linearDepth(texture2D(uDepth,uv).x)-vEyeDepth,0.);
 vec3 ray=refract(-V,n,1./1.333);float lo=0.,hi=3.;for(int k=0;k<8;k++){float mid=(lo+hi)*.5;vec3 q=vWorld+ray*mid;if(q.y>bedHeight(q.xz))lo=mid;else hi=mid;}float distanceToBed=(lo+hi)*.5;vec3 hit=vWorld+ray*distanceToBed;
 float inside=1.-smoothstep(2.67,2.795,max(abs(hit.x),abs(hit.z)));vec3 source=hit;source.xz=clamp(source.xz,vec2(-2.79),vec2(2.79));source.y=bedHeight(source.xz);vec4 projected=uCameraVP*vec4(source,1.);vec2 refrUV=clamp(projected.xy/projected.w*.5+.5,vec2(.002),vec2(.998));
 float rd=linearDepth(texture2D(uDepth,refrUV).x);float expectedDepth=-(viewMatrix*vec4(source,1.)).z;float validSample=1.-smoothstep(.035,.18,abs(rd-expectedDepth));if(rd<vEyeDepth+.015)validSample=0.;
 vec3 refr=texture2D(uScene,refrUV).rgb;vec3 fallback=vec3(.73,.68,.51)+vec3(.20,.26,.19)*caustics(hit.xz,uTime);if(uMarineActive){float occluded=submergedGeometry(scenePoint(refrUV,texture2D(uDepth,refrUV).x));if(occluded>.001){fallback=exposedBed(source,fallback);validSample*=1.-occluded;}}refr=mix(fallback,refr,inside*validSample);float marinePath;vec2 opticalSlope=slope*.28+interactionField(vWorld.xz).yz*.72;vec3 opticalRay=refract(-V,normalize(vec3(-opticalSlope.x,1.,-opticalSlope.y)),1./1.333);vec4 marine=marineRay(vWorld,opticalRay,distanceToBed,marinePath);refr=mix(refr,marine.rgb,marine.a);refr*=vec3(.77,.89,1.);float path=clamp(mix(distanceToBed,marinePath,marine.a),0.,2.2);vec3 transmission=exp(-vec3(2.5,.86,.12)*path);vec3 scatter=vec3(.007,.21,.36);refr=refr*transmission+scatter*(1.-transmission);
 vec2 ruv=vReflect.xy/vReflect.w*.5+.5;ruv+=slope*.023;vec3 refl=texture2D(uReflection,clamp(ruv,.002,.998)).rgb;refl=mix(refl,sky(reflect(-V,n)),.13);float fresnel=.022+.70*pow(1.-max(dot(V,n),0.),4.5);color=mix(refr,refl,fresnel);
 vec3 H=normalize(V+normalize(vec3(-.35,.86,-.9)));float spec=pow(max(dot(n,H),0.),400.);color+=vec3(1.,.96,.82)*spec*.11;
 // A soft shore break follows the actual bathymetry, rather than a fixed white ring.
 float waterDepth=.38+waveHeight(vWorld.xz,uTime)-bedHeight(vWorld.xz);float shore=exp(-pow((waterDepth-.024)/.018,2.));float broken=smoothstep(.38,.76,noise2(vWorld.xz*19.+uTime*.09));color=mix(color,vec3(.82,.89,.79),shore*broken*.12);float rim=1.-smoothstep(.001,.008,2.8-max(abs(vWorld.x),abs(vWorld.z)));color+=rim*vec3(.16,.22,.20);
 }else{vec3 sideN=normalize(vN+vec3(slope.x*.06,0.,slope.y*.06));vec3 ray=refract(-V,sideN,1./1.333);float lo=0.,hi=5.;for(int k=0;k<9;k++){float mid=(lo+hi)*.5;vec3 q=vWorld+ray*mid;if(q.y>bedHeight(q.xz))lo=mid;else hi=mid;}float distanceToBed=(lo+hi)*.5;vec3 hit=vWorld+ray*distanceToBed;
 float sandRipple=.02*sin(hit.x*27.+sin(hit.z*6.));vec3 sand=vec3(.33,.38,.28)*(1.+(noise2(hit.xz*90.)-.5)*.05+sandRipple);float ca=caustics(hit.xz,uTime);sand+=vec3(.32,.41,.29)*ca*.22;float marinePath;vec4 marine=marineRay(vWorld,ray,distanceToBed,marinePath);sand=mix(sand,marine.rgb*vec3(.77,.89,1.),marine.a);float path=clamp(mix(distanceToBed,marinePath,marine.a),.15,3.5);vec3 tr=exp(-vec3(2.8,.42,.24)*path);color=sand*tr+vec3(.013,.20,.25)*(1.-tr);
 // Waterline and corners catch a narrow Fresnel highlight.
 float yWave=.38+waveHeight(vWorld.xz,uTime);float rim=exp(-abs(vWorld.y-yWave)*150.);float edge=pow(1.-abs(dot(V,sideN)),4.);color=mix(color,vec3(.70,.87,.86),.045+edge*.18);color+=rim*vec3(.35,.55,.53)*.55;
 }
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`;
 const material=new T.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,side:T.FrontSide});
 const group=new T.Group();scene.add(group);const topGeo=new T.PlaneGeometry(SIZE,SIZE,160,160);topGeo.rotateX(-Math.PI/2);topGeo.translate(0,WATER,0);const top=new T.Mesh(topGeo,material);top.renderOrder=3;group.add(top);
 const positions=[],normals=[],indices=[];const corners=[[-2.8,-2.8],[-2.8,2.8],[2.8,2.8],[2.8,-2.8]];for(let k=0;k<4;k++){const a=corners[k],b=corners[(k+1)%4];const nx=-(b[1]-a[1])/SIZE,nz=(b[0]-a[0])/SIZE;for(let j=0;j<=128;j++){const t=j/128;positions.push(a[0]+(b[0]-a[0])*t,-.322,a[1]+(b[1]-a[1])*t,a[0]+(b[0]-a[0])*t,WATER,a[1]+(b[1]-a[1])*t);normals.push(nx,0,nz,nx,0,nz);if(j<128){const o=k*258+j*2;indices.push(o,o+2,o+1,o+1,o+2,o+3)}}}
 const sg=new T.BufferGeometry();sg.setAttribute('position',new T.Float32BufferAttribute(positions,3));sg.setAttribute('normal',new T.Float32BufferAttribute(normals,3));sg.setIndex(indices);const sides=new T.Mesh(sg,material);sides.renderOrder=2;group.add(sides);
 const oldClear=new T.Color();let frame=0;function render(lookAt,moving){
 // Synchronize the post-input camera pose before deriving the refraction matrix.
 // The depth/color passes below must use this exact same pose.
 camera.updateMatrixWorld(true);uniforms.uCameraVP.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);uniforms.uCameraInvVP.value.copy(uniforms.uCameraVP.value).invert();group.visible=false;renderer.getClearColor(oldClear);const prevTone=renderer.toneMapping;renderer.toneMapping=T.NoToneMapping;renderer.clippingPlanes=[underClip];renderer.setRenderTarget(refraction);renderer.render(scene,camera);renderer.clippingPlanes=[];
 if(frame++%2===0||moving){mirrorCamera.position.copy(camera.position);mirrorCamera.position.y=2*WATER-camera.position.y;mirrorCamera.up.set(0,-1,0);const target=lookAt.clone();target.y=2*WATER-lookAt.y;mirrorCamera.lookAt(target);mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);mirrorCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);mirrorCamera.updateMatrixWorld();mirrorMatrix.multiplyMatrices(mirrorCamera.projectionMatrix,mirrorCamera.matrixWorldInverse);renderer.clippingPlanes=[clip];renderer.setRenderTarget(reflection);renderer.render(scene,mirrorCamera);renderer.clippingPlanes=[];}
 renderer.toneMapping=prevTone;group.visible=true;renderer.setRenderTarget(null);renderer.render(scene,camera);}
 function resize(w,h){refraction.setSize(w,h);reflection.setSize(Math.max(1,Math.round(w*.55)),Math.max(1,Math.round(h*.55)));uniforms.uSize.value.set(w,h);}
 function setMarineActive(active){uniforms.uMarineActive.value=!!active;}
 return {group,render,resize,setMarineActive};
}
