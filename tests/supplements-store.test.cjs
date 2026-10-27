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
