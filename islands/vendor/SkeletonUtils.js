// Locally authored, narrow skeleton-safe clone helper for Three.js r180.
// Mesh geometry/materials stay shared; bones and Skeleton instances are private.
// Uses only public Three.js Object3D, SkinnedMesh and Skeleton APIs.
export function clone(source) {
 const copy=source.clone(true),sourceToClone=new Map(),cloneToSource=new Map();
 function pair(a,b){sourceToClone.set(a,b);cloneToSource.set(b,a);for(let i=0;i<a.children.length;i++)pair(a.children[i],b.children[i]);}
 pair(source,copy);
 copy.traverse(node=>{
  if(!node.isSkinnedMesh)return;
  const original=cloneToSource.get(node);
  node.skeleton=original.skeleton.clone();
  node.skeleton.bones=original.skeleton.bones.map(bone=>{
   const ownBone=sourceToClone.get(bone);
   if(!ownBone)throw new Error('Whale skeleton contains a bone outside its clone root');
   return ownBone;
  });
  node.bindMatrix.copy(original.bindMatrix);
  node.bind(node.skeleton,node.bindMatrix);
 });
 return copy;
}
