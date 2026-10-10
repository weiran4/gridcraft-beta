import test from 'node:test';
import assert from 'node:assert/strict';
import {mainlineFixture} from './fixtures/gfl-mainline.js';
import {gflDqModel} from '../analysis/gfl-dq-model.js';
import {analyzeGflDq} from '../analysis/gfl-dq-analysis.js';
import * as dqAnalysis from '../analysis/gfl-dq-analysis.js';
import {eigenvalues} from '../analysis/eigenvalues.js';
import {GflAnalysisError,gflCanonicalSnapshot,gflFingerprint,gflNumericalPolicy} from '../analysis/gfl-analysis-contract.js';
const load=()=>import('../analysis/gfl-model-contract.js');
const options=f=>({pllEnabled:f.settings.syncMode==='srf-pll',frequencyHz:f.settings.sync.fnHz,damping:f.settings.sync.damping,
 pllFilterMs:f.settings.sync.filterMs,dcModel:f.settings.dcModel,decouplingFrequency:f.settings.sync.decouplingFrequency});
const typed=code=>error=>error instanceof GflAnalysisError&&error.code===code;
const stateIds={il0:'electrical.il.d',il1:'electrical.il.q',ig0:'electrical.ig.d',ig1:'electrical.ig.q',vc0:'electrical.vc.d',vc1:'electrical.vc.q',
 hi0:'measurement.current.d',hi1:'measurement.current.q',hv0:'measurement.voltage.d',hv1:'measurement.voltage.q',pf:'measurement.power.p',qf:'measurement.power.q',
 dcVoltage:'dc.voltage',dcMeasured:'measurement.dc.voltage',xi0:'controller.current.d.integral',xi1:'controller.current.q.integral',
 outer0:'controller.outer.active.integral',outer1:'controller.outer.reactive.integral',pllAngle:'sync.angle',pllIntegral:'sync.integral',pllMeasured:'sync.error.filtered',
 delay0:'actuator.pade.d',delay1:'actuator.pade.q'};

// Regressions protected: adapter bypass/reordered matrices, fabricated states,
// wrong pu bases/frames, lost operating/provenance facts, untyped failures and
// tolerance/pole filtering changes. No mocks or test-only production behavior.
test('contract preserves existing matrices and all physical poles',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture(),raw=gflDqModel(f.input,f.gains,{frequencyHz:20}),m=buildGflReferenceModel(f.snapshot,f.gains);
 for(const key of ['A','B','C','D'])assert.deepEqual(m[key],raw[key]);
 assert.deepEqual(m.states.map(s=>s.legacyName),raw.names);
 assert.deepEqual(dqAnalysis.classifyDqPoles(m.A).poles,eigenvalues(raw.A));
 assert.deepEqual(structuredClone(m),m);
 // Existing canonical JSON intentionally represents signed zero as zero. Worker
 // structured cloning above remains exact, including the legacy negative zero.
 assert.equal(gflCanonicalSnapshot(JSON.parse(JSON.stringify(m))),gflCanonicalSnapshot(m));
 assert.equal(m.modelId,'gfl-dq-reference-v1');assert.equal(m.modelVersion,1);assert.equal(m.equationVersion,raw.version);
 assert.equal(m.numericalVersion,'gfl-dq-linearization-v1');assert.equal(m.realizationId,'outer-reference-closed-v1');
});

test('descriptor dimensions and legacy order remain authoritative',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture(),m=buildGflReferenceModel(f.snapshot,f.gains);
 assert.equal(m.states.length,m.A.length);assert.ok(m.A.every(r=>r.length===m.states.length));
 assert.ok(m.B.every(r=>r.length===m.inputs.length));assert.equal(m.C.length,m.outputs.length);
 assert.ok(m.C.every(r=>r.length===m.states.length));assert.ok(m.D.every(r=>r.length===m.inputs.length));
 assert.deepEqual(m.states.map(s=>s.id),m.states.map(s=>stateIds[s.legacyName]));
 assert.deepEqual(m.inputs.map(s=>s.id),['reference.p','reference.q','disturbance.grid.angle','disturbance.grid.relativeAmplitude','disturbance.dc.power']);
 assert.deepEqual(m.outputs.map(s=>s.id),['pcc.power.p','pcc.power.q','current.bridge.d','current.bridge.q','sync.angle','pcc.voltage.magnitude.diagnostic']);
 assert.equal(m.inputs[4].applicable,false);assert.ok(m.B.every(r=>r[4]===0));
 for(const descriptors of [m.states,m.inputs,m.outputs]){
  assert.equal(new Set(descriptors.map(d=>d.id)).size,descriptors.length);
  for(const d of descriptors){assert.deepEqual(Object.keys(d).sort(),['id','labelZh','unit','frame','meaning','baseSI','baseUnit','legacyName','applicable','enabledWhen'].sort());assert.ok(d.labelZh&&d.meaning);}
 }
});

