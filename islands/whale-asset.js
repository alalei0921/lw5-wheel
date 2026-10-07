import * as T from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {clone as cloneSkeleton} from './vendor/SkeletonUtils.js';

export const WHALE_ASSET_URL=new URL('./assets/whale-shark/whale-shark-alenzo.glb',import.meta.url).href;
export const WHALE_CREDIT=Object.freeze({title:'Whale Shark Fantasy',author:'Alenzo',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',source:'https://sketchfab.com/3d-models/whale-shark-fantasy-451892c9c18c4d74bf893bea8b626b02',sha256:'e88a5ccecc01582004bc7ed0601c70ee8a6ee63cc568049b12d29fc629b28719'});
const LENGTH=1.30,SAMPLE_HZ=240,BOUNDS_MARGIN=.008;
function materialsOf(mesh){return Array.isArray(mesh.material)?mesh.material:[mesh.material];}
function collectResources(root){const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.skeleton)skeletons.add(o.skeleton);for(const m of materialsOf(o))if(m){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});return {geometries,materials,textures,skeletons};}
function disposeShared(resources){for(const s of resources.skeletons)s.dispose();for(const g of resources.geometries)g.dispose();for(const m of resources.materials)m.dispose();const images=new Set();for(const t of resources.textures){if(t.source?.data)images.add(t.source.data);t.dispose();}for(const image of images)if(typeof image.close==='function')image.close();}

// The binary and its copyright metadata remain untouched. Omitting only the
// environment node mesh references in the loader's in-memory JSON prevents their
// four unused materials/textures from ever being decoded or sent to the GPU.
export function createWhaleLoader(){
 const loader=new GLTFLoader();
 loader.register(parser=>({name:'LW5_whale_only',beforeRoot(){const json=parser.json,omitted=[];for(const node of json.nodes||[]){if(node.mesh===undefined)continue;const mesh=json.meshes[node.mesh],isWhale=mesh.primitives.every(p=>json.materials?.[p.material]?.name==='WhaleShark');if(!isWhale){omitted.push(node.name||mesh.name||String(node.mesh));delete node.mesh;delete node.skin;}}parser.__whaleOmitted=omitted;}}));
 return loader;
}

