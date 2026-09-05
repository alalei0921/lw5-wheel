import * as THREE from './vendor/three.module.min.js';
import {segments,slice,TAU} from './wheel-core.js';
import {DEFAULT_PITCH,dragView,frontYaw} from './view-core.js';

export function makeWheelTexture(size=2048) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const c=canvas.getContext('2d'),r=size/2; c.translate(r,r);
  segments.forEach((seg,i)=>{
    const a=i*slice-Math.PI/2,b=a+slice,mid=a+slice/2,gold=seg.tier==='gold';
    const gradient=c.createRadialGradient(0,0,r*.19,0,0,r);
    gradient.addColorStop(0,gold?'#494226':i%2?'#082831':'#143e40');
    gradient.addColorStop(.48,gold?'#b29550':i%2?'#13515a':'#276f68');
    gradient.addColorStop(.93,gold?'#ddbd78':i%2?'#317c80':'#65bca1');
    gradient.addColorStop(1,gold?'#a98a40':'#214745');
    c.beginPath();c.moveTo(0,0);c.arc(0,0,r-6,a,b);c.closePath();c.fillStyle=gradient;c.fill();c.strokeStyle=gold?'#eddca688':'#96f1cd55';c.lineWidth=3;c.stroke();
    c.save();c.rotate(mid+Math.PI/2);
    c.fillStyle=gold?'#392f14':'#e4fff5';c.shadowColor=gold?'transparent':'#08261f';c.shadowBlur=3;
    c.font=`600 ${size*.028}px "PingFang SC","Microsoft YaHei",sans-serif`;c.textAlign='center';c.textBaseline='middle';
    const chars=Array.from(seg.label.replace('➕','+'));const space=size*.030;
    chars.forEach((char,j)=>c.fillText(char,0,-r*.79+j*space));
    c.shadowBlur=0;c.fillStyle=gold?'#655024':'#a0e2cd';c.font=`500 ${size*.011}px sans-serif`;c.fillText(String(i+1).padStart(2,'0'),0,-r*.90);
    c.fillStyle=gold?'#ffe6a8':'#8de7c377';c.font=`${size*.018}px serif`;c.fillText(gold?'✦':'·',0,-r*.34);
    c.restore();
  });
  c.beginPath();c.arc(0,0,r*.245,0,TAU);c.fillStyle='#123537';c.fill();
  return canvas;
}

