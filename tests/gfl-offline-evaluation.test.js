import test from 'node:test';import assert from 'node:assert/strict';
import {pvGridExample} from '../examples/pv-grid-demo.js';
import {resolveDesignSnapshot} from '../project/design-snapshot.js';
import {evaluateOfflineDesign} from '../analysis/gfl-offline-evaluation.js';
const snapshot=resolveDesignSnapshot(pvGridExample,{ibrId:'PV1'}).snapshot;
const gains={d:{kp:1.25,ki:50},q:{kp:1.25,ki:50},P:{kp:5,ki:100},Q:{kp:2,ki:100}};
test('offline poles and frequency complete without time metrics; unknown capability stays conditional',()=>{
 const a=evaluateOfflineDesign({snapshot,gains});assert.equal(a.solveStatus,'completed');assert.equal(a.stability.status,'stable');assert.ok(Math.abs(a.stability.alpha+21.473868)<1e-4);assert.equal(a.eligibility,'conditional');assert.equal(a.frequencyChecks.status,'completed');assert.equal(a.performance,undefined);
});
test('time goals and explicit scalar limits are not silently dropped',()=>{
 const s=resolveDesignSnapshot(pvGridExample,{ibrId:'PV1',targets:{maxOvershootPercent:10,scalarMinMargin:179}}).snapshot;
 const a=evaluateOfflineDesign({snapshot:s,gains});assert.ok(a.pending.some(x=>x.includes('时域')));assert.notEqual(a.eligibility,'recommended');assert.ok(a.violations.length);
});
test('PLL detector affects low-voltage linearization; zero Ki removes only controller state',()=>{
 const a=evaluateOfflineDesign({snapshot,gains}, {frequency:false});
 const s=resolveDesignSnapshot(pvGridExample,{implementation:{pllDetector:'rated-magnitude'}}).snapshot;
 const b=evaluateOfflineDesign({snapshot:s,gains},{frequency:false});assert.notEqual(a.stability.alpha,b.stability.alpha);
 const g=structuredClone(gains);g.d.ki=0;const c=evaluateOfflineDesign({snapshot,gains:g},{frequency:false});assert.equal(c.order,a.order-1);
});