for(const dMode of ['P','Vdc'])for(const qMode of ['Q','Vac'])test(`outer ${dMode}/${qMode} preserves equations and selected physical ports`,async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture({input:{dMode,qMode,reactivePowerVar:5e4}}),raw=gflDqModel(f.input,f.gains,options(f)),m=buildGflReferenceModel(f.snapshot,f.gains);
 for(const key of ['A','B','C','D'])assert.deepEqual(m[key],raw[key]);
 assert.deepEqual(m.inputs.slice(0,2).map(d=>d.id),[dMode==='P'?'reference.p':'reference.vdc',qMode==='Q'?'reference.q':'reference.vac']);
 assert.deepEqual(m.outputs.slice(0,2).map(d=>d.id),[dMode==='P'?'pcc.power.p':'dc.voltage',qMode==='Q'?'pcc.power.q':'pcc.voltage.magnitude']);
 assert.equal(m.states.some(s=>s.id==='dc.voltage'),dMode==='Vdc');
 assert.equal(m.inputs[4].applicable,dMode==='Vdc');
 assert.equal(m.outputs[0].baseSI,dMode==='P'?f.input.ratedVA:f.input.dcVoltage);
 assert.equal(m.outputs[1].baseSI,qMode==='Q'?f.input.ratedVA:f.input.voltageLL);
 assert.equal(m.outputs[5].baseSI,f.input.voltageLL);
});

test('optional states carry exact units, conversion bases and reference frames',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture({input:{dMode:'Vdc',delaySamples:1},settings:{sync:{filterMs:2}}}),m=buildGflReferenceModel(f.snapshot,f.gains);
 const states=Object.fromEntries(m.states.map(s=>[s.legacyName,s])),Vb=Math.sqrt(2/3)*f.input.voltageLL,Ib=Math.sqrt(2)*f.input.ratedVA/(Math.sqrt(3)*f.input.voltageLL);
 for(const key of ['il0','il1','ig0','ig1'])assert.deepEqual([states[key].unit,states[key].baseSI,states[key].baseUnit,states[key].frame],['pu',Ib,'A','nominal-dq']);
 for(const key of ['vc0','vc1','delay0','delay1'])assert.deepEqual([states[key].unit,states[key].baseSI,states[key].baseUnit,states[key].frame],['pu',Vb,'V','nominal-dq']);
 for(const key of ['hi0','hi1','outer0','outer1'])assert.deepEqual([states[key].unit,states[key].baseSI,states[key].baseUnit,states[key].frame],['pu',Ib,'A','controller-dq']);
 for(const key of ['hv0','hv1','xi0','xi1'])assert.deepEqual([states[key].unit,states[key].baseSI,states[key].baseUnit,states[key].frame],['pu',Vb,'V','controller-dq']);
 for(const key of ['dcVoltage','dcMeasured'])assert.deepEqual([states[key].unit,states[key].baseSI,states[key].baseUnit],['pu',f.input.dcVoltage,'V']);
 assert.deepEqual([states.pllAngle.unit,states.pllIntegral.unit,states.pllMeasured.unit],['rad','rad/s','1']);
 for(const key of ['pllAngle','pllIntegral','pllMeasured'])assert.equal(states[key].baseSI,null);
 assert.equal(m.inputs[2].unit,'rad');assert.equal(m.inputs[2].baseSI,null);
 assert.equal(m.inputs[3].unit,'1');assert.equal(m.inputs[3].baseSI,null);
 assert.equal(m.outputs[2].frame,'controller-dq');assert.equal(m.outputs[2].baseSI,Ib);
});

test('zero filters and zero Ki remove states without hidden integrators',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture({input:{filterCurrentMs:0,filterVoltageMs:0,filterPqMs:0,filterVdcMs:0},gains:{d:{ki:0},q:{ki:0},P:{ki:0},Q:{ki:0}}});
 const m=buildGflReferenceModel(f.snapshot,f.gains),raw=gflDqModel(f.input,f.gains,options(f));
 assert.deepEqual(m.states.map(s=>s.legacyName),['il0','il1','ig0','ig1','vc0','vc1','pllAngle','pllIntegral']);
 assert.deepEqual(m.A,raw.A);assert.equal(m.quality.residual,raw.residual);
});

