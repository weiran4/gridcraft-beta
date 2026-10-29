import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveInputSource} from '../ui/input-sources.js';
test('only unsaved defaults are suggestions; matching old saved values are not relabelled',()=>{
 assert.equal(resolveInputSource({value:'5',suggestion:5}),'suggested');
 assert.equal(resolveInputSource({value:'5',suggestion:5,storedValue:5}),'saved');
 assert.equal(resolveInputSource({value:'',suggestion:5}),'missing');
 assert.equal(resolveInputSource({value:'0',suggestion:0}),'suggested');
});
test('explicit origins survive roundtrip, while external edits invalidate stale metadata',()=>{
 const record=JSON.parse(JSON.stringify({kind:'suggested',value:'10'}));
 assert.equal(resolveInputSource({value:'10.0',storedValue:10,suggestion:10,record}),'suggested');
 assert.equal(resolveInputSource({value:'12',storedValue:12,suggestion:10,record}),'saved');
 assert.equal(resolveInputSource({value:'10',suggestion:10,record:{kind:'custom',value:'10'}}),'custom');
 assert.equal(resolveInputSource({value:'10',linked:'linked',record}),'linked');
});
