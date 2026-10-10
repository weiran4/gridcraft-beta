import test from 'node:test';
import assert from 'node:assert/strict';
import {gflDqModel} from '../analysis/gfl-dq-model.js';
import {buildGflReferenceModel} from '../analysis/gfl-model-contract.js';
import {GflAnalysisError,gflNumericalPolicy,gflFingerprint} from '../analysis/gfl-analysis-contract.js';
import {mainlineFixture} from './fixtures/gfl-mainline.js';

const closedId='outer-reference-closed',currentId='current-reference-frozen-outer';
const load=()=>import('../analysis/gfl-experiments.js');
const options=f=>({pllEnabled:f.settings.syncMode==='srf-pll',frequencyHz:f.settings.sync.fnHz,damping:f.settings.sync.damping,
 pllFilterMs:f.settings.sync.filterMs,dcModel:f.settings.dcModel,decouplingFrequency:f.settings.sync.decouplingFrequency});
const raw=(f,id=currentId,gains=f.gains)=>gflDqModel(f.input,gains,options(f),{experimentId:id});
const definition=(id,amplitudePu=.01,windowSeconds=null)=>({id,amplitudePu,windowSeconds});
const typed=code=>error=>error instanceof GflAnalysisError&&error.code===code;
const assertDerivative=(m,inputIndex)=>{
 const h=gflNumericalPolicy().model.jacobian.coarseStep,up=Array(5).fill(0),um=Array(5).fill(0);
 up[inputIndex]=h;um[inputIndex]=-h;
 const a=m.evaluate(m.x0,up),b=m.evaluate(m.x0,um);
 for(let i=0;i<m.names.length;i++){
  const derivative=(a.dx[i]-b.dx[i])/(2*h),scale=Math.max(1,...m.B[i].map(Math.abs));
  assert.ok(Math.abs(derivative-m.B[i][inputIndex])/scale<=1e-5,`${m.names[i]} input ${inputIndex}`);
 }
};

test('explicit closed experiment exactly preserves the default realization',()=>{
 const f=mainlineFixture(),m=gflDqModel(f.input,f.gains,options(f)),explicit=raw(f,closedId);
 for(const key of ['A','B','C','D','names','x0','y0','inputNames','outputNames','op','residual','jacobianError','dcAssumption'])assert.deepEqual(explicit[key],m[key],key);
});

for(const dMode of ['P','Vdc'])for(const qMode of ['Q','Vac']){
 test(`current injection freezes both outer outputs in ${dMode}/${qMode}`,()=>{
  const f=mainlineFixture({input:{dMode,qMode}}),m=raw(f),changed=structuredClone(f.gains);
  changed.P.kp*=2;changed.P.ki*=3;changed.Q.kp*=4;changed.Q.ki*=2;
  assert.equal(m.names.includes('outer0'),false);assert.equal(m.names.includes('outer1'),false);
  const other=raw(f,currentId,changed);
  for(const key of ['A','B','C','D','names','x0'])assert.deepEqual(other[key],m[key],key);
  assert.ok(m.residual<=1e-7);assert.ok(m.jacobianError<=1e-5);
 });
 test(`frozen ${dMode}/${qMode} keeps every selected non-outer state`,()=>{
  const f=mainlineFixture({input:{dMode,qMode,delaySamples:1},settings:{sync:{filterMs:1}}}),m=raw(f),closed=raw(f,closedId);
  assert.deepEqual(m.names,closed.names.filter(name=>!['outer0','outer1'].includes(name)));
  assert.equal(m.names.includes('dcVoltage'),dMode==='Vdc');
  assert.deepEqual(m.outputNames,closed.outputNames);assert.equal(m.inputNames.length,5);assert.equal(m.outputNames.length,6);
  assert.deepEqual(m.op,closed.op);assert.deepEqual(m.y0,closed.y0);
  for(const key of ['hi0','hi1','hv0','hv1','pllAngle','pllIntegral','pllMeasured','delay0','delay1'])assert.ok(m.names.includes(key),key);
 });
 for(const axis of [0,1])test(`frozen ${dMode}/${qMode} ${axis?'q':'d'} reference has its nonlinear RHS B derivative`,()=>{
  const f=mainlineFixture({input:{dMode,qMode}}),m=raw(f);
  assertDerivative(m,axis);
  const xi=m.names.indexOf('xi'+axis),loop=axis?'q':'d';
  assert.ok(Math.abs(m.B[xi][axis]-f.gains[loop].ki)/Math.max(1,f.gains[loop].ki)<1e-8);
  assert.ok(Math.abs(m.B[m.names.indexOf('il'+axis)][axis]-f.gains[loop].kp/(f.input.L/m.op.Z))<1e-4);
 });
}

