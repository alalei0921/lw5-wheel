import * as T from './vendor/three.module.min.js';
import {createAquaticModelFactory} from './marine-models.js';
import {createShoreModelFactory} from './shore-models.js';

// This preview dimension is deliberately independent of the house/table level.
// Stable keys form a cumulative population: upgrading adds residents; downgrading
// cancels only the residents above the requested tier, including queued arrivals.
const additions = [
 [], [['shell',3]], [['crab',2],['hermit',2]], [['smallFish',4]],
 [['clownfish',2],['tang',2]], [['puffer',1],['boxfish',1]],
 [['turtle',1],['puffer',1],['boxfish',1]],
 [['stingray',1],['turtle',1],['smallFish',2]],
 [['manta',1],['tang',2]], [['reefShark',1],['manta',1]],
 [['whaleShark',1],['reefShark',1],['clownfish',2]]
];
const names = {shell:'贝壳',crab:'小螃蟹',hermit:'寄居蟹',smallFish:'小鱼',clownfish:'小丑鱼',tang:'蓝吊鱼',puffer:'河豚',boxfish:'箱鲀',turtle:'海龟',stingray:'小鳐鱼',manta:'蝠鲼',reefShark:'礁鲨',whaleShark:'鲸鲨'};
let total=0;const population={};
export const MARINE_LEVELS = additions.map((list,index)=>{
 for(const [kind,count] of list){population[kind]=(population[kind]||0)+count;total+=count;}
 return Object.freeze({level:index/2,stars:index/2,count:total,counts:Object.freeze({...population}),species:Object.freeze({...population}),title:index?`${index/2} 星 · ${total} 位海岛居民`:'0 星 · 静静的海',description:Object.entries(population).map(([kind,n])=>`${names[kind]} ${n}`).join(' · '),label:index?`${index/2} 星 · ${total} 位海岛居民`:'0 星 · 静静的海'});
});
const catalog=[];const nextId={};
additions.forEach((list,tier)=>list.forEach(([kind,count])=>{for(let i=0;i<count;i++)catalog.push({id:`${kind}-${nextId[kind]||0}`,kind,variant:nextId[kind]||0,tier,serial:catalog.length,seed:701+catalog.length*131}),nextId[kind]=(nextId[kind]||0)+1;}));
const SHORE=new Set(['shell','crab','hermit']);
const OPTIONAL_ASSET_KINDS=new Set(['manta','turtle','reefShark','smallFish']);
const STABLE_MODEL_ROOTS=new Set(['whaleShark',...OPTIONAL_ASSET_KINDS]);
const LARGE=new Set(['stingray','manta','reefShark','whaleShark']);
const DEPTH_Y={smallFish:.12,clownfish:.12,tang:.12,puffer:.07,boxfish:.07,turtle:.12,stingray:-.04,manta:-.04,reefShark:-.06,whaleShark:-.145};
const SPEED={smallFish:.19,clownfish:.17,tang:.22,puffer:.105,boxfish:.12,turtle:.12,stingray:.17,manta:.18,reefShark:.24,whaleShark:.15};
const clamp=T.MathUtils.clamp,TAU=Math.PI*2;
const smooth=(x)=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
const hash=(i)=>{const a=Math.sin(i*127.1+311.7)*43758.5453123;return a-Math.floor(a);};
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
const shortest=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

