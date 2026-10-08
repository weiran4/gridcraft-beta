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
