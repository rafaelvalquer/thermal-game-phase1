import test from 'node:test';
import assert from 'node:assert/strict';
import { DataCenterSaveSystem } from '../../src/datacenter/DataCenterSaveSystem.js';

function fakeIndexedDB(){
  const records=new Map(),names=new Set();
  const db={objectStoreNames:{contains:name=>names.has(name)},createObjectStore:name=>names.add(name),transaction(_store,_mode){
    const tx={objectStore(){return{
      get(key){const request={};queueMicrotask(()=>{request.result=records.get(key);request.onsuccess?.();});return request;},
      put(value,key){records.set(key,value);queueMicrotask(()=>tx.oncomplete?.());return{};},
      delete(key){records.delete(key);queueMicrotask(()=>tx.oncomplete?.());return{};},
    };}};return tx;
  }};
  return {records,indexedDB:{open(){const request={result:db};queueMicrotask(()=>{request.onupgradeneeded?.();request.onsuccess?.();});return request;}}};
}

function memoryStorage(initial={}){
  const values=new Map(Object.entries(initial));
  return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}

test('asynchronous save writes snapshots to IndexedDB without synchronously updating localStorage',async()=>{
  const fake=fakeIndexedDB(),storage=memoryStorage(),system=new DataCenterSaveSystem({storage,indexedDB:fake.indexedDB,key:'profile'});
  const snapshot={version:1,state:{cash:900,saveRevision:4},world:{materials:[1,2],energy:[3,4]}};
  assert.equal(await system.saveAsync(snapshot),true);
  assert.equal(storage.values.size,0);
  assert.deepEqual(fake.records.get('profile').snapshot,snapshot);
  assert.ok(fake.records.get('profile').bytes>0);
});

test('legacy localStorage data migrates once and a newer IndexedDB snapshot wins on later loads',async()=>{
  const fake=fakeIndexedDB(),storage=memoryStorage({profile:JSON.stringify({version:1,state:{cash:100,saveRevision:2}})});
  const first=new DataCenterSaveSystem({storage,indexedDB:fake.indexedDB,key:'profile'});
  const legacy=await first.loadAsync();assert.equal(legacy.state.cash,100);
  assert.equal(fake.records.get('profile').snapshot.state.saveRevision,2);
  const newer={version:1,state:{cash:200,saveRevision:3}};await first.saveAsync(newer);
  storage.setItem('profile',JSON.stringify({version:1,state:{cash:150,saveRevision:2}}));
  const second=new DataCenterSaveSystem({storage,indexedDB:fake.indexedDB,key:'profile'});
  assert.equal((await second.loadAsync()).state.cash,200);
});

test('rapid IndexedDB saves coalesce to the newest snapshot and clear removes recoverable copies',async()=>{
  const fake=fakeIndexedDB(),storage=memoryStorage(),system=new DataCenterSaveSystem({storage,indexedDB:fake.indexedDB,key:'profile'});
  const first=system.saveAsync({version:1,state:{saveRevision:1}}),second=system.saveAsync({version:1,state:{saveRevision:2}});
  await Promise.all([first,second]);assert.equal(fake.records.get('profile').snapshot.state.saveRevision,2);
  storage.setItem('profile','legacy');await system.clearAsync();
  assert.equal(fake.records.has('profile'),false);assert.equal(storage.getItem('profile'),null);
});
