import * as T from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {clone as cloneSkeleton} from './vendor/SkeletonUtils.js';

// These four local binaries are unchanged originals. Full skinned vertices were
// measured offline at 240 Hz plus every animation keyframe. The fixed SHA and
// structural checks let phones use the verified envelope without resampling
// millions of vertices on their UI thread. See evidence/v13/model-envelope-cpu.json.
const VERIFIED = {
  "manta": {
    "file": "manta",
    "bytes": 2004784,
    "sha256": "534561dd996d2e5aaed9cfb3b455b6122c33659d0b4e7bb3227d2eeb54afe4ec",
    "clip": "Swimming",
    "duration": 7.300000190734863,
    "headingRotation": 1.5707963267948966,
    "targetLength": 0.61,
    "nativeMin": [
      -5.211913887420248,
      -0.8781564000133315,
      -4.494340324525244
    ],
    "nativeMax": [
      2.9905897432584814,
      1.4466969872071402,
      4.494103888133669
    ],
    "uniformScale": 0.07436753794518278,
    "displaySize": [
      0.61,
      0.17289362249110515,
      0.6684484660530702
    ],
    "bounds": {
      "length": 0.622,
      "width": 0.6804484660530702,
      "halfHeight": 0.09244681124555258,
      "radius": 0.4584719195068083
    },
    "sampleHz": 240,
    "samples": 1972,
    "vertices": 1021,
    "vertexSamples": 2013412,
    "meshes": 1,
    "triangles": 1596,
    "bones": 37,
    "source": "violaine-gltf"
  },
  "turtle": {
    "file": "turtle",
    "bytes": 3631336,
    "sha256": "a353b651c46cd66e45dd064925079688d0ed44c8001a25630a39489cf3b252ba",
    "clip": "Swim Cycle",
    "duration": 1,
    "headingRotation": -1.5707963267948966,
    "targetLength": 0.388,
    "nativeMin": [
      -0.12089219321517693,
      -0.12557814773197193,
      -0.2336207224311944
    ],
    "nativeMax": [
      0.24623032838077483,
      0.1113920544809856,
      0.17502434196600053
    ],
    "uniformScale": 1.0568678770054474,
    "displaySize": [
      0.38800000000000007,
      0.25044619452635997,
      0.43188384165821775
    ],
    "bounds": {
      "length": 0.4000000000000001,
      "width": 0.44388384165821776,
      "halfHeight": 0.13122309726318,
      "radius": 0.29628763868164476
    },
    "sampleHz": 240,
    "samples": 269,
    "vertices": 4346,
    "vertexSamples": 1169074,
    "meshes": 3,
    "triangles": 7904,
    "bones": 25,
    "source": "digitallife3d-gltf"
  },
  "reefShark": {
    "file": "shark",
    "bytes": 7072212,
    "sha256": "1056b1bc09f11e259aca73f7d56e7b614ddff64299c2530990e792878a6a6610",
    "clip": "Action_Shark Armature",
    "duration": 4.583333492279053,
    "headingRotation": 3.141592653589793,
    "targetLength": 0.68,
    "nativeMin": [
      -4.0984667356560935,
      -21.227600465261155,
      -1.5499239756083982
    ],
    "nativeMax": [
      4.333014033907609,
      -18.63988517498173,
      1.601835931224861
    ],
    "uniformScale": 0.08065012760922036,
    "displaySize": [
      0.68,
      0.20869956837736645,
      0.25418983867972683
    ],
    "bounds": {
      "length": 0.6920000000000001,
      "width": 0.26618983867972684,
      "halfHeight": 0.11034978418868323,
      "radius": 0.36897812402678815
    },
    "sampleHz": 240,
    "samples": 1212,
    "vertices": 12048,
    "vertexSamples": 14602176,
    "meshes": 2,
    "triangles": 22128,
    "bones": 43,
    "source": "optic-idealist-gltf",
    "rootMotion": {
      "track": "Shark_Armature_44.position",
      "from": [
        0,
        0,
        0
      ],
      "to": [
        -0.51768958568573,
        4.774362087691948e-16,
        -3.582454360831315e-14
      ],
      "mode": "linear-cycle-displacement"
    }
  },
  "smallFish": {
    "file": "gray-fish",
    "bytes": 98184,
    "sha256": "5c74dedda5054db20d7f219d63e53018d6298a231decc221edf71d6feb35dcb2",
    "clip": "ArmatureAction",
    "duration": 1.7083333730697632,
    "headingRotation": 2.471078414642346,
    "targetLength": 0.198,
    "nativeMin": [
      -1.2878665413043964,
      -0.3619439375332296,
      -0.5674379935347507
    ],
    "nativeMax": [
      0.7070996023127144,
      0.498542497609318,
      0.43387481209067524
    ],
    "uniformScale": 0.09924980463127182,
    "displaySize": [
      0.198,
      0.0854031105757574,
      0.09938010033311417
    ],
    "bounds": {
      "length": 0.21000000000000002,
      "width": 0.11138010033311417,
      "halfHeight": 0.0487015552878787,
      "radius": 0.11677048833310685
    },
    "sampleHz": 240,
    "samples": 452,
    "vertices": 314,
    "vertexSamples": 141928,
    "meshes": 1,
    "triangles": 534,
    "bones": 5,
    "source": "atlas-gltf"
  }
};
function deepFreeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;}
export const MARINE_ASSET_SPECS=deepFreeze(VERIFIED);
export const MARINE_ASSET_KINDS=Object.freeze(Object.keys(VERIFIED));
export const MARINE_ASSET_URLS=Object.freeze(Object.fromEntries(MARINE_ASSET_KINDS.map(kind=>[kind,new URL(`./assets/marine-imports/${VERIFIED[kind].file}.glb`,import.meta.url).href])));
const BOUNDS_MARGIN=.006;
function specFor(kind){const spec=VERIFIED[kind];if(!spec)throw new Error(`Unsupported marine asset kind: ${kind}`);return spec;}
function materialsOf(mesh){return Array.isArray(mesh.material)?mesh.material:[mesh.material];}
function collectResources(root){
 const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
 root?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.skeleton)skeletons.add(o.skeleton);for(const material of materialsOf(o))if(material){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
 return {geometries,materials,textures,skeletons};
}
function disposeShared(resources){
 for(const skeleton of resources.skeletons)skeleton.dispose();for(const geometry of resources.geometries)geometry.dispose();for(const material of resources.materials)material.dispose();
 const images=new Set();for(const texture of resources.textures){if(texture.source?.data)images.add(texture.source.data);texture.dispose();}for(const image of images)if(typeof image.close==='function')image.close();
}
function meshList(root){const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);});return meshes;}
function updateSkin(root,meshes){root.updateMatrixWorld(true);for(const mesh of meshes)mesh.skeleton?.update();}
function expandVertices(box,meshes){const point=new T.Vector3();for(const mesh of meshes)for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.z))throw new Error('Non-finite marine vertex');box.expandByPoint(point);}}
function sourceDisplay(kind,original,clip){
 const spec=specFor(kind),alignment=new T.Group();alignment.name=`${kind}-original-orientation`;alignment.rotation.y=spec.headingRotation;alignment.add(original);
 const display=new T.Group();display.name=`${kind}-in-place-display`;display.add(alignment);
 let travel=null;
 if(spec.rootMotion){
  const track=clip.tracks.find(track=>track.name===spec.rootMotion.track);
  if(!track||track.getValueSize()!==3||spec.rootMotion.from.some((value,i)=>Math.abs(track.values[i]-value)>1e-9)||spec.rootMotion.to.some((value,i)=>Math.abs(track.values[track.values.length-3+i]-value)>1e-9))throw new Error('Original shark root travel does not match the verified source');
  // This source's root translation is in scene axes. Cancel only its linear
  // one-cycle travel in a private parent, retaining all original keyframes and
  // periodic motion. The unmodified controller supplies forward locomotion.
  const node=original.getObjectByName(spec.rootMotion.track.slice(0,-9));if(!node)throw new Error('Original shark motion node is missing');
  display.updateMatrixWorld(true);const parentInSource=new T.Matrix4().copy(alignment.matrixWorld).invert().multiply(node.parent.matrixWorld),parentLinear=new T.Matrix3().setFromMatrix4(parentInSource);
  travel=new T.Vector3().fromArray(spec.rootMotion.to).sub(new T.Vector3().fromArray(spec.rootMotion.from)).applyMatrix3(parentLinear).applyAxisAngle(new T.Vector3(0,1,0),spec.headingRotation);
 }
 return {root:display,travel,apply(time){if(travel){const cycle=((time%clip.duration)+clip.duration)%clip.duration;display.position.copy(travel).multiplyScalar(-cycle/clip.duration);}}};
}

