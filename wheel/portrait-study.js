import * as THREE from './vendor/three.module.min.js';
import {sensorView,dragPortrait,clamp} from './portrait-core.js';
const $=id=>document.getElementById(id),host=$('portrait'),hint=$('hint'),motion=$('motion');
const DIST=3.2,FIT=.94,PHOTO_WIDTH=1.6,PHOTO_HEIGHT=2;
let renderer,camera,scene,frame,ready=false,comparison=false,visible=!document.hidden;
let yaw=0,pitch=0,targetYaw=0,targetPitch=0,zoom=1,targetZoom=1,lastRender=0;
let motionOn=false,pending=false,base=null,lastSensor=null,sensorTimer=null,needsRender=true;
const points=new Map();let pinchDistance=0;
const screenAngle=()=>screen.orientation?.angle??window.orientation??0;
function message(text){hint.textContent=text;}
function stopMotion(text){motionOn=false;pending=false;clearTimeout(sensorTimer);window.removeEventListener('deviceorientation',orientation);motion.disabled=!ready;motion.textContent='开启体感';motion.setAttribute('aria-pressed','false');host.dataset.motion='off';if(text)message(text)}
function orientation(e){
 if(!Number.isFinite(e.beta)||!Number.isFinite(e.gamma))return;
 lastSensor={beta:e.beta,gamma:e.gamma};if(!base)base={...lastSensor};
 const v=sensorView(e.beta,e.gamma,base,screenAngle());if(!v)return;
 if(pending){pending=false;motionOn=true;clearTimeout(sensorTimer);motion.disabled=false;motion.textContent='体感已开启';motion.setAttribute('aria-pressed','true');message('轻轻倾斜手机 · 点击归正可重新校准');host.dataset.motion='on';}
 if(motionOn&&!comparison){targetYaw=v.yaw;targetPitch=v.pitch;needsRender=true;}
}
motion.addEventListener('click',async()=>{
 if(!ready||pending)return;if(motionOn){stopMotion('拖动查看 · 双指放大');return;}
 if(!window.isSecureContext){message('体感需要安全连接，可先拖动查看');return;}
 if(!('DeviceOrientationEvent' in window)){message('当前设备不支持体感，可拖动查看');return;}
 pending=true;motion.disabled=true;motion.textContent='等待授权';
 try{
  // The permission request stays directly inside this user click; do not await anything first.
  const request=window.DeviceOrientationEvent.requestPermission;
  if(typeof request==='function'){
   const permission=await window.DeviceOrientationEvent.requestPermission();
   if(permission!=='granted'){stopMotion('没有获得体感权限，仍可拖动查看');return;}
  }
  base=null;targetYaw=targetPitch=0;window.addEventListener('deviceorientation',orientation,{passive:true});
  motion.textContent='连接体感';message('轻轻倾斜一下手机');
  sensorTimer=setTimeout(()=>{if(pending)stopMotion('这里未收到体感数据，可先拖动查看');},3500);
 }catch(error){stopMotion('此打开方式暂不能启用体感，可先拖动查看');}
});
function reset(){targetYaw=targetPitch=0;targetZoom=1;$('original').style.transform=`scale(${FIT})`;base=null;needsRender=true;message(motionOn?'已重新校准，轻轻倾斜手机':'已归正 · 拖动查看，双指放大');}
$('reset').addEventListener('click',reset);
$('compare').addEventListener('click',()=>{
 comparison=!comparison;host.classList.toggle('comparing',comparison);$('comparison').hidden=!comparison;$('compare').setAttribute('aria-pressed',String(comparison));$('compare').textContent=comparison?'返回空间':'对比原图';
 $('original').style.transform=`scale(${FIT*zoom})`;host.dataset.comparison=String(comparison);
 message(comparison?'这是你上传的原图':motionOn?'轻轻倾斜手机':'拖动查看 · 双指放大');needsRender=true;
});
host.addEventListener('pointerdown',e=>{
 if(!ready||comparison||(e.pointerType==='mouse'&&e.button!==0))return;
 if(motionOn||pending)stopMotion('已切换为手动查看');
 host.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(points.size===2){const [a,b]=[...points.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);}
});
host.addEventListener('pointermove',e=>{
 const old=points.get(e.pointerId);if(!old)return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(points.size===2){const [a,b]=[...points.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinchDistance>0)targetZoom=clamp(targetZoom*d/pinchDistance,1,1.65);pinchDistance=d;}
 else{const v=dragPortrait(targetYaw,targetPitch,e.clientX-old.x,e.clientY-old.y,host.clientWidth,host.clientHeight);targetYaw=v.yaw;targetPitch=v.pitch;}
 needsRender=true;
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])host.addEventListener(name,e=>{points.delete(e.pointerId);if(points.size<2)pinchDistance=0;});
host.addEventListener('wheel',e=>{if(!ready||comparison)return;e.preventDefault();targetZoom=clamp(targetZoom-e.deltaY*.001,1,1.65);needsRender=true;},{passive:false});
host.addEventListener('keydown',e=>{
 if(!ready||comparison)return;const offsets={ArrowLeft:[-.8,0],ArrowRight:[.8,0],ArrowUp:[0,-.6],ArrowDown:[0,.6]};
 if(offsets[e.key]){e.preventDefault();if(motionOn)stopMotion();const v=offsets[e.key];targetYaw=clamp(targetYaw+v[0],-4,4);targetPitch=clamp(targetPitch+v[1],-3,3);needsRender=true;}
 else if(e.key==='Home'){e.preventDefault();reset();}else if(e.key==='+'||e.key==='='){targetZoom=clamp(targetZoom+.1,1,1.65);needsRender=true;}else if(e.key==='-'){targetZoom=clamp(targetZoom-.1,1,1.65);needsRender=true;}
});
window.addEventListener('orientationchange',()=>{base=null;targetYaw=targetPitch=0;needsRender=true;});
document.addEventListener('visibilitychange',()=>{visible=!document.hidden;if(visible){base=null;needsRender=true;}});
function resize(){if(!renderer)return;renderer.setSize(host.clientWidth,host.clientHeight,false);camera.aspect=host.clientWidth/host.clientHeight;needsRender=true;}
function animate(now){
 frame=requestAnimationFrame(animate);if(!visible||!renderer)return;
 const dt=Math.min((now-lastRender)/1000,.05);if(now-lastRender<1000/45)return;lastRender=now;
 const b=1-Math.exp(-dt*9),oldYaw=yaw,oldPitch=pitch,oldZoom=zoom;
 yaw+=(targetYaw-yaw)*b;pitch+=(targetPitch-pitch)*b;zoom+=(targetZoom-zoom)*b;
 if(Math.abs(yaw-targetYaw)<.0001)yaw=targetYaw;if(Math.abs(pitch-targetPitch)<.0001)pitch=targetPitch;
 if(!needsRender&&Math.abs(oldYaw-yaw)+Math.abs(oldPitch-pitch)+Math.abs(oldZoom-zoom)<.00003)return;
 camera.fov=2*Math.atan(Math.max(PHOTO_HEIGHT/2,PHOTO_WIDTH/2/camera.aspect)/(DIST*FIT*zoom))*180/Math.PI;camera.updateProjectionMatrix();
 const y=yaw*Math.PI/180,p=pitch*Math.PI/180;camera.position.set(Math.sin(y)*Math.cos(p)*DIST,Math.sin(p)*DIST,Math.cos(y)*Math.cos(p)*DIST);camera.lookAt(0,0,0);
 renderer.render(scene,camera);host.dataset.yaw=yaw.toFixed(3);host.dataset.pitch=pitch.toFixed(3);host.dataset.zoom=zoom.toFixed(3);host.dataset.triangles=String(renderer.info.render.triangles);needsRender=false;
}
async function init(){
 motion.disabled=true;
 try{
  const [meta,buffer,photo]=await Promise.all([fetch('./assets/spatial/depth.json').then(r=>{if(!r.ok)throw Error('depth metadata');return r.json()}),fetch('./assets/spatial/depth.bin').then(r=>{if(!r.ok)throw Error('depth data');return r.arrayBuffer()}),new THREE.TextureLoader().loadAsync('./assets/spatial/reference.jpg')]);
  if(buffer.byteLength!==meta.width*meta.height*2)throw Error('Incomplete depth field');
  const depth=new DataView(buffer),sample=(x,y)=>depth.getUint16((y*meta.width+x)*2,true)/65535;
  const smoothDepth=(u,v)=>{
   const x=u*(meta.width-1),y=v*(meta.height-1),x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0;
   const x1=Math.min(x0+1,meta.width-1),y1=Math.min(y0+1,meta.height-1);
   return (sample(x0,y0)*(1-tx)+sample(x1,y0)*tx)*(1-ty)+(sample(x0,y1)*(1-tx)+sample(x1,y1)*tx)*ty;
  };
  photo.colorSpace=THREE.SRGBColorSpace;photo.anisotropy=4;photo.generateMipmaps=false;photo.minFilter=THREE.LinearFilter;
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio,1.5),2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0,0);$('webgl').append(renderer.domElement);
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(40,1,.1,20);
  const cols=320,rows=400,positions=[],uvs=[],indices=[];
  for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
   const u=col/cols,v=row/rows;
   const d=smoothDepth(u,v),z=(d-.5)*.42,perspective=(DIST-z)/DIST;
   positions.push((u-.5)*PHOTO_WIDTH*perspective,(.5-v)*PHOTO_HEIGHT*perspective,z);uvs.push(u,1-v);
   if(row<rows&&col<cols){const k=row*(cols+1)+col;indices.push(k,k+cols+1,k+1,k+1,k+cols+1,k+cols+2);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingSphere();
  // Projective texture coordinates preserve the source image exactly at the neutral view.
  const material=new THREE.ShaderMaterial({uniforms:{map:{value:photo}},vertexShader:`varying vec3 vSource;void main(){vSource=vec3(uv*(3.2-position.z),3.2-position.z);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform sampler2D map;varying vec3 vSource;void main(){gl_FragColor=texture2D(map,vSource.xy/vSource.z);#include <colorspace_fragment>}`.replace(';#include',';\n#include'),side:THREE.DoubleSide});
  scene.add(new THREE.Mesh(geometry,material));resize();new ResizeObserver(resize).observe(host);
  ready=true;motion.disabled=false;$('loading').hidden=true;host.classList.add('ready');host.dataset.ready='true';animate(performance.now());
 }catch(error){console.error('Spatial portrait failed to load',error);$('loading').hidden=true;message('空间效果暂未加载，当前显示原图');motion.disabled=true;$('compare').disabled=true;host.dataset.ready='fallback';}
}
init();
