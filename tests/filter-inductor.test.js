import test from 'node:test';
import assert from 'node:assert/strict';
import {designFilterInductor,filterDesignContext} from '../analysis/filter-inductor.js';
import {createComponent,emptyProject,parseProject,serializeProject} from '../project/model.js';
const input={ratedVA:1e6,voltageLL:315,frequencyHz:50,dcVoltage:800,fs:10000,sideband:'N-2',harmonicPu:.4,ripplePercent:20,dropPercent:20,L:63e-6};
test('inductor bounds use RMS rated current and peak-to-peak ripple',()=>{
 const r=designFilterInductor(input);
 assert.ok(Math.abs(r.currentRms-1832.85799742738)<1e-8);
 assert.equal(r.harmonicHz,9900);
 assert.ok(Math.abs(r.minH-8.10243346649649e-6)<1e-14);
 assert.ok(Math.abs(r.maxH-63.168596913e-6)<1e-14);
 assert.equal(r.currentPass,true);
 assert.equal(r.feasible,true);
 assert.ok(Math.abs(r.dropPercent-19.94662)<1e-5);
});
test('missing harmonic amplitude leaves lower bound unknown, not zero',()=>{
 const r=designFilterInductor({...input,harmonicPu:null});
 assert.equal(r.minH,null);assert.equal(r.currentPass,null);assert.ok(r.maxH>0);
});
test('conflicting bounds remain flagged and invalid inputs are rejected',()=>{
 assert.equal(designFilterInductor({...input,fs:500}).feasible,false);
 for(const patch of [{fs:100},{ripplePercent:0},{harmonicPu:-1},{ratedVA:Infinity},{L:-1},{sideband:'bad'}])assert.throws(()=>designFilterInductor({...input,...patch}));
});
test('GFL and GFM use their own ratings and only their connected DC source',()=>{
 const p=emptyProject();p.components=[createComponent('gfl','A'),createComponent('gfm','B'),createComponent('dc','D')];
 p.wires=[{id:'w',from:'B.DC',to:'D.DC'}];
 assert.equal(filterDesignContext(p,'A').dcVoltage,null);
 assert.equal(filterDesignContext(p,'B').dcVoltage,1500);
 p.components[1].extensions.filterDesign={fs:5000,harmonicPu:.3};
 const restored=parseProject(serializeProject(p));assert.equal(restored.components[1].extensions.filterDesign.fs,5000);
 assert.equal(restored.components[0].extensions.filterDesign,undefined);
 p.components.push(createComponent('dc','D2'));p.wires.push({id:'w2',from:'B.DC',to:'D2.DC'});
 assert.equal(filterDesignContext(p,'B').dcVoltage,null);
});
test('phase harmonic and equivalent LL harmonic give identical inductor bounds',()=>{
 const p={ratedVA:1e6,voltageLL:315,frequencyHz:50,dcVoltage:800,fs:2000,sideband:'2N-1',harmonicPu:.389,ripplePercent:10,dropPercent:20,L:63e-6};
 const phase=designFilterInductor({...p,harmonicBasis:'phase'}),line=designFilterInductor({...p,harmonicBasis:'line',harmonicPu:.389*Math.sqrt(3)}),legacy=designFilterInductor(p);
 assert.ok(Math.abs(phase.minH-line.minH)<1e-14);assert.ok(Math.abs(phase.minH-legacy.minH*Math.sqrt(3))<1e-14);assert.equal(phase.maxH,legacy.maxH);assert.throws(()=>designFilterInductor({...p,harmonicBasis:'bad'}));
});

test('manual PV phase amplitude keeps exact and approximate spectral inputs distinct',()=>{
 const p={ratedVA:1928*Math.sqrt(3)*315,voltageLL:315,frequencyHz:50,dcVoltage:800,fs:2000,sideband:'2N-1',harmonicPu:.389,harmonicBasis:'phase',ripplePercent:10,dropPercent:20,L:63e-6};
 const exact=designFilterInductor(p),approx=designFilterInductor({...p,harmonicPu:.4});
 assert.equal(exact.harmonicPhasePeakV,155.6);
 assert.ok(Math.abs(exact.minH*1000-.0650362654159854)<1e-12);
 assert.equal((approx.minH*1000).toFixed(3),'0.067');
 assert.equal(approx.harmonicPhasePeakV,160);
 const line=designFilterInductor({...p,harmonicBasis:'line',harmonicPu:.389*Math.sqrt(3)});
 assert.ok(Math.abs(line.harmonicPhasePeakV-155.6)<1e-10);
 assert.equal(designFilterInductor({...p,dcVoltage:null}).harmonicPhasePeakV,null);
});

test('efficiency correction scales design current and both bounds without changing base ratings',()=>{
 const a=designFilterInductor(input),b=designFilterInductor({...input,currentEfficiencyPercent:96});
 assert.ok(Math.abs(b.currentRms-a.currentRms/.96)<1e-9);
 assert.equal(b.baseCurrentRms,a.currentRms);
 assert.ok(Math.abs(b.minH-a.minH*.96)<1e-14);
 assert.ok(Math.abs(b.maxH-a.maxH*.96)<1e-14);
 assert.ok(Math.abs(b.dropPercent-a.dropPercent/.96)<1e-10);
 for(const eta of [0,-1,101,NaN,null])assert.throws(()=>designFilterInductor({...input,currentEfficiencyPercent:eta}));
});
test('FFT selected order uses its actual frequency',()=>{
 const r=designFilterInductor({...input,sideband:'custom',harmonicOrder:79});
 assert.equal(r.harmonicHz,3950);
 for(const harmonicOrder of [null,0,1,NaN])assert.throws(()=>designFilterInductor({...input,sideband:'custom',harmonicOrder}));
});


test('conflicting constraints offer an applicable midpoint without claiming compliance',()=>{
 const p={ratedVA:3,voltageLL:Math.sqrt(3),frequencyHz:1,dcVoltage:2,fs:12,sideband:'N-2',harmonicBasis:'phase',harmonicPu:.2,ripplePercent:10,dropPercent:20,L:.15/Math.PI};
 const r=designFilterInductor(p);
 assert.equal(r.feasible,false);
 assert.equal(r.currentPass,false);
 assert.ok(Math.abs(r.midpointH-.15/Math.PI)<1e-14);
 assert.equal(r.canApply,true);
 assert.ok(Math.abs(r.ripplePercent-40/3)<1e-10);
 assert.ok(Math.abs(r.dropPercent-30)<1e-10);
 assert.equal(designFilterInductor({...p,L:0}).canApply,false);
 for(const L of [.12/Math.PI,.18/Math.PI,r.minH,r.maxH]){
  const custom=designFilterInductor({...p,L});
  assert.equal(custom.canApply,true);
  assert.equal(custom.currentPass,false);
 }
 for(const L of [.09/Math.PI,.21/Math.PI])assert.equal(designFilterInductor({...p,L}).canApply,false);

});

test('compromise selection does not allow incomplete data or bypass a feasible interval',()=>{
 for(const patch of [{harmonicPu:null},{dcVoltage:null}]){
  const r=designFilterInductor({...input,...patch});
  assert.equal(r.midpointH,null);
  assert.equal(r.canApply,false);
 }
 const valid=designFilterInductor(input);
 assert.equal(valid.canApply,true);
 const outside=designFilterInductor({...input,L:.001});
 assert.equal(outside.feasible,true);
 assert.equal(outside.canApply,false);
});
