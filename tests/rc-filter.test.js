import test from 'node:test';
import assert from 'node:assert/strict';
import {designRcFilter,rcDesignCandidates,rcDesignContext} from '../analysis/rc-filter.js';
import {pvReferenceDemo} from '../examples/pv-reference.js';
import {createComponent,parseProject,serializeProject} from '../project/model.js';
const p={ratedW:1e6,voltageLL:315,frequencyHz:50,L:63e-6,fs:10000,reactivePercent:5,qualityFactor:4,capacitanceF:.0015,currentC:.0015,currentR:.051};
const near=(v,w,t=1e-8)=>assert.ok(Math.abs(v-w)<=t,`${v} != ${w}`);
test('RC design uses rated watts, line RMS voltage, per-phase capacitance and QF',()=>{
 const r=designRcFilter(p);
 near(r.qVar,46758.679658,0.001);near(r.resonanceHz,517.731,0.001);
 near(r.resistanceOhm,.0512347538298,1e-12);
 near(r.capMinF,16.082727562276e-6,1e-13);
 near(r.capMaxF,1603.98027858e-6,1e-11);
 assert.equal(r.feasible,true);assert.equal(r.selectedPass,true);
 near(r.currentQualityFactor,4.018412065,1e-8);
});
test('resonance and reactive-power constraints independently limit capacitance',()=>{
 assert.equal(designRcFilter({...p,fs:900}).feasible,false);
 assert.equal(designRcFilter({...p,capacitanceF:.01}).selectedPass,false);
 assert.equal(designRcFilter({...p,capacitanceF:1e-9}).selectedPass,false);
 const a=designRcFilter({...p,ratedW:1e5});near(a.capMaxF,160.398027858e-6,1e-12);
 near(designRcFilter({...p,qualityFactor:8}).resistanceOhm,.0256173769149,1e-12);
});
test('invalid physical inputs and unknown chosen capacitance cannot yield an applicable design',()=>{
 for(const patch of [{ratedW:0},{L:0},{fs:NaN},{qualityFactor:0},{reactivePercent:101},{capacitanceF:-1},{voltageLL:1e308}])assert.throws(()=>designRcFilter({...p,...patch}));
 const r=designRcFilter({...p,capacitanceF:null});assert.equal(r.selectedPass,false);assert.equal(r.resistanceOhm,null);
 assert.equal(designRcFilter({...p,currentR:0}).currentQualityFactor,Infinity);
});
test('RC association is restricted to its exact AC net and requires an explicit choice for multiple IBRs',()=>{
 const project=pvReferenceDemo({ratedIbrVA:1e6});
 assert.deepEqual(rcDesignCandidates(project,'RC1').map(c=>c.id),['PV1']);
 assert.equal(rcDesignContext(project,'RC1','PV1').ratedW,1e6);
 project.components.find(c=>c.id==='PV1').parametersSI.activePowerW=123;
 assert.equal(rcDesignContext(project,'RC1','PV1').ratedW,1e6);
 const b=createComponent('gfm','B');project.components.push(b);project.wires.push({id:'b',from:'B.AC',to:'PCC1.AC'});
 assert.equal(rcDesignCandidates(project,'RC1').length,2);assert.throws(()=>rcDesignContext(project,'RC1',''));
 project.wires.find(w=>w.id==='b').to='BUS35.AC';assert.throws(()=>rcDesignContext(project,'RC1','B'));
});
test('RC design inputs survive project export without modifying another component',()=>{
 const project=pvReferenceDemo({ratedIbrVA:1e6}),rc=project.components.find(c=>c.id==='RC1');
 rc.extensions.rcDesign={ibrId:'PV1',fs:10000,reactivePercent:5,qualityFactor:4,capacitanceF:.0015};
 const restored=parseProject(serializeProject(project));assert.deepEqual(restored.components.find(c=>c.id==='RC1').extensions.rcDesign,rc.extensions.rcDesign);
 assert.equal(restored.components.find(c=>c.id==='PV1').extensions.rcDesign,undefined);
});
