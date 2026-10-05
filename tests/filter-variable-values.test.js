import test from 'node:test';
import assert from 'node:assert/strict';
import {filterVariableValues} from '../ui/filter-variable-values.js';
test('formula values distinguish ratios, units, selected preview and ripple peak-to-peak',()=>{
 const ctx={ratedVA:1e6,voltageLL:315,dcVoltage:800,frequencyHz:50,L:63e-6};
 const v=filterVariableValues(ctx,{ripplePercent:20,dropPercent:10,harmonicPu:.1,selectedMh:.03},{currentRms:1000,harmonicHz:9900,minH:.000002,maxH:.00006,ripplePercent:2});
 assert.match(v.di,/0.2.*20%/);assert.match(v.dv,/0.1.*10%/);
 assert.match(v.L,/0.03 mH/);assert.match(v.ripple,/20 A/);assert.match(v.S,/1 MVA/);
 assert.match(v.harmonic,/0.1 pu/);
});
test('unknown and invalid computations never reuse stale tooltip values',()=>{
 const v=filterVariableValues({ratedVA:1e6,voltageLL:315,dcVoltage:null,frequencyHz:50,L:0},{ripplePercent:null,dropPercent:20,harmonicPu:null},null);
 assert.match(v.min,/待补充|不可计算/);assert.match(v.ripple,/待补充|不可计算/);assert.match(v.dc,/待补充/);assert.match(v.di,/待补充/);
});
