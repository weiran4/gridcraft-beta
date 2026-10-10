import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readGflModelInput} from '../analysis/gfl-model-input.js';
const project=JSON.parse(readFileSync(new URL('./fixtures/PV_Grid_Demo.json',import.meta.url)));
const stored=project.extensions.gflPi.PV1;
const input=readGflModelInput(project,'PV1',stored).modelInput,gains=stored.gains;
const load=()=>import('../analysis/gfl-dq-model.js');

test('normalized SRF PLL parameters use rad/s and independent characteristic frequency',async()=>{
 const {pllParameters,srfPll}=await load();const p=pllParameters({frequencyHz:20,damping:Math.SQRT1_2});
 assert.equal(p.kp,2*Math.SQRT1_2*2*Math.PI*20);assert.equal(p.ki,(2*Math.PI*20)**2);
 assert.deepEqual(srfPll(.1,2,p),{delta:p.kp*.1+2,integral:p.ki*.1});
 assert.throws(()=>pllParameters({frequencyHz:0,damping:.7}));
});
test('coupled GFL operating point satisfies network KVL, shunt KCL and bridge/DC power balance',async()=>{
 const {gflDqModel}=await load();const before=JSON.stringify({input,gains});
 const m=gflDqModel(input,gains,{pllEnabled:true,frequencyHz:20,damping:.707,dcModel:'auto'});
 assert.ok(m.residual<1e-7,m.residual);assert.ok(m.jacobianError<1e-5,m.jacobianError);
 assert.ok(m.names.includes('pllAngle'));assert.ok(m.names.includes('dcVoltage'));assert.equal(m.inputNames.length,m.B[0].length);
 assert.ok(Math.abs(Math.hypot(...m.op.eg)-1)<1e-10);assert.ok(Math.abs(m.op.bridgePower-m.op.P-m.op.losses)<1e-10);
 assert.equal(JSON.stringify({input,gains}),before);
});
test('all four GFL outer mode combinations are equilibria; current bases and output labels are explicit',async()=>{
 const {gflDqModel}=await load();for(const dMode of ['P','Vdc'])for(const qMode of ['Q','Vac']){
 const m=gflDqModel({...input,dMode,qMode},gains,{pllEnabled:true});assert.ok(m.residual<1e-7);assert.deepEqual(m.outputNames.slice(0,2),[dMode,qMode]);
 assert.equal(m.names.includes('dcVoltage'),dMode==='Vdc');
 }
});
test('PLL, operating P/Q and grid strength change the linear model rather than labels only',async()=>{
 const {gflDqModel}=await load();const a=gflDqModel(input,gains,{pllEnabled:true,frequencyHz:20});
 const b=gflDqModel(input,gains,{pllEnabled:false});assert.equal(a.names.length-b.names.length,2);
 const c=gflDqModel({...input,activePowerW:input.activePowerW*.5,reactivePowerVar:100000},gains,{frequencyHz:40});
 assert.notDeepEqual(a.A,c.A);assert.notDeepEqual(a.op.il,c.op.il);
 const changed=gflDqModel({...input,gridXOhm:input.gridXOhm*.8},gains,{frequencyHz:20});assert.notDeepEqual(a.A,changed.A);
});
test('zero filters and Ki=0 remove corresponding states without fictitious instability',async()=>{
 const {gflDqModel}=await load(),g=structuredClone(gains);g.d.ki=0;g.P.ki=0;
 const m=gflDqModel({...input,filterCurrentMs:0,filterVoltageMs:0,filterPqMs:0,filterVdcMs:0},g,{pllFilterMs:0});
 assert.ok(!m.names.includes('hi0'));assert.ok(!m.names.includes('xi0'));assert.ok(!m.names.includes('outer0'));assert.ok(m.residual<1e-7);
});
test('unsupported topology, disabled SCR and rigid-DC Vdc mode cannot masquerade as covered',async()=>{
 const {gflDqModel}=await load();
 assert.throws(()=>gflDqModel({...input,considerScr:false},gains,{}),/SCR/);
 assert.throws(()=>gflDqModel({...input,gridCapacitanceF:0},gains,{}),/电容|LCL/);
 assert.throws(()=>gflDqModel(input,gains,{dcModel:'rigid'}),/Vdc/);
 assert.throws(()=>gflDqModel({...input,gridXOhm:0},gains,{}),/电网电感/);
 assert.throws(()=>gflDqModel(input,gains,{frequencyHz:NaN}),/PLL/);
});
test('nonzero delay uses explicitly labelled first-order Pade states, Ts alone is not inferred delay',async()=>{
 const {gflDqModel}=await load();const a=gflDqModel(input,gains,{}),b=gflDqModel({...input,fs:input.fs/2},gains,{});
 assert.deepEqual(a.A,b.A);const d=gflDqModel({...input,delaySamples:1},gains,{});assert.equal(d.delayModel,'first-order-pade');assert.equal(d.names.length-a.names.length,2);
});

