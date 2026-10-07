// Independent, bounded asset loading for the marine preview. Geometry remains
// available through the procedural fallback while a requested original loads.
export function createMarineAssetPreloader({specs,loadAsset,registerAsset,maxConcurrent=2}){
 if(!Array.isArray(specs)||typeof loadAsset!=='function'||typeof registerAsset!=='function')throw new TypeError('Marine asset preloader requires specs and callbacks');
 const entries=specs.map(spec=>({...spec,status:'idle',error:null,startedAt:null,finishedAt:null}));
 const limit=Math.max(1,Math.min(2,Math.floor(maxConcurrent)||1));
 let level=0,active=0,scheduled=false,disposed=false;
 const timestamp=()=>globalThis.performance?.now?.()??Date.now();
 function schedule(){if(scheduled||disposed)return;scheduled=true;queueMicrotask(()=>{scheduled=false;drain();});}
 function drain(){
  if(disposed)return;
  for(const entry of entries){
   if(active>=limit)break;
   if(entry.status!=='idle'||level<entry.minLevel)continue;
   entry.status='loading';entry.startedAt=timestamp();active++;
   Promise.resolve().then(()=>loadAsset(entry.kind)).then(asset=>{
    if(disposed){asset?.dispose?.();return;}
    if(!asset){entry.status='fallback';entry.error='unavailable';return;}
    let accepted=false;
    try{accepted=registerAsset(entry.kind,asset,entry.variants?{variants:entry.variants}:undefined)!==false;}
    catch{entry.error='registration-failed';}
    if(!accepted){asset.dispose?.();entry.status='fallback';entry.error||='registration-rejected';return;}
    entry.status='ready';entry.error=null;
   }).catch(()=>{if(!disposed){entry.status='fallback';entry.error='load-failed';}}).finally(()=>{
    active--;entry.finishedAt=timestamp();schedule();
   });
  }
 }
 return {
  ensure(value){if(disposed)return;level=Number.isFinite(value)?Math.min(5,Math.max(0,value)):0;schedule();},
  getState(){return Object.fromEntries(entries.map(entry=>[entry.kind,{status:entry.status,error:entry.error,minLevel:entry.minLevel,variants:entry.variants?[...entry.variants]:null,seconds:entry.startedAt===null?null:((entry.finishedAt??timestamp())-entry.startedAt)/1000}]));},
  dispose(){disposed=true;for(const entry of entries)if(entry.status==='idle'||entry.status==='loading')entry.status='disposed';},
 };
}