export function createMarineLife(parent,{bedHeight,waterLevel=.38,extent=5.6,sampleFlow=()=>({x:0,z:0}),waterState=()=>({}),disturb=()=>{},sampleSurface=()=>waterLevel}={}){
 if(typeof bedHeight!=='function')throw new TypeError('Marine life requires the actual island bedHeight.');
 const root=new T.Group();root.name='marine-life';root.userData.role='marine-life';parent.add(root);
 const aquatic=createAquaticModelFactory(),shore=createShoreModelFactory(),actors=new Map();
 const edge=extent/2-.055,particleLimit=96;
 const particleGeometry=new T.SphereGeometry(1,7,5),particleMaterial=new T.MeshStandardMaterial({color:0xffffff,roughness:.27,transparent:true,opacity:.72,depthWrite:false});
 const droplets=new T.InstancedMesh(particleGeometry,particleMaterial,particleLimit);droplets.name='bounded-marine-splash';droplets.instanceMatrix.setUsage(T.DynamicDrawUsage);droplets.frustumCulled=false;droplets.renderOrder=4;root.add(droplets);
 const particles=Array.from({length:particleLimit},()=>({life:0,maxLife:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,size:0,water:true}));
 const dummy=new T.Object3D(),color=new T.Color(),shoreBasis=new T.Matrix4(),shoreForward=new T.Vector3(),shoreNormal=new T.Vector3(),shoreSide=new T.Vector3(),shoreTurn=new T.Quaternion();let particleCursor=0;
 let whaleAsset=null,lastAssetError=null;const disposedModels=new WeakSet(),registeredAssets=new Map();
 let level=0,clock=0,spawnClock=0,disposed=false,frameCount=0,lastDisturb=-99,waterSnapshot={};
 const metrics={created:0,removed:0,replays:0,arrivals:0,waterEntries:0,shoreLandings:0,disturbances:0,clampedFrames:0,maxActors:0,maxParticles:0,rejectedCandidates:0,flowResponses:0,sweptTrims:0,modelSwaps:0,modelDisposals:0,assetRegistrations:0,maxQueuedWait:0};
 const queue=[];
 function absoluteSurface(x,z){const y=sampleSurface(x,z);return Number.isFinite(y)?y:waterLevel;}
 function bodySamples(a,x,z,yaw){
  const length=a.bounds.length/2+.012,width=a.bounds.width/2+.012,c=Math.cos(yaw),s=Math.sin(yaw),points=[[x,z]];
  for(let j=0;j<12;j++){const t=j*Math.PI/6,u=Math.cos(t)*length,v=Math.sin(t)*width;points.push([x+c*u+s*v,z-s*u+c*v]);}
  for(const u of [-length,length])for(const v of [-width,width])points.push([x+c*u+s*v,z-s*u+c*v]);
  return points;
 }
 function safeVolume(a,x,z,yaw,{surface=true}={}){
  let floor=-Infinity,ceiling=Infinity;
  for(const [px,pz] of bodySamples(a,x,z,yaw)){
   if(Math.abs(px)>edge||Math.abs(pz)>edge)return null;
   floor=Math.max(floor,bedHeight(px,pz));ceiling=Math.min(ceiling,surface?absoluteSurface(px,pz):waterLevel);
  }
  const low=floor+a.bounds.halfHeight+.026,high=ceiling-a.bounds.halfHeight-.031;
  return high>=low?{low,high,floor,ceiling}:null;
 }
 function sweptVolume(a,from,to){
  let low=-Infinity,high=Infinity;
  const turn=shortest(from.yaw,to.yaw);
  for(const t of [0,.25,.5,.75,1]){
   const q=safeVolume(a,mix(from.x,to.x,t),mix(from.z,to.z,t),from.yaw+turn*t);
   if(!q)return null;
   low=Math.max(low,q.low);high=Math.min(high,q.high);
  }
  return high>=low?{low,high}:null;
 }
 function path(a,phase=a.orbit){
  const large=LARGE.has(a.kind),whale=a.kind==='whaleShark',h=hash(a.seed),rx=whale?2.36:large?2.17+h*.13:1.83+h*.46,rz=whale?2.36:large?2.08+h*.12:1.64+hash(a.seed+2)*.60;
  // A broad, gently breathing oval lets small groups change spacing naturally.
  // Big residents stay in the outer corridor; individual phases are not reset.
  const wiggle=(whale?.006:large?.028:.055)*Math.sin(phase*3+a.seed);
  const x=Math.cos(phase)*(rx+wiggle),z=Math.sin(phase)*(rz+wiggle);
  const dx=-Math.sin(phase)*rx*a.direction,dz=Math.cos(phase)*rz*a.direction;
  return {x,z,yaw:Math.atan2(-dz,dx)};
 }
 function safePath(a,phase=a.orbit){
  let p=path(a,phase),v=safeVolume(a,p.x,p.z,p.yaw);
  if(!v){
   // Fall back towards the centre of the deep outer lane, never towards land.
   const ca=Math.cos(phase),sa=Math.sin(phase);
   for(const r of [2.18,2.28,2.08,2.37,1.98]){const q={x:ca*r,z:sa*r,yaw:Math.atan2(-ca*a.direction,-sa*a.direction)},test=safeVolume(a,q.x,q.z,q.yaw);if(test){p=q;v=test;break;}}
  }
  return v?{...p,volume:v}:null;
 }
 const shoreSeeds=[[-.98,.06],[-.83,.40],[.73,.45],[-.56,.61],[.58,.59],[-1.02,-.43],[1.04,-.44]];
 function shorePosition(a){
  const p=shoreSeeds[a.serial]||[-1,.3];let best={x:p[0],z:p[1],y:bedHeight(...p)},score=Infinity;
  // Find dry sand with the least slope near this resident's reserved patch.
  for(let ix=-3;ix<=3;ix++)for(let iz=-3;iz<=3;iz++){
   const x=p[0]+ix*.022,z=p[1]+iz*.022,y=bedHeight(x,z);
   if(y<waterLevel+.083||y>.61)continue;
   if(Math.abs(x+.16)<.72&&Math.abs(z+.4)<.57)continue;
   if(Math.abs(x-.84)<.34&&Math.abs(z-.15)<.285)continue;
   if(Math.abs(x)<.43&&z>.28&&z<.70)continue;
   const slope=Math.hypot(bedHeight(x+.04,z)-bedHeight(x-.04,z),bedHeight(x,z+.04)-bedHeight(x,z-.04));
   const d=Math.hypot(ix,iz)*.013+slope;
   if(d<score){score=d;best={x,z,y};}
  }
  return best;
 }
 function shoreSupport(a,x,z){
  const d=.026,dx=(bedHeight(x+d,z)-bedHeight(x-d,z))/(d*2),dz=(bedHeight(x,z+d)-bedHeight(x,z-d))/(d*2);
  shoreNormal.set(-dx,1,-dz).normalize();shoreForward.set(Math.cos(a.yaw),0,-Math.sin(a.yaw));shoreForward.addScaledVector(shoreNormal,-shoreForward.dot(shoreNormal)).normalize();shoreSide.crossVectors(shoreForward,shoreNormal).normalize();
  shoreBasis.makeBasis(shoreForward,shoreNormal,shoreSide);shoreTurn.setFromRotationMatrix(shoreBasis);
  let y=bedHeight(x,z);
  for(let i=0;i<12;i++){
   const t=i/12*TAU,u=Math.cos(t)*a.bounds.length*.47,v=Math.sin(t)*a.bounds.width*.47;
   const xx=shoreForward.x*u+shoreSide.x*v,zz=shoreForward.z*u+shoreSide.z*v,yy=shoreForward.y*u+shoreSide.y*v;
   y=Math.max(y,bedHeight(x+xx,z+zz)-yy);
  }
  return {y:y+.002,quaternion:shoreTurn};
 }
 function makeActor(entry){
  const isShore=SHORE.has(entry.kind),model=(isShore?shore:aquatic).create(entry.kind,{variant:entry.variant,seed:entry.seed});
  const actorRoot=STABLE_MODEL_ROOTS.has(entry.kind)?new T.Group():model.root;if(actorRoot!==model.root)actorRoot.add(model.root);
  const a={...entry,model,root:actorRoot,bounds:{...model.bounds},isShore,phase:'queued',queuedAt:clock,age:0,orbit:(entry.serial*2.399963+hash(entry.seed)*.5)%TAU,direction:LARGE.has(entry.kind)?1:entry.serial%3===0?-1:1,speed:0,cruise:(SPEED[entry.kind]||.012)*(1+hash(entry.seed+2)*.16),flowX:0,flowZ:0,flowPush:0,offsetX:0,offsetZ:0,avoidX:0,avoidZ:0,trafficOffset:0,yaw:0,x:0,y:0,z:0,fallVelocity:0,entered:false};
  if(isShore){a.yaw=(hash(a.seed+3)-.5)*1.6;a.home=shorePosition(a);a.home.y=shoreSupport(a,a.home.x,a.home.z).y;}else{a.bounds.halfHeight=finite(a.bounds.halfHeight,.06);}
  a.root.name=entry.id;a.root.userData.role='marine-life';a.root.visible=false;root.add(a.root);actors.set(a.id,a);queue.push(a.id);metrics.created++;metrics.maxActors=Math.max(metrics.maxActors,actors.size);return a;
 }
 function releaseModel(model){
  if(!model||disposedModels.has(model))return;
  disposedModels.add(model);if(typeof model.dispose==='function'){model.dispose();metrics.modelDisposals++;}
 }
 function setWhaleAsset(asset){
  if(!asset)return false;
  if(disposed){asset.dispose?.();return false;}
  if(asset===whaleAsset&&!lastAssetError)return true;
  let replacement;
  try{
   if(!aquatic.setWhaleAsset?.(asset))return false;
   whaleAsset=asset;metrics.assetRegistrations++;lastAssetError=null;
   const a=actors.get('whaleShark-0');
   if(!a)return true;
   replacement=aquatic.create('whaleShark',{variant:a.variant,seed:a.seed});
   if(replacement.source==='procedural')throw new Error('Whale asset instance unavailable; procedural fallback retained');
   if(!['length','width','halfHeight','radius'].every(k=>Number.isFinite(replacement.bounds?.[k])&&replacement.bounds[k]>0))throw new Error('Invalid whale instance bounds');
   replacement.animate(clock+a.seed*.17,a.speed);
   const previous=a.model;
   const target={...replacement.bounds},baseScale=replacement.root.scale.clone();
   const startScale=a.phase==='queued'?1:Math.min(1,a.bounds.length/target.length,a.bounds.width/target.width,a.bounds.halfHeight/target.halfHeight);
   a.root.add(replacement.root);a.root.remove(previous.root);a.model=replacement;
   a.modelTransition=startScale<.99999?{age:0,startScale,target,baseScale}:null;
   a.modelScale=startScale;a.bounds=Object.fromEntries(Object.entries(target).map(([k,v])=>[k,typeof v==='number'?v*startScale:v]));replacement.root.scale.copy(baseScale).multiplyScalar(startScale);
   releaseModel(previous);metrics.modelSwaps++;return true;
  }catch(error){if(replacement&&actors.get('whaleShark-0')?.model!==replacement)releaseModel(replacement);lastAssetError=String(error?.message||error);return false;}
 }
 function selectedVariant(variants,variant){return variants===null||variants.includes(variant);}
 function validateModelBounds(bounds){return bounds&&['length','width','halfHeight','radius'].every(k=>Number.isFinite(bounds[k])&&bounds[k]>0);}
 function assetFitsRoutes(kind,bounds){
  if(!validateModelBounds(bounds))return false;
  // Admission is checked against the unchanged seabed and the complete nominal
  // route, not just the current pose. A caller can keep the previous fallback
  // when a candidate is too wide or tall for this small water block.
  for(const entry of catalog.filter(entry=>entry.kind===kind)){
   const probe={...entry,bounds,direction:LARGE.has(kind)?1:entry.serial%3===0?-1:1};
   for(let i=0;i<32;i++){const p=path(probe,i*TAU/32);if(!safeVolume(probe,p.x,p.z,p.yaw,{surface:false}))return false;}
  }
  return true;
 }
 function attachReplacement(a,replacement){
  const previous=a.model,target={...replacement.bounds},baseScale=replacement.root.scale.clone();
  const startScale=a.phase==='queued'?1:Math.min(1,a.bounds.length/target.length,a.bounds.width/target.width,a.bounds.halfHeight/target.halfHeight);
  a.root.add(replacement.root);a.root.remove(previous.root);a.model=replacement;
  a.modelTransition=startScale<.99999?{age:0,startScale,target,baseScale}:null;
  a.modelScale=startScale;a.bounds=Object.fromEntries(Object.entries(target).map(([k,v])=>[k,typeof v==='number'?v*startScale:v]));
  replacement.root.scale.copy(baseScale).multiplyScalar(startScale);releaseModel(previous);metrics.modelSwaps++;
 }
 function setMarineAsset(kind,asset,options={}){
  if(!asset||!OPTIONAL_ASSET_KINDS.has(kind))return false;
  if(disposed){asset.dispose?.();return false;}
  let variants=Object.prototype.hasOwnProperty.call(options,'variants')?options.variants:(kind==='smallFish'?[0,1]:null);
  if(kind==='smallFish'&&variants===null)return false;
  if(variants!==null){
   if(!Array.isArray(variants)||!variants.length||variants.some(v=>!Number.isInteger(v)||v<0||v>=(nextId[kind]||0)))return false;
   variants=[...new Set(variants)].sort((a,b)=>a-b);if(kind==='smallFish'&&variants.length>2)return false;
  }
  const previous=registeredAssets.get(kind),signature=JSON.stringify(variants);
  if(previous?.asset===asset&&previous.signature===signature&&!previous.lastError)return true;
  const staged=[];let record;
  try{
   if(!assetFitsRoutes(kind,asset.bounds))return false;
   if(!aquatic.setAsset?.(kind,asset,{variants}))return false;
   record={asset,variants,signature,lastError:null};registeredAssets.set(kind,record);metrics.assetRegistrations++;
   for(const a of actors.values()){
    if(a.kind!==kind)continue;
    const selected=selectedVariant(variants,a.variant),previouslySelected=previous&&selectedVariant(previous.variants,a.variant);
    if(selected&&previous?.asset===asset&&previouslySelected&&a.model.source!=='procedural')continue;
    if(!selected&&(a.model.source||'procedural')==='procedural')continue;
    const replacement=aquatic.create(kind,{variant:a.variant,seed:a.seed});staged.push({a,replacement});
    if(selected&&replacement.source==='procedural')throw new Error(`${kind} asset instance unavailable; existing models retained`);
    if(replacement.kind!==kind||!validateModelBounds(replacement.bounds))throw new Error(`Invalid ${kind} instance bounds or kind`);
    if(selected&&['length','width','halfHeight','radius'].some(key=>replacement.bounds[key]>asset.bounds[key]+1e-7))throw new Error(`${kind} instance exceeds the accepted animation envelope`);
    replacement.animate(clock+a.seed*.17,a.speed);
   }
   // Stage every instance first so one failed private skeleton does not replace
   // half of a species. World wrappers and every actor state remain untouched.
   for(const {a,replacement} of staged)attachReplacement(a,replacement);
   return true;
  }catch(error){
   for(const {a,replacement} of staged)if(a.model!==replacement)releaseModel(replacement);
   if(record){
    // A rejected source remains owned by its caller. In particular, a preload
    // callback may dispose it immediately after false is returned here.
    aquatic.clearAsset?.(kind,asset);
    if(previous?.asset){aquatic.setAsset(kind,previous.asset,{variants:previous.variants});registeredAssets.set(kind,previous);}
    else registeredAssets.set(kind,{asset:null,variants:null,signature:'',lastError:String(error?.message||error)});
   }
   return false;
  }
 }
 function advanceModelTransition(a,dt,finish=false){
  const transition=a.modelTransition;if(!transition)return;
  transition.age+=dt;
  let scale=finish?1:mix(transition.startScale,1,smooth(transition.age/.65));
  const atScale=s=>Object.fromEntries(Object.entries(transition.target).map(([k,v])=>[k,typeof v==='number'?v*s:v]));
  if(!finish&&a.phase!=='queued'&&!safeVolume({...a,bounds:atScale(scale)},a.x,a.z,a.yaw)){
   // A live pressure trough or the inner shoreline may temporarily leave less
   // room than the new animation envelope. Pause growth within its safe size;
   // continue to full uniform scale as ordinary swimming finds enough room.
   let low=a.modelScale??transition.startScale,high=scale;
   if(!safeVolume({...a,bounds:atScale(low)},a.x,a.z,a.yaw))return;
   for(let i=0;i<10;i++){const mid=(low+high)/2;if(safeVolume({...a,bounds:atScale(mid)},a.x,a.z,a.yaw))low=mid;else high=mid;}
   scale=low;
  }
  a.modelScale=scale;a.bounds=atScale(scale);
  a.model.root.scale.copy(transition.baseScale).multiplyScalar(scale);
  if(scale>=1)a.modelTransition=null;
 }
 function setLevel(value){
  if(disposed)return level;
  const next=Math.round(clamp(finite(Number(value)),0,5)*2)/2,tier=Math.round(next*2);
  if(next===level)return level;
  level=next;
  for(const [id,a] of actors)if(a.tier>tier){root.remove(a.root);releaseModel(a.model);actors.delete(id);metrics.removed++;}
  for(let i=queue.length-1;i>=0;i--)if(!actors.has(queue[i]))queue.splice(i,1);
  for(const entry of catalog)if(entry.tier<=tier&&!actors.has(entry.id))makeActor(entry);
  if(!actors.size){queue.length=0;clearParticles();spawnClock=0;}
  else if(queue.length)spawnClock=Math.min(spawnClock,.02);
  return level;
 }
 // Large neighbours share an outer circulation direction. Reserve a free gap
 // only for newcomers; an upgrade never relocates an existing resident.
 function chooseOuterGap(a){
  if(!LARGE.has(a.kind))return;
  const others=[...actors.values()].filter(b=>b!==a&&LARGE.has(b.kind)&&b.phase!=='queued');
  if(!others.length)return;
  const preferred=a.orbit;
  for(let i=0;i<96;i++){
   const offset=i===0?0:Math.ceil(i/2)*TAU/96*(i%2?1:-1),phase=preferred+offset,p=safePath(a,phase);
   if(p&&others.every(b=>[0,.6,1.2,1.8].every(t=>{const q=path(b,b.orbit+.075*t);return Math.hypot(p.x-q.x,p.z-q.z)>=a.bounds.radius+b.bounds.radius+.18;}))){a.orbit=phase;return;}
  }
 }
 function passingOffset(a,p,dt){
  let target=0;
  const whale=actors.get('whaleShark-0');
  if(!LARGE.has(a.kind)&&whale&&whale.phase!=='queued'){
   const angle=Math.abs(shortest(a.orbit,whale.orbit)),near=1-smooth((angle-.45)/.70),radius=Math.hypot(p.x,p.z),lane=Math.hypot(whale.x,whale.z)-whale.bounds.width/2-a.bounds.width/2-.14;
   target=Math.min(.48,Math.max(0,radius-lane))*near;
  }
  // Smaller swimmers gently take the inside lane before meeting the whale.
  // This scalar is separate from the <= .10 local water-flow displacement.
  a.trafficOffset=mix(a.trafficOffset,target,1-Math.exp(-dt*1.3));
  return a.trafficOffset;
 }
 function startArrival(a){
  chooseOuterGap(a);
  metrics.maxQueuedWait=Math.max(metrics.maxQueuedWait,clock-a.queuedAt);
  a.phase='air';a.age=0;a.root.visible=true;a.root.scale.setScalar(.001);a.fallVelocity=0;a.flowX=a.flowZ=a.offsetX=a.offsetZ=a.flowPush=0;
  if(a.isShore){a.x=a.home.x;a.z=a.home.z;a.targetY=a.home.y;a.y=a.targetY+.34;}
  else{
   let p=safePath(a);
   for(let tries=0;!p&&tries<24;tries++){a.orbit+=TAU/24;p=safePath(a);}
   if(!p){a.phase='queued';a.root.visible=false;a.queuedAt=clock;queue.push(a.id);metrics.rejectedCandidates++;return;}
   a.x=p.x;a.z=p.z;a.yaw=p.yaw;a.y=absoluteSurface(a.x,a.z)+a.bounds.halfHeight+.80;
  }
  a.airY=a.y;a.root.position.set(a.x,a.y,a.z);a.root.rotation.set(0,a.yaw,0);metrics.arrivals++;
 }
 function clearParticles(){for(const p of particles)p.life=0;updateParticleMesh();}
 function burst(a,water){
  const count=water?Math.round(clamp(7+a.bounds.length*14,9,17)):5;
  const baseY=water?absoluteSurface(a.x,a.z)+.008:a.home.y+.018;
  for(let j=0;j<count;j++){
   const p=particles[particleCursor];particleCursor=(particleCursor+1)%particleLimit;
   const angle=j/count*TAU+hash(a.seed+metrics.arrivals)*TAU,r=.012+hash(j+a.seed)*.055,force=water?.17+.11*hash(j+a.seed+1):.06+.06*hash(j+a.seed+1);
   Object.assign(p,{life:water?.46+.21*hash(j+2):.32+.13*hash(j+2),x:a.x+Math.cos(angle)*r,y:baseY,z:a.z+Math.sin(angle)*r,vx:Math.cos(angle)*force,vy:water?.38+hash(j+a.seed+4)*.45:.10+hash(j+1)*.11,vz:Math.sin(angle)*force,size:water?.009+hash(j+4)*.009:.008+hash(j+4)*.006,water});p.maxLife=p.life;
   color.set(water?'#cdf4ee':'#e9d3ab');droplets.setColorAt(particleCursor?particleCursor-1:particleLimit-1,color);
  }
  if(water&&clock-lastDisturb>.09){disturb(a.x,a.z,clamp(.25+a.bounds.length*.75,.30,.92),clamp(.10+a.bounds.length*.11,.12,.20));lastDisturb=clock;metrics.disturbances++;}
  if(droplets.instanceColor)droplets.instanceColor.needsUpdate=true;
 }
 function land(a){
  a.age=0;a.entered=true;a.speed=0;
  if(a.isShore){a.phase='landing';a.y=a.home.y;metrics.shoreLandings++;burst(a,false);}
  else{a.phase='diving';a.entryY=a.y;metrics.waterEntries++;burst(a,true);}
 }
 function flowTarget(a,dt){
  const f=sampleFlow(a.x,a.z)||{},fx=clamp(finite(f.x),-.60,.60),fz=clamp(finite(f.z),-.60,.60),filter=1-Math.exp(-dt*3.0);
  a.flowX=mix(a.flowX,fx,filter);a.flowZ=mix(a.flowZ,fz,filter);
  const deep=waterSnapshot.deep;
  let ax=0,az=0;
  if(deep?.active){const dx=a.x-deep.x,dz=a.z-deep.z,d=Math.hypot(dx,dz),r=.48+Math.min(.22,a.bounds.length*.25);if(d<r){const power=(1-d/r)*.065*(deep.pressure||0);ax=dx/(d||1)*power;az=dz/(d||1)*power;}}
  a.avoidX=mix(a.avoidX,ax,filter);a.avoidZ=mix(a.avoidZ,az,filter);
  // Bounded inertial drift. It responds to local flow, never to pointer position.
  a.offsetX+=(a.flowX*.12+a.avoidX-a.offsetX*.75)*dt;
  a.offsetZ+=(a.flowZ*.12+a.avoidZ-a.offsetZ*.75)*dt;
  const drift=Math.hypot(a.offsetX,a.offsetZ),limit=a.kind==='whaleShark'?.025:.10;if(drift>limit){a.offsetX*=limit/drift;a.offsetZ*=limit/drift;}
  a.flowPush=Math.hypot(a.flowX,a.flowZ);
  if(a.flowPush>.015)metrics.flowResponses++;
 }
 function swim(a,dt,diving=false){
  const orbitSpeed=LARGE.has(a.kind)?.075*(.95+.05*Math.sin(clock*.31)):a.cruise/2.1*(.90+.12*Math.sin(clock*.31+a.seed));
  a.orbit+=orbitSpeed*a.direction*dt*(diving?.42:1);
  flowTarget(a,dt);
  const p=safePath(a);
  if(!p){metrics.rejectedCandidates++;return;}
  const inward=passingOffset(a,p,dt)/Math.max(.5,Math.hypot(p.x,p.z)),tx=p.x*(1-inward)+a.offsetX,tz=p.z*(1-inward)+a.offsetZ,tx0=a.x,tz0=a.z;
  const turn=clamp(shortest(a.yaw,p.yaw)*(1-Math.exp(-dt*4.4)),-dt*.36,dt*.36),yaw=a.yaw+turn;
  let v=safeVolume(a,tx,tz,yaw),x=tx,z=tz;
  if(!v){
   // A wider imported swimmer may reach the inner edge of a passing lane.
   // Project only the unavailable part of its requested drift back towards
   // the safe route, rather than jumping all the way to that route.
   let low=0,high=1;v=p.volume;
   for(let i=0;i<12;i++){
    const amount=(low+high)/2,test=safeVolume(a,mix(p.x,tx,amount),mix(p.z,tz,amount),yaw);
    if(test&&test.high-test.low>.006){low=amount;v=test;}else high=amount;
   }
   x=mix(p.x,tx,low);z=mix(p.z,tz,low);
  }
  const distance=Math.hypot(x-a.x,z-a.z),travel=(a.cruise+.18)*dt;
  if(distance>travel){x=mix(a.x,x,travel/distance);z=mix(a.z,z,travel/distance);}
  const from={x:a.x,z:a.z,yaw:a.yaw},to={x,z,yaw};
  // Sample the whole short movement and turn, including all four footprint
  // corners. If a changing water/shore constraint rejects it, trim smoothly.
  v=sweptVolume(a,from,to);
  for(let trim=0;!v&&trim<6;trim++){
   to.x=mix(from.x,to.x,.5);to.z=mix(from.z,to.z,.5);to.yaw=from.yaw+shortest(from.yaw,to.yaw)*.5;
   v=sweptVolume(a,from,to);metrics.sweptTrims++;
  }
  if(!v)return;
  a.x=x=to.x;a.z=z=to.z;a.yaw=to.yaw;
  const whale=a.kind==='whaleShark';
  let desiredY=(DEPTH_Y[a.kind]??.07)+(hash(a.seed+4)-.5)*(whale?.006:.05)+Math.sin(clock*.55+a.seed)*(whale?.003:.012);
  desiredY=clamp(desiredY,v.low,v.high);
  if(diving)a.y=mix(a.entryY,desiredY,smooth(a.age/.73));
  else a.y=clamp(mix(a.y,desiredY,1-Math.exp(-dt*2.6)),v.low,v.high);
  a.speed=dt>0?Math.min(.55,Math.hypot(x-tx0,z-tz0)/dt):a.cruise;
 }
 function updateActor(a,dt){
  if(a.phase==='queued')return;
  advanceModelTransition(a,dt);
  a.age+=dt;
  if(a.phase==='air'){
   a.root.scale.setScalar(smooth(a.age/.16));
   if(a.age>=.19){a.phase='falling';a.age=0;}
  }else if(a.phase==='falling'){
   const gravity=a.isShore?2.5:3.5;a.fallVelocity+=gravity*dt;a.y-=a.fallVelocity*dt;
   const target=a.isShore?a.home.y:absoluteSurface(a.x,a.z)+a.bounds.halfHeight;
   if(a.y<=target){a.y=target;land(a);}
  }else if(a.phase==='diving'){
   swim(a,dt,true);if(a.age>=.73){a.phase='swimming';a.age=0;}
  }else if(a.phase==='swimming')swim(a,dt);
  else if(a.phase==='landing'){
   // A small squash stays above the beach; no bounce into water or ground.
   const k=Math.sin(Math.min(1,a.age/.28)*Math.PI)*.055;a.root.scale.set(1+k,1-k,1+k);
   if(a.age>=.28){a.phase='shore';a.age=0;a.root.scale.setScalar(1);}
  }else if(a.phase==='shore'){
   if(a.kind!=='shell'){
    const t=clock*.17+a.seed,nx=a.home.x+Math.sin(t)*.014,nz=a.home.z+Math.sin(t*.83)*.012;
    a.speed=Math.hypot(nx-a.x,nz-a.z)/Math.max(dt,.001);a.x=nx;a.z=nz;a.y=shoreSupport(a,nx,nz).y;
   }
  }
  a.root.position.set(a.x,a.y,a.z);a.root.rotation.set(0,a.yaw,0);
  if(a.isShore){const support=shoreSupport(a,a.x,a.z),weight=a.phase==='air'?0:a.phase==='falling'?smooth(a.age/.45):1;a.root.quaternion.slerp(support.quaternion,weight);}
  if(!a.isShore&&(a.phase==='diving'||a.phase==='swimming')){
   a.root.rotation.z=(a.phase==='diving'?-.10*Math.sin(Math.min(1,a.age/.73)*Math.PI):0)+Math.sin(clock*.65+a.seed)*(a.kind==='whaleShark'?0:.009);
  }
  a.model.animate(clock+a.seed*.17,a.speed);
 }
 function updateParticleMesh(){
  let alive=0;
  for(let i=0;i<particleLimit;i++){
   const p=particles[i];if(p.life>0){alive++;const s=p.size*Math.min(1,p.life/.12);dummy.position.set(p.x,p.y,p.z);dummy.scale.set(s,s*(p.water?1.3:.7),s);}else{dummy.position.set(0,-2,0);dummy.scale.setScalar(0);}
   dummy.updateMatrix();droplets.setMatrixAt(i,dummy.matrix);
  }
  droplets.instanceMatrix.needsUpdate=true;droplets.visible=alive>0;metrics.maxParticles=Math.max(metrics.maxParticles,alive);return alive;
 }
 function step(frameDt,time){
  if(disposed)return;
  frameCount++;let dt=clamp(finite(frameDt),0,1/15);if(frameDt>1/15)metrics.clampedFrames++;
  waterSnapshot=typeof waterState==='function'?waterState()||{}:waterState||{};
  // At most one scheduled arrival per displayed frame. Background time cannot
  // build a timer backlog, and each integration step is at most 1/30 second.
  spawnClock-=dt;
  if(queue.length&&spawnClock<=0&&dt>0){
   const id=queue.shift(),a=actors.get(id);if(a&&a.phase==='queued')startArrival(a);
   const oldest=actors.get(queue[0]);
   spawnClock=oldest?clamp((oldest.queuedAt+2.6-clock)/Math.max(1,queue.length),.035,.195):0;
  }
  const count=Math.min(4,Math.max(1,Math.ceil(dt/(1/30)))),sub=dt/count;
  for(let n=0;n<count;n++){
   clock+=sub;
   for(const a of actors.values())updateActor(a,sub);
   for(const p of particles)if(p.life>0){p.life-=sub;p.vy-=(p.water?2.0:.8)*sub;p.x+=p.vx*sub;p.y+=p.vy*sub;p.z+=p.vz*sub;if(p.y<bedHeight(p.x,p.z)+.004)p.life=0;}
  }
  updateParticleMesh();
 }
 function stable(a){
  advanceModelTransition(a,0,true);
  if(a.phase==='queued')chooseOuterGap(a);
  a.trafficOffset=0;
  a.flowX=a.flowZ=a.flowPush=a.offsetX=a.offsetZ=a.avoidX=a.avoidZ=0;a.age=0;a.fallVelocity=0;a.entered=true;a.root.visible=true;a.root.scale.setScalar(1);
  if(a.isShore){a.x=a.home.x;a.z=a.home.z;a.y=a.home.y;a.phase='shore';}
  else{
   let p=safePath(a);for(let i=0;!p&&i<24;i++){a.orbit+=TAU/24;p=safePath(a);}if(!p)return;
   a.x=p.x;a.z=p.z;a.yaw=p.yaw;a.y=clamp((DEPTH_Y[a.kind]??.07)+(hash(a.seed+4)-.5)*(a.kind==='whaleShark'?.006:.05),p.volume.low,p.volume.high);a.phase='swimming';
  }
  a.root.position.set(a.x,a.y,a.z);a.root.rotation.set(0,a.yaw,0);if(a.isShore)a.root.quaternion.copy(shoreSupport(a,a.x,a.z).quaternion);a.speed=0;a.model.animate(clock+a.seed*.17,0);
 }
 function resetMotion(){if(disposed)return;queue.length=0;spawnClock=0;clearParticles();for(const a of actors.values())stable(a);}
 function replay(){
  if(disposed)return;queue.length=0;spawnClock=0;clearParticles();metrics.replays++;
  for(const a of actors.values()){advanceModelTransition(a,0,true);a.phase='queued';a.queuedAt=clock;a.age=0;a.entered=false;a.trafficOffset=0;a.root.visible=false;a.root.scale.setScalar(1);a.flowX=a.flowZ=a.flowPush=a.offsetX=a.offsetZ=0;queue.push(a.id);}
 }
 function getState(){
  const phaseCounts={},counts={};for(const a of actors.values()){phaseCounts[a.phase]=(phaseCounts[a.phase]||0)+1;counts[a.kind]=(counts[a.kind]||0)+1;}
  return {level,count:actors.size,totalCount:actors.size,targetCount:MARINE_LEVELS[Math.round(level*2)].count,activeCount:actors.size-queue.length,active:actors.size-queue.length,queued:queue.length,species:{...counts},counts:{...counts},phaseCounts,particles:particles.filter(p=>p.life>0).length,budget:{actors:33,particles:particleLimit,spawnPerFrame:1,spawnIntervalRange:[.035,.195],queuedWindowTarget:2.6},clock,frameCount,metrics:{...metrics},actors:[...actors.values()].map(a=>({id:a.id,kind:a.kind,label:names[a.kind],phase:a.phase,position:{x:a.x,y:a.y,z:a.z},yaw:a.yaw,speed:a.speed,bounds:{...a.bounds},isShore:a.isShore,orbit:a.orbit,age:a.age,queuedAt:a.queuedAt,modelSource:a.model.source||'procedural',modelScale:a.modelScale??1,modelTransition:!!a.modelTransition,animationClip:a.model.animationClip||null,trafficOffset:a.trafficOffset,flow:{x:a.flowX,z:a.flowZ,speed:a.flowPush,offset:Math.hypot(a.offsetX,a.offsetZ)},visible:a.root.visible})),whaleAsset:{registered:!!whaleAsset,lastError:lastAssetError},assets:Object.fromEntries([...registeredAssets].map(([kind,r])=>[kind,{registered:!!r.asset,source:r.asset?.source||null,variants:r.variants?[...r.variants]:null,lastError:r.lastError}])),resources:{aquatic:aquatic.getStats?.()||{},shore:shore.getStats?.()||{}},disposed};
 }
 function dispose(){if(disposed)return;disposed=true;queue.length=0;for(const a of actors.values())releaseModel(a.model);actors.clear();root.removeFromParent();aquatic.dispose();shore.dispose();particleGeometry.dispose();particleMaterial.dispose();}
 updateParticleMesh();
 const hasAquatic=()=>{for(const a of actors.values())if(!a.isShore&&a.phase!=='queued')return true;return false;};
 return {root,setLevel,getState,step,replay,resetMotion,dispose,hasAquatic,setWhaleAsset,setMarineAsset};
}
