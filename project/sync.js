// Merge only local edits onto the latest project, preserving unrelated tab changes.
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function mergeProjectChanges(base,local,remote){
 if(equal(base,local))return structuredClone(remote);
 if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remote)&&[...base,...local,...remote].every(x=>object(x)&&typeof x.id==='string')){
  const before=new Map(base.map(x=>[x.id,x])),after=new Map(local.map(x=>[x.id,x])),latest=new Map(remote.map(x=>[x.id,x]));
  for(const [id,value] of before){if(!after.has(id))latest.delete(id);else if(latest.has(id))latest.set(id,mergeProjectChanges(value,after.get(id),latest.get(id)));}
  for(const [id,value] of after)if(!before.has(id))latest.set(id,structuredClone(value));
  return [...latest.values()];
 }
 if(object(local)&&(base===undefined||object(base))&&(remote===undefined||object(remote))){
  const out=structuredClone(remote??{});
  for(const key of new Set([...Object.keys(base??{}),...Object.keys(local)])){
   if(equal(base?.[key],local[key]))continue;
   if(!Object.hasOwn(local,key))delete out[key];else out[key]=mergeProjectChanges(base?.[key],local[key],remote?.[key]);
  }
  return out;
 }
 return structuredClone(local);
}
export function projectStore(storage,parse,serialize,key='gridcraft-v1'){
 let baseline;
 return {
  accept(p){baseline=p?structuredClone(p):undefined;},
  read(){const raw=storage.getItem(key);return raw?parse(raw):null;},
  write(p){const raw=storage.getItem(key),latest=raw?parse(raw):null;
   const merged=baseline&&latest?mergeProjectChanges(baseline,p,latest):p;
   const encoded=serialize(merged);if(raw!==encoded)storage.setItem(key,encoded);
   baseline=structuredClone(merged);return merged;
  }
 };
}

// Seed the visible initial project before design pages read shared storage.
export function ensureInitialProject(store,project){const saved=store.read();if(saved){store.accept(saved);return saved;}return store.write(project);}
