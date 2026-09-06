import * as THREE from './vendor/three.module.min.js';
import {segments,TAU} from './wheel-core.js';
import {annularSurface,BOWL_PROFILE,CONE_PROFILE,BALL_RADIUS} from './physics.js';
import {DEFAULT_PITCH,dragView,frontYaw} from './view-core.js';
import {CasinoRoom} from './room.js';

function woodTexture(){
 const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d');ctx.fillStyle='#493527';ctx.fillRect(0,0,1024,1024);
 for(let y=0;y<1024;y++){const grain=Math.sin(y*.17+Math.sin(y*.019)*7)+Math.sin(y*1.6)*.28;ctx.strokeStyle=`rgba(${grain>0?'139,102,67':'14,8,4'},${.025+Math.abs(grain)*.035})`;ctx.lineWidth=1;ctx.beginPath();for(let x=0;x<=1024;x+=8){const yy=y+Math.sin(x*.007+y*.011)*10+Math.sin(x*.021)*2;x?ctx.lineTo(x,yy):ctx.moveTo(x,yy)}ctx.stroke()}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
export function makeWheelTexture(size=2048){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const c=canvas.getContext('2d'),r=size/2;c.translate(r,r);
 segments.forEach((seg,i)=>{const a=i/19*TAU-Math.PI/2,b=a+TAU/19;const gold=seg.tier==='gold';c.beginPath();c.arc(0,0,r,a,b);c.arc(0,0,r*(1.72/2.43),b,a,true);c.closePath();const g=c.createRadialGradient(0,0,r*.7,0,0,r);g.addColorStop(0,gold?'#6e4c25':i%2?'#123e3c':'#28382e');g.addColorStop(1,gold?'#c4934b':i%2?'#2c695e':'#4a5f46');c.fillStyle=g;c.fill();
 c.save();c.rotate((i+.5)/19*TAU);c.translate(0,-r*(2.075/2.43));c.rotate(Math.PI);c.fillStyle=gold?'#fff0c4':'#e6ecd0';c.font=`600 ${size*.035}px "PingFang SC","Microsoft YaHei",sans-serif`;c.textAlign='center';c.textBaseline='middle';const chars=Array.from(seg.label.replace('➕','+')),lines=[];for(let k=0;k<chars.length;k+=2)lines.push(chars.slice(k,k+2).join(''));lines.forEach((line,j)=>c.fillText(line,0,(j-(lines.length-1)/2)*size*.038));c.restore();
 });return canvas;
}
export class WheelScene {
 constructor(host,{reduced=false,onStart=()=>{},onEnter=()=>{},onArrive=()=>{}}={}){
  this.host=host;this.onEnter=onEnter;this.onArrive=onArrive;this.roomTarget=new THREE.Vector2();this.roomView=new THREE.Vector2();this.arrived=false;this.reduced=reduced;this.onStart=onStart;this.energy=0;this.viewYaw=0;this.viewPitch=DEFAULT_PITCH;this.velocity=0;this.dragging=false;this.spinActive=false;this.pointers=new Map();this.bursts=[];this.active=true;this.angle=0;this.entered=false;this.zoom=0;this.cameraYaw=0;this.cameraPitch=0;
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(48,1,.1,90);this.camera.position.set(0,8.6,9.3);this.camera.lookAt(0,.05,0);
  this.renderer=new THREE.WebGLRenderer({alpha:false,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia("(max-width:600px)").matches?1.4:1.65));this.renderer.setClearColor(0x070604,1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;host.append(this.renderer.domElement);
  this.scene.add(new THREE.HemisphereLight(0xffebc9,0x18100a,.58));this.scene.fog=new THREE.FogExp2(0x070604,.018);
  this.spot=new THREE.SpotLight(0xffe1a4,200,26,.62,.6,1.5);this.spot.position.set(-.8,9.2,1.8);this.spot.target.position.set(0,0,0);this.spot.castShadow=true;this.spot.shadow.mapSize.set(1024,1024);this.spot.shadow.bias=-.0003;this.spot.shadow.normalBias=.025;this.scene.add(this.spot,this.spot.target);
  const rim=new THREE.DirectionalLight(0xb7d2dd,1.0);rim.position.set(-5,3,-5);this.scene.add(rim);const soft=new THREE.DirectionalLight(0xffc67b,1.8);soft.position.set(5,2,3);this.scene.add(soft);const bounce=new THREE.PointLight(0xf4bc80,18,15,2);bounce.position.set(0,2.3,5);this.scene.add(bounce);
  this.rig=new THREE.Group();this.rig.rotation.order='YXZ';this.scene.add(this.rig);this.rotor=new THREE.Group();this.rig.add(this.rotor);
  this.createEnvironment();const grain=woodTexture();const wood=new THREE.MeshPhysicalMaterial({map:grain,bumpMap:grain,bumpScale:.012,color:0xe1b67f,roughness:.3,metalness:.02,clearcoat:.55,clearcoatRoughness:.22});const brass=new THREE.MeshPhysicalMaterial({color:0xd5ab62,roughness:.23,metalness:1,clearcoat:.25,clearcoatRoughness:.16,envMapIntensity:1.1});const darkBrass=new THREE.MeshStandardMaterial({color:0x5c4b2f,roughness:.35,metalness:.75});const dark=new THREE.MeshStandardMaterial({color:0x101c1e,roughness:.33,metalness:.65});this.brass=brass;
  this.cylinder(3.78,3.55,.66,-.52,wood,this.rig);this.cylinder(3.57,3.32,.18,-.92,dark,this.rig);this.cylinder(2.3,2.65,.26,-1.12,darkBrass,this.rig);
  this.torus(3.72,.065,brass,this.rig,-.72);this.torus(3.78,.042,brass,this.rig,-.28);this.torus(3.43,.018,this.glowMaterial(0x62ffcf,.7),this.rig,-.96);
  const bowl=this.surface([...BOWL_PROFILE,[3.80,1.18],[3.80,-.30],[2.43,-.30],BOWL_PROFILE[0]],wood);bowl.castShadow=true;this.rig.add(bowl);this.torus(3.68,.13,brass,this.rig,1.17);this.torus(3.81,.055,darkBrass,this.rig,1.0);this.torus(3.7,.017,this.glowMaterial(0xffd28b,.9),this.rig,1.24);
  // Machined diamonds are seated on tilted mounting plates, flush with the wooden slope.
  for(let i=0;i<10;i++){
   const a=i/10*TAU,mount=new THREE.Group();mount.position.set(Math.sin(a)*2.86,.287,Math.cos(a)*2.86);mount.rotation.y=a;mount.rotation.x=-Math.atan(.65);
   const foot=new THREE.Mesh(this.beveledBox(.23,.025,.27,.014),darkBrass);foot.position.y=.012;mount.add(foot);
   const m=new THREE.Mesh(this.beveledBox(.12,.14,.18,.022),brass);m.position.y=.08;m.rotation.y=Math.PI/4;m.castShadow=true;m.receiveShadow=true;mount.add(m);
   for(const z of [-.095,.095]){const screw=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.009,12),brass);screw.position.set(0,.032,z);mount.add(screw);const slot=new THREE.Mesh(new THREE.BoxGeometry(.021,.002,.004),dark);slot.position.set(0,.037,z);mount.add(slot)}this.rig.add(mount);
  }
  const floorTexture=new THREE.CanvasTexture(makeWheelTexture());floorTexture.colorSpace=THREE.SRGBColorSpace;floorTexture.anisotropy=this.renderer.capabilities.getMaxAnisotropy();
  const floor=this.surface([[1.72,-.109],[2.43,-.109]],new THREE.MeshStandardMaterial({map:floorTexture,roughness:.66,metalness:.12}),2.43);this.rotor.add(floor);
  this.rotor.add(this.surface([...CONE_PROFILE,[1.72,-.25],[.7,-.25],CONE_PROFILE[0]],wood));this.cylinder(2.43,2.43,.14,-.18,wood,this.rotor);this.torus(2.44,.035,brass,this.rotor,.02);this.torus(1.72,.026,darkBrass,this.rotor,-.09);
  const dividers=new THREE.InstancedMesh(this.beveledBox(.048,.21,.71,.009),brass,19),dummy=new THREE.Object3D();dividers.castShadow=true;dividers.receiveShadow=true;
  for(let i=0;i<19;i++){const a=i/19*TAU;dummy.position.set(Math.sin(a)*2.075,-.005,Math.cos(a)*2.075);dummy.rotation.y=a;dummy.updateMatrix();dividers.setMatrixAt(i,dummy.matrix)}this.rotor.add(dividers);
  this.torus(1.50,.018,brass,this.rotor,.19);this.torus(.94,.028,brass,this.rotor,.53);this.torus(1.15,.008,this.glowMaterial(0x72d5c6,.6),this.rotor,.445);
  const screws=new THREE.InstancedMesh(new THREE.SphereGeometry(.025,8,6),brass,76);for(let i=0;i<76;i++){const a=i/76*TAU;dummy.position.set(Math.sin(a)*3.77,1.04,Math.cos(a)*3.77);dummy.rotation.set(0,0,0);dummy.updateMatrix();screws.setMatrixAt(i,dummy.matrix)}this.rig.add(screws);
  this.cylinder(.76,.85,.12,.64,darkBrass,this.rig);this.torus(.77,.034,brass,this.rig,.71);
  const start=new THREE.TextureLoader().load(new URL('./assets/start.png',import.meta.url).href);start.colorSpace=THREE.SRGBColorSpace;start.anisotropy=this.renderer.capabilities.getMaxAnisotropy();
  this.hubFace=new THREE.Mesh(new THREE.CircleGeometry(.745,80),new THREE.MeshBasicMaterial({map:start,color:0xe7d7b3,toneMapped:false}));this.hubFace.rotation.x=-Math.PI/2;this.hubFace.position.y=.706;this.hubFace.receiveShadow=true;this.rig.add(this.hubFace);
  this.ballMesh=new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS,32,24),new THREE.MeshPhysicalMaterial({color:0xfff6dc,metalness:.12,roughness:.16,clearcoat:1,clearcoatRoughness:.08}));this.ballMesh.castShadow=true;this.ballMesh.position.set(2.65,.69,1.96);this.rig.add(this.ballMesh);
  const ballStripe=new THREE.Mesh(new THREE.TorusGeometry(BALL_RADIUS+.0005,.004,6,48),brass);this.ballMesh.add(ballStripe);
  this.marker=this.surface([[1.72,-.103],[2.43,-.103]],new THREE.MeshBasicMaterial({color:0xffd377,transparent:true,opacity:.42,side:THREE.DoubleSide,depthWrite:false}),2.43,0,TAU/19);this.marker.visible=false;this.rotor.add(this.marker);
  this.glowTexture=this.makeGlowTexture();this.createAtmosphere();this.createRoom();this.room=new CasinoRoom(this.scene,this.brass);this.createBackplate(wood,darkBrass);
  this.raycaster=new THREE.Raycaster();this.pointerNdc=new THREE.Vector2();this.centerButton=host.parentElement.querySelector('.center-start');this.hubPoint=new THREE.Vector3();this.hubNormal=new THREE.Vector3();host.parentElement.classList.add('webgl-ready');
  this.setupInteraction();this.resize();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);document.addEventListener('visibilitychange',()=>{this.active=!document.hidden;this.lastTime=performance.now()});
  this.lastTime=performance.now();this.animate=this.animate.bind(this);this.frame=requestAnimationFrame(this.animate);
 }
 beveledBox(w,h,d,r){const shape=new THREE.Shape(),x=-w/2,y=-d/2;shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);shape.lineTo(x+w,y+d-r);shape.quadraticCurveTo(x+w,y+d,x+w-r,y+d);shape.lineTo(x+r,y+d);shape.quadraticCurveTo(x,y+d,x,y+d-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);const g=new THREE.ExtrudeGeometry(shape,{depth:Math.max(.001,h-r*2),bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:r/2,bevelThickness:r,curveSegments:4});g.rotateX(-Math.PI/2);g.translate(0,-h/2+r,0);g.computeVertexNormals();return g}
 createEnvironment(){
  const studio=new THREE.Scene();studio.background=new THREE.Color(0x17110b);
  const panel=(w,h,x,y,z,color,intensity)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color}));m.material.color.multiplyScalar(intensity);m.position.set(x,y,z);m.lookAt(0,0,0);studio.add(m)};
  panel(3,10,-5,4,2,0xffe1ad,3);panel(2,8,5,3,-3,0xdceaff,2);panel(7,4,0,8,0,0xfff2d0,4);panel(1,5,2,0,6,0xffba63,2);
  const generator=new THREE.PMREMGenerator(this.renderer);this.env=generator.fromScene(studio,.035);this.scene.environment=this.env.texture;generator.dispose();studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});
 }
 createRoom(){
  const walnut=new THREE.MeshStandardMaterial({color:0x17110d,roughness:.42,metalness:.12});
  this.cylinder(2.6,2.85,2.4,-2.25,walnut,this.scene);this.torus(2.8,.07,this.brass,this.scene,-3.4);this.torus(2.6,.045,this.brass,this.scene,-1.2);
  for(let i=0;i<12;i++){const a=i/12*TAU;const trim=new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,2.0,8),this.brass);trim.position.set(Math.sin(a)*2.68,-2.3,Math.cos(a)*2.68);this.scene.add(trim)}

 }
 cylinder(rt,rb,height,y,material,parent){const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,height,128),material);m.position.y=y;m.receiveShadow=true;m.castShadow=true;parent.add(m);return m}
 surface(profile,material,uvRadius=3.8,start=0,length=TAU){
  const data=annularSurface(profile,length<TAU?16:128,start,length),geo=new THREE.BufferGeometry(),uv=[];for(let i=0;i<data.vertices.length;i+=3){const x=data.vertices[i],z=data.vertices[i+2];uv.push(.5+x/(uvRadius*2),.5+z/(uvRadius*2))}
  geo.setAttribute('position',new THREE.Float32BufferAttribute(data.vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(data.indices);geo.computeVertexNormals();

  const m=new THREE.Mesh(geo,material);m.receiveShadow=true;return m;
 }
 torus(r,t,mat,parent,y=0){const m=new THREE.Mesh(new THREE.TorusGeometry(r,t,10,128),mat);m.rotation.x=Math.PI/2;m.position.y=y;m.castShadow=t>.02;m.receiveShadow=true;parent.add(m);return m}
 glowMaterial(color,opacity=1){return new THREE.MeshBasicMaterial({color,transparent:true,opacity,toneMapped:false,depthWrite:false})}
 makeGlowTexture(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#fff');g.addColorStop(.12,'#fff');g.addColorStop(.35,'#ffffff88');g.addColorStop(1,'#ffffff00');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)}
 createBackplate(wood,metal){this.cylinder(3.45,3.45,.06,-.9,wood,this.rig);this.torus(2.8,.025,metal,this.rig,-.94);this.cylinder(.6,.6,.15,-1.06,metal,this.rig)}
 createAtmosphere(){
  // A soft atmospheric light cone shares the spotlight's direction; dust occupies its illuminated volume.
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{uStrength:{value:.6}},vertexShader:'varying vec2 vUv;varying vec3 vN;varying vec3 vP;void main(){vUv=uv;vN=normalMatrix*normal;vec4 p=modelViewMatrix*vec4(position,1.);vP=p.xyz;gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec2 vUv;varying vec3 vN;varying vec3 vP;uniform float uStrength;void main(){float edge=pow(abs(dot(normalize(vN),normalize(-vP))),2.5);float fade=pow(vUv.y,.7)*(1.-vUv.y);gl_FragColor=vec4(1.,.79,.48,edge*fade*uStrength);}'});
  this.beam=new THREE.Mesh(new THREE.CylinderGeometry(.55,3.8,9.2,64,1,true),material);this.beam.position.set(-.4,4.6,.9);this.beam.rotation.z=-.11;this.scene.add(this.beam);
  const positions=new Float32Array(220*3);for(let i=0;i<220;i++){const y=.8+Math.random()*5.6,r=(7.4-y)*.47,a=Math.random()*TAU;positions.set([Math.cos(a)*r*Math.random()-.4,y,Math.sin(a)*r*Math.random()+.6],i*3)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));this.dust=new THREE.Points(g,new THREE.PointsMaterial({color:0xffdaa1,size:.05,map:this.glowTexture,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending}));this.scene.add(this.dust);
 }
 setupInteraction(){const host=this.host;
  const hit=e=>{const r=host.getBoundingClientRect();this.pointerNdc.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);this.raycaster.setFromCamera(this.pointerNdc,this.camera)};
  host.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;if(this.entered&&this.zoom<1)return;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});host.setPointerCapture(e.pointerId);this.dragging=true;this.velocity=0;this.dragDistance=0;host.classList.add('dragging')});
  host.addEventListener('pointermove',e=>{
   if(!this.entered){const r=host.getBoundingClientRect();this.roomTarget.set((e.clientX-r.left)/r.width-.5,(e.clientY-r.top)/r.height-.5);}
   if(!this.pointers.has(e.pointerId))return;const p=this.pointers.get(e.pointerId),dx=e.clientX-p.x,dy=e.clientY-p.y;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.dragDistance+=Math.hypot(dx,dy);if(!this.entered)return;
   const v=dragView(this.viewYaw,this.viewPitch,dx,dy,host.clientWidth);this.viewYaw=v.yaw;this.viewPitch=Math.max(-.25,Math.min(.80,v.pitch));this.velocity=this.reduced?0:dx/Math.max(host.clientWidth,240)*TAU*.3;
  });
  host.addEventListener('pointerleave',()=>this.roomTarget.set(0,0));
  const finish=e=>{if(!this.pointers.has(e.pointerId))return;this.pointers.delete(e.pointerId);this.dragging=this.pointers.size>0;if(!this.dragging)host.classList.remove('dragging');if(e.type==='pointerup'&&this.dragDistance<7&&!this.spinActive){hit(e);if(!this.entered){if(this.raycaster.intersectObjects([this.rig,this.beam],true).length)this.onEnter()}else if(this.zoom===1&&this.raycaster.intersectObject(this.hubFace).length)this.onStart()}if(e.type==='pointercancel')this.velocity=0};
  host.addEventListener('pointerup',finish);host.addEventListener('pointercancel',finish);host.addEventListener('lostpointercapture',finish);
  host.addEventListener('keydown',e=>{
   if(!this.entered){if(e.key==='Enter'||e.key===' '){e.preventDefault();this.onEnter()}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();this.roomTarget.x=Math.max(-.5,Math.min(.5,this.roomTarget.x+(e.key==='ArrowLeft'?-.1:e.key==='ArrowRight'?.1:0)));this.roomTarget.y=Math.max(-.5,Math.min(.5,this.roomTarget.y+(e.key==='ArrowUp'?-.1:e.key==='ArrowDown'?.1:0)))}return}if(this.zoom<1)return;
   const keys={ArrowLeft:[-.18,0],ArrowRight:[.18,0],ArrowUp:[0,-.12],ArrowDown:[0,.12]};if(keys[e.key]){e.preventDefault();this.velocity=0;this.viewYaw+=keys[e.key][0];this.viewPitch=Math.max(-.25,Math.min(.80,this.viewPitch+keys[e.key][1]))}else if(e.key==='Home'){e.preventDefault();this.resetView()}else if(e.key==='Enter'||e.key===' '){e.preventDefault();this.onStart()}
  });
 }

 enter(){this.entered=true}
 resetView(){this.velocity=0;this.viewYaw=frontYaw(this.cameraYaw);this.viewPitch=DEFAULT_PITCH}
 setSpinning(value){this.spinActive=value;if(value){this.resetView();this.marker.visible=false;this.clearBursts()}}
 setAngle(angle){this.angle=angle;this.rotor.rotation.y=angle}
 updatePhysics(sim){this.renderer.shadowMap.needsUpdate=true;this.setAngle(sim.angle);this.ballMesh.position.copy(sim.ball.position);this.ballMesh.quaternion.copy(sim.ball.quaternion);this.host.dataset.ballPocket=String(sim.lastPocket);this.host.dataset.physicsTime=sim.time.toFixed(2);this.host.dataset.ballHeight=sim.ball.position.y.toFixed(3)}
 setEnergy(e){this.energy=e;this.spot.intensity=200+e*35;this.beam.material.uniforms.uStrength.value=.6+e*.12}
 setReduced(r){this.reduced=r;this.dust.visible=!r;this.velocity=0;if(r)this.clearBursts()}
 celebrate(gold,index){this.marker.rotation.y=index*TAU/19;this.marker.visible=true;this.marker.material.color.set(gold?0xffc66a:0x74efc8);if(this.reduced)return;const count=gold?160:100,positions=new Float32Array(count*3),vel=new Float32Array(count*3);for(let i=0;i<count;i++){const a=Math.random()*TAU,s=.5+Math.random()*2;positions.set([this.ballMesh.position.x,.3,this.ballMesh.position.z],i*3);vel.set([Math.cos(a)*s,1+Math.random()*3,Math.sin(a)*s],i*3)}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));const p=new THREE.Points(geo,new THREE.PointsMaterial({color:gold?0xffd38a:0x98ffe1,size:.07,map:this.glowTexture,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));this.rig.add(p);this.bursts.push({p,vel,age:0})}
 clearBursts(){for(const b of this.bursts){this.rig.remove(b.p);b.p.geometry.dispose();b.p.material.dispose()}this.bursts=[]}
 resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix()}
 animate(now){this.frame=requestAnimationFrame(this.animate);if(!this.active){this.lastTime=now;return;}if(!this.spinActive&&!this.dragging&&(!this.entered||this.zoom===1)&&Math.abs(this.velocity)<.001&&now-this.lastTime<1000/30)return;const dt=Math.min((now-this.lastTime)/1000,.05);this.lastTime=now;if(!this.dragging&&!this.reduced&&!this.spinActive){this.viewYaw+=this.velocity*dt*60;this.velocity*=Math.exp(-dt*7)}const blend=this.reduced?1:1-Math.exp(-dt*10);this.cameraYaw+=(this.viewYaw-this.cameraYaw)*blend;this.cameraPitch+=(this.viewPitch-this.cameraPitch)*blend;
  if(this.entered)this.zoom=Math.min(1,this.zoom+dt/(this.reduced?.05:2.3));
  const t=this.zoom,z=t*t*t*(t*(t*6-15)+10),aspect=this.camera.aspect;
  this.roomView.lerp(this.reduced?new THREE.Vector2():this.roomTarget,1-Math.exp(-dt*3));
  const framedDistance=aspect<1?11.8/aspect**.77:11.2,elevation=.70+this.cameraPitch;
  const distance=Math.min(framedDistance,14.5,10.5/Math.sin(elevation),8.4/Math.cos(elevation));
  this.camera.fov=THREE.MathUtils.lerp(48,2*Math.atan(Math.tan(24*Math.PI/180)*framedDistance/distance)*180/Math.PI,z);this.camera.updateProjectionMatrix();
  const close=new THREE.Vector3(Math.sin(-this.cameraYaw)*Math.cos(elevation)*distance,Math.sin(elevation)*distance,Math.cos(-this.cameraYaw)*Math.cos(elevation)*distance);
  const far=new THREE.Vector3(4.0+this.roomView.x*.55,10.0-this.roomView.y*.25,aspect<.65?30:26);
  this.camera.position.lerpVectors(far,close,z);this.camera.lookAt(new THREE.Vector3(.1,.6,-3).lerp(new THREE.Vector3(0,.15,0),z));
  if(t===1&&!this.arrived){this.arrived=true;this.onArrive()}
  this.host.dataset.stage=!this.entered?'room':this.zoom<1?'approaching':'table';this.host.dataset.cameraPosition=this.camera.position.toArray().map(x=>x.toFixed(2)).join(',');

  if(!this.reduced){const pos=this.dust.geometry.attributes.position;for(let i=0;i<pos.count;i++){pos.array[i*3]+=.00012*Math.sin(now*.0003+i);pos.array[i*3+1]+=dt*.025;if(pos.array[i*3+1]>6.4)pos.array[i*3+1]=.8}pos.needsUpdate=true;this.dust.material.opacity=.65+Math.sin(now*.0005)*.08}
  for(const b of this.bursts){b.age+=dt;const p=b.p.geometry.attributes.position;for(let i=0;i<p.count;i++){b.vel[i*3+1]-=dt*2;p.array[i*3]+=b.vel[i*3]*dt;p.array[i*3+1]+=b.vel[i*3+1]*dt;p.array[i*3+2]+=b.vel[i*3+2]*dt}p.needsUpdate=true;b.p.material.opacity=Math.max(0,1-b.age/2)}if(this.bursts.some(b=>b.age>2.2))this.clearBursts();
  this.host.dataset.viewYaw=this.cameraYaw.toFixed(3);this.host.dataset.viewPitch=this.cameraPitch.toFixed(3);this.renderer.render(this.scene,this.camera);this.host.dataset.drawCalls=String(this.renderer.info.render.calls);this.host.dataset.triangles=String(this.renderer.info.render.triangles);
  if(this.centerButton){this.hubPoint.set(0,.73,0);this.rig.localToWorld(this.hubPoint);const normal=new THREE.Vector3(0,1,0).transformDirection(this.rig.matrixWorld),visible=normal.dot(this.camera.position.clone().sub(this.hubPoint).normalize())>.15;this.hubPoint.project(this.camera);this.centerButton.style.left=`${(this.hubPoint.x+1)*.5*this.host.clientWidth+this.host.offsetLeft}px`;this.centerButton.style.top=`${(1-this.hubPoint.y)*.5*this.host.clientHeight+this.host.offsetTop}px`;this.centerButton.style.width=`${this.host.clientHeight*.18}px`;this.centerButton.style.height=`${this.host.clientHeight*.14}px`;this.centerButton.style.visibility=visible?'visible':'hidden'}
 }
}