test('fixed angle removes PLL states and marks the angle output inapplicable',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture({settings:{syncMode:'fixed-angle',sync:{filterMs:2}}}),m=buildGflReferenceModel(f.snapshot,f.gains);
 assert.ok(!m.states.some(s=>s.id.startsWith('sync.')));assert.equal(m.outputs[4].applicable,false);
 assert.deepEqual(m.A,gflDqModel(f.input,f.gains,options(f)).A);assert.equal(m.coverage.syncMode,'fixed-angle');
});

test('PLL fn, damping and filter changes alter matrices as well as fingerprints',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture(),base=buildGflReferenceModel(f.snapshot,f.gains);
 for(const sync of [{fnHz:25},{damping:.9},{filterMs:1},{decouplingFrequency:'nominal'}]){
  const changed=mainlineFixture({settings:{sync}}),m=buildGflReferenceModel(changed.snapshot,changed.gains);
  assert.notDeepEqual(m.A,base.A);assert.notEqual(m.modelFingerprint,base.modelFingerprint);
  assert.deepEqual(m.A,gflDqModel(changed.input,changed.gains,options(changed)).A);
 }
});

test('nonzero P/Q and strong/weak R/X remain reproducible equilibria',async()=>{
 const {buildGflReferenceModel}=await load(),initial=mainlineFixture();
 for(const scale of [.25,1,5])for(const ratio of [.1,2]){
  const f=mainlineFixture({input:{activePowerW:1e5,reactivePowerVar:2e4,gridXOhm:initial.input.gridXOhm*scale,gridROhm:initial.input.gridXOhm*scale*ratio}}),m=buildGflReferenceModel(f.snapshot,f.gains),raw=gflDqModel(f.input,f.gains,options(f));
  assert.deepEqual(m.operatingPoint.op,raw.op);assert.deepEqual(m.A,raw.A);assert.ok(m.quality.residual<1e-7);
 }
});

test('explicit capacitor DC remains dynamic independently of active outer mode',async()=>{
 const {buildGflReferenceModel}=await load();
 for(const dMode of ['P','Vdc']){
  const f=mainlineFixture({input:{dMode},settings:{dcModel:'capacitor'}}),m=buildGflReferenceModel(f.snapshot,f.gains);
  assert.ok(m.states.some(s=>s.id==='dc.voltage'));assert.equal(m.inputs[4].applicable,true);assert.ok(m.B.some(r=>r[4]!==0));
  assert.equal(m.states.some(s=>s.id==='measurement.dc.voltage'),dMode==='Vdc');
  assert.deepEqual(m.A,gflDqModel(f.input,f.gains,options(f)).A);
 }
});

test('operating point and parameters are reproducible without mutation or functions',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture(),before=JSON.stringify(f),m=buildGflReferenceModel(f.snapshot,f.gains),raw=gflDqModel(f.input,f.gains,options(f));
 assert.deepEqual(m.operatingPoint.u0,[0,0,0,0,0]);assert.deepEqual(m.operatingPoint.x0,raw.x0);assert.deepEqual(m.operatingPoint.y0,raw.y0);assert.deepEqual(m.operatingPoint.op,raw.op);
 assert.equal(m.operatingPoint.branch,'high-voltage');
 assert.deepEqual(m.operatingPoint.bases,{Vb:Math.sqrt(2/3)*f.input.voltageLL,Ib:Math.sqrt(2)*f.input.ratedVA/(Math.sqrt(3)*f.input.voltageLL),S:f.input.ratedVA,Vdc:f.input.dcVoltage,VLL:f.input.voltageLL,Zb:raw.op.Z});
 assert.deepEqual(m.parameterSources,f.snapshot.parameterSources);assert.deepEqual(m.configurationSnapshot.gains,f.gains);assert.deepEqual(m.configurationSnapshot.policy,gflNumericalPolicy().model);
 assert.deepEqual(buildGflReferenceModel(m.configurationSnapshot,m.configurationSnapshot.gains),m);
 assert.equal(JSON.stringify(f),before);assert.ok(Object.isFrozen(m.configurationSnapshot));assert.ok(Object.isFrozen(m.configurationSnapshot.input));
 const visit=value=>{assert.notEqual(typeof value,'function');if(value&&typeof value==='object')Object.values(value).forEach(visit);};visit(m);
});

