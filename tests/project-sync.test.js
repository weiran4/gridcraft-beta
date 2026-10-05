import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeProjectChanges,projectStore} from '../project/sync.js';
const base=()=>({frequencyHz:50,components:[{id:'PV1',parametersSI:{L:63,V:315},extensions:{}},{id:'DC1',parametersSI:{V:800}}],extensions:{gflPi:{PV1:{manual:true,gains:{d:{kp:2,ki:3}}}}}});
test('simultaneous edits preserve remote DC voltage and local inductance',()=>{const b=base(),local=structuredClone(b),remote=structuredClone(b);local.components[0].parametersSI.L=70;remote.components[1].parametersSI.V=900;const m=mergeProjectChanges(b,local,remote);assert.equal(m.components[0].parametersSI.L,70);assert.equal(m.components[1].parametersSI.V,900);assert.deepEqual(b,base());});
test('PI settings survive a stale layout or frequency save',()=>{const b=base(),local=structuredClone(b),remote=structuredClone(b);local.frequencyHz=60;remote.extensions.gflPi.PV1.gains.d.kp=4;assert.equal(mergeProjectChanges(b,local,remote).extensions.gflPi.PV1.gains.d.kp,4);});
test('removed remote component is not resurrected by a stale parameter edit',()=>{const b=base(),local=structuredClone(b),remote=structuredClone(b);local.components[0].parametersSI.L=70;remote.components.shift();assert.deepEqual(mergeProjectChanges(b,local,remote).components.map(x=>x.id),['DC1']);});
test('only the edited field wins a conflict; additions and deletions propagate',()=>{const b=base(),local=structuredClone(b),remote=structuredClone(b);local.components[0].parametersSI.L=70;remote.components[0].parametersSI.L=80;remote.components[0].parametersSI.V=400;local.components.pop();remote.components.push({id:'PV2',parametersSI:{L:20}});const m=mergeProjectChanges(b,local,remote);assert.deepEqual(m.components.map(x=>x.id),['PV1','PV2']);assert.deepEqual(m.components[0].parametersSI,{L:70,V:400});});

test('reading and accepting another tab does not echo writes; unchanged saves are silent',()=>{
 let value=JSON.stringify(base()),writes=0;const storage={getItem:()=>value,setItem:(k,v)=>{value=v;writes++;}};
 const a=projectStore(storage,JSON.parse,JSON.stringify),b=projectStore(storage,JSON.parse,JSON.stringify);
 a.accept(a.read());b.accept(b.read());const edit=a.read();edit.components[1].parametersSI.V=900;a.write(edit);assert.equal(writes,1);
 b.accept(b.read());b.write(b.read());assert.equal(writes,1);
 a.accept(null);a.write(base());assert.equal(JSON.parse(value).components[1].parametersSI.V,800);
});