// Offline QA only. Loading a production asset reads the verified constants above.
export function sampleMarineEnvelope(kind,gltf,{sampleHz=240}={}){
 const spec=specFor(kind),clip=gltf.animations.find(animation=>animation.name===spec.clip),original=gltf.scene,meshes=meshList(original),display=sourceDisplay(kind,original,clip),mixer=new T.AnimationMixer(original);
 mixer.clipAction(clip).play();const count=Math.ceil(clip.duration*sampleHz),times=new Set([0,clip.duration,Math.max(0,clip.duration-1e-7)]);
 for(let i=0;i<=count;i++)times.add(i/count*clip.duration);for(const track of clip.tracks)for(const time of track.times)if(time>=0&&time<=clip.duration)times.add(time);
 const samples=[...times].sort((a,b)=>a-b),envelope=new T.Box3();
 for(const time of samples){mixer.setTime(time);display.apply(time);updateSkin(display.root,meshes);expandVertices(envelope,meshes);}
 mixer.stopAllAction();mixer.uncacheRoot(original);original.removeFromParent();
 const size=envelope.getSize(new T.Vector3()),uniformScale=spec.targetLength/size.x,scaled=size.clone().multiplyScalar(uniformScale),vertices=meshes.reduce((sum,mesh)=>sum+mesh.geometry.attributes.position.count,0);
 return {kind,nativeMin:envelope.min.toArray(),nativeMax:envelope.max.toArray(),uniformScale,displaySize:scaled.toArray(),bounds:{length:scaled.x+2*BOUNDS_MARGIN,width:scaled.z+2*BOUNDS_MARGIN,halfHeight:scaled.y/2+BOUNDS_MARGIN,radius:Math.hypot(scaled.x/2,scaled.z/2)+BOUNDS_MARGIN},sampleHz,samples:samples.length,vertices,vertexSamples:samples.length*vertices,rootMotion:spec.rootMotion||null};
}