test('quality exports dimensional residuals and existing Jacobian scales and thresholds',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture({input:{dMode:'Vdc'},settings:{sync:{filterMs:1}}}),m=buildGflReferenceModel(f.snapshot,f.gains),raw=gflDqModel(f.input,f.gains,options(f));
 const residual=m.quality.operatingPoint,jacobian=m.quality.jacobian;
 assert.equal(m.quality.residual,raw.residual);assert.equal(m.quality.jacobianError,raw.jacobianError);
 assert.equal(residual.scale,'max(abs(dx))');assert.equal(residual.threshold,1e-7);assert.equal(residual.unit,'mixed-state-derivatives');
 assert.deepEqual(residual.derivatives.map(r=>r.stateId),m.states.map(s=>s.id));
 assert.deepEqual(residual.derivatives.map(r=>r.value),raw.evaluate(raw.x0).dx);
 assert.equal(residual.derivatives.find(r=>r.stateId==='sync.angle').unit,'rad/s');
 assert.equal(residual.derivatives.find(r=>r.stateId==='sync.integral').unit,'rad/s²');
 assert.equal(residual.derivatives.find(r=>r.stateId==='sync.error.filtered').unit,'1/s');
 assert.equal(residual.derivatives.find(r=>r.stateId==='dc.voltage').unit,'pu/s');
 assert.equal(jacobian.coarseStep,2e-6);assert.equal(jacobian.fineStep,1e-6);assert.equal(jacobian.maxNormalizedDifference,1e-5);
 assert.equal(jacobian.rowNormalization,'max(1,max(abs(fine row)))');assert.equal(jacobian.actualNormalizedDifference,raw.jacobianError);
 assert.equal(m.quality.poleRealPartTolerance,1e-6);
});

test('positive delay is labelled approximate and periods remain independent',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture({input:{delaySamples:1,fs:10000,switchingFrequencyHz:2500}}),m=buildGflReferenceModel(f.snapshot,f.gains);
 assert.equal(m.delayRepresentation.kind,'first-order-pade');assert.equal(m.delayRepresentation.approximate,true);assert.equal(m.delayRepresentation.seconds,.0001);
 assert.equal(m.delayRepresentation.controlStepSeconds,.0001);assert.equal(m.delayRepresentation.pwmPeriodSeconds,.0004);
 assert.deepEqual(m.A,gflDqModel(f.input,f.gains,options(f)).A);
 const unknown=mainlineFixture({input:{switchingFrequencyHz:null}}),n=buildGflReferenceModel(unknown.snapshot,unknown.gains);
 assert.equal(n.delayRepresentation.pwmPeriodSeconds,null);assert.equal(n.delayRepresentation.kind,'none');assert.equal(n.delayRepresentation.approximate,false);
});

test('model fingerprints retain exact PI, operating facts and parameter provenance',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture(),m=buildGflReferenceModel(f.snapshot,f.gains);
 assert.equal(m.modelFingerprint,gflFingerprint('model',{configurationSnapshot:m.configurationSnapshot,operatingPoint:m.operatingPoint,numericalVersion:m.numericalVersion,realizationId:m.realizationId}));
 for(const changed of [mainlineFixture({gains:{d:{kp:f.gains.d.kp+Number.EPSILON}}}),mainlineFixture({input:{reactivePowerVar:1000}}),mainlineFixture({settings:{sources:{'sync.fnHz':'measured'}}})]){
  assert.notEqual(buildGflReferenceModel(changed.snapshot,changed.gains).modelFingerprint,m.modelFingerprint);
 }
 const reordered=Object.fromEntries(Object.entries(structuredClone(f.snapshot)).reverse());
 assert.equal(buildGflReferenceModel(reordered,f.gains).modelFingerprint,m.modelFingerprint);
});

test('unsupported model/equation versions and unknown experiments fail explicitly',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture();
 for(const patch of [{modelId:'legacy-scalar'},{modelId:'future-model'},{modelVersion:2},{equationVersion:'future-equations'}, {analysis:{...f.snapshot.analysis,modelVersion:2}}]){
  assert.throws(()=>buildGflReferenceModel({...f.snapshot,...patch},f.gains),typed('unsupported'));
 }
 assert.equal(buildGflReferenceModel(f.snapshot,f.gains,{experimentId:'current-reference-frozen-outer'}).realizationId,'current-reference-frozen-outer-v1');
 assert.throws(()=>buildGflReferenceModel(f.snapshot,f.gains,{experimentId:'unknown'}),typed('unsupported'));
});

