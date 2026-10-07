import * as T from './vendor/three.module.min.js';
import {makeTerrain,bedHeight,WATER,SIZE} from './terrain.js';
import {createWaterDynamics} from './dynamics.js';
import {bindIslandGestures} from './gestures.js';
import {makePalms} from './palms.js';
import {createCoconutEffects} from './coconut-effects.js';
import {makeCharacters} from './characters.js';
import {makeWater} from './water.js';
import {makeCaustics} from './caustics.js';
import {BUILDING_LEVELS,createBuildingSeries} from './buildings.js';
import {createTableSeries} from './tables.js';
import {ISLAND_LAYOUT} from './scene-layout.js';
import {createMarineLife,MARINE_LEVELS} from './marine.js';
import {createStarRating} from './star-rating.js';
import {loadWhaleAsset} from './whale-asset.js';
import {loadMarineAsset} from './marine-assets.js';
import {createMarineAssetPreloader} from './marine-preload.js';
import {createRatingsState,RATING_DIMENSIONS} from './ratings-state.js';
import {createRadar} from './radar.js';
const canvas=document.querySelector('canvas');
const stage=document.querySelector('#scene-stage');
const ratingsScroll=document.querySelector('#ratings-scroll');
const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setClearColor('#f4efe7');renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.1,100);const world=new T.Group();scene.add(world);
scene.add(new T.HemisphereLight('#f6fbff','#c6baa2',1.35));const sun=new T.DirectionalLight('#fff3df',3.3);sun.position.set(-3.5,6,4.5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-4.2,right:4.2,top:4.2,bottom:-4.2,near:.1,far:15});sun.shadow.normalBias=.013;sun.shadow.bias=-.0001;sun.shadow.radius=3;scene.add(sun);
const fill=new T.DirectionalLight('#c4e9e6',.4);fill.position.set(4,2,-4);scene.add(fill);
const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshBasicMaterial({color:'#f4efe7',toneMapped:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.015;scene.add(floor);const shadowFloor=new T.Mesh(new T.PlaneGeometry(200,200),new T.ShadowMaterial({color:'#46564c',opacity:.20}));shadowFloor.rotation.x=-Math.PI/2;shadowFloor.position.y=-1.014;shadowFloor.receiveShadow=true;scene.add(shadowFloor);
// A soft ambient grounding shadow supplements the directional contact shadows.
const c=document.createElement('canvas');c.width=c.height=128;const cx=c.getContext('2d'),g=cx.createRadialGradient(64,64,9,64,64,64);g.addColorStop(0,'rgba(57,68,57,.25)');g.addColorStop(.65,'rgba(57,68,57,.13)');g.addColorStop(1,'rgba(57,68,57,0)');cx.fillStyle=g;cx.fillRect(0,0,128,128);const contact=new T.Mesh(new T.PlaneGeometry(9,9),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,depthWrite:false}));contact.rotation.x=-Math.PI/2;contact.position.y=-1.011;scene.add(contact);
const time={value:0},dynamics=createWaterDynamics({size:112,extent:SIZE,waterLevel:WATER,bedHeight});
const interactionTexture=new T.DataTexture(dynamics.data,dynamics.size,dynamics.size,T.RGBAFormat,T.FloatType);
interactionTexture.minFilter=interactionTexture.magFilter=renderer.extensions.has('OES_texture_float_linear')?T.LinearFilter:T.NearestFilter;
interactionTexture.generateMipmaps=false;interactionTexture.needsUpdate=true;
const caustics=makeCaustics(renderer,time,interactionTexture);makeTerrain(world,time,caustics.texture);const palms=makePalms(world);makeCharacters(world);
const plot=ISLAND_LAYOUT.building,buildingSeries=createBuildingSeries(world,{position:[plot.x,plot.y,plot.z]}),tableSeries=createTableSeries(world,{...ISLAND_LAYOUT.table,level:0});
const panel=document.querySelector('#ratings-panel'),ratingStore=createRatingsState({persist:false}),ratings=Object.create(null),radar=createRadar(document.querySelector('#radar'),RATING_DIMENSIONS);
let selectedStars=0,controls=null,requestMarineAssets=()=>{},ratingsEnabled=false,ratingContext=null;
function buildingState(){return {stars:selectedStars,building:buildingSeries.getState(),table:tableSeries.getState()}}
const marine=createMarineLife(world,{bedHeight,waterLevel:WATER,extent:SIZE,sampleFlow:(x,z)=>dynamics.sampleFlow(x,z),waterState:()=>dynamics.getState(),disturb:(x,z,strength,radius)=>dynamics.disturb(x,z,strength,radius),sampleSurface:(x,z)=>WATER+sampleWater(x,z).height});
const coconutSources=palms.flatMap(crown=>crown.children.filter(mesh=>mesh.userData.role==='coconut').map(mesh=>({id:mesh.userData.coconutId,treeIndex:mesh.userData.treeIndex,mesh})));
const coconuts=createCoconutEffects(world,{coconuts:coconutSources,bedHeight,waterLevel:WATER,extent:SIZE,sampleFlow:(x,z)=>dynamics.sampleFlow(x,z),sampleSurface:(x,z)=>WATER+sampleWater(x,z).height,disturb:(x,z,strength,radius)=>dynamics.disturb(x,z,strength,radius)});
const replayButton=document.querySelector('#marine-replay');
function cancelRatings(){Object.values(ratings).forEach(rating=>rating.cancel());}
function showRating(key,value){const output=document.querySelector('#value-'+key);output.textContent=value===null?'未评':String(Number.isInteger(value)?value:value.toFixed(1));output.dataset.unrated=String(value===null);}
function applyModel(key,value){
 const stars=value??0;
 if(key==='hotel'){const changed=stars!==selectedStars;buildingSeries.setLevel(stars);tableSeries.setLevel(stars);selectedStars=stars;if(changed)renderer.shadowMap.needsUpdate=true;}
 if(key==='marine'){marine.setLevel(stars);replayButton.disabled=!ratingsEnabled||stars===0;requestMarineAssets(stars);}
}
function syncRating(key,live=false){
 const value=ratingStore.getState().values[key],host=document.querySelector('#rating-'+key),widget=ratings[key];
 widget.setValue(value??0,{preserveDrag:live});host.dataset.unrated=String(value===null);host.closest('.dimension-row')?.setAttribute('data-unrated',String(value===null));
 document.querySelector('#unset-'+key).setAttribute('aria-pressed',String(value===null));
 showRating(key,live?widget.getState().previewValue:value);
}
function setRating(key,value,{persist=false,live=false}={}){
 if(!ratingsEnabled){ratings[key]?.cancel();syncRating(key);return ratingStore.getState();}
 const state=ratingStore.setValue(key,value,{persist:false});applyModel(key,state.values[key]);syncRating(key,live);radar.update(state.values);
 window.dispatchEvent(new CustomEvent('lw5:rating-change',{detail:{key,value:state.values[key],context:ratingContext?{...ratingContext}:null}}));
 return state;
}
function setRatingsEnabled(enabled){
 ratingsEnabled=!!enabled;
 for(const {key} of RATING_DIMENSIONS){
  const host=document.querySelector('#rating-'+key),track=host.querySelector('[role=slider]'),clear=host.querySelector('button');
  host.inert=!ratingsEnabled;host.setAttribute('aria-disabled',String(!ratingsEnabled));
  if(track){track.tabIndex=ratingsEnabled?0:-1;track.setAttribute('aria-disabled',String(!ratingsEnabled));}
  if(clear)clear.disabled=!ratingsEnabled;document.querySelector('#unset-'+key).disabled=!ratingsEnabled;
 }
 replayButton.disabled=!ratingsEnabled||(ratingStore.getState().values.marine??0)===0;
 if(!ratingsEnabled)cancelRatings();
}
function restoreRatings(values={},options={}){
 cancelRatings();controls?.cancel();velocity=0;setRatingsEnabled(false);ratingContext=options.context?{...options.context}:null;
 for(const {key} of RATING_DIMENSIONS){ratingStore.setValue(key,values[key]??null,{persist:false});syncRating(key);}
 const state=ratingStore.getState();for(const key of ['hotel','marine'])applyModel(key,state.values[key]);radar.update(state.values);
 marine.resetMotion();coconuts.reset();dynamics.reset();interactionTexture.needsUpdate=true;renderer.shadowMap.needsUpdate=true;
 setRatingsEnabled(!!options.enabled);return state;
}
function setBuildingLevel(value,persist=true,live=false){const number=value===null?null:Number(value);if(number!==null&&!Number.isFinite(number))return;setRating('hotel',number,{persist,live});return buildingState();}
function setMarineLevel(value,persist=true,live=false){const number=value===null?null:Number(value);if(number!==null&&!Number.isFinite(number))return;setRating('marine',number,{persist,live});return marine.getState();}
const ratingStart=()=>{controls?.cancel();velocity=0;};
for(const {key,label} of RATING_DIMENSIONS){
 ratings[key]=createStarRating(document.querySelector('#rating-'+key),{
  value:ratingStore.getState().values[key]??0,label,
  onPreview:value=>showRating(key,ratings[key]?.getState().dragging?value:ratingStore.getState().values[key]),
  onCommit:(value,meta)=>setRating(key,value,{live:!!meta?.live}),
  onExplicitSelect:value=>{if(ratingStore.getState().values[key]===null)setRating(key,value);},
  onInteractionStart:ratingStart,
 });
 document.querySelector('#unset-'+key).onclick=()=>{ratingStart();ratings[key].cancel();setRating(key,null);};
 syncRating(key);
}
for(const key of ['hotel','marine'])applyModel(key,ratingStore.getState().values[key]);
radar.update(ratingStore.getState().values);marine.resetMotion();
replayButton.onclick=()=>{if(ratingsEnabled)marine.replay();};
setRatingsEnabled(false);