export function createMarineLoader(kind){specFor(kind);return new GLTFLoader();}

// CPU tooling may call this with the same loader and test-only texture stubs.
// Production loadMarineAsset verifies the binary before calling preparation.
export function prepareMarineAsset(kind,gltf){
 const spec=specFor(kind),original=gltf?.scene,clip=gltf?.animations?.find(animation=>animation.name===spec.clip);
 if(!original||!clip||Math.abs(clip.duration-spec.duration)>1e-5)throw new Error(`Original ${kind} swimming clip is missing`);
 const bodies=meshList(original),triangles=bodies.reduce((sum,mesh)=>sum+(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3,0),vertices=bodies.reduce((sum,mesh)=>sum+mesh.geometry.attributes.position.count,0),bones=new Set(bodies.flatMap(mesh=>mesh.skeleton?.bones||[]));
 if(bodies.length!==spec.meshes||triangles!==spec.triangles||vertices!==spec.vertices||bones.size!==spec.bones||bodies.some(mesh=>!mesh.isSkinnedMesh))throw new Error(`Original ${kind} geometry or skeleton does not match the verified source`);
 for(const mesh of bodies){
  const sourceMaterials=materialsOf(mesh);
  for(const material of sourceMaterials){const materialIndex=gltf.parser?.associations?.get(material)?.materials,definition=gltf.parser?.json?.materials?.[materialIndex];if(definition?.pbrMetallicRoughness?.baseColorTexture&&!material.map||definition?.normalTexture&&!material.normalMap)throw new Error(`Original ${kind} textures did not decode completely`);}
  mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false;
 }
 const display=sourceDisplay(kind,original,clip);
 const center=new T.Vector3().fromArray(spec.nativeMin).add(new T.Vector3().fromArray(spec.nativeMax)).multiplyScalar(.5),normalizer=new T.Group();normalizer.name=`${kind}-uniform-display`;normalizer.scale.setScalar(spec.uniformScale);normalizer.position.copy(center).multiplyScalar(-spec.uniformScale);normalizer.add(display.root);
 const template=new T.Group();template.name=`${kind}-asset-template`;template.add(normalizer);
 // One original pose is checked after assembly as a cheap guard against a bad
 // loader or changed normalization. The complete animation envelope is baked.
 const mixer=new T.AnimationMixer(template);mixer.clipAction(clip).play();mixer.setTime(0);display.apply(0);updateSkin(template,bodies);const firstPose=new T.Box3();expandVertices(firstPose,bodies);
 if(firstPose.min.x< -spec.bounds.length/2||firstPose.max.x>spec.bounds.length/2||firstPose.min.y< -spec.bounds.halfHeight||firstPose.max.y>spec.bounds.halfHeight||firstPose.min.z< -spec.bounds.width/2||firstPose.max.z>spec.bounds.width/2){mixer.stopAllAction();mixer.uncacheRoot(template);throw new Error(`Verified ${kind} envelope does not contain its first pose`);}
 mixer.stopAllAction();mixer.uncacheRoot(template);template.updateMatrixWorld(true);
 const shared=collectResources(template),instances=new Set(),credit=Object.freeze({...gltf.parser?.json?.asset?.extras}),bounds=Object.freeze({...spec.bounds});
 const sampling=Object.freeze({mode:'offline-verified',clip:clip.name,duration:clip.duration,sampleHz:spec.sampleHz,samples:spec.samples,vertices:spec.vertices,vertexSamples:spec.vertexSamples,margin:BOUNDS_MARGIN,nativeMin:[...spec.nativeMin],nativeMax:[...spec.nativeMax],uniformScale:spec.uniformScale,headingRotation:spec.headingRotation,displaySize:[...spec.displaySize],sha256:spec.sha256,rootMotion:spec.rootMotion||null});
 let disposed=false,created=0,released=0;
 const asset={kind,source:spec.source,animationClip:clip.name,bounds,sampling,credit,
  create({seed=0,variant=0}={}){
   if(disposed)throw new Error(`${kind} asset is disposed`);
   let root,ownMixer,ownDisplay;const privateSkeletons=new Set();
   try{
    root=cloneSkeleton(template);root.name=`marine-${kind}`;Object.assign(root.userData,{marineKind:kind,marineSource:spec.source,animationClip:clip.name,modelTriangles:triangles,marineUniformScale:spec.uniformScale,marineVariant:variant});
    root.traverse(node=>{if(node.isSkinnedMesh){privateSkeletons.add(node.skeleton);node.frustumCulled=false;}});
    ownMixer=new T.AnimationMixer(root);ownMixer.clipAction(clip).play();
    if(spec.rootMotion){const group=root.getObjectByName(`${kind}-in-place-display`),nativeTravel=display.travel.clone();ownDisplay={apply(time){const cycle=((time%clip.duration)+clip.duration)%clip.duration;group.position.copy(nativeTravel).multiplyScalar(-cycle/clip.duration);}};}
   }catch(error){ownMixer?.stopAllAction();if(root)ownMixer?.uncacheRoot(root);for(const skeleton of privateSkeletons)skeleton.dispose();throw error;}
   const phase=Number.isFinite(seed)?((seed*.61803398875)%1+1)%1*clip.duration:0;let instanceDisposed=false;
   const model={root,kind,source:spec.source,animationClip:clip.name,bounds:{...bounds},
    animate(time){if(instanceDisposed)return;const animationTime=(Number.isFinite(time)?Math.max(0,time):0)+phase;ownMixer.setTime(animationTime);ownDisplay?.apply(animationTime);root.updateMatrixWorld(true);for(const skeleton of privateSkeletons)skeleton.update();},
    dispose(){if(instanceDisposed)return;instanceDisposed=true;ownMixer.stopAllAction();ownMixer.uncacheRoot(root);for(const skeleton of privateSkeletons)skeleton.dispose();instances.delete(model);released++;}
   };
   instances.add(model);created++;try{model.animate(0);}catch(error){model.dispose();throw error;}return model;
  },
  getStats(){return {kind,source:spec.source,status:disposed?'disposed':'ready',disposed,animationClip:clip.name,animationDuration:clip.duration,availableClips:gltf.animations.map(animation=>animation.name),bones:spec.bones,meshes:bodies.length,triangles,geometries:disposed?0:shared.geometries.size,materials:disposed?0:shared.materials.size,textures:disposed?0:shared.textures.size,instances:instances.size,refCount:instances.size,created,released,uniformScale:spec.uniformScale,bounds:{...bounds},sampling,credit};},
  dispose(){if(disposed)return;disposed=true;for(const instance of [...instances])instance.dispose();disposeShared(shared);template.clear();}
 };
 return asset;
}

// A failed optional source leaves that species' procedural fallback available.
// There is one bounded request and no automatic retry or background rejection.
export async function loadMarineAsset(kind,{url=MARINE_ASSET_URLS[kind],onError}={}){
 let gltf,timer;const abort=new AbortController();
 try{
  const spec=specFor(kind);timer=setTimeout(()=>abort.abort(),180000);
  const requestURL=new URL(url,import.meta.url).href,response=await fetch(requestURL,{signal:abort.signal,credentials:'same-origin'});if(!response.ok)throw new Error(`Marine ${kind} asset HTTP ${response.status}`);
  const bytes=await response.arrayBuffer();if(bytes.byteLength!==spec.bytes)throw new Error(`Marine ${kind} asset byte count does not match`);
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes),sha256=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');if(sha256!==spec.sha256)throw new Error(`Marine ${kind} asset checksum does not match`);
  gltf=await createMarineLoader(kind).parseAsync(bytes,new URL('.',requestURL).href);return prepareMarineAsset(kind,gltf);
 }catch(error){if(gltf?.scene)disposeShared(collectResources(gltf.scene));try{onError?.(error);}catch{}return null;}
 finally{clearTimeout(timer);}
}