test('explicit P-mode capacitor retains DC energy after frozen integrators are removed',()=>{
 const f=mainlineFixture({input:{dMode:'P'},settings:{dcModel:'capacitor'}}),m=raw(f);
 assert.equal(m.names.includes('outer0'),false);assert.equal(m.names.includes('outer1'),false);
 assert.ok(m.names.includes('dcVoltage'));assert.ok(m.B[m.names.indexOf('dcVoltage')][4]>0);
 assert.equal(m.names.includes('dcMeasured'),false);assert.ok(m.residual<=1e-7);assertDerivative(m,4);
});

test('frozen current injection does not multiply by or require outer PI gains',()=>{
 const f=mainlineFixture(),zero=structuredClone(f.gains);zero.P={kp:0,ki:0};zero.Q={kp:0,ki:0};
 const m=raw(f),other=raw(f,currentId,zero);
 for(const key of ['A','B','C','D','names','x0'])assert.deepEqual(other[key],m[key]);
 assert.ok(m.B.some(row=>row[0]!==0));assert.ok(m.B.some(row=>row[1]!==0));
});

test('PLL on/off and tuning still change the frozen current physical realization',()=>{
 const f=mainlineFixture({settings:{sync:{filterMs:1}}}),m=raw(f),fixed=raw(mainlineFixture({settings:{syncMode:'fixed-angle',sync:{filterMs:1}}}));
 assert.ok(m.names.includes('pllAngle'));assert.ok(m.names.includes('pllIntegral'));assert.ok(m.names.includes('pllMeasured'));
 assert.ok(!fixed.names.some(name=>name.startsWith('pll')));assert.notDeepEqual(m.A,fixed.A);
 assert.notDeepEqual(raw(mainlineFixture({settings:{sync:{fnHz:25,filterMs:1}}})).A,m.A);
});

test('source disturbances preserve units, order and solved source scaling',async()=>{
 const {buildGflExperiment,findPortIndex}=await load(),f=mainlineFixture({input:{gridVoltagePu:.93}}),closed=buildGflExperiment(f.snapshot,f.gains,definition(closedId)),current=buildGflExperiment(f.snapshot,f.gains,definition(currentId)),m=raw(f);
 assert.deepEqual(current.model.inputs.slice(2),closed.model.inputs.slice(2));assert.deepEqual(current.model.outputs,closed.model.outputs);
 assert.deepEqual(current.model.inputs.slice(2).map(d=>[d.id,d.unit,d.applicable]),[
  ['disturbance.grid.angle','rad',true],['disturbance.grid.relativeAmplitude','1',true],['disturbance.dc.power','pu',false]]);
 const lg=f.input.gridXOhm/(m.op.w*m.op.Z),h=1e-6,u=Array(5).fill(0);u[3]=h;
 const base=m.evaluate(m.x0).dx,changed=m.evaluate(m.x0,u).dx;
 for(const k of [0,1])assert.ok(Math.abs((changed[m.names.indexOf('ig'+k)]-base[m.names.indexOf('ig'+k)])/h+m.op.eg[k]/lg)<1e-4);
 assertDerivative(m,2);assertDerivative(m,3);
 assert.equal(current.model.inputs[3].baseSI,null);assert.equal(current.model.inputs[3].baseUnit,null);
 assert.notEqual(m.op.V,1);assert.ok(Math.abs(Math.hypot(...m.op.eg)-.93)<1e-10);
 assert.throws(()=>findPortIndex(current.model.inputs,'disturbance.dc.power'),typed('invalidInput'));
});

