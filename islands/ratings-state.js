// UI rating state. The journal creates this with persist:false so only its
// explicit-save repository owns records; preview preferences are never imported.
export const RATINGS_STORAGE_KEY='lw5-little-island:preview-selection:v2';
export const LEGACY_RATINGS_STORAGE_KEY='lw5-little-island:preview-selection:v1';
export const RATING_DIMENSIONS=Object.freeze([
 {key:'scenery',label:'景色'},
 {key:'transport',label:'交通便利程度',shortLabel:'交通'},
 {key:'food',label:'美食'},
 {key:'service',label:'服务'},
 {key:'water',label:'海水'},
 {key:'marine',label:'海洋生物'},
 {key:'hotel',label:'酒店设施'},
 {key:'value',label:'性价比'},
].map(Object.freeze));
const keys=RATING_DIMENSIONS.map(d=>d.key);
const emptyValues=()=>Object.fromEntries(keys.map(key=>[key,null]));
const validStoredValue=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=5&&Number.isInteger(value*2);

export function createRatingsState(options={}){
 const persistent=options.persist!==false,storageKey=options.storageKey||RATINGS_STORAGE_KEY,legacyKey=options.legacyKey||LEGACY_RATINGS_STORAGE_KEY;
 let storage=null,storageStatus='ready',restoredFrom='empty',values=emptyValues();
 try{if(persistent){storage=Object.hasOwn(options,'storage')?options.storage:globalThis.localStorage;if(!storage)storageStatus='unavailable';}else storageStatus='memory';}
 catch{storageStatus='unavailable';}
 function persist(){
  if(!storage)return false;
  try{storage.setItem(storageKey,JSON.stringify({version:2,values}));storageStatus='ready';return true;}
  catch{storageStatus='write-failed';return false;}
 }
 if(storage){
  try{
   const current=storage.getItem(storageKey);
   if(current!==null){
    // The existence of v2 always wins, even if one field (or the JSON itself)
    // is corrupt. Never replace a user's newer choices with a v1 snapshot.
    restoredFrom='v2';let parsed;
    try{parsed=JSON.parse(current);}catch{/* Recover as independently unrated. */}
    if(parsed?.version===2&&parsed.values&&typeof parsed.values==='object'){
     for(const key of keys)values[key]=validStoredValue(parsed.values[key])?parsed.values[key]:null;
    }
   }else{
    const legacy=storage.getItem(legacyKey);let parsed;
    try{parsed=legacy===null?null:JSON.parse(legacy);}catch{/* No valid old preview to migrate. */}
    if(parsed?.version===1){
     values.hotel=validStoredValue(parsed.building)?parsed.building:null;
     values.marine=validStoredValue(parsed.marine)?parsed.marine:null;
     restoredFrom='v1';persist();
    }
   }
  }catch{storageStatus='read-failed';}
 }
 function getState(){return {version:2,values:{...values},ratedCount:keys.filter(key=>values[key]!==null).length,storageKey:persistent?storageKey:null,restoredFrom,storageStatus};}
 function setValue(key,value,{persist:shouldPersist=true}={}){
  if(!keys.includes(key))throw new RangeError('Unknown preview rating dimension: '+key);
  if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)))throw new TypeError('A preview rating must be a finite number or null');
  const next=value===null?null:Math.round(Math.max(0,Math.min(5,value))*2)/2;
  const changed=values[key]!==next;values[key]=next;
  if(persistent&&shouldPersist&&(changed||storageStatus==='write-failed'))persist();
  return getState();
 }
 return {getState,setValue,dimensions:RATING_DIMENSIONS,storageKey:persistent?storageKey:null};
}