test('errors do not masquerade as unstable: physical, input and operating-point boundaries are typed',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture();
 for(const input of [{considerScr:false},{gridCapacitanceF:0},{gridXOhm:0},{gridError:'unsupported branch'},{dMode:'unknown'}]){
  const changed=mainlineFixture({input});
  assert.throws(()=>buildGflReferenceModel(changed.snapshot,changed.gains),typed('unsupported'));
  assert.throws(()=>gflDqModel(changed.input,changed.gains,options(changed)),typed('unsupported'));
 }
 for(const dcCapacitanceF of [undefined,null,0,-1,NaN]){
  const changed=mainlineFixture({input:{dcCapacitanceF},settings:{dcModel:'capacitor'}});
  assert.throws(()=>buildGflReferenceModel(changed.snapshot,changed.gains),typed('invalidInput'));
 }
 const badGain=structuredClone(f.gains);badGain.d.kp=-1;
 assert.throws(()=>gflDqModel(f.input,badGain),typed('invalidInput'));
 assert.throws(()=>gflDqModel(f.input,f.gains,{frequencyHz:NaN}),typed('invalidInput'));
 assert.throws(()=>gflDqModel({...f.input,R:-1},f.gains),typed('invalidInput'));
 const rigid=mainlineFixture({input:{dMode:'Vdc'},settings:{dcModel:'rigid'}});
 assert.throws(()=>buildGflReferenceModel(rigid.snapshot,rigid.gains),typed('unsupported'));
 const collapsed=mainlineFixture({input:{activePowerW:1e8}});
 assert.throws(()=>buildGflReferenceModel(collapsed.snapshot,collapsed.gains),typed('operatingPointFailure'));
 assert.throws(()=>gflDqModel(collapsed.input,collapsed.gains),typed('operatingPointFailure'));
});

test('numerical overflow and invalid pole matrices return numerical failures, never instability',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture({gains:{d:{kp:Number.MAX_VALUE}}});
 assert.throws(()=>buildGflReferenceModel(f.snapshot,f.gains),typed('numericalFailure'));
 for(const A of [[],[[NaN]],[[Infinity]],[[1,2]]])assert.throws(()=>dqAnalysis.classifyDqPoles(A),typed('numericalFailure'));
});

test('pole classifier preserves ±1e-6 inclusive marginal boundary and existing analysis results',()=>{
 assert.equal(typeof dqAnalysis.classifyDqPoles,'function');
 for(const alpha of [1e-6,-1e-6,0])assert.deepEqual(dqAnalysis.classifyDqPoles([[alpha]]),{status:'marginal',alpha,poles:[{re:alpha,im:0}]});
 assert.equal(dqAnalysis.classifyDqPoles([[1e-6+Number.EPSILON]]).status,'unstable');
 assert.equal(dqAnalysis.classifyDqPoles([[-1e-6-Number.EPSILON]]).status,'stable');
 const f=mainlineFixture(),r=analyzeGflDq(f.input,f.gains,options(f),{includeSeries:false}),classification=dqAnalysis.classifyDqPoles(r.model.A);
 assert.equal(r.poleStatus,classification.status);assert.equal(r.alpha,classification.alpha);assert.deepEqual(r.poles,classification.poles);assert.equal(r.poles.length,r.order);
});

test('inconsistent resolved metadata and invalid provenance fail at the typed boundary',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture();
 for(const patch of [{nominalFrequencyHz:60},{controlStepSeconds:.1},{pwmPeriodSeconds:.1},{parameterSources:undefined},{parameterSources:{fs:3}}])
  assert.throws(()=>buildGflReferenceModel({...f.snapshot,...patch},f.gains),typed('invalidInput'));
});

test('model identity excludes caller presentation and request decorations',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture(),m=buildGflReferenceModel(f.snapshot,f.gains);
 const decorated={...f.snapshot,display:{color:'red'},request:{maxOvershootPercent:1},input:{...f.snapshot.input,display:{units:'SI'},zoom:10,request:{maxOvershootPercent:1}}};
 assert.deepEqual(buildGflReferenceModel(decorated,f.gains),m);
});