// This exported preparation function also permits GPU-free geometry QA with
// the same trusted loader and texture placeholders supplied only by the test.
export function prepareWhaleAsset(gltf){
 const original=gltf?.scene,clip=gltf?.animations?.find(a=>a.name==='Swimming');
 if(!original||!clip)throw new Error('Whale body or original Swimming clip is missing');
 const bodies=[];original.traverse(o=>{if(o.isMesh&&materialsOf(o).some(m=>m?.name==='WhaleShark'))bodies.push(o);});
 if(bodies.length!==1||!bodies[0].isSkinnedMesh)throw new Error('Expected the original single skinned whale body');
 const body=bodies[0],whaleMaterial=materialsOf(body)[0],removed=[];
 if(!whaleMaterial.map||!whaleMaterial.emissiveMap||!whaleMaterial.roughnessMap||!whaleMaterial.metalnessMap)throw new Error('Original whale textures did not decode completely');
 original.traverse(o=>{if(o.isMesh&&!bodies.includes(o))removed.push(o);});for(const o of removed){disposeShared(collectResources(o));o.removeFromParent();}
 for(const name of ['particles','ocean'])original.getObjectByName(name)?.removeFromParent();
 for(const mesh of bodies){mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false;}
 const mixer=new T.AnimationMixer(original),action=mixer.clipAction(clip);action.play();mixer.setTime(0);original.updateMatrixWorld(true);
 const head=original.getObjectByName('ORG_head_WhaleSharkRig'),tail=original.getObjectByName('ORG-spine05_WhaleSharkRig');
 if(!head||!tail)throw new Error('Expected whale orientation bones are missing');
 const forward=head.getWorldPosition(new T.Vector3()).sub(tail.getWorldPosition(new T.Vector3()));forward.y=0;
 if(forward.lengthSq()<1e-8)throw new Error('Whale forward axis cannot be determined');
 const alignment=new T.Group();alignment.name='whale-original-orientation';alignment.rotation.y=Math.atan2(forward.z,forward.x);alignment.add(original);alignment.updateMatrixWorld(true);
 const times=new Set([0]);for(let i=0;i<=Math.ceil(clip.duration*SAMPLE_HZ);i++)times.add(i/Math.ceil(clip.duration*SAMPLE_HZ)*clip.duration);for(const track of clip.tracks)for(const t of track.times)if(t>=0&&t<=clip.duration)times.add(t);
 const samples=[...times].sort((a,b)=>a-b),envelope=new T.Box3(),point=new T.Vector3();let vertexSamples=0;
 for(const time of samples){mixer.setTime(time);alignment.updateMatrixWorld(true);body.skeleton.update();for(let i=0;i<body.geometry.attributes.position.count;i++){body.getVertexPosition(i,point).applyMatrix4(body.matrixWorld);if(![point.x,point.y,point.z].every(Number.isFinite))throw new Error('Non-finite animated whale vertex');envelope.expandByPoint(point);vertexSamples++;}}
 const nativeSize=envelope.getSize(new T.Vector3()),center=envelope.getCenter(new T.Vector3()),uniformScale=LENGTH/nativeSize.x;
 if(!Number.isFinite(uniformScale)||uniformScale<=0)throw new Error('Invalid whale display scale');
 const normalizer=new T.Group();normalizer.name='whale-uniform-display';normalizer.scale.setScalar(uniformScale);normalizer.position.copy(center).multiplyScalar(-uniformScale);normalizer.add(alignment);
 const template=new T.Group();template.name='whale-asset-template';template.add(normalizer);mixer.stopAllAction();mixer.uncacheRoot(original);mixer.setTime(0);template.updateMatrixWorld(true);
 const size=nativeSize.clone().multiplyScalar(uniformScale),bounds=Object.freeze({length:size.x+BOUNDS_MARGIN*2,width:size.z+BOUNDS_MARGIN*2,halfHeight:size.y/2+BOUNDS_MARGIN,radius:Math.hypot(size.x/2,size.z/2)+BOUNDS_MARGIN});
 const shared=collectResources(template),instances=new Set();let disposed=false,created=0,released=0;
 const sampling=Object.freeze({clip:clip.name,duration:clip.duration,sampleHz:SAMPLE_HZ,samples:samples.length,vertices:body.geometry.attributes.position.count,vertexSamples,margin:BOUNDS_MARGIN,nativeMin:envelope.min.toArray(),nativeMax:envelope.max.toArray(),uniformScale,headingRotation:alignment.rotation.y,displaySize:size.toArray()});
 const triangles=(body.geometry.index?body.geometry.index.count:body.geometry.attributes.position.count)/3,availableClips=gltf.animations.map(a=>a.name),omittedEnvironment=gltf.parser?.__whaleOmitted||removed.map(o=>o.name);
 const asset={source:'alenzo-gltf',animationClip:'Swimming',bounds,sampling,credit:WHALE_CREDIT,
  create({seed=0}={}){
   if(disposed)throw new Error('Whale asset has been disposed');
   const root=cloneSkeleton(template);root.name='marine-whaleShark';root.userData.marineKind='whaleShark';root.userData.marineSource='alenzo-gltf';root.userData.animationClip='Swimming';root.userData.modelTriangles=triangles;root.userData.whaleUniformScale=uniformScale;
   const ownMixer=new T.AnimationMixer(root),ownAction=ownMixer.clipAction(clip);ownAction.play();const skeletons=new Set();root.traverse(o=>{if(o.isSkinnedMesh){skeletons.add(o.skeleton);o.frustumCulled=false;}});
   let instanceDisposed=false;const phase=Number.isFinite(seed)?((seed*.61803398875)%1+1)%1*clip.duration:0;
   const model={root,kind:'whaleShark',source:'alenzo-gltf',animationClip:'Swimming',bounds:{...bounds},
    animate(time){if(instanceDisposed)return;ownMixer.setTime((Number.isFinite(time)?Math.max(0,time):0)+phase);root.updateMatrixWorld(true);for(const skeleton of skeletons)skeleton.update();},
    dispose(){if(instanceDisposed)return;instanceDisposed=true;ownMixer.stopAllAction();ownMixer.uncacheRoot(root);for(const skeleton of skeletons)skeleton.dispose();instances.delete(model);released++;}
   };
   instances.add(model);created++;model.animate(0);return model;
  },
  getStats(){return {source:'alenzo-gltf',status:disposed?'disposed':'ready',disposed,animationClip:clip.name,animationDuration:clip.duration,availableClips:[...availableClips],bones:body.skeleton.bones.length,meshes:bodies.length,triangles,geometries:disposed?0:shared.geometries.size,materials:disposed?0:shared.materials.size,textures:disposed?0:shared.textures.size,instances:instances.size,created,released,uniformScale,bounds:{...bounds},sampling,omittedEnvironment:[...omittedEnvironment],credit:WHALE_CREDIT};},
  dispose(){if(disposed)return;disposed=true;for(const instance of [...instances])instance.dispose();disposeShared(shared);template.clear();}
 };
 return asset;
}

// Expected asset/network failures resolve to null, allowing the procedural whale
// to remain live. No detached promise, retry storm or unhandled rejection.
export async function loadWhaleAsset({url=WHALE_ASSET_URL,onError}={}){
 let gltf;const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),120000);
 try{const requestURL=new URL(url,import.meta.url).href,response=await fetch(requestURL,{signal:abort.signal,credentials:'same-origin'});if(!response.ok)throw new Error(`Whale asset HTTP ${response.status}`);const bytes=await response.arrayBuffer();gltf=await createWhaleLoader().parseAsync(bytes,new URL('.',requestURL).href);return prepareWhaleAsset(gltf);}
 catch(error){if(gltf?.scene)disposeShared(collectResources(gltf.scene));try{onError?.(error);}catch{}return null;}
 finally{clearTimeout(timer);}
}