export class WheelScene {
  constructor(host,{reduced=false,onStart=()=>{}}={}) {
    this.host=host;this.reduced=reduced;this.angle=0;this.energy=0;this.viewYaw=0;this.viewPitch=DEFAULT_PITCH;this.velocity=0;this.dragging=false;this.spinActive=false;this.onStart=onStart;this.pointers=new Map();this.bursts=[];this.active=true;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(35,1,.1,100);this.camera.position.set(0,0,11.1);this.camera.lookAt(0,-.1,0);
    this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.8));this.renderer.setClearColor(0x000000,0);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;
    host.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.AmbientLight(0x91d7dd,1));
    const key=new THREE.DirectionalLight(0xe6fff2,2.2);key.position.set(-4,6,8);this.scene.add(key);
    const rim=new THREE.PointLight(0x5affd1,22,20,2);rim.position.set(-4,0,3);this.scene.add(rim);
    const gold=new THREE.PointLight(0xffcd6b,30,25,2);gold.position.set(4,3,3);this.scene.add(gold);
    this.energyLight=new THREE.PointLight(0x72ffcf,0,14,2);this.energyLight.position.set(0,-2,4);this.scene.add(this.energyLight);
    this.rig=new THREE.Group();this.rig.rotation.order="YXZ";this.rig.rotation.x=DEFAULT_PITCH;this.rig.position.y=.13;this.scene.add(this.rig);
    this.rotor=new THREE.Group();this.rig.add(this.rotor);
    const metal=new THREE.MeshStandardMaterial({color:0x576964,metalness:.86,roughness:.27});
    const edgeMetal=new THREE.MeshStandardMaterial({color:0xbdcca9,metalness:.8,roughness:.26});
    const darkMetal=new THREE.MeshStandardMaterial({color:0x152f34,metalness:.8,roughness:.37});
    this.torus(2.85,.13,metal,this.rotor,-.10);
    this.torus(2.81,.028,edgeMetal,this.rotor,.20);
    this.torus(2.65,.024,edgeMetal,this.rotor,.19);
    this.torus(2.85,.014,this.glowMaterial(0x87ffd2,.95),this.rotor,-.13);
    const side=new THREE.Mesh(new THREE.CylinderGeometry(2.79,2.80,.48,128),darkMetal);side.rotation.x=Math.PI/2;side.position.z=-.16;this.rotor.add(side);
    // A fully modeled rear housing, axle, concentric ribs and radial vents.
    const rearCanvas=document.createElement('canvas');rearCanvas.width=rearCanvas.height=1024;const rc=rearCanvas.getContext('2d');rc.translate(512,512);const rg=rc.createRadialGradient(-110,-150,20,0,0,510);rg.addColorStop(0,'#24536a');rg.addColorStop(.65,'#0c2638');rg.addColorStop(1,'#163e4b');rc.fillStyle=rg;rc.beginPath();rc.arc(0,0,512,0,TAU);rc.fill();
    for(let i=0;i<38;i++){rc.save();rc.rotate(i/38*TAU);rc.fillStyle='#040f1e';rc.fillRect(-9,-445,18,86);rc.fillStyle='#4a809033';rc.fillRect(-8,-447,16,3);rc.restore()}
    for(const radius of [260,300,463]){rc.beginPath();rc.arc(0,0,radius,0,TAU);rc.strokeStyle='#7ec4d644';rc.lineWidth=2;rc.stroke()}
    rc.textAlign='center';rc.fillStyle='#93c3ce';rc.font='600 88px sans-serif';rc.fillText('LW & 5',0,-85);rc.font='18px sans-serif';rc.fillStyle='#648da0';rc.fillText('OUR LITTLE UNIVERSE',0,-35);rc.font='15px sans-serif';rc.fillText('GOOD THINGS ARE COMING',0,222);
    const rearTexture=new THREE.CanvasTexture(rearCanvas);rearTexture.colorSpace=THREE.SRGBColorSpace;
    const rear=new THREE.Mesh(new THREE.CircleGeometry(2.76,128),new THREE.MeshStandardMaterial({map:rearTexture,metalness:.45,roughness:.5}));rear.position.z=-.405;rear.rotation.y=Math.PI;this.rotor.add(rear);
    this.torus(2.8,.04,edgeMetal,this.rotor,-.40);this.torus(2.63,.012,this.glowMaterial(0x6fd7ff,.65),this.rotor,-.42);
    const axle=new THREE.Mesh(new THREE.CylinderGeometry(.36,.5,.25,48),metal);axle.rotation.x=Math.PI/2;axle.position.z=-.55;this.rig.add(axle);this.torus(.47,.035,edgeMetal,this.rig,-.64);
    const edgeGrooves=new THREE.InstancedMesh(new THREE.BoxGeometry(.033,.09,.26),edgeMetal,76),eg=new THREE.Object3D();for(let i=0;i<76;i++){const a=i/76*TAU;eg.position.set(Math.sin(a)*2.81,Math.cos(a)*2.81,-.23);eg.rotation.z=-a;eg.updateMatrix();edgeGrooves.setMatrixAt(i,eg.matrix)}this.rotor.add(edgeGrooves);
    // Independent solid wedges give the disc true thickness and reflective bevels.
    segments.forEach((seg,i)=>{
      const start=Math.PI/2-(i+1)*slice+.006,end=Math.PI/2-i*slice-.006,inner=.67,outer=2.65;
      const shape=new THREE.Shape();shape.moveTo(Math.cos(start)*inner,Math.sin(start)*inner);shape.lineTo(Math.cos(start)*outer,Math.sin(start)*outer);shape.absarc(0,0,outer,start,end,false);shape.lineTo(Math.cos(end)*inner,Math.sin(end)*inner);shape.absarc(0,0,inner,end,start,true);shape.closePath();
      const geo=new THREE.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:true,bevelSize:.017,bevelThickness:.025,bevelSegments:2,steps:1,curveSegments:10});
      const mat=new THREE.MeshStandardMaterial({color:seg.tier==='gold'?0xbea363:i%2?0x16434b:0x367768,metalness:.55,roughness:.32});
      this.rotor.add(new THREE.Mesh(geo,mat));
    });
    const texture=new THREE.CanvasTexture(makeWheelTexture());texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=this.renderer.capabilities.getMaxAnisotropy();
    const face=new THREE.Mesh(new THREE.CircleGeometry(2.648,152),new THREE.MeshStandardMaterial({map:texture,metalness:.18,roughness:.57}));face.position.z=.205;this.rotor.add(face);
    const tickGeo=new THREE.BoxGeometry(.021,.065,.024),instance=new THREE.Object3D();
    this.ticks=new THREE.InstancedMesh(tickGeo,edgeMetal,114);this.rotor.add(this.ticks);
    for(let i=0;i<114;i++){const a=i/114*TAU;instance.position.set(Math.sin(a)*2.82,Math.cos(a)*2.82,.22);instance.rotation.set(0,0,-a);instance.updateMatrix();this.ticks.setMatrixAt(i,instance.matrix);this.ticks.setColorAt(i,new THREE.Color(i%6===0?0xc8ffd4:0x7da995));}
    const rivets=new THREE.InstancedMesh(new THREE.SphereGeometry(.035,8,6),this.glowMaterial(0x9fffdc,1),38);this.rotor.add(rivets);
    for(let i=0;i<38;i++){const a=i/38*TAU;instance.position.set(Math.sin(a)*2.935,Math.cos(a)*2.935,-.09);instance.updateMatrix();rivets.setMatrixAt(i,instance.matrix);}
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.80,.84,.24,80),darkMetal);hub.rotation.x=Math.PI/2;hub.position.z=.35;this.rig.add(hub);
    this.torus(.82,.025,edgeMetal,this.rig,.40);
    this.torus(.79,.009,this.glowMaterial(0x8affd1,.8),this.rig,.48);
    const startTexture=new THREE.TextureLoader().load(new URL('./assets/start.png',import.meta.url).href);startTexture.colorSpace=THREE.SRGBColorSpace;startTexture.anisotropy=this.renderer.capabilities.getMaxAnisotropy();
    this.hubFace=new THREE.Mesh(new THREE.CircleGeometry(.80,80),new THREE.MeshBasicMaterial({map:startTexture,toneMapped:false}));this.hubFace.position.z=.49;this.rig.add(this.hubFace);
    this.raycaster=new THREE.Raycaster();this.pointerNdc=new THREE.Vector2();
    const pointerMat=new THREE.MeshStandardMaterial({color:0xffd389,metalness:.6,roughness:.22,emissive:0xa96c1b,emissiveIntensity:.35});
    this.pointer=new THREE.Mesh(new THREE.ConeGeometry(.13,.38,4),pointerMat);this.pointer.rotation.z=Math.PI;this.pointer.rotation.y=Math.PI/4;this.pointer.position.set(0,2.78,.58);this.rig.add(this.pointer);
    const pointerBase=new THREE.Mesh(new THREE.OctahedronGeometry(.13),pointerMat);pointerBase.position.set(0,3.01,.47);this.rig.add(pointerBase);
    this.orbit=new THREE.Group();this.rig.add(this.orbit);
    this.torus(3.2,.008,this.glowMaterial(0x558c88,.55),this.orbit,-.2);
    this.torus(3.37,.007,this.glowMaterial(0x466864,.32),this.orbit,-.3);
    this.arcRing=this.torus(3.2,.019,this.glowMaterial(0x99ffdb,1),this.orbit,-.19,Math.PI*.35);
    this.arcRing2=this.torus(3.37,.013,this.glowMaterial(0xe7c782,.85),this.orbit,-.29,Math.PI*.22);this.arcRing2.rotation.z=Math.PI;
    // The low horizontal halo grounds the floating wheel in space.
    this.platform=new THREE.Group();this.platform.position.set(0,-3.12,-.1);this.platform.rotation.x=Math.PI/2-.04;this.scene.add(this.platform);
    this.torus(2.28,.009,this.glowMaterial(0x68faca,.55),this.platform,0);
    this.torus(1.85,.02,this.glowMaterial(0x3fc599,.15),this.platform,0);
    this.torus(1.1,.007,this.glowMaterial(0x86ffd2,.24),this.platform,0);
    this.glowTexture=this.makeGlowTexture();
    const haloCanvas=document.createElement('canvas');haloCanvas.width=haloCanvas.height=256;const hc=haloCanvas.getContext('2d'),hg=hc.createRadialGradient(128,128,0,128,128,128);hg.addColorStop(0,'#ffffff00');hg.addColorStop(.66,'#ffffff00');hg.addColorStop(.78,'#ffffff08');hg.addColorStop(.86,'#ffffffaa');hg.addColorStop(.92,'#ffffff18');hg.addColorStop(1,'#ffffff00');hc.fillStyle=hg;hc.fillRect(0,0,256,256);
    this.aura=new THREE.Mesh(new THREE.PlaneGeometry(7.1,7.1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(haloCanvas),color:0x59ffc7,transparent:true,opacity:.25,blending:THREE.AdditiveBlending,depthWrite:false}));this.aura.position.z=-.5;this.rig.add(this.aura);
    const streakPositions=new Float32Array(48*6);for(let i=0;i<48;i++){const a=i/48*TAU;streakPositions.set([Math.sin(a)*3.15,Math.cos(a)*3.15,-.4,Math.sin(a)*(3.5+Math.random()*.7),Math.cos(a)*(3.5+Math.random()*.7),-.4],i*6)}const streakGeo=new THREE.BufferGeometry();streakGeo.setAttribute('position',new THREE.BufferAttribute(streakPositions,3));this.streaks=new THREE.LineSegments(streakGeo,new THREE.LineBasicMaterial({color:0x8dffd5,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));this.scene.add(this.streaks);
    const groundGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTexture,color:0x34cca3,transparent:true,opacity:.14,blending:THREE.AdditiveBlending,depthWrite:false}));groundGlow.scale.set(6,1.2,1);groundGlow.position.set(0,-3.0,-.5);this.scene.add(groundGlow);
    this.createStars();this.resize();
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
    this.setupInteraction();
    document.addEventListener('visibilitychange',()=>{this.active=!document.hidden;if(this.active)this.lastTime=performance.now()});
    this.centerButton=host.parentElement.querySelector('.center-start');this.hubPoint=new THREE.Vector3();this.hubEdge=new THREE.Vector3();this.hubNormal=new THREE.Vector3();host.parentElement.classList.add('webgl-ready');
    this.lastTime=performance.now();this.animate=this.animate.bind(this);this.frame=requestAnimationFrame(this.animate);
  }
  setupInteraction(){
    const host=this.host;
    host.addEventListener('pointerdown',e=>{
      if(e.button!==0&&e.pointerType==='mouse')return;
      this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});host.setPointerCapture(e.pointerId);this.dragging=true;this.velocity=0;this.lastDrag={x:e.clientX,y:e.clientY};this.dragDistance=0;host.classList.add('dragging');
    });
    host.addEventListener('pointermove',e=>{
      if(!this.pointers.has(e.pointerId))return;
      const prev=this.pointers.get(e.pointerId),dx=e.clientX-prev.x,dy=e.clientY-prev.y;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      this.dragDistance+=Math.hypot(dx,dy);
      const next=dragView(this.viewYaw,this.viewPitch,dx,dy,host.clientWidth);this.viewYaw=next.yaw;this.viewPitch=next.pitch;this.velocity=this.reduced?0:dx/Math.max(host.clientWidth,240)*TAU*.35;
    });
    const finish=e=>{
      if(!this.pointers.has(e.pointerId))return;
      this.pointers.delete(e.pointerId);this.dragging=this.pointers.size>0;if(!this.dragging)host.classList.remove('dragging');
      if(e.type==='pointerup'&&this.dragDistance<7&&!this.spinActive){const rect=host.getBoundingClientRect();this.pointerNdc.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointerNdc,this.camera);if(this.raycaster.intersectObject(this.hubFace).length)this.onStart()}
      if(e.type==='pointercancel')this.velocity=0;
    };
    host.addEventListener('pointerup',finish);host.addEventListener('pointercancel',finish);host.addEventListener('lostpointercapture',finish);
    host.addEventListener('keydown',e=>{const steps={ArrowLeft:[-.18,0],ArrowRight:[.18,0],ArrowUp:[0,-.14],ArrowDown:[0,.14]};if(steps[e.key]){e.preventDefault();this.velocity=0;this.viewYaw+=steps[e.key][0];this.viewPitch=Math.max(-1.35,Math.min(1.35,this.viewPitch+steps[e.key][1]));}else if(e.key==='Home'){e.preventDefault();this.resetView()}else if(e.key==='Enter'||e.key===' '){e.preventDefault();this.onStart()}});
  }
  resetView(){this.velocity=0;this.viewYaw=frontYaw(this.rig.rotation.y);this.viewPitch=DEFAULT_PITCH;}
  setSpinning(value){this.spinActive=value;if(value)this.resetView();}
  glowMaterial(color,opacity=1){return new THREE.MeshBasicMaterial({color,transparent:true,opacity,toneMapped:false,depthWrite:false})}
  torus(radius,tube,mat,parent,z=0,arc=TAU){const mesh=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,8,arc===TAU?160:60,arc),mat);mesh.position.z=z;parent.add(mesh);return mesh}
  makeGlowTexture(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#fff');g.addColorStop(.1,'#fff');g.addColorStop(.3,'#ffffff88');g.addColorStop(1,'#ffffff00');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)}
  createStars(){const count=180,pos=new Float32Array(count*3),colors=new Float32Array(count*3);for(let i=0;i<count;i++){pos[i*3]=(Math.random()-.5)*12;pos[i*3+1]=(Math.random()-.5)*9;pos[i*3+2]=-1-Math.random()*5;const c=new THREE.Color(i%6===0?0xffd38a:0xa6ebdf);colors.set([c.r,c.g,c.b],i*3)}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));this.stars=new THREE.Points(geo,new THREE.PointsMaterial({size:.035,map:this.glowTexture,transparent:true,opacity:.85,vertexColors:true,blending:THREE.AdditiveBlending,depthWrite:false}));this.scene.add(this.stars)}
  resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  setAngle(angle){this.angle=angle;this.rotor.rotation.z=angle}
  setEnergy(energy){this.energy=energy;this.energyLight.intensity=energy*45;this.aura.material.opacity=.25+energy*.45;this.streaks.material.opacity=energy*.38}
  setReduced(reduced){this.reduced=reduced;if(reduced){this.velocity=0;this.rig.position.y=.13;this.clearBursts()}}
  tick(){this.pointer.scale.set(1,1.16,1)}
  celebrate(gold){if(this.reduced)return;this.clearBursts();const count=gold?280:180,pos=new Float32Array(count*3),vel=new Float32Array(count*3),cols=new Float32Array(count*3);for(let i=0;i<count;i++){const a=Math.random()*TAU,s=1.4+Math.random()*4.5;pos.set([Math.cos(a)*.7,Math.sin(a)*.7,1],i*3);vel.set([Math.cos(a)*s,Math.sin(a)*s,Math.random()*2],i*3);const c=new THREE.Color(gold?(i%3?0xffcd71:0xfff1c3):(i%3?0x85ffcb:0xc8faff));cols.set([c.r,c.g,c.b],i*3)}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(cols,3));const points=new THREE.Points(geo,new THREE.PointsMaterial({size:gold?.12:.09,map:this.glowTexture,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));this.scene.add(points);const ring=this.torus(.8,.015,this.glowMaterial(gold?0xffd585:0x94ffe1,1),this.scene,1);this.bursts.push({points,vel,age:0,ring});}
  clearBursts(){for(const b of this.bursts){this.scene.remove(b.points,b.ring);b.points.geometry.dispose();b.points.material.dispose();b.ring.geometry.dispose();b.ring.material.dispose()}this.bursts=[]}
  animate(now){this.frame=requestAnimationFrame(this.animate);if(!this.active)return;const dt=Math.min((now-this.lastTime)/1000,.05);this.lastTime=now;
    if(!this.dragging&&!this.reduced&&!this.spinActive&&Math.abs(this.velocity)>.00005){this.viewYaw+=this.velocity*dt*60;this.velocity*=Math.exp(-dt*7);}
    const blend=this.reduced?1:1-Math.exp(-dt*15);this.rig.rotation.x+=(this.viewPitch-this.rig.rotation.x)*blend;this.rig.rotation.y+=(this.viewYaw-this.rig.rotation.y)*blend;
    if(!this.reduced){this.rig.position.y=.13+Math.sin(now*.0008)*.035;this.streaks.rotation.z=now*.00004;this.arcRing.rotation.z+=dt*(.12+this.energy*.6);this.arcRing2.rotation.z-=dt*.085;this.stars.rotation.z=now*.000008;}
    this.host.dataset.viewYaw=this.rig.rotation.y.toFixed(3);this.host.dataset.viewPitch=this.rig.rotation.x.toFixed(3);
    this.pointer.scale.y+=(1-this.pointer.scale.y)*.15;
    for(const b of this.bursts){b.age+=dt;const pos=b.points.geometry.attributes.position;for(let i=0;i<pos.count;i++){b.vel[i*3+1]-=dt*.7;pos.array[i*3]+=b.vel[i*3]*dt;pos.array[i*3+1]+=b.vel[i*3+1]*dt;pos.array[i*3+2]+=b.vel[i*3+2]*dt}pos.needsUpdate=true;b.points.material.opacity=Math.max(0,1-b.age/2.8);b.ring.scale.setScalar(1+b.age*4);b.ring.material.opacity=Math.max(0,1-b.age/1.1);}
    if(this.bursts.some(b=>b.age>3))this.clearBursts();
    this.renderer.render(this.scene,this.camera);
    if(this.centerButton){
      this.hubPoint.set(0,0,.52);this.rig.localToWorld(this.hubPoint);this.hubEdge.copy(this.hubPoint);this.hubPoint.project(this.camera);
      this.hubNormal.set(0,0,1).transformDirection(this.rig.matrixWorld);const front=this.hubNormal.dot(this.camera.position.clone().sub(this.hubEdge).normalize())>.15;
      const diameter=this.host.clientHeight*.225;this.centerButton.style.left=`${(this.hubPoint.x+1)*.5*this.host.clientWidth+this.host.offsetLeft}px`;this.centerButton.style.top=`${(1-this.hubPoint.y)*.5*this.host.clientHeight+this.host.offsetTop}px`;this.centerButton.style.width=`${diameter}px`;this.centerButton.style.height=`${diameter}px`;this.centerButton.style.visibility=front?'visible':'hidden';
    }
  }
  dispose(){cancelAnimationFrame(this.frame);this.observer.disconnect();this.clearBursts();this.scene.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose()});this.renderer.dispose();this.renderer.domElement.remove()}
}
