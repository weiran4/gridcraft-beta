import test from 'node:test';import assert from 'node:assert/strict';
import {eigenvalues} from '../analysis/eigenvalues.js';import {gfmOperatingPoint,gfmDynamicModel,analyzeGfmMode,tuneGfmCoupled} from '../analysis/gfm-dynamics.js';
import {demo} from '../examples/demo.js';import {gfmContext,gfmSettings} from '../project/gfm-settings.js';import {autoTuneGfm} from '../analysis/gfm-pi.js';
const d=demo('gfm480'),s={...gfmSettings(d,'GFM1'),considerScr:true},p={...gfmContext(d,'GFM1'),...s},g=autoTuneGfm(p).gains;
test('complex QR finds known real and complex eigenvalues across scales',()=>{const e=eigenvalues([[-2,-3,0],[3,-2,0],[0,0,-100000]]);assert.ok(e.some(z=>Math.abs(z.re+2)<1e-8&&Math.abs(z.im-3)<1e-8));assert.ok(e.some(z=>z.re===-100000));assert.ok(eigenvalues([[1,4],[0,-2]]).some(z=>z.re===1));});
test('all GFM modes have true stationary operating points and distinct dynamics',()=>{const a=Object.fromEntries(['droop','vsg','sync'].map(mode=>[mode,gfmDynamicModel(p,g,mode,s.modes[mode])]));for(const m of Object.values(a)){assert.ok(m.residual<1e-7);assert.ok(Math.abs(Math.hypot(...m.op.eg)-p.gridVoltagePu)<1e-10);}assert.equal(a.droop.names.includes('omega'),false);assert.equal(a.vsg.names.includes('emf'),true);assert.notDeepEqual(a.vsg.A,a.sync.A);assert.ok(a.droop.A.some((row,i)=>row.some((v,j)=>i!==j&&v!==0)));});
test('forming parameters, PQ sensors, grid and operating PQ change poles',()=>{const alpha=(input,mode,m)=>analyzeGfmMode(input,g,mode,m).alpha;
for(const [mode,key] of [['droop','mp'],['droop','nq'],['vsg','h'],['vsg','d'],['vsg','kv'],['sync','ke']])assert.ok(Math.abs(alpha(p,mode,{...s.modes[mode],[key]:s.modes[mode][key]*2})-alpha(p,mode,s.modes[mode]))>1e-6,mode+key);
for(const change of [{filterPqMs:20},{gridL:p.gridL*.8},{activePowerW:.8e6},{reactivePowerVar:.1e6},{filterCurrentMs:0},{filterVoltageMs:0}])assert.notEqual(alpha({...p,...change},'droop',s.modes.droop),alpha(p,'droop',s.modes.droop));
assert.throws(()=>gfmOperatingPoint({...p,activePowerW:10e6}),/潮流/);});
test('delay is labeled Pade and bypass filters remove states without NaNs',()=>{const a=gfmDynamicModel({...p,filterPqMs:0,filterCurrentMs:0,filterVoltageMs:0,delaySamples:1.5},g,'sync',s.modes.sync);assert.equal(a.delayModel,'first-order-pade');assert.ok(a.A.flat().every(Number.isFinite));assert.ok(a.residual<1e-7);});
test('each forming mode receives PI that passes coupled pole check',async()=>{for(const mode of ['droop','vsg','sync']){const a=await tuneGfmCoupled(p,g,mode,s.modes[mode]);assert.ok(a.dynamics.alpha<0);assert.ok(a.loops.P.frequency<=a.loops.d.frequency/5*1.001);}});

test('network edits propagate to GFM electrical context and mode gain banks survive project roundtrip',async()=>{
 const {setGfmField}=await import('../project/gfm-settings.js');const {serializeProject,parseProject}=await import('../project/model.js');
 const project=demo('gfm480'),base=gfmContext(project,'GFM1');
 for(const [key,value]of [['C',700e-6],['Rc',.15],['L',160e-6],['R',.001],['dcVoltage',820],['activePowerW',.8e6],['reactivePowerVar',.1e6],['ratedVA',1.1e6]]){setGfmField(project,'GFM1',key,value);assert.equal(gfmContext(project,'GFM1')[key],value);}
 const before=JSON.stringify(project);assert.throws(()=>setGfmField(project,'GFM1','C',-1));assert.equal(JSON.stringify(project),before);
 const t=project.components.find(c=>c.type==='transformer');t.parametersSI.ratedApparentPowerVA*=2;
 assert.notEqual(gfmContext(project,'GFM1').gridL,base.gridL);
 const settings=gfmSettings(project,'GFM1');settings.gainBank={droop:{gains:g,manual:true},vsg:{gains:{...g,d:{kp:.5,ki:2}},manual:true}};settings.mode='vsg';project.extensions.gfmPi={GFM1:settings};
 const read=gfmSettings(parseProject(serializeProject(project)),'GFM1');assert.deepEqual(read.gainBank,settings.gainBank);assert.equal(read.mode,'vsg');assert.notDeepEqual(read.gainBank.droop.gains,read.gainBank.vsg.gains);
});
test('all diagrams include editable PI, filters and mode-specific equations',async()=>{const {gfmDiagram}=await import('../ui/gfm-diagram.js');for(const mode of ['droop','vsg','sync']){const svg=gfmDiagram(g,{...s,mode});assert.equal((svg.match(/data-gain=/g)||[]).length,16);assert.equal((svg.match(/data-setting=/g)||[]).length,8);assert.ok(svg.includes('电网 dq'));assert.ok(svg.includes(mode==='droop'?'P–f 下垂':mode==='vsg'?'Kv / s':'Ke / s'));assert.ok(!svg.includes('NaN'));}});
