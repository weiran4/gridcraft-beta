import test from 'node:test';
import assert from 'node:assert/strict';
import {pvGridExample} from '../examples/pv-grid-demo.js';
import {resolveDesignSnapshot} from '../project/design-snapshot.js';
import {solveOperatingPoint} from '../analysis/gfl-operating-point.js';
const snap=patch=>resolveDesignSnapshot(pvGridExample,{ibrId:'PV1',...patch}).snapshot;
test('historical PQ remains unchanged while explicit Vac solves Q at 1pu',()=>{
 const a=solveOperatingPoint(snap({}));assert.equal(a.status,'solved');assert.ok(Math.abs(a.point.V-.9112627388)<1e-9);
 const b=solveOperatingPoint(snap({pointPolicy:'mode-reference',vacRefPu:1}));
 assert.equal(b.status,'solved');assert.ok(Math.abs(b.point.V-1)<1e-9);assert.notEqual(b.point.Q,0);
 assert.ok(b.residuals.powerPu<1e-9);assert.equal(b.capability.current.status,'unknown');
});
test('explicit constraints reject inconsistent Q and known current excess',()=>{
 const a=solveOperatingPoint(snap({pointPolicy:'mode-reference',vacRefPu:1,lockedQVar:0}));assert.equal(a.status,'conflict');
 const b=solveOperatingPoint(snap({limits:{currentPu:.5}}));assert.equal(b.capability.current.status,'failed');
});
test('DC input and AC power cannot be independently inconsistent',()=>{
 const a=solveOperatingPoint(snap({pdcW:1}));assert.equal(a.status,'conflict');
});
test('historical strategy also enforces explicit Q constraint',()=>{
 assert.equal(solveOperatingPoint(snap({lockedQVar:1234567})).status,'conflict');
});
test('optional grid and bridge q-axis limits remain separate from bridge magnitude',()=>{const a=solveOperatingPoint(snap({limits:{gridCurrentPu:.01,qAxisCurrentPu:.001}}));assert.equal(a.capability.gridCurrent.status,'failed');assert.equal(a.capability.qAxisCurrent.status,'failed');});
