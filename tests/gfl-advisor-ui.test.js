import test from 'node:test';
import assert from 'node:assert/strict';
import {createTuningClient} from '../ui/gfl-tuning-client.js';
function fixture(){const events=[],workers=[];const client=createTuningClient({workerFactory:()=>{const w={postMessage(x){this.sent=x;},terminate(){this.terminated=true;}};workers.push(w);return w;},onEvent:e=>events.push(e)});return {client,workers,events};}
test('client creates no worker until explicitly asked and never applies results',()=>{
 const f=fixture();assert.equal(f.workers.length,0);f.client.start({snapshotKey:'one',input:{},request:{}});
 const w=f.workers[0];w.onmessage({data:{type:'result',requestId:w.sent.requestId,snapshotKey:'one',result:{candidates:[]}}});
 assert.equal(f.events.at(-1).type,'result');assert.equal(f.client.busy,false);assert.equal(w.terminated,true);
});
test('cancellation and stale request/snapshot responses are ignored',()=>{
 const f=fixture();f.client.start({snapshotKey:'a'});const first=f.workers[0];f.client.invalidate();assert.equal(first.terminated,true);
 f.client.start({snapshotKey:'b'});const second=f.workers[1],n=f.events.length;
 first.onmessage({data:{type:'result',requestId:first.sent.requestId,snapshotKey:'a',result:{}}});
 second.onmessage({data:{type:'result',requestId:second.sent.requestId,snapshotKey:'wrong',result:{}}});assert.equal(f.events.length,n);
 second.onmessage({data:{type:'result',requestId:second.sent.requestId,snapshotKey:'b',result:{}}});assert.equal(f.events.at(-1).type,'result');
});
test('worker failures are reported only in search state without invoking a save callback',()=>{
 const f=fixture();f.client.start({snapshotKey:'a'});f.workers[0].onerror({message:'numerical issue'});assert.equal(f.events.at(-1).type,'error');assert.equal(f.client.busy,false);
 const messages=[];const c=createTuningClient({workerFactory:()=>{throw Error('unsupported')},onEvent:e=>messages.push(e)});c.start({snapshotKey:'a'});assert.equal(messages.at(-1).type,'error');
});