const water=makeWater(scene,camera,renderer,time,caustics.texture,interactionTexture);
let theta=.22,phi=1.03,zoom=1,drag=false,velocity=0,movingUntil=0,lastWake=0,lastWaterHit=null;
const target=new T.Vector3(0,.55,0),raycaster=new T.Raycaster(),pointer=new T.Vector2(),waterPlane=new T.Plane(new T.Vector3(0,1,0),-WATER),hit=new T.Vector3();
let frame=0,lastFrame=null,frameTimes=[],paused=false,stageWidth=0,stageHeight=0,stageRect=null;
function refreshStageBounds(){const r=canvas.getBoundingClientRect();stageRect={left:r.left,top:r.top,width:r.width,height:r.height};return r;}
function view(){
 // Fit the original island/water volume to the embedded stage's short axis.
 // At 390×480 this is approximately 16.67 world units, keeping the island
 // readable without reserving the old floating-panel space.
 const aspect=stageWidth/Math.max(1,stageHeight),base=4.4/(Math.tan(T.MathUtils.degToRad(camera.fov/2))*Math.min(1,aspect)),dist=base*zoom,near=T.MathUtils.clamp((.8-zoom)/.4,0,1);
 target.set(Math.sin(theta)*near*.8,.55-near*.45,Math.cos(theta)*near*.8);camera.position.set(Math.sin(theta)*Math.sin(phi)*dist,Math.cos(phi)*dist,Math.cos(theta)*Math.sin(phi)*dist);camera.lookAt(target);camera.updateMatrixWorld(true);
 const header=stage.querySelector('header');if(header)header.style.opacity=String(T.MathUtils.clamp((zoom-.55)/.25,0,1));movingUntil=performance.now()+250;
}
function resize(){
 const width=Math.max(1,stage.clientWidth),height=Math.max(1,stage.clientHeight),dpr=Math.min(devicePixelRatio,1.75);
 if(width!==stageWidth||height!==stageHeight||dpr!==renderer.getPixelRatio()){
  cancelRatings();controls?.cancel();velocity=0;stageWidth=width;stageHeight=height;renderer.setPixelRatio(dpr);renderer.setSize(width,height,false);camera.aspect=width/height;
  // A small downward framing adjustment leaves room for the stage header.
  camera.setViewOffset(width,height,0,-Math.min(20,height*.04),width,height);camera.updateProjectionMatrix();view();
  const size=renderer.getDrawingBufferSize(new T.Vector2());water.resize(size.x,size.y);
 }
 refreshStageBounds();
}
const stageObserver=new ResizeObserver(resize);stageObserver.observe(stage);addEventListener('resize',resize);globalThis.visualViewport?.addEventListener('resize',resize);resize();
function sampleWater(x,z){const n=dynamics.size,fx=T.MathUtils.clamp((x/SIZE+.5)*(n-1),0,n-1),fz=T.MathUtils.clamp((z/SIZE+.5)*(n-1),0,n-1),ix=Math.min(n-2,Math.floor(fx)),iz=Math.min(n-2,Math.floor(fz)),a=fx-ix,b=fz-iz;const result=[];for(let c=0;c<4;c++){const at=(xx,zz)=>dynamics.data[(zz*n+xx)*4+c];result.push((at(ix,iz)*(1-a)+at(ix+1,iz)*a)*(1-b)+(at(ix,iz+1)*(1-a)+at(ix+1,iz+1)*a)*b)}return {height:result[0],dx:result[1],dz:result[2],wet:result[3]}}
function waterHit(x,y,meanPlane=false){const rect=refreshStageBounds();if(rect.width<=0||rect.height<=0||x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return null;pointer.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);camera.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);waterPlane.constant=-WATER;if(!raycaster.ray.intersectPlane(waterPlane,hit))return null;for(let i=0;i<(meanPlane?0:2);i++){waterPlane.constant=-(WATER+sampleWater(hit.x,hit.z).height);if(!raycaster.ray.intersectPlane(waterPlane,hit))return null;}if(Math.max(Math.abs(hit.x),Math.abs(hit.z))>SIZE/2-.035||bedHeight(hit.x,hit.z)>WATER-.045)return null;const obstruction=raycaster.intersectObjects([buildingSeries.root,tableSeries.root],true)[0];if(obstruction&&obstruction.distance<raycaster.ray.origin.distanceTo(hit))return null;return {x:hit.x,z:hit.z};}
const coconutPoint=new T.Vector3(),coconutProjection=new T.Vector3(),coconutRay=new T.Raycaster();
function projectCoconuts(){
 const rect=refreshStageBounds();world.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 return coconutSources.filter(source=>coconuts.isAttached(source.id)).map(source=>{
  source.mesh.getWorldPosition(coconutPoint);coconutProjection.copy(coconutPoint).project(camera);
  coconutRay.set(camera.position,coconutPoint.clone().sub(camera.position).normalize());
  const obstruction=coconutRay.intersectObjects([buildingSeries.root,tableSeries.root],true)[0];
  const x=rect.left+(coconutProjection.x+1)*rect.width/2,y=rect.top+(1-coconutProjection.y)*rect.height/2;
  return {id:source.id,treeIndex:source.treeIndex,x,y,depth:coconutProjection.z,ready:coconuts.canDrop(source.id),visible:coconutProjection.z>=-1&&coconutProjection.z<=1&&x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom&&(!obstruction||obstruction.distance>=camera.position.distanceTo(coconutPoint)-.09)};
 });
}
function pickCoconut(x,y){
 const rect=refreshStageBounds();if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return null;
 // Expand only the tiny original nuts, not the whole palm crown. Nearby nuts
 // resolve to the closest screen centre and stay bounded by the same budget.
 return projectCoconuts().filter(p=>p.visible).map(p=>({...p,distance:Math.hypot(p.x-x,p.y-y)}))
  .filter(p=>p.distance<=19).sort((a,b)=>a.distance-b.distance||a.depth-b.depth)[0]?.id??null;
}
function touchWater(x,y,strength,force=false){const now=performance.now(),p=waterHit(x,y);if(!p){lastWaterHit=null;return false}if(!force&&((now-lastWake)<45||(lastWaterHit&&Math.hypot(p.x-lastWaterHit.x,p.z-lastWaterHit.z)<.10)))return false;dynamics.disturb(p.x,p.z,strength,force?.24:.17);lastWaterHit=p;lastWake=now;return true;}
function rockScreen(dx,dy){const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0),forward=new T.Vector3(camera.position.x,0,camera.position.z).normalize();dynamics.rock(right.x*dx/145+forward.x*dy/190,right.z*dx/145+forward.z*dy/190);}
const halo=document.querySelector('#water-halo');let deepContact=false,lastStirTime=0;
function endStir(){if(deepContact)dynamics.endStir();deepContact=false;lastWaterHit=null;}
controls=bindIslandGestures(canvas,{
 getTapTarget:pickCoconut,
 onTargetTap:id=>{if(coconuts.drop(id))renderer.shadowMap.needsUpdate=true;},
 isWater:(x,y)=>!!waterHit(x,y,true),
 onStart:()=>{velocity=0;lastWaterHit=null;},
 onMode:mode=>{drag=mode!=='idle';if(mode!=='stir')endStir();},
 onOrbit:(dx,dy,elapsed)=>{rockScreen(T.MathUtils.clamp(dx,-35,35),T.MathUtils.clamp(dy,-35,35));theta-=dx*.006;phi=T.MathUtils.clamp(phi+dy*.004,.6,1.30);velocity=T.MathUtils.clamp(-dx*.006/Math.max(12,elapsed),-.012,.012);view();},
 onOrbitEnd:({cancelled,idleMs})=>{if(cancelled||idleMs>100)velocity=0;else rockScreen(velocity*24,0);},
 onTap:(x,y)=>touchWater(x,y,1.75,true),
 onStirStart:(x,y)=>{velocity=0;lastWaterHit=null;const p=waterHit(x,y,true);if(p){deepContact=dynamics.beginStir(p.x,p.z);lastStirTime=performance.now();}},
 onStirMove:(x,y)=>{const p=waterHit(x,y,true),now=performance.now();if(!p){endStir();return}if(!deepContact){deepContact=dynamics.beginStir(p.x,p.z);}else dynamics.moveStir(p.x,p.z,Math.max(.008,(now-lastStirTime)/1000));lastStirTime=now;},
 onHalo:({visible,x,y})=>{halo.classList.toggle('active',visible);if(visible){halo.style.left=x+'px';halo.style.top=y+'px'}else endStir();},
 onPinchStart:()=>{velocity=0;lastWaterHit=null;return zoom;},
 onPinch:value=>{zoom=T.MathUtils.clamp(value,.40,1.35);velocity=0;view();}
});
ratingsScroll.addEventListener('pointerdown',()=>{controls.cancel();velocity=0;},{capture:true});
for(const button of [replayButton,document.querySelector('#reset')])button.addEventListener('pointerdown',()=>{cancelRatings();controls.cancel();velocity=0;});
function reset(){cancelRatings();controls.cancel();theta=.22;phi=1.03;zoom=1;velocity=0;marine.resetMotion();coconuts.reset();dynamics.reset();interactionTexture.needsUpdate=true;renderer.shadowMap.needsUpdate=true;view();}
document.querySelector('#reset').onclick=reset;
document.addEventListener('visibilitychange',()=>{paused=document.hidden;lastFrame=null;if(paused){cancelRatings();controls.cancel();velocity=0;coconuts.reset();renderer.shadowMap.needsUpdate=true;}});
addEventListener('blur',()=>{cancelRatings();controls.cancel();velocity=0;coconuts.reset();renderer.shadowMap.needsUpdate=true;});
function onPageScroll(event){
 cancelRatings();
 // The lower pane scrolls independently; its momentum cannot cancel a new
 // canvas gesture or move the camera. Pointer entry into that pane stops any
 // previous canvas gesture above. Viewport/document movement still cancels it.
 if(event?.target===ratingsScroll)return;
 controls.cancel();velocity=0;refreshStageBounds();
}
addEventListener('scroll',onPageScroll,{capture:true,passive:true});globalThis.visualViewport?.addEventListener('scroll',onPageScroll,{passive:true});
function animate(ms){requestAnimationFrame(animate);if(paused)return;const elapsed=lastFrame===null?0:Math.max(0,ms-lastFrame);const dt=Math.min(elapsed/1000,.0667);if(lastFrame!==null&&frame>60){frameTimes.push(elapsed);if(frameTimes.length>600)frameTimes.shift()}lastFrame=ms;
 if(!drag&&Math.abs(velocity)>.000015){const delta=velocity*dt*1000;theta+=delta;dynamics.rock(Math.cos(theta)*delta*.26,-Math.sin(theta)*delta*.26);velocity*=Math.pow(.94,dt*1000/16.7);view()}
 time.value+=dt;dynamics.step(dt);marine.step(dt,time.value);coconuts.step(dt,time.value);water.setMarineActive(marine.hasAquatic()||coconuts.hasAquatic());interactionTexture.needsUpdate=true;
 palms.forEach((p,i)=>{p.rotation.z=Math.sin(time.value*.42+i)*.008;p.rotation.x=Math.cos(time.value*.36+i)*.006});if(frame%4===0)renderer.shadowMap.needsUpdate=true;caustics.render();water.render(target,drag||ms<movingUntil);frame++;
}
requestAnimationFrame(animate);
window.preview={renderer,scene,camera,version:16,
 coconuts:{getState:()=>coconuts.getState(),projectTargets:projectCoconuts,pick:pickCoconut},
 ratings:{getState:()=>ratingStore.getState(),setValue:(key,value)=>setRating(key,value),restore:restoreRatings,setEnabled:setRatingsEnabled,cancel:cancelRatings,dimensions:RATING_DIMENSIONS,storageKey:null},
 rating:{building:{getState:()=>ratings.hotel.getState()},marine:{getState:()=>ratings.marine.getState()},storageKey:ratingStore.storageKey},
 marine:{setLevel:setMarineLevel,getState:()=>marine.getState(),replay:()=>marine.replay(),resetMotion:()=>marine.resetMotion(),levels:MARINE_LEVELS},building:{setLevel:setBuildingLevel,getState:buildingState,levels:BUILDING_LEVELS},food:{getAnchors:()=>tableSeries.getFoodAnchors()},setView:(t,p)=>{theta=t;phi=p;velocity=0;view()},reset,
 water:{getState:()=>dynamics.getState(),sampleFlow:(x,z)=>dynamics.sampleFlow(x,z),sample:sampleWater,project:(x,z)=>{const rect=refreshStageBounds(),p=new T.Vector3(x,WATER+sampleWater(x,z).height,z).project(camera);return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2}},texture:interactionTexture},
 getState:()=>{refreshStageBounds();return {theta,phi,zoom,drag,activePointer:controls.getState().activePointer,orbitGesture:controls.getState().mode==='orbit',gesture:controls.getState(),paused,frame,time:time.value,cssWidth:stageWidth,cssHeight:stageHeight,stage:{...stageRect},dpr:renderer.getPixelRatio(),triangles:renderer.info.render.triangles,calls:renderer.info.render.calls}},
 getMetrics:()=>{const a=[...frameTimes].sort((a,b)=>a-b);return {samples:a.length,medianMs:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)],meanMs:a.reduce((s,x)=>s+x,0)/a.length}},resetMetrics:()=>{frameTimes=[];frame=61}};

