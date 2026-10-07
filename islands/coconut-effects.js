import * as T from './vendor/three.module.min.js';

const MAX_ACTIVE=3,PARTICLE_LIMIT=48,GRAVITY=7.5,STEP=1/120,MAX_FRAME=.1,RETURN_TIME=.4;
// Unit mass, solid-sphere inertia I/(m r²)=2/5. Coulomb impact friction and
// rolling resistance are different coefficients, not per-frame velocity loss.
const INERTIA=.4,IMPACT_FRICTION=.60,FIRST_RESTITUTION=.12,RESTITUTION=.025,ROLL_RESISTANCE=.06,IMPACT_ROLL_RESISTANCE=.40;
const clamp=T.MathUtils.clamp,finite=(n,f=0)=>Number.isFinite(n)?n:f;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453123;return x-Math.floor(x);};

// A small, bounded rigid-body approximation for the nine existing coconuts.
// Coordinates and terrain callbacks use the supplied parent's local frame.
// Conservative bounding spheres contact the real heightfield. Normal impulses
// and bounded tangential friction settle impacts, then gravity drives rolling
// with solid-sphere inertia. Water uses damped buoyancy, not a fluid solver.
export function createCoconutEffects(parent,{
 coconuts=[],bedHeight,waterLevel=.38,extent=5.6,
 sampleSurface=()=>waterLevel,sampleFlow=()=>({x:0,z:0}),disturb=()=>{},
}={}){
 if(!parent?.isObject3D||typeof bedHeight!=='function')throw new TypeError('Coconuts need a Three parent and the actual island bedHeight.');
 if(coconuts.length>9)throw new RangeError('At most nine original coconuts may be registered.');
 const ids=new Set();
 for(const entry of coconuts){
  if(!entry?.mesh?.isMesh||!entry.mesh.parent||ids.has(entry.id))throw new TypeError('Each coconut needs a unique id and an attached original mesh.');
  ids.add(entry.id);
 }
 const root=new T.Group();root.name='coconut-effects';root.userData.role='coconut-effects';parent.add(root);
 const particleGeometry=new T.SphereGeometry(1,7,5);
 const particleMaterial=new T.MeshStandardMaterial({color:'#d9faf6',roughness:.22,transparent:true,opacity:.76,depthWrite:false});
 const droplets=new T.InstancedMesh(particleGeometry,particleMaterial,PARTICLE_LIMIT);
 droplets.name='bounded-coconut-splash';droplets.instanceMatrix.setUsage(T.DynamicDrawUsage);droplets.frustumCulled=false;droplets.count=0;droplets.visible=false;droplets.renderOrder=4;root.add(droplets);
 const particles=Array.from({length:PARTICLE_LIMIT},()=>({life:0,duration:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,size:0}));
 const dummy=new T.Object3D(),position=new T.Vector3();
 const normal=new T.Vector3(),nextNormal=new T.Vector3(),axis=new T.Vector3(),delta=new T.Vector3(),turn=new T.Quaternion();
 const actors=coconuts.map(({id,mesh,treeIndex=0},serial)=>{
  if(!mesh.geometry.boundingSphere)mesh.geometry.computeBoundingSphere();
  return {id,mesh,treeIndex,serial,phase:'attached',age:0,life:8.4+hash(serial+29)*1.8,
   originalParent:mesh.parent,originalIndex:mesh.parent.children.indexOf(mesh),
   originalPosition:mesh.position.clone(),originalQuaternion:mesh.quaternion.clone(),originalScale:mesh.scale.clone(),
   originalMatrix:mesh.matrix.clone(),originalAutoUpdate:mesh.matrixAutoUpdate,
   detachedScale:mesh.scale.clone(),geometryRadius:mesh.geometry.boundingSphere.radius,radius:0,
   x:0,y:0,z:0,vx:0,vy:0,vz:0,wx:0,wy:0,wz:0,landImpacts:0,waterEntries:0,splashed:false,restored:false,
   rollingDistance:0,rotationDistance:0,contactCount:0,contactTime:0,firstContact:null,entry:null,reboundCount:0,maxReboundHeight:0};
 });
 const byId=new Map(actors.map(a=>[a.id,a]));
 let active=0,clock=0,disposed=false,particleCursor=0;
 const stats={drops:0,rejected:0,landImpacts:0,waterEntries:0,disturbances:0,respawns:0,resets:0,maxActive:0,maxParticles:0,clampedFrames:0};
 const surface=(x,z)=>clamp(finite(sampleSurface(x,z),waterLevel),waterLevel-.3,waterLevel+.3);
 const floor=(x,z)=>finite(bedHeight(x,z),waterLevel);

 // Sample the lower hemisphere, including its high-slope shoulder. This is a
 // centre-height constraint, not bed height: every tested surface point stays
 // below the collider. A 2 mm skin prevents grazing the visible sand mesh.
 function supportHeight(x,z,r){
  let support=floor(x,z)+r;
  for(const fraction of [.55,.90]){
   const offset=r*fraction,lift=r*Math.sqrt(1-fraction*fraction);
   for(let i=0;i<8;i++){
    const angle=i*Math.PI/4;
    support=Math.max(support,floor(x+Math.cos(angle)*offset,z+Math.sin(angle)*offset)+lift);
   }
  }
  // Follow the continuous uphill contact as well. Once the ellipsoid rolls,
  // its long axis can point between the eight sampled azimuths; those samples
  // alone are not sufficient to prevent a grazing vertex from entering sand.
  const e=Math.max(.008,r*.12);let qx=x,qz=z;
  for(let i=0;i<4;i++){
   const gx=(floor(qx+e,qz)-floor(qx-e,qz))/(2*e),gz=(floor(qx,qz+e)-floor(qx,qz-e))/(2*e),length=Math.hypot(gx,1,gz);
   qx=x+r*gx/length;qz=z+r*gz/length;
   support=Math.max(support,floor(qx,qz)+Math.sqrt(Math.max(0,r*r-(qx-x)**2-(qz-z)**2)));
  }
  return support+.002;
 }
 function contactNormal(x,z,r,out){
  // Evaluate a continuous terrain normal at the uphill sphere contact point.
  // The support envelope stays conservative; normal direction does not jump
  // when the winning discrete lower-hemisphere support sample changes.
  const e=Math.max(.008,r*.12);let qx=x,qz=z,gx=0,gz=0;
  for(let i=0;i<3;i++){
   gx=(floor(qx+e,qz)-floor(qx-e,qz))/(2*e);gz=(floor(qx,qz+e)-floor(qx,qz-e))/(2*e);
   const length=Math.hypot(gx,1,gz);qx=x+r*gx/length;qz=z+r*gz/length;
  }
  return out.set(-gx,1,-gz).normalize();
 }
 function readAttachedPosition(a){
  a.mesh.updateWorldMatrix(true,false);a.mesh.getWorldPosition(position);parent.worldToLocal(position);
  a.x=position.x;a.y=position.y;a.z=position.z;
  // The original parent chains here have unit scale; preserve correct radii
  // as well if a caller uniformly scales the entire scene parent.
  const local=a.mesh.matrixWorld.clone().premultiply(parent.matrixWorld.clone().invert());
  const scale=new T.Vector3(),quaternion=new T.Quaternion();local.decompose(position,quaternion,scale);
  a.radius=a.geometryRadius*Math.max(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z));
 }
 for(const a of actors)readAttachedPosition(a);

 function restoreTransform(a,scaleFactor=1){
  a.originalParent.add(a.mesh);
  const children=a.originalParent.children,index=children.indexOf(a.mesh);
  children.splice(index,1);children.splice(Math.min(a.originalIndex,children.length),0,a.mesh);
  a.mesh.position.copy(a.originalPosition);a.mesh.quaternion.copy(a.originalQuaternion);a.mesh.scale.copy(a.originalScale).multiplyScalar(scaleFactor);
  a.mesh.matrixAutoUpdate=true;a.mesh.updateMatrix();a.restored=true;
 }
 function finish(a,countRespawn){
  restoreTransform(a);
  a.mesh.matrixAutoUpdate=a.originalAutoUpdate;
  if(!a.originalAutoUpdate)a.mesh.matrix.copy(a.originalMatrix);
  a.phase='attached';a.age=0;a.vx=a.vy=a.vz=a.wx=a.wy=a.wz=0;a.restored=false;
  active=Math.max(0,active-1);if(countRespawn)stats.respawns++;
 }
 function isAttached(id){return !disposed&&byId.get(id)?.phase==='attached';}
 function canDrop(id){return active<MAX_ACTIVE&&isAttached(id);}
 function drop(id){
  if(!canDrop(id)){if(!disposed)stats.rejected++;return false;}
  const a=byId.get(id);readAttachedPosition(a);
  // A released coconut has no invented horizontal launch impulse. Its tree
  // position, contact normal and gravity alone determine its landward path.
  a.vx=a.vz=0;a.vy=-.025;a.wx=a.wy=a.wz=0;
  root.attach(a.mesh);a.mesh.matrixAutoUpdate=true;a.detachedScale.copy(a.mesh.scale);
  a.phase='falling';a.age=0;a.landImpacts=0;a.waterEntries=0;a.splashed=false;a.restored=false;
  a.rollingDistance=a.rotationDistance=a.contactCount=a.contactTime=0;a.firstContact=a.entry=null;
  a.reboundCount=a.maxReboundHeight=0;
  active++;stats.drops++;stats.maxActive=Math.max(stats.maxActive,active);return true;
 }
 function burst(a,y,impact){
  for(let i=0;i<16;i++){
   const p=particles[particleCursor++%PARTICLE_LIMIT],angle=i*Math.PI*2/16+hash(a.serial+8)*2;
   const speed=.12+hash(i+a.serial*17)*.24;
   p.duration=p.life=.30+hash(i+29+a.serial)*.22;
   p.x=a.x+Math.cos(angle)*a.radius*.6;p.y=y+.009;p.z=a.z+Math.sin(angle)*a.radius*.6;
   p.vx=Math.cos(angle)*speed;p.vz=Math.sin(angle)*speed;p.vy=.48+hash(i+77)*.44+Math.min(.2,impact*.025);
   p.size=.009+hash(i+91)*.009;
  }
  stats.maxParticles=Math.max(stats.maxParticles,particles.filter(p=>p.life>0).length);
 }
 function enterWater(a,y){
  a.phase='floating';
  if(!a.splashed){
   const impact=Math.max(0,-a.vy);a.splashed=true;a.waterEntries++;stats.waterEntries++;
   a.entry={age:a.age,x:a.x,y:a.y,z:a.z,rollingDistance:a.rollingDistance,contactTime:a.contactTime};
   disturb(a.x,a.z,.65+Math.min(.35,impact*.06),clamp(a.radius*2,.12,.19));stats.disturbances++;
   burst(a,y,impact);
  }
  // Entry drag removes most impact energy before buoyancy takes over, so a
  // lightweight coconut never shoots below the bed or springs high like gel.
  a.vy=Math.max(-.48,a.vy*.12);a.vx*=.78;a.vz*=.78;
 }
 function spin(a,dt){
  const speed=Math.hypot(a.wx,a.wy,a.wz);
  if(speed>1e-8){axis.set(a.wx,a.wy,a.wz).multiplyScalar(1/speed);turn.setFromAxisAngle(axis,speed*dt);a.mesh.quaternion.premultiply(turn).normalize();}
 }
 function impact(a,n){
  a.landImpacts++;a.contactCount++;stats.landImpacts++;
  const vn=a.vx*n.x+a.vy*n.y+a.vz*n.z;
  if(!a.firstContact)a.firstContact={age:a.age,x:a.x,y:a.y,z:a.z,normal:{x:n.x,y:n.y,z:n.z},normalSpeed:vn};
  // An inelastic normal bounce followed by a Coulomb-limited contact impulse.
  // For a solid sphere, cancelling contact slip needs Jt=-u/(1+1/kappa).
  // Updating both translation and angular momentum avoids applying 5/7 twice.
  const restitution=a.contactCount===1?FIRST_RESTITUTION:RESTITUTION;
  const jn=Math.max(0,-(1+restitution)*vn);
  a.vx+=jn*n.x;a.vy+=jn*n.y;a.vz+=jn*n.z;
  const normalSpeed=a.vx*n.x+a.vy*n.y+a.vz*n.z;
  if(a.contactCount===1)a.firstContact.reboundNormalSpeed=Math.max(0,normalSpeed);
  let ux=a.vx-normalSpeed*n.x+a.radius*(n.y*a.wz-n.z*a.wy);
  let uy=a.vy-normalSpeed*n.y+a.radius*(n.z*a.wx-n.x*a.wz);
  let uz=a.vz-normalSpeed*n.z+a.radius*(n.x*a.wy-n.y*a.wx);
  const slip=Math.hypot(ux,uy,uz),impulse=Math.min(slip*INERTIA/(1+INERTIA),IMPACT_FRICTION*jn);
  if(slip>1e-8){
   const k=-impulse/slip;ux*=k;uy*=k;uz*=k;
   a.vx+=ux;a.vy+=uy;a.vz+=uz;
   a.wx-=(n.y*uz-n.z*uy)/(INERTIA*a.radius);
   a.wy-=(n.z*ux-n.x*uz)/(INERTIA*a.radius);
   a.wz-=(n.x*uy-n.y*ux)/(INERTIA*a.radius);
  }
  // Soft sand has a finite contact patch, rather than a frictionless point
  // bearing. Its bounded impact rolling moment absorbs M<=mu*r*Jn; with the
  // solid sphere's effective rolling mass this gives dv<=mu*Jn/(1+kappa).
  // This only removes incident kinetic energy; it cannot launch, steer or
  // accelerate a coconut towards water. Sustained rolling uses its own much
  // smaller resistance coefficient in roll().
  const tx=a.vx-normalSpeed*n.x,ty=a.vy-normalSpeed*n.y,tz=a.vz-normalSpeed*n.z,tangentSpeed=Math.hypot(tx,ty,tz);
  const retained=tangentSpeed>0?Math.max(0,1-IMPACT_ROLL_RESISTANCE*jn/((1+INERTIA)*tangentSpeed)):0;
  const rx=tx*retained,ry=ty*retained,rz=tz*retained;
  a.vx=rx+normalSpeed*n.x;a.vy=ry+normalSpeed*n.y;a.vz=rz+normalSpeed*n.z;
  a.wx=(n.y*rz-n.z*ry)/a.radius;a.wy=(n.z*rx-n.x*rz)/a.radius;a.wz=(n.x*ry-n.y*rx)/a.radius;
  // Sub-centimetre late bounces become a resting contact rather than jitter.
  if(normalSpeed<.14){
   a.vx-=normalSpeed*n.x;a.vy-=normalSpeed*n.y;a.vz-=normalSpeed*n.z;a.phase='rolling';
  }else a.reboundCount++;
 }
 function roll(a,dt){
  contactNormal(a.x,a.z,a.radius,normal);
  const oldX=a.x,oldY=a.y,oldZ=a.z,vn=a.vx*normal.x+a.vy*normal.y+a.vz*normal.z;
  a.vx-=vn*normal.x;a.vy-=vn*normal.y;a.vz-=vn*normal.z;
  // Static traction is sufficient on this terrain (mu_s=.60; the required
  // ratio for no-slip is 2/7*slope). Only rolling resistance dissipates motion
  // after impact. On a flat plane it can stop the coconut, never seek the sea.
  const factor=GRAVITY/(1+INERTIA);
  a.vx+=factor*normal.y*normal.x*dt;
  a.vy+=factor*(normal.y*normal.y-1)*dt;
  a.vz+=factor*normal.y*normal.z*dt;
  const speed=Math.hypot(a.vx,a.vy,a.vz),resistance=ROLL_RESISTANCE*factor*normal.y*dt;
  const retained=speed>0?Math.max(0,1-resistance/speed):0;
  a.vx*=retained;a.vy*=retained;a.vz*=retained;
  a.x+=a.vx*dt;a.z+=a.vz*dt;edgeClamp(a);a.y=supportHeight(a.x,a.z,a.radius);
  contactNormal(a.x,a.z,a.radius,nextNormal);
  // Roll by actual displacement, excluding normal penetration correction.
  // Both displacement and rotation are in the effect parent's local frame.
  normal.add(nextNormal).normalize();delta.set(a.x-oldX,a.y-oldY,a.z-oldZ);delta.addScaledVector(normal,-delta.dot(normal));
  const distance=delta.length();
  if(distance>1e-10){
   axis.crossVectors(normal,delta).normalize();turn.setFromAxisAngle(axis,distance/a.radius);a.mesh.quaternion.premultiply(turn).normalize();
   a.rollingDistance+=distance;a.rotationDistance+=distance;a.wx=axis.x*distance/(a.radius*dt);a.wy=axis.y*distance/(a.radius*dt);a.wz=axis.z*distance/(a.radius*dt);
  }else a.wx=a.wy=a.wz=0;
  a.contactTime+=dt;
  // Keep centre velocity tangent to the new contact plane for the next step.
  const nextVn=a.vx*nextNormal.x+a.vy*nextNormal.y+a.vz*nextNormal.z;
  a.vx-=nextVn*nextNormal.x;a.vy-=nextVn*nextNormal.y;a.vz-=nextVn*nextNormal.z;
  const water=surface(a.x,a.z);
  if(a.y<water+a.radius*.20&&a.y-a.radius<=water)enterWater(a,water);
 }
 function edgeClamp(a){
  const edge=Math.max(0,extent/2-a.radius-.006);
  const x=clamp(a.x,-edge,edge),z=clamp(a.z,-edge,edge);
  if(x!==a.x)a.vx=0;if(z!==a.z)a.vz=0;a.x=x;a.z=z;
 }
 function integrate(a,dt){
  a.age+=dt;
  if(a.age>=a.life-RETURN_TIME){
   a.phase='returning';
   const t=clamp((a.age-a.life+RETURN_TIME)/RETURN_TIME,0,1);
   if(t<.5)a.mesh.scale.copy(a.detachedScale).multiplyScalar(1-smooth(t*2)*.999);
   else{
    if(!a.restored)restoreTransform(a,.001);
    a.mesh.scale.copy(a.originalScale).multiplyScalar(.001+.999*smooth((t-.5)*2));
   }
   if(t>=1-1e-8)finish(a,true);
   return;
  }
  if(a.phase==='falling'){
   a.vy-=GRAVITY*dt;a.x+=a.vx*dt;a.z+=a.vz*dt;a.y+=a.vy*dt;edgeClamp(a);
   const support=supportHeight(a.x,a.z,a.radius),water=surface(a.x,a.z);
   if(a.contactCount>0)a.maxReboundHeight=Math.max(a.maxReboundHeight,Math.max(0,a.y-support)*contactNormal(a.x,a.z,a.radius,normal).y);
   // Intersect the higher of water and solid terrain first. Only locations
   // deep enough for this radius may become floating coconuts.
   const canFloat=support<water+a.radius*.20;
   if(canFloat&&a.y-a.radius<=water&&a.vy<0)enterWater(a,water);
   else if(a.y<=support){a.y=support;impact(a,contactNormal(a.x,a.z,a.radius,normal));}
   a.y=Math.max(a.y,support);
   if(a.phase!=='rolling')spin(a,dt);
  }else if(a.phase==='rolling')roll(a,dt);
  else if(a.phase==='floating'){
   const flow=sampleFlow(a.x,a.z)||{},response=1-Math.exp(-dt*2.3);
   a.vx+=(clamp(finite(flow.x),-.8,.8)*.55-a.vx)*response;
   a.vz+=(clamp(finite(flow.z),-.8,.8)*.55-a.vz)*response;
   const oldX=a.x,oldZ=a.z;
   a.x+=a.vx*dt;a.z+=a.vz*dt;edgeClamp(a);
   let water=surface(a.x,a.z),support=supportHeight(a.x,a.z,a.radius);
   if(support>water+a.radius*.22){
    // Reject a shoreward step; never tunnel horizontally through the island.
    a.x=oldX;a.z=oldZ;a.vx*=.12;a.vz*=.12;
    water=surface(a.x,a.z);support=supportHeight(a.x,a.z,a.radius);
   }
   const target=water+a.radius*.14+.004*Math.sin(clock*2.4+a.serial*1.7);
   a.vy+=(42*(target-a.y)-11*a.vy)*dt;a.vy=clamp(a.vy,-.50,.50);a.y+=a.vy*dt;
   if(a.y<support){a.y=support;a.vy=Math.max(0,a.vy);}
   if(support>water+a.radius*.30){a.phase='rolling';a.vy=0;}
   const angularDrag=Math.exp(-dt*2.4);a.wx*=angularDrag;a.wy*=angularDrag;a.wz*=angularDrag;spin(a,dt);
  }
  a.mesh.position.set(a.x,a.y,a.z);
 }
 function integrateParticles(dt){
  for(const p of particles){
   if(p.life<=0)continue;
   p.life-=dt;p.vy-=4.8*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
   if(p.y<=Math.max(floor(p.x,p.z),surface(p.x,p.z))||Math.abs(p.x)>extent/2||Math.abs(p.z)>extent/2)p.life=0;
  }
 }
 function updateParticles(){
  let count=0;
  for(const p of particles){
   if(p.life<=0)continue;
   dummy.position.set(p.x,p.y,p.z);dummy.scale.setScalar(p.size*Math.min(1,p.life/.12));dummy.updateMatrix();
   droplets.setMatrixAt(count++,dummy.matrix);
  }
  droplets.count=count;droplets.visible=count>0;
  if(count)droplets.instanceMatrix.needsUpdate=true;
 }
 function step(dt,time){
  if(disposed||!Number.isFinite(dt)||dt<=0)return;
  if(dt>MAX_FRAME)stats.clampedFrames++;
  const elapsed=Math.min(dt,MAX_FRAME),steps=Math.ceil(elapsed/STEP),h=elapsed/steps;
  // Age and buoyancy advance only by bounded elapsed time; an external clock
  // or a background-tab jump cannot launch overdue events or skip collisions.
  for(let i=0;i<steps;i++){
   clock+=h;for(const a of actors)if(a.phase!=='attached')integrate(a,h);
   integrateParticles(h);
  }
  updateParticles();
 }
 function hasAquatic(){
  return !disposed&&actors.some(a=>a.phase!=='attached'&&!a.restored&&a.y-a.radius<surface(a.x,a.z)&&floor(a.x,a.z)<surface(a.x,a.z));
 }
 function reset(){
  if(disposed)return;
  for(const a of actors)if(a.phase!=='attached')finish(a,false);
  for(const p of particles)p.life=0;
  active=0;clock=0;particleCursor=0;droplets.count=0;droplets.visible=false;stats.resets++;
 }
 function getState(){
  const states=actors.map(a=>{
   if(a.phase==='attached'||a.restored)readAttachedPosition(a);
   const n=contactNormal(a.x,a.z,a.radius,normal),vn=a.vx*n.x+a.vy*n.y+a.vz*n.z;
   return {id:a.id,treeIndex:a.treeIndex,phase:a.phase,ready:canDrop(a.id),age:a.age,life:a.life,radius:a.radius,
    x:a.x,y:a.y,z:a.z,vx:a.vx,vy:a.vy,vz:a.vz,supportHeight:supportHeight(a.x,a.z,a.radius),floorHeight:floor(a.x,a.z),surfaceHeight:surface(a.x,a.z),
    landImpacts:a.landImpacts,waterEntries:a.waterEntries,rollingDistance:a.rollingDistance,rotationDistance:a.rotationDistance,
    contactCount:a.contactCount,contactTime:a.contactTime,firstContact:a.firstContact?{...a.firstContact,normal:{...a.firstContact.normal}}:null,entry:a.entry?{...a.entry}:null,
    reboundCount:a.reboundCount,maxReboundHeight:a.maxReboundHeight,rebounding:a.phase==='falling'&&a.contactCount>0,
    surfaceNormal:{x:n.x,y:n.y,z:n.z},slope:Math.hypot(n.x,n.z)/n.y,tangentialSpeed:Math.hypot(a.vx-vn*n.x,a.vy-vn*n.y,a.vz-vn*n.z),rollingContact:a.phase==='rolling'};
  });
  return {active,available:actors.filter(a=>a.phase==='attached').length,total:actors.length,particleCount:particles.filter(p=>p.life>0).length,
   particleLimit:PARTICLE_LIMIT,maxActive:MAX_ACTIVE,clock,disposed,stats:{...stats},coconuts:states};
 }
 function dispose(){
  if(disposed)return;
  reset();root.removeFromParent();droplets.dispose();particleGeometry.dispose();particleMaterial.dispose();disposed=true;
 }
 return {drop,canDrop,isAttached,step,reset,getState,hasAquatic,dispose};
}