// Review I1: only the eight numerical PI fields affect computation/identity.
for(const [label,decorate]of [
 ['object-level',gains=>({...gains,display:{color:'red'},request:{maxOvershootPercent:1}})],
 ['loop-level',gains=>({...gains,d:{...gains.d,label:'display only',zoom:4}})],
 ['non-cloneable',gains=>({...gains,display:{formatter:()=>0},d:{...gains.d,formatter:()=>1}})]
])test(`gain projection excludes ${label} decorations from model data and identity`,async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture(),expected=buildGflReferenceModel(f.snapshot,f.gains),decorated=decorate(f.gains);
 assert.deepEqual(buildGflReferenceModel(f.snapshot,decorated),expected);
 assert.deepEqual(expected.configurationSnapshot.gains,f.gains);
});

test('invalid numerical gain fields remain typed invalid input at the adapter boundary',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture();
 for(const gains of [undefined,null,{}, {...f.gains,d:{kp:()=>0,ki:1}}, {...f.gains,q:{kp:1,ki:NaN}}, {...f.gains,P:{kp:-1,ki:1}}])
  assert.throws(()=>buildGflReferenceModel(f.snapshot,gains),typed('invalidInput'));
});

// Review I2: finite primitive inputs must not export nonfinite realizations or
// diagnostics, or become fictitious zero-state dynamics through overflow.
for(const [label,config]of [
 ['explicit delay',{input:{fs:1e-305,delaySamples:1e10},settings:{syncMode:'fixed-angle'}}],
 ['operating-point modulation',{input:{dcVoltage:1e-310}}],
 ['dynamic DC energy scale',{input:{dcVoltage:1e200},settings:{dcModel:'capacitor'}}],
 ['current conversion base',{input:{ratedVA:1.7e308,voltageLL:1e153,dcVoltage:4e153}}]
])test(`adapter rejects nonfinite derived ${label} with a typed numerical failure`,async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture(config);
 assert.throws(()=>buildGflReferenceModel(f.snapshot,f.gains),typed('numericalFailure'));
});

test('adapter preserves marginal lossless fixed-angle zero-gain physical states',async()=>{
 const {buildGflReferenceModel}=await load(),f=mainlineFixture({input:{R:0,filterCurrentMs:0,filterVoltageMs:0,filterPqMs:0},
  gains:Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:0,ki:0}])),settings:{syncMode:'fixed-angle'}});
 const m=buildGflReferenceModel(f.snapshot,f.gains),raw=gflDqModel(f.input,f.gains,{pllEnabled:false});
 assert.deepEqual(m.states.map(s=>s.legacyName),['il0','il1','ig0','ig1','vc0','vc1']);
 for(const key of ['A','B','C','D'])assert.deepEqual(m[key],raw[key]);
 assert.deepEqual(m.A[1],[0,0,0,0,0,0]);assert.deepEqual(m.B[1],[0,0,0,0,0]);
 const stability=dqAnalysis.classifyDqPoles(m.A);assert.equal(stability.status,'marginal');assert.equal(stability.alpha,0);assert.equal(stability.poles.length,6);
 assert.deepEqual(structuredClone(m),m);
});

const dcRangeInput={ratedVA:1e-15,voltageLL:Math.sqrt(1e-15),activePowerW:0,reactivePowerVar:0,
 dcVoltage:1e154,dcCapacitanceF:1,R:.001,L:.0001,gridROhm:.001,gridXOhm:.1,gridCapacitanceF:.001,gridCapResistanceOhm:.001};
for(const dMode of ['P','Vdc']){
 test(`adapter rejects ${dMode} capacitor DC subnormal power dependency loss`,async()=>{
  const {buildGflReferenceModel}=await load(),f=mainlineFixture({input:{...dcRangeInput,dMode},settings:{syncMode:'fixed-angle',dcModel:'capacitor'}});
  assert.throws(()=>buildGflReferenceModel(f.snapshot,f.gains),typed('numericalFailure'));
 });
 test(`${dMode} capacitor DC retains the representable small power dependency`,async()=>{
  const {buildGflReferenceModel}=await load(),f=mainlineFixture({input:{...dcRangeInput,dMode,dcVoltage:1e145},settings:{syncMode:'fixed-angle',dcModel:'capacitor'}}),m=buildGflReferenceModel(f.snapshot,f.gains),raw=gflDqModel(f.input,f.gains,options(f)),i=m.states.findIndex(s=>s.id==='dc.voltage');
  assert.ok(m.inputs[4].applicable);assert.ok(m.B[i][4]>0);assert.ok(Number.isFinite(m.B[i][4]));
  for(const key of ['A','B','C','D'])assert.deepEqual(m[key],raw[key]);
  assert.deepEqual(structuredClone(m),m);
 });
}
