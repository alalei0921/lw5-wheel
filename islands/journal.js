import * as localStore from './journal-store.js';
import {RATING_DIMENSIONS} from './ratings-state.js';
import {createRadar} from './radar.js';

// This promise exists before scene.js evaluates. The journal never captures an
// obsolete record in an asset-load callback; scene readiness restores the latest
// selected subject once, and optional model arrivals only affect appearance.
export const sceneReady=import('./scene.js').then(module=>module.journalScene);
window.LW5IslandSceneReady=sceneReady;
const $=selector=>document.querySelector(selector);
const form=$('#journal-editor'),fields=$('#journal-fields'),picker=$('#trip-picker');
const status=$('#journal-status'),saveStatus=$('#save-status');
const clone=value=>structuredClone(value);
const dimensionKeys=RATING_DIMENSIONS.map(d=>d.key);
const isRating=value=>value===null||(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=5&&Number.isInteger(value*2));
let repository=null,state={revision:0,records:[]},draft=null,baseline='',baseRevision=0;
let activeSubjectKey=null,selectionGeneration=0,ready=false,busy=false,scene=null,sceneFailed=false;
let runtimeSubjectSequence=0;const runtimeSubjectKeys=new WeakMap();
let pendingChoice=null,permitDeparture=false,fallbackRadar=null;

