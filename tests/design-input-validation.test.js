import test from 'node:test';
import assert from 'node:assert/strict';
import {designInputIssues} from '../ui/design-input-validation.js';
const l={fs:10000,sideband:'N-2',harmonicPu:.1,ripplePercent:20,dropPercent:20,selectedMh:.063};
const rc={ibrId:'PV1',fs:10000,reactivePercent:5,qualityFactor:4,selectedUf:1500};
test('inductor invalid fields and out-of-range chosen value are identified independently',()=>{
 assert.deepEqual(designInputIssues('l',l,{minH:1e-6,maxH:1e-4,feasible:true},50),{});
 const e=designInputIssues('l',{...l,fs:-1,harmonicPu:-1,selectedMh:1},{minH:1e-6,maxH:1e-4,feasible:true},50);
 assert.ok(e.fs&&e.harmonicPu&&e.selectedMh);assert.equal(e.ripplePercent,undefined);
});
test('RC invalid selection, resonance conflict and recommended limits are reported',()=>{
 assert.deepEqual(designInputIssues('rc',rc,{capMinF:1e-6,capMaxF:.002,feasible:true},50),{});
 const e=designInputIssues('rc',{...rc,ibrId:'',fs:900,qualityFactor:7,reactivePercent:8,selectedUf:3000},{capMinF:1e-6,capMaxF:.002,feasible:false},50);
 assert.ok(e.ibrId&&e.fs&&e.qualityFactor&&e.reactivePercent&&e.selectedUf);
});
test('cleared or nonfinite inputs cannot silently appear valid',()=>{
 const e=designInputIssues('l',{...l,harmonicPu:null,selectedMh:NaN},null,50);
 assert.ok(e.harmonicPu&&e.selectedMh);
});