test('definitions default to independent 0.01 pu reference runs with automatic windows',async()=>{
 const {createGflExperimentDefinitions,buildGflExperiment}=await load(),defs=createGflExperimentDefinitions(),f=mainlineFixture();
 assert.deepEqual(defs,[definition(closedId),definition(currentId)]);
 const again=createGflExperimentDefinitions();assert.notEqual(again,defs);assert.notEqual(again[0],defs[0]);
 const outer=buildGflExperiment(f.snapshot,f.gains,defs[0]),current=buildGflExperiment(f.snapshot,f.gains,defs[1]);
 assert.deepEqual(outer.steps,[{inputId:'reference.p',targetOutputId:'pcc.power.p',amplitudePu:.01},{inputId:'reference.q',targetOutputId:'pcc.power.q',amplitudePu:.01}]);
 assert.deepEqual(current.steps,[{inputId:'reference.current.d',targetOutputId:'current.bridge.d',amplitudePu:.01},{inputId:'reference.current.q',targetOutputId:'current.bridge.q',amplitudePu:.01}]);
 assert.deepEqual(current.model.inputs.slice(0,2).map(d=>[d.id,d.unit,d.frame,d.baseSI,d.baseUnit]),[
  ['reference.current.d','pu','controller-dq',current.model.operatingPoint.bases.Ib,'A'],['reference.current.q','pu','controller-dq',current.model.operatingPoint.bases.Ib,'A']]);
});

for(const dMode of ['P','Vdc'])for(const qMode of ['Q','Vac'])test(`closed experiment selects actual ${dMode}/${qMode} tracking outputs by ID`,async()=>{
 const {buildGflExperiment}=await load(),f=mainlineFixture({input:{dMode,qMode}}),r=buildGflExperiment(f.snapshot,f.gains,definition(closedId));
 assert.deepEqual(r.model,buildGflReferenceModel(f.snapshot,f.gains));
 assert.deepEqual(r.steps.map(s=>[s.inputId,s.targetOutputId]),[[dMode==='P'?'reference.p':'reference.vdc',dMode==='P'?'pcc.power.p':'dc.voltage'],[qMode==='Q'?'reference.q':'reference.vac',qMode==='Q'?'pcc.power.q':'pcc.voltage.magnitude']]);
});

test('feedback records freezing at both outer current commands, actual frame and full retained states',async()=>{
 const {buildGflExperiment}=await load(),f=mainlineFixture({input:{dMode:'Vdc',delaySamples:1},settings:{sync:{filterMs:1}}}),r=buildGflExperiment(f.snapshot,f.gains,definition(currentId));
 assert.equal(r.feedback.outer,'frozen-output-increments');assert.equal(r.feedback.current,'closed');
 assert.equal(r.feedback.freezeLocation,'outer-controller-current-command-output');assert.equal(r.feedback.controllerFrame,'controller-dq');
 assert.deepEqual(r.feedback.operatingCurrentBiasPu,r.model.operatingPoint.op.il);assert.deepEqual(r.feedback.frozenOuterOutputIncrementsPu,[0,0]);
 assert.deepEqual(r.feedback.retainedStateIds,r.model.states.map(s=>s.id));assert.equal(r.feedback.stabilityScope,'experiment-diagnostic');
 assert.equal(r.model.realizationId,'current-reference-frozen-outer-v1');assert.equal(r.model.equationVersion,'gfl-dq-srf-pll-v1');
});

test('fingerprints separate connections, amplitude, windows and response policy while sharing physical identity',async()=>{
 const {buildGflExperiment}=await load(),f=mainlineFixture(),closed=buildGflExperiment(f.snapshot,f.gains,definition(closedId)),current=buildGflExperiment(f.snapshot,f.gains,definition(currentId));
 assert.equal(closed.modelFingerprint,current.modelFingerprint);assert.equal(current.model.modelFingerprint,current.modelFingerprint);
 assert.notEqual(closed.experimentFingerprint,current.experimentFingerprint);assert.notDeepEqual(closed.model.A,current.model.A);
 for(const d of [definition(currentId,-.01),definition(currentId,.010000000000000002),definition(currentId,.01,2)])
  assert.notEqual(buildGflExperiment(f.snapshot,f.gains,d).experimentFingerprint,current.experimentFingerprint);
 const policy={...gflNumericalPolicy(),response:{...gflNumericalPolicy().response,tailWindowSeconds:.5}};
 const changed=buildGflExperiment(f.snapshot,f.gains,definition(currentId),policy);
 assert.equal(changed.modelFingerprint,current.modelFingerprint);assert.notEqual(changed.experimentFingerprint,current.experimentFingerprint);
 assert.deepEqual(changed.policy,{...policy.response,windowSeconds:null});assert.equal(changed.policy.windowSeconds,null);
 const payload=JSON.parse(current.experimentFingerprint.split('gfl-analysis-contract/v1/experiment:')[1]);
 assert.equal(current.experimentFingerprint,gflFingerprint('experiment',payload));
 assert.deepEqual(payload.realization.A,current.model.A);assert.deepEqual(payload.realization.B,current.model.B);
 assert.deepEqual(payload.inputIds,current.model.inputs.map(d=>d.id));assert.deepEqual(payload.outputIds,current.model.outputs.map(d=>d.id));
 assert.equal(payload.windowSeconds,null);assert.deepEqual(payload.feedback,current.feedback);assert.deepEqual(payload.steps,current.steps);
});

