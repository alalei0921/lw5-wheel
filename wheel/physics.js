import * as CANNON from './vendor/cannon-es.js';
import {segments,TAU,modulo} from './wheel-core.js';
export const BALL_RADIUS=.115;
export const POCKET_INNER=1.72,POCKET_OUTER=2.43;
export const BOWL_PROFILE=[[2.43,.03],[2.68,.17],[3.08,.43],[3.42,.59],[3.65,.65],[3.68,1.00]];
export const CONE_PROFILE=[[.7,.60],[1.12,.46],[1.48,.20],[1.72,-.11]];
export function annularSurface(profile,steps=128,start=0,length=TAU){
 const vertices=[],indices=[];
 for(const [radius,y] of profile)for(let j=0;j<=steps;j++){const a=start+j/steps*length;vertices.push(Math.sin(a)*radius,y,Math.cos(a)*radius)}
 for(let row=0;row<profile.length-1;row++)for(let j=0;j<steps;j++){const a=row*(steps+1)+j,b=a+1,c=a+steps+1,d=c+1;indices.push(a,c,b,b,c,d)}
 return {vertices,indices};
}
export function pocketAt(x,z,rotorAngle){return Math.floor(modulo(Math.atan2(x,z)-rotorAngle)/(TAU/segments.length))%segments.length}
export class RoulettePhysics {
 constructor({onCollision=()=>{}}={}){
  this.world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.81,0),allowSleep:false});this.world.solver.iterations=14;this.world.defaultContactMaterial.contactEquationStiffness=1e7;
  this.materials={ball:new CANNON.Material('ceramic'),metal:new CANNON.Material('metal'),wood:new CANNON.Material('wood')};
  for(const [name,friction,restitution] of [['wood',.24,.24],['metal',.12,.48]])this.world.addContactMaterial(new CANNON.ContactMaterial(this.materials.ball,this.materials[name],{friction,restitution,contactEquationStiffness:1e7,contactEquationRelaxation:4}));
  const bowl=new CANNON.Body({mass:0,material:this.materials.wood});bowl.addShape(this.surface(BOWL_PROFILE));this.world.addBody(bowl);
  // The outer brass lip closes the wooden raceway; metal diamonds scatter the ball as it descends.
  const rail=new CANNON.Body({mass:0,material:this.materials.metal});rail.addShape(this.surface([[3.65,.59],[3.65,1.08]]));
  for(let i=0;i<10;i++){const a=i/10*TAU,q=new CANNON.Quaternion();q.setFromEuler(0,a,Math.PI/4);rail.addShape(new CANNON.Box(new CANNON.Vec3(.055,.09,.08)),new CANNON.Vec3(Math.sin(a)*2.86,.36,Math.cos(a)*2.86),q)}this.world.addBody(rail);
  this.rotor=new CANNON.Body({type:CANNON.Body.KINEMATIC,material:this.materials.wood});
  this.rotor.addShape(this.surface([[POCKET_INNER,-.11],[POCKET_OUTER,-.11]]));this.rotor.addShape(this.surface(CONE_PROFILE));
  for(let i=0;i<segments.length;i++){const a=i/segments.length*TAU,q=new CANNON.Quaternion();q.setFromAxisAngle(new CANNON.Vec3(0,1,0),a);const divider=new CANNON.Box(new CANNON.Vec3(.024,.105,(POCKET_OUTER-POCKET_INNER)/2));divider.material=this.materials.metal;this.rotor.addShape(divider,new CANNON.Vec3(Math.sin(a)*2.075,-.005,Math.cos(a)*2.075),q)}
  // Low outer pocket curb: the ball can drop over it, then stay below its crest.
  const curb=this.surface([[2.43,-.11],[2.43,.05]]);curb.material=this.materials.metal;this.rotor.addShape(curb);this.world.addBody(this.rotor);
  this.ball=new CANNON.Body({mass:.032,material:this.materials.ball,shape:new CANNON.Sphere(BALL_RADIUS),linearDamping:.20,angularDamping:.28});this.world.addBody(this.ball);
  this.onCollision=onCollision;this.ball.addEventListener('collide',e=>{const c=e.contact;const otherShape=c.bi===this.ball?c.sj:c.si;const material=otherShape.material||e.body.material;const speed=Math.abs(c.getImpactVelocityAlongNormal());if(speed>.12)this.onCollision({material:material?.name==='metal'?'metal':'wood',speed,position:this.ball.position.clone(),time:this.time})});
  this.running=false;this.angle=0;this.time=0;this.result=null;this.ball.position.set(0,-5,0);
 }
 surface(profile){const {vertices,indices}=annularSurface(profile);return new CANNON.Trimesh(vertices,indices)}
 launch(random=Math.random){
  const a=random()*TAU,speed=6.7+random()*1.3,r=3.43;
  this.angle=random()*TAU;this.initialOmega=-(.68+random()*.35);this.rotor.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),this.angle);
  this.ball.position.set(Math.sin(a)*r,.91+random()*.10,Math.cos(a)*r);this.ball.velocity.set(Math.cos(a)*speed,-.25,-Math.sin(a)*speed);this.ball.angularVelocity.set(-Math.sin(a)*speed/BALL_RADIUS,0,-Math.cos(a)*speed/BALL_RADIUS);this.ball.force.setZero();this.ball.torque.setZero();this.ball.wakeUp();this.ball.aabbNeedsUpdate=true;
  this.time=0;this.running=true;this.result=null;this.stableTime=0;this.lastPocket=-1;this.failed=false;this.world.time=0;
 }
 step(dt=1/120){
  if(!this.running)return;
  this.time+=dt;
  const speedScale=Math.max(0,1-this.time/13);this.omega=this.initialOmega*speedScale*speedScale;
  this.rotor.angularVelocity.set(0,this.omega,0);this.world.step(dt);this.angle+=this.omega*dt;
  // Quaternion and analytical angle share the same integration to avoid drift in pocket mapping.
  this.rotor.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),this.angle);this.rotor.aabbNeedsUpdate=true;
  const p=this.ball.position,r=Math.hypot(p.x,p.z),index=pocketAt(p.x,p.z,this.angle);
  const tangential=new CANNON.Vec3(this.omega*p.z,0,-this.omega*p.x);const relative=this.ball.velocity.vsub(tangential).length();
  const inside=r>POCKET_INNER+BALL_RADIUS*.65&&r<POCKET_OUTER-BALL_RADIUS*.55&&p.y<.07;
  if(inside&&relative<.12&&index===this.lastPocket)this.stableTime+=dt;else this.stableTime=0;
  this.lastPocket=index;
  if(this.stableTime>.8&&Math.abs(this.omega)<.09){this.result=index;this.running=false;this.rotor.angularVelocity.setZero();this.ball.velocity.setZero();this.ball.angularVelocity.setZero();}
  // Report a failed throw rather than fabricate a result or teleport into a pocket.
  if(p.y<-2||r>4.4||this.time>35){this.running=false;this.failed=true;}
 }
}
