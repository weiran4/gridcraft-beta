import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readGflModelInput} from '../analysis/gfl-model-input.js';
const project=JSON.parse(readFileSync(new URL('./fixtures/PV_Grid_Demo.json',import.meta.url))),stored=project.extensions.gflPi.PV1;
const input=readGflModelInput(project,'PV1',stored).modelInput,gains=stored.gains;
test('dq evaluation exposes all four MIMO channels and distinguishes scalar from full-model stability',async()=>{
 const {analyzeGflDq}=await import('../analysis/gfl-dq-analysis.js');
 const r=analyzeGflDq(input,gains,{enabled:true},{count:25});assert.equal(r.status,'ok');assert.equal(Object.keys(r.sweep.series).length,4);
 assert.ok(r.poles.length>10);assert.ok(r.sweep.series.q.some(p=>p.db>-100));assert.ok(Number.isFinite(r.alpha));assert.equal(r.poleStatus,r.alpha>0?'unstable':'stable');
 assert.equal(r.model.version,'gfl-dq-srf-pll-v1');assert.ok(!('phaseMargin' in r));
});
test('opt-in dq gate blocks unassessed/unstable/Pade candidates and leaves legacy behavior opt-out',async()=>{
 const {assertDqApplication}=await import('../analysis/gfl-dq-analysis.js');
 assert.equal(assertDqApplication(input,gains,{enabled:false}).status,'notEnabled');
 assert.throws(()=>assertDqApplication(input,gains,{enabled:true}),/dq|稳定/);
 assert.throws(()=>assertDqApplication({...input,delaySamples:1},gains,{enabled:true}),/Padé|延时|近似/);
});
test('dq settings keep existing gain banks and unrelated data byte-for-byte and isolate per inverter',async()=>{
 const {readDqSettings,saveDqSettings}=await import('../project/gfl-dq-settings.js');const before=JSON.stringify(project);
 assert.equal(readDqSettings(project,'PV1').enabled,false);const next=saveDqSettings(project,'PV1',{enabled:true,frequencyHz:35});
 assert.equal(readDqSettings(next,'PV1').frequencyHz,35);assert.deepEqual(next.components,project.components);assert.deepEqual(next.extensions.gflPi.PV1.gains,gains);assert.equal(JSON.stringify(project),before);
 assert.throws(()=>saveDqSettings(project,'PV1',{frequencyHz:NaN}));assert.throws(()=>saveDqSettings(project,'PV1',{enabled:'true'}));
});
test('stable coupled case can pass a dq gate and reports its model scope rather than a universal PM',async()=>{
 const {assertDqApplication}=await import('../analysis/gfl-dq-analysis.js');
 const p={...input,dMode:'P',qMode:'Q',activePowerW:2e5,gridXOhm:input.gridXOhm*.1,filterCurrentMs:.1,filterVoltageMs:.1};
 const r=assertDqApplication(p,gains,{enabled:true});assert.equal(r.status,'stable');assert.ok(r.alpha<0);
});
test('MIMO labels are supplied verbatim rather than hardcoded as current d/q loops',async()=>{
 const {bodeLoopGrid}=await import('../ui/bode-plot.js');const html=bodeLoopGrid(null,{}, {titles:{d:'Vdc ← Vdc*',q:'Vdc ← Q*',P:'Q ← Vdc*',Q:'Q ← Q*'}});
 assert.match(html,/Vdc ← Vdc\*/);assert.ok(!html.includes('d 轴电流环'));
});
