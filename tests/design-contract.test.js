import test from 'node:test';
import assert from 'node:assert/strict';
import {pvGridExample} from '../examples/pv-grid-demo.js';
import {resolveDesignSnapshot,convertPi} from '../project/design-snapshot.js';
test('PI conventions and disabled integral serialize without Infinity',()=>{
 assert.equal(convertPi({kp:5,ti:.01,form:'parallel'}).ki,100);
 assert.equal(convertPi({kp:5,ti:.01,form:'series'}).ki,500);
 assert.deepEqual(convertPi({kp:5,enabled:false}),{kp:5,ki:0,enabled:false,ti:null,form:'parallel'});
 assert.throws(()=>convertPi({kp:5,ti:0}));
});
test('snapshot preserves source project and legacy point policy; explicit semantics change identity',()=>{
 const before=JSON.stringify(pvGridExample),a=resolveDesignSnapshot(pvGridExample,{ibrId:'PV1'}).snapshot;
 assert.equal(a.requirements.pointPolicy,'historical-pq');
 assert.equal(a.requirements.limits.currentPu,null);
 assert.equal(JSON.stringify(pvGridExample),before);
 const b=resolveDesignSnapshot(pvGridExample,{ibrId:'PV1',pointPolicy:'mode-reference',vacRefPu:1}).snapshot;
 assert.notEqual(a.identity,b.identity);
 assert.ok(Math.abs(a.bases.voltagePeak*a.bases.currentPeak*1.5-a.bases.power)<1e-8);
 assert.throws(()=>resolveDesignSnapshot(pvGridExample,{ibrId:'PV1',vacRefPu:NaN}));
});