// Finite primitives alone cannot certify derived physical coefficients.
for(const [label,patch]of [
 ['explicit delay overflow',{fs:1e-305,delaySamples:1e10}],
 ['control period overflow',{fs:Number.MIN_VALUE}],
 ['positive delay underflow',{fs:1e308,delaySamples:Number.MIN_VALUE}],
 ['modulation overflow',{dcVoltage:1e-310}],
 ['dynamic DC energy denominator overflow',{dcVoltage:1e200}],
 ['capacitor reactance intermediate overflow',{gridCapacitanceF:Number.MAX_VALUE}],
 ['operating-point discriminant overflow',{gridVoltagePu:Number.MAX_VALUE}]
])test(`dq source rejects ${label} before returning a model`,async()=>{
 const {gflDqModel}=await load(),{GflAnalysisError}=await import('../analysis/gfl-analysis-contract.js'),{mainlineFixture}=await import('./fixtures/gfl-mainline.js');
 const f=mainlineFixture();
 assert.throws(()=>gflDqModel({...f.input,...patch},f.gains,{pllEnabled:false,dcModel:label.startsWith('dynamic DC')?'capacitor':'rigid'}),error=>error instanceof GflAnalysisError&&error.code==='numericalFailure');
});

test('derived PLL coefficients remain finite even in fixed-angle metadata',async()=>{
 const {pllParameters,gflDqModel}=await load(),{GflAnalysisError}=await import('../analysis/gfl-analysis-contract.js'),{mainlineFixture}=await import('./fixtures/gfl-mainline.js'),f=mainlineFixture();
 const raw={pllEnabled:false,damping:Number.MAX_VALUE},typed=error=>error instanceof GflAnalysisError&&error.code==='numericalFailure';
 assert.throws(()=>pllParameters(raw),typed);assert.throws(()=>gflDqModel(f.input,f.gains,raw),typed);
});

for(const [label,config]of [
 ['positive current Ki',{gains:{d:{ki:Number.MIN_VALUE}}}],
 ['positive PLL integral coefficient',{settings:{sync:{fnHz:1e-162}}}]
])test(`${label} cannot silently become an all-zero derivative row`,async()=>{
 const {gflDqModel}=await load(),{GflAnalysisError}=await import('../analysis/gfl-analysis-contract.js'),{mainlineFixture}=await import('./fixtures/gfl-mainline.js'),f=mainlineFixture(config);
 assert.throws(()=>gflDqModel(f.input,f.gains,{frequencyHz:f.settings.sync.fnHz}),error=>error instanceof GflAnalysisError&&error.code==='numericalFailure');
});

test('positive PLL frequency cannot underflow its derived integral gain to zero',async()=>{
 const {pllParameters}=await load(),{GflAnalysisError}=await import('../analysis/gfl-analysis-contract.js');
 assert.throws(()=>pllParameters({frequencyHz:Number.MIN_VALUE,pllEnabled:false}),error=>error instanceof GflAnalysisError&&error.code==='numericalFailure');
});

test('lossless fixed-angle filter-bypassed zero-gain model preserves physical zero rows and marginal poles',async()=>{
 const {gflDqModel}=await load(),{classifyDqPoles}=await import('../analysis/gfl-dq-analysis.js'),{mainlineFixture}=await import('./fixtures/gfl-mainline.js');
 const f=mainlineFixture({input:{R:0,filterCurrentMs:0,filterVoltageMs:0,filterPqMs:0},
  gains:Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:0,ki:0}])),settings:{syncMode:'fixed-angle'}});
 const m=gflDqModel(f.input,f.gains,{pllEnabled:false}),i=m.names.indexOf('il1');
 assert.deepEqual(m.names,['il0','il1','ig0','ig1','vc0','vc1']);
 assert.deepEqual(m.A[i],[0,0,0,0,0,0]);assert.deepEqual(m.B[i],[0,0,0,0,0]);
 assert.ok(m.residual<1e-7);assert.ok(m.jacobianError<1e-5);
 const stability=classifyDqPoles(m.A);assert.equal(stability.status,'marginal');assert.equal(stability.alpha,0);assert.equal(stability.poles.length,6);
 // Complex QR may leave a tiny imaginary residue on a physical zero root.
 assert.ok(stability.poles.some(p=>Math.hypot(p.re,p.im)<1e-6));
});

const dcRangeInput={ratedVA:1e-15,voltageLL:Math.sqrt(1e-15),activePowerW:0,reactivePowerVar:0,
 dcVoltage:1e154,dcCapacitanceF:1,R:.001,L:.0001,gridROhm:.001,gridXOhm:.1,gridCapacitanceF:.001,gridCapResistanceOhm:.001};
for(const dMode of ['P','Vdc'])test(`${dMode} capacitor DC rejects power-derivative quotient underflow`,async()=>{
 const {gflDqModel}=await load(),{GflAnalysisError}=await import('../analysis/gfl-analysis-contract.js'),{mainlineFixture}=await import('./fixtures/gfl-mainline.js');
 const f=mainlineFixture({input:{...dcRangeInput,dMode},settings:{syncMode:'fixed-angle',dcModel:'capacitor'}}),coefficient=f.input.ratedVA/(f.input.dcCapacitanceF*f.input.dcVoltage**2);
 assert.ok(Number.isFinite(coefficient)&&coefficient>0);assert.equal(coefficient,1e-323);
 assert.throws(()=>gflDqModel(f.input,f.gains,{pllEnabled:false,dcModel:'capacitor'}),error=>error instanceof GflAnalysisError&&error.code==='numericalFailure');
});
