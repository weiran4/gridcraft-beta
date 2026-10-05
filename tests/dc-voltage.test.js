import test from 'node:test';
import assert from 'node:assert/strict';
import {designDcVoltage,dcDesignCandidates,dcDesignContext,dcInputIssues} from '../analysis/dc-voltage.js';
import {pvReferenceDemo} from '../examples/pv-reference.js';
import {createComponent,parseProject,serializeProject} from '../project/model.js';
const input={ratedVA:1e6,voltageLL:315,frequencyHz:50,L:63e-6,phaseAngleDeg:0,modulation:'spwm',marginPercent:5,selectedV:800};
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
test('DC design uses phase RMS, rated RMS current and the phase-voltage modulation definition',()=>{
 const r=designDcVoltage(input);near(r.currentRms,1832.857997);near(r.phaseRms,181.8653348);near(r.inductorDropRms,36.2759872847);near(r.converterRms,185.448056,1e-3);
 near(r.minimumV,552.13,.1);assert.equal(r.pass,true);assert.equal(r.overmodulation,false);
 const third=designDcVoltage({...input,modulation:'third'});near(third.minimumV,r.minimumV/1.15);assert.equal(third.maxModulation,1.15);
});
test('signed reactive angle changes required voltage and zero L removes angle dependence',()=>{
 const pos=designDcVoltage({...input,phaseAngleDeg:30}),neg=designDcVoltage({...input,phaseAngleDeg:-30});assert.ok(pos.minimumV>neg.minimumV);
 const zero=designDcVoltage({...input,L:0,phaseAngleDeg:0}),other=designDcVoltage({...input,L:0,phaseAngleDeg:80});near(zero.minimumV,other.minimumV);
});
test('margin failure and actual overmodulation are distinguished, including equality at minimum',()=>{
 const r=designDcVoltage(input);
 assert.equal(designDcVoltage({...input,selectedV:r.minimumV}).pass,true);
 const below=designDcVoltage({...input,selectedV:r.minimumV*.99});assert.equal(below.pass,false);assert.equal(below.overmodulation,false);
 assert.equal(designDcVoltage({...input,selectedV:400}).overmodulation,true);
 const empty=designDcVoltage({...input,selectedV:null});assert.equal(empty.modulationIndex,null);assert.equal(empty.pass,false);
});
test('invalid physical values are rejected and fields receive meaningful errors',()=>{
 for(const patch of [{ratedVA:0},{L:-1},{phaseAngleDeg:91},{phaseAngleDeg:null},{marginPercent:100},{modulation:'x'},{selectedV:-1},{voltageLL:1.7e308}])assert.throws(()=>designDcVoltage({...input,...patch}));
 const errors=dcInputIssues({ibrId:'',phaseAngleDeg:100,marginPercent:100,selectedV:0},null);assert.ok(errors.ibrId&&errors.phaseAngleDeg&&errors.marginPercent&&errors.selectedV);
});
test('DC association supports GFL/GFM only on the same DC net and rejects multiple ideal supplies',()=>{
 const p=pvReferenceDemo({ratedIbrVA:1e6});assert.deepEqual(dcDesignCandidates(p,'DC1').map(c=>c.id),['PV1']);
 assert.equal(dcDesignContext(p,'DC1','PV1').L,63e-6);
 const g=createComponent('gfm','G');p.components.push(g);assert.throws(()=>dcDesignContext(p,'DC1','G'));
 p.wires.push({id:'wg',from:'DC1.DC',to:'G.DC'});assert.equal(dcDesignCandidates(p,'DC1').length,2);assert.equal(dcDesignContext(p,'DC1','G').sharedCount,2);
 p.components.push(createComponent('dc','D2'));p.wires.push({id:'wd',from:'DC1.DC',to:'D2.DC'});assert.throws(()=>dcDesignContext(p,'DC1','PV1'));
});
test('DC inputs survive serialization without altering electrical parameters',()=>{
 const p=pvReferenceDemo({ratedIbrVA:1e6}),dc=p.components.find(c=>c.id==='DC1');dc.extensions.dcDesign={ibrId:'PV1',phaseAngleDeg:20,marginPercent:5,modulation:'third',selectedV:900};
 const restored=parseProject(serializeProject(p));assert.deepEqual(restored.components.find(c=>c.id==='DC1').extensions.dcDesign,dc.extensions.dcDesign);assert.equal(restored.components.find(c=>c.id==='DC1').parametersSI.voltageV,800);
});
