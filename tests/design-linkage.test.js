import test from 'node:test';
import assert from 'node:assert/strict';
import {rcFrequencySettings} from '../project/rc-frequency.js';
import {designFilterInductor} from '../analysis/filter-inductor.js';
import {designRcFilter} from '../analysis/rc-filter.js';
const ibr=fs=>({extensions:{filterDesign:{fs}}});
test('linked RC frequency follows changed IBR and overrides cached fs',()=>{
 assert.equal(rcFrequencySettings({fsMode:'linked',fs:10000},ibr(5000)).fs,5000);
 assert.equal(rcFrequencySettings({},ibr(8000)).mode,'linked');
 assert.equal(rcFrequencySettings({},ibr(8000)).fs,8000);
});
test('custom and legacy RC frequencies are preserved explicitly',()=>{
 assert.deepEqual(rcFrequencySettings({fsMode:'custom',fs:2000},ibr(5000)),{mode:'custom',fs:2000});
 assert.equal(rcFrequencySettings({fs:3000},ibr(5000)).mode,'custom');
 assert.equal(rcFrequencySettings({},null).fs,10000);
 assert.equal(rcFrequencySettings({fsMode:'linked'},ibr(null)).fs,null);
});
test('inductor preview scales ripple inversely with L and voltage drop directly',()=>{
 const p={ratedVA:1e6,voltageLL:315,frequencyHz:50,dcVoltage:800,fs:10000,sideband:'N-2',harmonicPu:.1,ripplePercent:20,dropPercent:20,L:60e-6};
 const a=designFilterInductor(p),b=designFilterInductor({...p,L:30e-6});
 assert.equal(b.ripplePercent,a.ripplePercent*2);assert.equal(b.dropPercent,a.dropPercent/2);assert.equal(b.minH,a.minH);
 const c=designFilterInductor({...p,dcVoltage:1600});assert.equal(c.minH,a.minH*2);
});
test('RC coupled changes recompute R, resonance, reactive power and bounds',()=>{
 const p={ratedW:1e6,voltageLL:315,frequencyHz:50,L:63e-6,fs:10000,reactivePercent:5,qualityFactor:4,capacitanceF:.0015,currentC:.0015,currentR:.051};
 const a=designRcFilter(p),b=designRcFilter({...p,capacitanceF:p.capacitanceF*4});
 assert.equal(b.resistanceOhm,a.resistanceOhm/2);assert.equal(b.resonanceHz,a.resonanceHz/2);assert.equal(b.qVar,a.qVar*4);
 assert.equal(designRcFilter({...p,qualityFactor:8}).resistanceOhm,a.resistanceOhm/2);
 assert.equal(designRcFilter({...p,fs:5000}).capMinF,a.capMinF*4);
 assert.equal(designRcFilter({...p,L:p.L*4}).capResonanceMaxF,a.capResonanceMaxF/4);
 assert.equal(designRcFilter({...p,ratedW:2e6}).capReactiveMaxF,a.capReactiveMaxF*2);
});