test('explicit experiment windows travel with the response policy for reproducibility',async()=>{
 const {buildGflExperiment}=await load(),f=mainlineFixture(),r=buildGflExperiment(f.snapshot,f.gains,definition(currentId,-.02,3));
 assert.equal(r.policy.windowSeconds,3);assert.deepEqual(r.steps.map(s=>s.amplitudePu),[-.02,-.02]);
});

test('port selection rejects absent, ambiguous and inapplicable IDs instead of relying on positions',async()=>{
 const {findPortIndex,buildGflExperiment}=await load(),f=mainlineFixture(),r=buildGflExperiment(f.snapshot,f.gains,definition(currentId));
 const reordered=[...r.model.outputs].reverse();assert.equal(findPortIndex(reordered,'current.bridge.d'),3);
 assert.throws(()=>findPortIndex(r.model.inputs,'disturbance.dc.power'),typed('invalidInput'));
 assert.throws(()=>findPortIndex(r.model.inputs,'missing'),typed('invalidInput'));
 assert.throws(()=>findPortIndex([...r.model.outputs,r.model.outputs[2]],'current.bridge.d'),typed('invalidInput'));
 const dc=mainlineFixture({settings:{dcModel:'capacitor'}}),dynamic=buildGflExperiment(dc.snapshot,dc.gains,definition(currentId));
 assert.equal(findPortIndex(dynamic.model.inputs,'disturbance.dc.power'),4);
});

test('invalid experiments, amplitudes, windows and policy identities fail explicitly',async()=>{
 const {buildGflExperiment}=await load(),f=mainlineFixture();
 for(const amplitude of [0,-0,NaN,Infinity,-Infinity,null,undefined,'0.01'])
  assert.throws(()=>buildGflExperiment(f.snapshot,f.gains,{id:currentId,amplitudePu:amplitude,windowSeconds:null}),typed('invalidInput'));
 for(const windowSeconds of [0,-1,NaN,Infinity,'1',undefined])
  assert.throws(()=>buildGflExperiment(f.snapshot,f.gains,{id:currentId,amplitudePu:.01,windowSeconds}),typed('invalidInput'));
 assert.throws(()=>buildGflExperiment(f.snapshot,f.gains,definition('unknown')),typed('unsupported'));
 assert.throws(()=>buildGflReferenceModel(f.snapshot,f.gains,{experimentId:'unknown'}),typed('unsupported'));
 assert.throws(()=>raw(f,'unknown'),typed('unsupported'));
 assert.throws(()=>buildGflExperiment(f.snapshot,f.gains,definition(currentId),{response:{id:'future-policy'}}),typed('unsupported'));
});

test('experiment construction is detached, data-only and ignores display decorations',async()=>{
 const {buildGflExperiment}=await load(),f=mainlineFixture(),d=definition(currentId),policy=gflNumericalPolicy(),before=JSON.stringify({f,d,policy}),r=buildGflExperiment(f.snapshot,f.gains,d,policy);
 assert.deepEqual(structuredClone(r),r);assert.equal(JSON.stringify({f,d,policy}),before);
 const decorated=buildGflExperiment({...f.snapshot,display:{color:'red'}},{...f.gains,display:{formatter:()=>0}},{...d,color:'red',zoom:3},policy);
 assert.deepEqual(decorated,r);assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.steps));assert.ok(Object.isFrozen(r.feedback));
});

test('frozen fixed-angle zero gains preserve legitimate zero modes and existing guards',async()=>{
 const {buildGflExperiment}=await load(),f=mainlineFixture({input:{R:0,filterCurrentMs:0,filterVoltageMs:0,filterPqMs:0},gains:Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:0,ki:0}])),settings:{syncMode:'fixed-angle'}}),m=raw(f),r=buildGflExperiment(f.snapshot,f.gains,definition(currentId));
 assert.deepEqual(m.names,['il0','il1','ig0','ig1','vc0','vc1']);assert.deepEqual(m.A[1],[0,0,0,0,0,0]);assert.deepEqual(m.B[1],[0,0,0,0,0]);
 assert.deepEqual(r.model.A,m.A);assert.ok(r.model.quality.residual<=1e-7);
 assert.throws(()=>raw(mainlineFixture({gains:{d:{ki:Number.MIN_VALUE}}})),typed('numericalFailure'));
 assert.throws(()=>raw(mainlineFixture({input:{dcVoltage:1e200},settings:{dcModel:'capacitor'}})),typed('numericalFailure'));
});

