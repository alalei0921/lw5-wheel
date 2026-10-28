'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createStore,dayKey,untilMidnight,CONFIG_KEY,PREFIX,parseSettings}=require('../shared/supplements-store-v1.js');
const items=Array.from({length:4},(_,i)=>({name:'测试项目 '+i,description:'测试说明'}));
function setup(){const map=new Map([['unrelated','keep']]);const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};let time=Date.parse('2026-10-27T15:59:59Z');return {map,storage,store:createStore(storage,()=>time),setTime:v=>{time=Date.parse(v)}};}
test('Shanghai day boundary, year and leap day are timezone independent',()=>{
 for(const [time,day] of [['2026-10-27T15:59:59.999Z','2026-10-27'],['2026-10-27T16:00:00Z','2026-10-28'],['2026-12-31T16:00:00Z','2027-01-01'],['2028-02-28T16:00:00Z','2028-02-29']])assert.equal(dayKey(Date.parse(time)),day);
 assert.equal(untilMidnight(Date.parse('2026-10-27T15:59:59Z')),1000);
});
test('empty template makes no writes; cross-day reopen resets without deleting other data',()=>{
 const s=setup();assert.equal(s.store.snapshot().items.length,4);assert.equal(s.map.size,1);s.store.setChecked(0,true);assert.equal(s.store.snapshot().checked[0],true);
 s.setTime('2026-10-27T16:00:00Z');assert.deepEqual(s.store.snapshot().checked,[false,false,false,false]);assert.equal(s.map.get('unrelated'),'keep');assert.equal(s.map.get(PREFIX+'check.0'),'2026-10-27');
 assert.equal(createStore(s.storage,()=>Date.parse('2026-10-28T03:00:00Z')).snapshot().checked[0],false);
});
test('rapid corrections and separate rows preserve each other across instances',()=>{
 const s=setup(),other=createStore(s.storage,()=>Date.parse('2026-10-27T15:00:00Z'));for(let i=0;i<101;i++)s.store.setChecked(0,!s.store.snapshot().checked[0]);other.setChecked(1,true);assert.deepEqual(s.store.snapshot().checked,[true,true,false,false]);s.store.setChecked(0,false);assert.deepEqual(other.snapshot().checked,[false,true,false,false]);assert.equal(s.map.get('unrelated'),'keep');
});
test('settings validate four items, retain marks and reject stale edits',()=>{
 const s=setup();s.store.setChecked(2,true);s.store.saveSettings(items,null);assert.equal(s.store.snapshot().checked[2],true);assert.throws(()=>s.store.saveSettings(items,null),/另一个窗口/);assert.throws(()=>s.store.saveSettings(items.slice(1),s.store.snapshot().raw),/4/);assert.throws(()=>s.store.saveSettings(items.map(x=>({...x,name:' '})),s.store.snapshot().raw),/名称/);
});
test('malformed imports and corrupt storage rejected without overwrite',()=>{
 const s=setup();for(const data of ['bad','{}','{"format":"lw5-supplements","version":2}','{"format":"lw5-supplements","version":1,"items":[]}'])assert.throws(()=>parseSettings(data));s.map.set(CONFIG_KEY,'broken');assert.throws(()=>s.store.snapshot());assert.equal(s.map.get(CONFIG_KEY),'broken');assert.deepEqual(parseSettings(JSON.stringify({format:'lw5-supplements',version:1,items})),items);
});
test('storage failure never reports a successful write',()=>{
 const store=createStore({getItem:()=>null,setItem:()=>{throw Error('quota')}});assert.throws(()=>store.setChecked(0,true),/quota/);assert.throws(()=>store.saveSettings(items,null),/quota/);assert.deepEqual(store.snapshot().checked,[false,false,false,false]);
});

