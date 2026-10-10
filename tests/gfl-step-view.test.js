import test from 'node:test';
import assert from 'node:assert/strict';
const sample={status:'ok',dcGain:1,finalError:0,riseTimeSeconds:.02,overshootPercent:10,settlingTimeSeconds:.1,windowSeconds:1,peakPoint:{t:.05,y:1.1},points:[{t:0,y:0},{t:.05,y:1.1},{t:.1,y:1.02},{t:1,y:1}]};
const other={...sample,settlingTimeSeconds:.3,peakPoint:{t:.15,y:1.2},points:[{t:0,y:0},{t:.15,y:1.2},{t:.3,y:1.02},{t:2,y:1}]};
test('plot uses one shared time/scale, a unit reference, error band and both actual traces',async()=>{
 const {stepResponseSvg}=await import('../ui/gfl-step-plot.js');
 const html=stepResponseSvg({current:sample,candidate:other},{width:900});
 for(const name of ['step-current','step-candidate','step-reference','step-target-band'])assert.ok(html.includes(`data-curve="${name}"`));
 assert.match(html,/归一化增量/);assert.match(html,/时间/);assert.match(html,/0\.98/);assert.doesNotMatch(html,/NaN|Infinity/);
});
test('plot does not draw unstable/unsupported or explicitly hidden curves',async()=>{
 const {stepResponseSvg}=await import('../ui/gfl-step-plot.js');
 let html=stepResponseSvg({current:{status:'unstable',points:[]},candidate:other});
 assert.ok(!html.includes('data-curve="step-current"'));assert.ok(html.includes('data-curve="step-candidate"'));
 html=stepResponseSvg({current:sample,candidate:other},{showCandidate:false});assert.ok(!html.includes('data-curve="step-candidate"'));
 html=stepResponseSvg({current:{status:'unsupportedDelay',points:[]}});assert.ok(!html.includes('<svg'));assert.doesNotMatch(html,/NaN/);
});
test('nonunity final gain keeps steady error visible and declares a separate final-value band',async()=>{
 const {stepResponseSvg}=await import('../ui/gfl-step-plot.js');
 const nonunity={...sample,dcGain:.5,finalError:.5,points:sample.points.map(p=>({t:p.t,y:p.y/2})),peakPoint:{t:.05,y:.55}};
 const html=stepResponseSvg({current:nonunity},{width:390});assert.match(html,/step-final-band/);assert.match(html,/0\.5/);assert.ok(html.includes('viewBox="0 0 390 '));
});
function rig(create){const events=[],workers=[],timers=new Map();let n=0;
 const client=create({workerFactory:()=>{const w={postMessage(data){this.sent=data;},terminate(){this.dead=true;}};workers.push(w);return w;},onEvent:e=>events.push(e),setTimer:f=>{timers.set(++n,f);return n;},clearTimer:id=>timers.delete(id)});
 return {client,workers,events,flush(){const all=[...timers.values()];timers.clear();all.forEach(f=>f());}};
}
test('step client debounces edits, rejects stale replies and reuses unchanged results',async()=>{
 const {createStepClient}=await import('../ui/gfl-step-client.js'),r=rig(createStepClient);
 r.client.update({loop:'P',value:1});r.client.update({loop:'P',value:2});assert.equal(r.workers.length,0);r.flush();assert.equal(r.workers.length,1);
 const first=r.workers[0];r.client.update({loop:'q',value:2});assert.equal(first.dead,true);r.flush();const second=r.workers[1],count=r.events.length;
 first.onmessage({data:{type:'result',...first.sent,result:{old:true}}});assert.equal(r.events.length,count);
 second.onmessage({data:{...second.sent,type:'result',result:{loop:'q'}}});assert.equal(r.events.at(-1).type,'result');
 r.client.update({loop:'q',value:2});r.flush();assert.equal(r.workers.length,2);
 r.client.clear();assert.equal(r.events.at(-1).type,'empty');r.client.destroy();
});
test('worker errors clear data and an invalidation cannot let a late response reappear',async()=>{
 const {createStepClient}=await import('../ui/gfl-step-client.js'),r=rig(createStepClient);
 r.client.update({loop:'d'});r.flush();const w=r.workers[0];w.onerror({message:'worker blocked'});assert.equal(r.events.at(-1).type,'error');
 r.client.update({loop:'d'});r.flush();assert.equal(r.workers.length,2);const w2=r.workers[1];r.client.clear('invalid');const n=r.events.length;
 w2.onmessage({data:{...w2.sent,type:'result',result:sample}});assert.equal(r.events.length,n);assert.equal(w2.dead,true);
});