// Self-review: unused outer gains cannot force an extra closed-loop solve.
for(const outer of [{kp:Number.MAX_VALUE,ki:1},{kp:1,ki:Number.MIN_VALUE}])test(`frozen model identity does not linearize unused outer gains ${outer.kp}/${outer.ki}`,async()=>{
 const {buildGflExperiment}=await load(),f=mainlineFixture({gains:{P:outer,Q:outer}}),m=raw(f);
 const r=buildGflExperiment(f.snapshot,f.gains,definition(currentId));
 assert.deepEqual(r.model.A,m.A);assert.deepEqual(r.model.B,m.B);
 assert.deepEqual(r.model.configurationSnapshot.gains,f.gains);assert.ok(r.modelFingerprint.includes('"gains"'));
});

for(const syncMode of ['srf-pll','fixed-angle'])for(const delaySamples of [0,1])for(const Pki of [0,1])for(const Qki of [0,1])
 test(`physical identity matches across connections with ${syncMode}, delay ${delaySamples}, outer Ki ${Pki}/${Qki}`,async()=>{
  const {buildGflExperiment}=await load(),f=mainlineFixture({input:{delaySamples},gains:{d:{ki:0},q:{ki:0},P:{ki:Pki},Q:{ki:Qki}},settings:{syncMode}});
  const closed=buildGflExperiment(f.snapshot,f.gains,definition(closedId)),current=buildGflExperiment(f.snapshot,f.gains,definition(currentId));
  assert.equal(current.modelFingerprint,closed.modelFingerprint);assert.notEqual(current.experimentFingerprint,closed.experimentFingerprint);
 });

test('experiment accepts the response-only policy contract and detaches its data',async()=>{
 const {buildGflExperiment}=await load(),f=mainlineFixture(),policy={id:'gfl-dq-response-v1',tail:{seconds:.5}};
 const r=buildGflExperiment(f.snapshot,f.gains,definition(currentId),policy);assert.deepEqual(r.policy,{...policy,windowSeconds:null});
 policy.tail.seconds=5;assert.equal(r.policy.tail.seconds,.5);
});

test('unsupported model numerical policies are not silently ignored',async()=>{
 const {buildGflExperiment}=await load(),f=mainlineFixture(),policy=structuredClone(gflNumericalPolicy());policy.model.jacobian.coarseStep=3e-6;
 assert.throws(()=>buildGflExperiment(f.snapshot,f.gains,definition(currentId),policy),typed('unsupported'));
});

test('response policy rejects nonfinite or non-JSON data before fingerprinting',async()=>{
 const {buildGflExperiment}=await load(),f=mainlineFixture(),cycle={};cycle.self=cycle;
 for(const value of [NaN,Infinity,undefined,()=>0,new Date(0),new Map([['step',.1]]),cycle])
  assert.throws(()=>buildGflExperiment(f.snapshot,f.gains,definition(currentId),{id:'gfl-dq-response-v1',step:value}),typed('invalidInput'));
});

test('frozen Vdc DC drift retains its physical zero pole as a full-state diagnostic',async()=>{
 const {buildGflExperiment}=await load(),{classifyDqPoles}=await import('../analysis/gfl-dq-analysis.js'),f=mainlineFixture({input:{dMode:'Vdc'}}),r=buildGflExperiment(f.snapshot,f.gains,definition(currentId));
 const dc=r.model.states.findIndex(s=>s.id==='dc.voltage'),stability=classifyDqPoles(r.model.A);
 assert.ok(dc>=0);
 // The retained Vdc sensor still follows physical DC voltage; it feeds no
 // frozen outer controller and must not be mistaken for removed DC physics.
 const measured=r.model.states.findIndex(s=>s.id==='measurement.dc.voltage');
 assert.ok(measured>=0);assert.ok(r.model.A[measured][dc]>0);
 assert.ok(r.model.A.every((row,i)=>i===measured||row[dc]===0));
 assert.equal(stability.poles.length,r.model.states.length);assert.ok(stability.poles.some(p=>Math.hypot(p.re,p.im)<1e-6));
 assert.equal(r.feedback.stabilityScope,'experiment-diagnostic');
});