// Preload independently of the first frame. A unavailable asset leaves the
// existing procedural whale available; other residents and controls stay usable.
const whaleAssetStatus={status:'loading',source:'procedural-fallback'};
window.preview.whaleAsset={getState:()=>({...whaleAssetStatus})};
loadWhaleAsset().then(asset=>{
 if(!asset){whaleAssetStatus.status='fallback';return;}
 try{const accepted=marine.setWhaleAsset(asset);whaleAssetStatus.status=accepted===false?'fallback':'ready';whaleAssetStatus.source=accepted===false?'procedural-fallback':'alenzo';}
 catch{whaleAssetStatus.status='fallback';}
}).catch(()=>{whaleAssetStatus.status='fallback';});

// Load only species requested by the selected rating, with two bounded
// transfers at a time. Existing residents stay usable while originals arrive.
const marineAssetLoader=createMarineAssetPreloader({
 specs:[
  {kind:'turtle',minLevel:3},
  {kind:'manta',minLevel:4},
  {kind:'reefShark',minLevel:4.5},
 ],
 loadAsset:kind=>loadMarineAsset(kind),
 registerAsset:(kind,asset,options)=>marine.setMarineAsset(kind,asset,options),
});
requestMarineAssets=level=>marineAssetLoader.ensure(level);
window.preview.marineAssets={getState:()=>marineAssetLoader.getState()};
requestMarineAssets(marine.getState().level);

// The host owns records. This bridge only restores or displays a selected draft.
export const journalScene={restore:restoreRatings,setEnabled:setRatingsEnabled,cancel:cancelRatings,getState:()=>ratingStore.getState()};
window.dispatchEvent(new CustomEvent('lw5:scene-ready',{detail:{scene:journalScene}}));