function message(element,text,tone=''){element.textContent=text;element.dataset.tone=tone;}
function currentSubject(){return subjectEntries().find(entry=>entry.key===activeSubjectKey)?.subject||null;}
function subjectEntries(){
 if(!draft)return[];
 const counts=new Map();for(const s of draft.subjects)if(typeof s.id==='string'&&s.id)counts.set(s.id,(counts.get(s.id)||0)+1);
 return draft.subjects.map((subject,index)=>{
  let key=typeof subject.id==='string'&&counts.get(subject.id)===1?subject.id:runtimeSubjectKeys.get(subject);
  if(!key){key=`legacy-subject-${++runtimeSubjectSequence}`;runtimeSubjectKeys.set(subject,key);}
  return{subject,key,index};
 });
}
function dirty(){return !!draft&&JSON.stringify(draft)!==baseline;}
function safeState(value){
 if(!value||!Number.isInteger(value.revision)||value.revision<0||!Array.isArray(value.records))throw Error('手记暂时无法完整读取。请保留备份后重试。');
 const ids=new Set();for(const record of value.records){localStore.validate(record);if(ids.has(record.id))throw Error('手记中有重复记录，请先导出备份核对。');ids.add(record.id);}
 return clone(value);
}
function dateText(record){return`${record.start||'开始日期待补'} — ${record.end||'结束日期待补'}`;}
function option(value,text){const element=document.createElement('option');element.value=value;element.textContent=text;return element;}
function selectedLabel(subject,index){return subject.kind==='island'?'海岛整体':subject.name.trim()||`酒店 ${index}`;}
function renderLibrary(){
 const records=[...state.records].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
 picker.replaceChildren(option('','选择已保存的旅行'));
 for(const record of records)picker.append(option(record.id,`${record.island} · ${dateText(record)}${record.conflictOf?' · 冲突副本':''}`));
 if(draft&&!state.records.some(record=>record.id===draft.id))picker.append(option(draft.id,'新建旅行 · 尚未保存'));
 picker.value=draft?.id||'';
 const datalist=$('#known-islands');datalist.replaceChildren();for(const name of new Set(records.map(record=>record.island).filter(Boolean)))datalist.append(option(name,name));
 $('#journal-library').setAttribute('aria-busy',String(busy));
 $('#journal-new').disabled=!ready||busy;picker.disabled=!ready||busy;
 for(const id of['journal-export','journal-import-button'])$('#'+id).disabled=!ready||busy;
 $('#journal-delete').disabled=!ready||busy||!draft||!state.records.some(record=>record.id===draft.id);
 $('#journal-import').disabled=!ready||busy;
}
function renderSubjectPicker(){
 const select=$('#subject-picker');select.replaceChildren();
 for(const entry of subjectEntries())select.append(option(entry.key,selectedLabel(entry.subject,entry.index)));
 select.value=activeSubjectKey||'';
}
function syncHeader(){
 $('#scene-title').textContent=draft?.island.trim()||'把海风，留在这里';
 const subject=currentSubject();$('#scene-subtitle').textContent=subject?selectedLabel(subject,draft.subjects.indexOf(subject)):'一座岛，一段旅程。';
}
function context(){return draft&&currentSubject()?{recordId:draft.id,subjectKey:activeSubjectKey,generation:selectionGeneration}:null;}
function showPreservedRatings(values){
 if(!fallbackRadar){
  fallbackRadar=createRadar($('#radar'),RATING_DIMENSIONS);
  const description=$('#ratings-panel .section-heading p');description.id='ratings-unavailable';description.setAttribute('role','status');
  description.textContent='小岛暂时无法显示，评分暂不可调整。下面保留当前对象的已有评分；文字与备注仍可编辑并保存。';
 }
 for(const key of dimensionKeys){
  const value=values[key],host=$('#rating-'+key),output=$('#value-'+key),row=host.closest('.dimension-row');
  host.textContent='只读评分';host.classList.add('rating-readonly');host.inert=true;host.setAttribute('aria-disabled','true');
  host.dataset.unrated=String(value===null);row.dataset.unrated=String(value===null);
  output.textContent=value===null?'未评':String(value);output.dataset.unrated=String(value===null);
  row.querySelector('.dimension-status').textContent=value===null?'这个维度尚未评分':'原有评分已保留';
  $('#unset-'+key).disabled=true;
 }
 fallbackRadar.update(values);
}
function syncScene(){
 const subject=currentSubject(),values=Object.fromEntries(dimensionKeys.map((key,index)=>[key,subject?.ratings[index]??null]));
 if(!scene){if(sceneFailed)showPreservedRatings(values);return;}
 scene.restore(values,{enabled:!!draft&&!busy,context:context()});
}
function updateEnabled(){
 fields.disabled=!draft||busy;
 $('#journal-save').disabled=!draft||busy;
 $('#journal-cancel').disabled=busy;
 scene?.setEnabled(!!draft&&!busy);
 $('#hotel-add').disabled=!draft||busy||draft.subjects.length>=50;
 renderLibrary();
}
function renderSubject(){
 const subject=currentSubject();if(!subject)return;
 renderSubjectPicker();const hotel=subject.kind==='hotel';
 $('#hotel-name-label').hidden=!hotel;$('#hotel-remove').hidden=!hotel;
 $('#hotel-name').value=hotel?subject.name:'';$('#subject-note').value=subject.note;
 $('#radar-title').textContent=hotel?`${subject.name.trim()||'这间酒店'}的八面印象`:'这座岛的八面印象';
 syncHeader();syncScene();
}
function renderDraft(){
 form.hidden=!draft;$('#journal-empty').hidden=!!draft;
 if(draft){
  for(const name of['island','start','end','note'])$('#trip-'+name).value=draft[name];
  $('#journal-edit-label').textContent=draft.conflictOf?'导入的冲突副本 · 核对后再保存':state.records.some(record=>record.id===draft.id)?'正在编辑这段旅行':'新建旅行 · 尚未保存';
  const source=$('#source-time');source.hidden=!draft.sourceRecordedAt;source.textContent=draft.sourceRecordedAt?`来源记录时间：${draft.sourceRecordedAt}（不是旅行日期）`:'';
  renderSubject();
 }else{activeSubjectKey=null;syncHeader();syncScene();}
 updateEnabled();
}
function noteChanged(){
 message(saveStatus,dirty()?'修改还在草稿里，确认保存后才会留下。':'这段记录尚未修改。');
 syncHeader();
}
function closeDraft(){
 scene?.cancel();selectionGeneration++;draft=null;baseline='';activeSubjectKey=null;renderDraft();
}
function choose({title='这段手记还没保存',copy='要先留下刚才的修改吗？',canSave=true}={}){
 if(pendingChoice)return pendingChoice;
 scene?.cancel();const dialog=$('#journal-choice');$('#choice-title').textContent=title;$('#choice-copy').textContent=copy;$('#choice-save').hidden=!canSave;
 pendingChoice=new Promise(resolve=>{
  const finish=value=>{dialog.close();dialog.removeEventListener('cancel',cancel);for(const [button,handler]of handlers)button.removeEventListener('click',handler);pendingChoice=null;resolve(value);};
  const handlers=[['choice-save','save'],['choice-discard','discard'],['choice-stay','stay']].map(([id,value])=>{const button=$('#'+id),handler=()=>finish(value);button.addEventListener('click',handler);return[button,handler];});
  const cancel=event=>{event.preventDefault();finish('stay');};dialog.addEventListener('cancel',cancel);dialog.showModal();
 });return pendingChoice;
}
async function guardDraft(options={}){
 scene?.cancel();if(!dirty())return true;
 const decision=await choose(options);if(decision==='stay')return false;
 if(decision==='save')return save();
 return decision==='discard';
}
async function openRecord(id=null){
 if(!ready||busy)return false;
 if(draft?.id===id)return true;
 if(!await guardDraft()) {renderLibrary();return false;}
 busy=true;updateEnabled();
 try{
  const latest=safeState(await repository.read());let selected=id?latest.records.find(record=>record.id===id):null;
  if(id&&!selected)throw Error('这段旅行已在另一处更新或删除，请重新选择。');
  state=latest;
  const now=new Date().toISOString();draft=selected?clone(selected):{id:crypto.randomUUID(),island:'',start:'',end:'',note:'',subjects:[localStore.blankSubject()],createdAt:now,updatedAt:now};
  baseline=JSON.stringify(draft);baseRevision=state.revision;activeSubjectKey=subjectEntries()[0]?.key||null;selectionGeneration++;
  renderDraft();message(saveStatus,selected?'修改后，请按确认保存。':'日期和评分可以先留空，慢慢补全。');message(status,`${state.records.length} 段旅程已保存。`);
  $('#ratings-scroll').scrollTop=0;
  return true;
 }catch(error){message(status,error.message||'暂时无法打开手记，请重试。','error');return false;}
 finally{busy=false;updateEnabled();}
}
async function save(){
 if(!draft||busy||!ready)return false;
 scene?.cancel();
 if(!form.reportValidity())return false;
 const unnamedHotel=subjectEntries().find(entry=>entry.subject.kind==='hotel'&&!entry.subject.name.trim());
 if(unnamedHotel){selectSubject(unnamedHotel.key);message(saveStatus,'请先填写这间酒店的名称，再确认保存。','error');$('#hotel-name').focus();return false;}
 busy=true;updateEnabled();
 try{
  // Trim only fields the old form trimmed; all other IDs and unknown provenance
  // fields survive the clone. Dates are never synthesized from timestamps.
  const record=clone(draft);for(const key of['island','start','end','note'])record[key]=String(record[key]).trim();record.updatedAt=new Date().toISOString();localStore.validate(record);
  const records=state.records.filter(existing=>existing.id!==record.id).concat(record);
  const revision=await repository.write(baseRevision,clone(records));
  if(!Number.isInteger(revision)||revision<=baseRevision)throw Error('保存结果暂时无法确认，请保留草稿并重新核对。');
  state={...state,revision,records};closeDraft();message(status,'✓ 已确认保存。'+(repository===localStore?' 当前仅保存在此浏览器。':''),'success');return true;
 }catch(error){message(saveStatus,error.message||'保存失败，草稿仍然保留。','error');return false;}
 finally{busy=false;updateEnabled();}
}
async function cancelEdit(){
 if(!draft||busy)return;
 if(!await guardDraft({title:'放下这次编辑？',copy:'放弃草稿后，已经保存的记录不会改变。',canSave:false}))return;
 closeDraft();message(status,'已取消编辑，保存过的记录没有改变。');
}
async function deleteCurrent(){
 if(!draft||busy)return;scene?.cancel();const id=draft.id;
 if(!state.records.some(record=>record.id===id))return;
 if(!confirm('删除这段已保存的旅行？当前草稿也会放弃。建议先保留一份备份。'))return;
 busy=true;updateEnabled();
 try{
  const records=state.records.filter(record=>record.id!==id),revision=await repository.write(baseRevision,clone(records));
  if(!Number.isInteger(revision)||revision<=baseRevision)throw Error('删除结果暂时无法确认，请重新核对。');
  state={...state,revision,records};closeDraft();message(status,'这段旅行已删除。');
 }catch(error){message(saveStatus,error.message||'删除失败，记录仍保留。','error');}
 finally{busy=false;updateEnabled();}
}
function selectSubject(key){
 if(!draft||busy)return;const entry=subjectEntries().find(item=>item.key===key);if(!entry)return;
 scene?.cancel();activeSubjectKey=entry.key;selectionGeneration++;renderSubject();noteChanged();
}
function addHotel(){
 if(!draft||busy||draft.subjects.length>=50)return;
 scene?.cancel();const subject=localStore.blankSubject('hotel');draft.subjects.push(subject);activeSubjectKey=subject.id;selectionGeneration++;renderSubject();noteChanged();updateEnabled();$('#hotel-name').focus({preventScroll:true});
}
function removeHotel(){
 const subject=currentSubject();if(!draft||busy||subject?.kind!=='hotel')return;
 if(!confirm('移除草稿中的这个酒店评价？确认保存后才会从记录里移除。'))return;
 scene?.cancel();draft.subjects.splice(draft.subjects.indexOf(subject),1);activeSubjectKey=subjectEntries()[0]?.key||null;selectionGeneration++;renderSubject();noteChanged();updateEnabled();
}
async function exportRecords(){
 if(!ready||busy)return;
 busy=true;updateEnabled();
 try{
  const latest=safeState(await repository.read()),backup=localStore.exportBackup(latest.records),blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download=`LW5-海岛备份-${new Date().toISOString().slice(0,10)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  message(status,`已导出 ${latest.records.length} 段已保存的旅程。${dirty()?'当前未保存的草稿不在备份中。':''}`,'success');
 }catch(error){message(status,error.message||'备份导出失败，请重试。','error');}
 finally{busy=false;updateEnabled();}
}
async function importRecords(file){
 if(!file||!ready||busy)return;
 try{
  if(file.size>10000000)throw Error('备份文件过大，请选择 10 MB 以内的手记备份。');
  const incoming=localStore.parseBackup(await file.text());
  if(!await guardDraft({copy:'导入备份前，要先保存当前修改吗？'}))return;
  if(!confirm(`导入 ${incoming.length} 段旅行？已保存的内容不会被覆盖；同一记录有差异时，会保留冲突副本。`))return;
  busy=true;updateEnabled();const latest=safeState(await repository.read()),records=localStore.merge(latest.records,incoming),revision=await repository.write(latest.revision,clone(records));
  if(!Number.isInteger(revision)||revision<=latest.revision)throw Error('导入结果暂时无法确认，请重新核对。');
  state={...latest,revision,records};closeDraft();message(status,`✓ 备份已导入，共 ${records.length} 段旅程。${records.some(record=>record.conflictOf)?'冲突副本已在列表中标明，请核对后编辑。':''}`,'success');
 }catch(error){message(status,'导入未完成：'+(error.message||'请检查备份文件。'),'error');}
 finally{busy=false;updateEnabled();$('#journal-import').value='';}
}

window.addEventListener('lw5:rating-change',event=>{
 const {key,value,context:source}=event.detail||{},selected=context(),index=dimensionKeys.indexOf(key);
 if(!draft||busy||index<0||!isRating(value)||!source||!selected||source.generation!==selected.generation||source.recordId!==selected.recordId||source.subjectKey!==selected.subjectKey)return;
 currentSubject().ratings[index]=value;noteChanged();
});
for(const key of['island','start','end','note'])$('#trip-'+key).addEventListener('input',event=>{if(!draft||busy)return;draft[key]=event.target.value;noteChanged();});
$('#subject-note').addEventListener('input',event=>{const subject=currentSubject();if(subject&&!busy){subject.note=event.target.value;noteChanged();}});
$('#hotel-name').addEventListener('input',event=>{const subject=currentSubject();if(subject?.kind==='hotel'&&!busy){subject.name=event.target.value;renderSubjectPicker();$('#radar-title').textContent=`${subject.name.trim()||'这间酒店'}的八面印象`;noteChanged();}});
$('#subject-picker').addEventListener('change',event=>selectSubject(event.target.value));
picker.addEventListener('change',event=>{const id=event.target.value;if(!id){renderLibrary();return;}void openRecord(id);});
$('#journal-new').addEventListener('click',()=>{void openRecord();});
$('#hotel-add').addEventListener('click',addHotel);$('#hotel-remove').addEventListener('click',removeHotel);
form.addEventListener('submit',event=>{event.preventDefault();void save();});
$('#journal-cancel').addEventListener('click',()=>{void cancelEdit();});$('#journal-delete').addEventListener('click',()=>{void deleteCurrent();});
$('#journal-export').addEventListener('click',()=>{void exportRecords();});
$('#journal-import-button').addEventListener('click',()=>$('#journal-import').click());$('#journal-import').addEventListener('change',event=>{void importRecords(event.target.files?.[0]);});
$('#journal-about-open').addEventListener('click',()=>{scene?.cancel();const frame=$('#journal-about-frame'),url=new URL('about.html',location.href).href;if(frame.contentWindow.location.href!==url)frame.contentWindow.location.replace(url);$('#journal-about').showModal();});
$('#journal-about-close').addEventListener('click',()=>$('#journal-about').close());
$('#journal-retain').addEventListener('click',async()=>{
 try{const allowed=await navigator.storage?.persist?.();message($('#retention-status'),allowed?'浏览器已允许长期保留，仍建议定期备份。':'仍可正常保存；请保留备份，避免清理浏览器数据后丢失。');}catch{message($('#retention-status'),'暂时无法请求长期保留，请定期导出备份。');}
});
async function goHome(){
 if(busy)return;const href=$('#journal-home').href;
 if(await requestClose()){
  // The shell accepts this only from its own same-origin island frame.
  // A direct bookmark continues to work without the shell.
  if(window.parent!==window){
   try{if(parent.location.origin===location.origin&&parent.document.querySelector('#toolFrame')?.contentWindow===window){parent.postMessage({type:'lw5:island-close'},location.origin);return;}}catch{}
  }
  location.assign(href);
 }
}
$('#journal-home').addEventListener('click',event=>{event.preventDefault();void goHome();});
window.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog[open]')){
  event.preventDefault();void goHome();
 }
});
async function requestClose(){
 if(busy)return false;
 const allowed=await guardDraft({copy:'回家之前，要留下刚才的修改吗？'});
 if(allowed)permitDeparture=true;
 return allowed;
}
window.addEventListener('beforeunload',event=>{if(!permitDeparture&&(dirty()||busy)){event.preventDefault();event.returnValue='';}});
sceneReady.then(api=>{scene=api;syncScene();message($('#scene-state'),'');}).catch(()=>{
 sceneFailed=true;message($('#scene-state'),'小岛暂时没有加载好，文字记录仍可编辑并保存。','error');
 syncScene();
 for(const id of['marine-replay','reset'])$('#'+id).disabled=true;
});
const api={
 getState:()=>({ready,busy,dirty:dirty(),revision:state.revision,recordCount:state.records.length,recordId:draft?.id||null,subjectKey:activeSubjectKey,generation:selectionGeneration,sceneReady:!!scene,sceneFailed}),
 openRecord,save,cancel:cancelEdit,selectSubject,requestClose,
};
window.LW5Journal=api;
async function initialize(){
 try{
  repository=await(window.LW5JournalRepository||localStore);
  if(typeof repository.read!=='function'||typeof repository.write!=='function')throw Error('暂时无法连接手记，请稍后重试。');
  state=safeState(await repository.read());ready=true;
  const customPrivacy=typeof repository.privacyLabel==='string'?repository.privacyLabel:null;
  $('#journal-privacy').textContent=customPrivacy||(repository===localStore?'记录保存在此浏览器，未云同步。换设备前，请导出一份备份。':'只有确认保存，修改才会留下。请定期导出一份备份。');
  $('#journal-retain').hidden=repository!==localStore;
  const home=repository.homeHref||window.LW5JournalHomeHref;
  if(home){const url=new URL(home,location.href);if(['http:','https:'].includes(url.protocol))$('#journal-home').href=url.href;}
  renderDraft();message(status,state.records.length?`${state.records.length} 段旅程已保存，选一段继续记录。`:'还没有保存过的手记，从一次真实的旅行开始吧。');return api;
 }catch(error){message(status,error.message||'无法读取手记。请保留备份后重试。','error');renderLibrary();return api;}
}
window.LW5JournalReady=initialize();