const shortNames=['镁片','鱼油','蛋白粉','肌酸'];
const notes=['每天 1 片，午饭时或饭后用水吞服。','周一、周四各 1 粒，午饭时或饭后；吃鱼充足可不吃。','下午约半大勺（15–16 克），用水冲；喝后反复腹泻先停。','每天 3 克（3 克量勺一平勺），下午冲服，休息日照常。'];
const oldNames=['DEMO 甘氨酸镁','TEST-B 鱼油（可选）','QA 蛋白粉','EXAMPLE 单方肌酸'];
function seed(s,names,extra={}){const value={format:'lw5-supplements',version:1,items:names.map((name,i)=>({name,description:'既有说明 '+i})),...extra};const raw=JSON.stringify(value);s.map.set(CONFIG_KEY,raw);return raw;}
test('fresh contexts show four generic short labels without writing personal settings',()=>{const s=setup();assert.deepEqual(s.store.snapshot().items.map(x=>x.name),shortNames);assert.deepEqual(s.store.snapshot().items.map(x=>x.description),notes);assert.equal(s.map.size,1);});
test('old Arabic/Chinese placeholder labels migrate in view only; personal notes and marks remain byte-for-byte',()=>{for(const names of [['补剂 1','补剂 2','补剂 3','补剂 4'],['补给一','补给二','补给三','补给四']]){const s=setup(),raw=seed(s,names);s.store.setChecked(1,true);const before=new Map(s.map);assert.deepEqual(s.store.snapshot().items.map(x=>x.name),shortNames);assert.deepEqual(s.store.snapshot().items.map(x=>x.description),items.map((_,i)=>'既有说明 '+i));assert.equal(s.store.snapshot().checked[1],true);assert.deepEqual(s.map,before);assert.equal(s.map.get(CONFIG_KEY),raw);}});
test('the complete legacy imported product layout is shortened without changing notes or stored originals',()=>{const s=setup(),raw=seed(s,oldNames);s.store.setChecked(0,true);assert.deepEqual(s.store.snapshot().items.map(x=>x.name),shortNames);assert.equal(s.map.get(CONFIG_KEY),raw);assert.equal(s.store.snapshot().items[0].description,'既有说明 0');assert.equal(s.store.snapshot().checked[0],true);});
test('custom and partly edited lists do not undergo brand/category substring guessing',()=>{for(const names of [['我的镁片','周末鱼油','训练后的蛋白粉','肌酸备忘'],[oldNames[0],oldNames[1],'我的蛋白粉',oldNames[3]],['补剂 2','自定义二','自定义三','自定义四']]){const s=setup();seed(s,names);assert.deepEqual(s.store.snapshot().items.map(x=>x.name),names);}});
test('explicit v61 name edits are final, even when users choose old-style wording',()=>{const s=setup();s.store.saveSettings(oldNames.map(name=>({name,description:'自己设定'})),null);assert.equal(JSON.parse(s.map.get(CONFIG_KEY)).labelsVersion,2);assert.deepEqual(s.store.snapshot().items.map(x=>x.name),oldNames);});
test('placeholder guidance disappears, while an edited description is retained',()=>{const s=setup();seed(s,['补剂 1','补剂 2','补剂 3','补剂 4'],{items:shortNames.map((_,i)=>({name:'补剂 '+(i+1),description:i===0?'点「编辑」填写名称和用量':'自定义说明'}))});assert.equal(s.store.snapshot().items[0].description,notes[0]);assert.equal(s.store.snapshot().items[1].description,'自定义说明');});

test('v61 empty default notes migrate without writing config or changing checks',()=>{for(const description of ['', '点「编辑」填写名称和用量']){const s=setup(),raw=seed(s,shortNames,{labelsVersion:2,items:shortNames.map(name=>({name,description}))});s.store.setChecked(3,true);const before=new Map(s.map);assert.deepEqual(s.store.snapshot().items.map(x=>x.description),notes);assert.deepEqual(s.map,before);assert.equal(s.store.snapshot().raw,raw);assert.equal(s.store.snapshot().checked[3],true);}});
test('custom notes and blank custom rows survive default-note migration',()=>{const s=setup();const kept=shortNames.map((name,i)=>({name:i===1?'自定义项目':name,description:i===1?'':'我自己写的 '+i}));seed(s,shortNames,{labelsVersion:2,items:kept});assert.deepEqual(s.store.snapshot().items,kept);});
test('v62 explicit blank notes stay blank after save, reopen and cross-day',()=>{const s=setup();const blank=shortNames.map(name=>({name,description:''}));s.store.saveSettings(blank,null);assert.equal(JSON.parse(s.store.snapshot().raw).notesVersion,1);assert.deepEqual(createStore(s.storage).snapshot().items,blank);s.setTime('2026-10-28T12:00:00Z');assert.deepEqual(s.store.snapshot().items,blank);});
