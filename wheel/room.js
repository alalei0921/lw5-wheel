import * as THREE from './vendor/three.module.min.js';
// A shallow relief preserves the supplied portrait, including the character's hair and clothes.
// Movement is deliberately bounded: unseen room surfaces are never exposed.
export class CasinoRoom {
 constructor(host,{reduced=false,onEnter=()=>{}}={}){
  this.host=host;this.reduced=reduced;this.onEnter=onEnter;this.target=new THREE.Vector2();this.current=new THREE.Vector2();this.entering=false;this.progress=0;
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(38,1,.1,50);this.camera.position.z=12;
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.outputColorSpace=THREE.SRGBColorSpace;host.append(this.renderer.domElement);
  const texture=new THREE.TextureLoader().load('./assets/casino-room.jpg');texture.colorSpace=THREE.SRGBColorSpace;
  const geometry=new THREE.PlaneGeometry(7.2,12.8,100,180),p=geometry.attributes.position;
  const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
  for(let i=0;i<p.count;i++){const x=p.getX(i)/7.2+.5,y=.5-p.getY(i)/12.8;let z=.1+Math.pow(y,3)*.65;
   // Foreground chair/table and left column sit forward; rear figure remains a coherent relief.
   z+=smooth(.68,.83,y)*.35;z+=(1-smooth(.15,.23,x))*.20;
   const person=smooth(.635,.68,x)*(1-smooth(.79,.82,x))*smooth(.30,.33,y)*(1-smooth(.55,.57,y));z+=person*.16;
   const wheel=Math.exp(-((x-.36)**2/.13+(y-.65)**2/.014));z+=wheel*.34;p.setZ(i,z);
  }
  geometry.computeVertexNormals();this.photo=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture}));this.scene.add(this.photo);
  const count=160,positions=new Float32Array(count*3);for(let i=0;i<count;i++){const y=.7+Math.random()*4.7;positions.set([-1.4+(Math.random()-.5)*(6-y)*.33,y,.7+Math.random()*.8],i*3)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));this.dust=new THREE.Points(g,new THREE.PointsMaterial({color:0xffe2aa,size:.018,transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending}));this.scene.add(this.dust);
  host.addEventListener('pointermove',e=>{if(this.entering||this.reduced)return;const r=host.getBoundingClientRect();this.target.set((e.clientX-r.left)/r.width-.5,(e.clientY-r.top)/r.height-.5)});host.addEventListener('pointerleave',()=>this.target.set(0,0));
  this.ray=new THREE.Raycaster();host.addEventListener('click',e=>{const r=host.getBoundingClientRect(),ndc=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);this.ray.setFromCamera(ndc,this.camera);const hit=this.ray.intersectObject(this.photo)[0];if(!hit)return;const u=hit.uv.x,v=1-hit.uv.y;if((u<.72&&v>.51&&v<.82)||(u>.18&&u<.51&&v>.08&&v<.57))this.enter()});
  host.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.enter()}});
  this.resize();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.last=performance.now();this.tick=this.tick.bind(this);this.frame=requestAnimationFrame(this.tick);
 }
 enter(){if(this.entering)return;this.entering=true;this.host.setAttribute('aria-busy','true');document.body.classList.add('approaching');this.onEnter()}
 resize(){const w=this.host.clientWidth,h=this.host.clientHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();const ratio=w/h;this.distance=19.4;this.camera.position.z=this.distance;}
 tick(now){this.frame=requestAnimationFrame(this.tick);const dt=Math.min((now-this.last)/1000,.05);this.last=now;if(document.hidden||this.progress>=1)return;
  this.current.lerp(this.target,1-Math.exp(-dt*3));if(this.entering)this.progress=Math.min(1,this.progress+dt/(this.reduced?.05:1.65));const t=this.progress,tween=t*t*(3-2*t);
  this.camera.position.set(this.current.x*.20-tween*.9,-this.current.y*.12-tween*1.85,this.distance-tween*(this.distance-5));this.camera.lookAt(-tween*.9,-tween*1.85,0);
  this.host.style.opacity=String(1-Math.max(0,(t-.58)/.42));if(!this.reduced){const p=this.dust.geometry.attributes.position;for(let i=0;i<p.count;i++){p.array[i*3]+=.003*dt*Math.sin(i+now*.0004);p.array[i*3+1]+=dt*.027;if(p.array[i*3+1]>5.5)p.array[i*3+1]=.7}p.needsUpdate=true;}this.renderer.render(this.scene,this.camera);
 }
 dispose(){cancelAnimationFrame(this.frame);this.observer.disconnect();this.renderer.dispose();this.scene.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose()}})}
}
