import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mainlineFixture} from './fixtures/gfl-mainline.js';
import {readGflAnalysisSettings,saveGflAnalysisSettings,resolveGflSnapshot} from '../project/gfl-analysis-settings.js';
import {gflCanonicalSnapshot,gflFingerprint,gflNumericalPolicy,GflAnalysisError} from '../analysis/gfl-analysis-contract.js';
import {readDqSettings,saveDqSettings} from '../project/gfl-dq-settings.js';
import {tuningSnapshot} from '../project/gfl-tuning-state.js';
import {validateProject} from '../project/model.js';

const original=()=>JSON.parse(readFileSync(new URL('./fixtures/PV_Grid_Demo.json',import.meta.url)));
const unsupported={code:'unsupported'};
const invalid={code:'invalidInput'};

// Each assertion protects a production behavior: explicit model selection,
// lossless unknown-record reads, independent settings ownership, canonical
// identity, immutable physical facts, or the existing numerical thresholds.
test('legacy dq is not mainline, even with an enabled custom PLL side check',()=>{
 const project=original();
 project.extensions.gflPi.PV1.dqAnalysis={enabled:true,frequencyHz:35};
 const before=JSON.stringify(project),settings=readGflAnalysisSettings(project,'PV1');
 assert.equal(settings.modelId,'legacy-scalar');
 assert.equal(settings.schemaVersion,1);
 assert.equal(settings.modelVersion,1);
 assert.equal(JSON.stringify(project),before);
 assert.ok(!Object.hasOwn(project.extensions.gflPi.PV1,'analysis'));
 assert.equal(readDqSettings(project,'PV1').frequencyHz,35);
});

test('new defaults identify engineering assumptions without changing stored PI',()=>{
 const project=original(),before=JSON.stringify(project),settings=readGflAnalysisSettings(project,'PV1');
 assert.deepEqual(settings.sync,{fnHz:20,damping:Math.SQRT1_2,filterMs:0,decouplingFrequency:'pll'});
 assert.equal(settings.syncMode,'srf-pll');
 assert.equal(settings.dcModel,'auto');
 for(const key of ['syncMode','sync.fnHz','sync.damping','sync.filterMs','sync.decouplingFrequency','dcModel'])assert.equal(settings.sources[key],'engineering-default');
 assert.equal(JSON.stringify(project),before);
});

test('an analysis record without modelId still reads as legacy scalar',()=>{
 const project=original();
 project.extensions.gflPi.PV1.analysis={schemaVersion:1,modelVersion:1,sync:{fnHz:29}};
 assert.equal(readGflAnalysisSettings(project,'PV1').modelId,'legacy-scalar');
});

test('explicit model opt-in initializes saved legacy PLL fields once',()=>{
 const project=original();
 project.extensions.gflPi.PV1.dqAnalysis={enabled:true,pllEnabled:false,frequencyHz:35,damping:.8,pllFilterMs:2,dcModel:'capacitor',decouplingFrequency:'nominal'};
 const next=saveGflAnalysisSettings(project,'PV1',{modelId:'gfl-dq-reference-v1'}),settings=readGflAnalysisSettings(next,'PV1');
 assert.equal(settings.syncMode,'fixed-angle');
 assert.deepEqual(settings.sync,{fnHz:35,damping:.8,filterMs:2,decouplingFrequency:'nominal'});
 assert.equal(settings.dcModel,'capacitor');
 assert.equal(settings.sources['sync.fnHz'],'legacy-dq-setting');
 assert.deepEqual(next.extensions.gflPi.PV1.dqAnalysis,project.extensions.gflPi.PV1.dqAnalysis);
});

test('canonical settings take precedence without bidirectional overwriting',()=>{
 const {project}=mainlineFixture();
 const selected=saveGflAnalysisSettings(project,'PV1',{modelId:'gfl-dq-reference-v1',sync:{fnHz:27}});
 const oldChanged=saveDqSettings(selected,'PV1',{frequencyHz:70,pllEnabled:false});
 assert.equal(readGflAnalysisSettings(oldChanged,'PV1').sync.fnHz,27);
 assert.equal(readGflAnalysisSettings(oldChanged,'PV1').syncMode,'srf-pll');
 const next=saveGflAnalysisSettings(oldChanged,'PV1',{sync:{filterMs:1}});
 assert.equal(readDqSettings(next,'PV1').frequencyHz,70);
 assert.equal(readDqSettings(next,'PV1').pllEnabled,false);
 assert.equal(readGflAnalysisSettings(next,'PV1').sync.fnHz,27);
});

test('unknown versions remain unsupported and readable byte-for-byte',()=>{
 const {input,sourceMap}=mainlineFixture();
 for(const change of [{schemaVersion:999},{modelVersion:999},{modelId:'future-model'}]){
  const project=original(),record={schemaVersion:1,modelId:'gfl-dq-reference-v1',modelVersion:1,...change,sync:{fnHz:31,filterMs:null},future:{b:2,a:1}};
  project.extensions.gflPi.PV1.analysis=record;
  const before=JSON.stringify(project),read=readGflAnalysisSettings(project,'PV1');
  assert.equal(JSON.stringify(read),JSON.stringify(record));
  assert.equal(JSON.stringify(project),before);
  assert.throws(()=>resolveGflSnapshot(input,read,sourceMap),unsupported);
  assert.throws(()=>saveGflAnalysisSettings(project,'PV1',{sync:{fnHz:25}}),unsupported);
  assert.equal(JSON.stringify(project),before);
 }
});

test('explicit model records with missing version identity remain unsupported and lossless',()=>{
 const {input,sourceMap}=mainlineFixture();
 for(const record of [{modelId:'gfl-dq-reference-v1'},{schemaVersion:1,modelId:'gfl-dq-reference-v1'},{modelId:'gfl-dq-reference-v1',modelVersion:1}]){
  const project=original();project.extensions.gflPi.PV1.analysis=record;
  const read=readGflAnalysisSettings(project,'PV1');
  assert.equal(JSON.stringify(read),JSON.stringify(record));
  assert.throws(()=>resolveGflSnapshot(input,read,sourceMap),unsupported);
  assert.throws(()=>saveGflAnalysisSettings(project,'PV1',{sync:{fnHz:25}}),unsupported);
 }
});

test('unknown settings can only be replaced by an explicit supported model choice',()=>{
 const project=original();
 project.extensions.gflPi.PV1.analysis={schemaVersion:999,modelId:'future-model',modelVersion:999,sync:{fnHz:999},future:'keep until explicit replacement'};
 const before=JSON.stringify(project),next=saveGflAnalysisSettings(project,'PV1',{modelId:'gfl-dq-reference-v1'});
 assert.equal(readGflAnalysisSettings(next,'PV1').schemaVersion,1);
 assert.equal(readGflAnalysisSettings(next,'PV1').modelVersion,1);
 assert.equal(readGflAnalysisSettings(next,'PV1').sync.fnHz,20);
 assert.equal(JSON.stringify(project),before);
});

test('PLL changes preserve gains, gain banks, electrical facts and unrelated extensions',()=>{
 const project=original();
 project.extensions.gflPi.PV1.dqAnalysis={enabled:true,frequencyHz:35};
 project.extensions.gflPi.PV1.advisor={historical:'untouched'};
 const before=JSON.stringify(project),next=saveGflAnalysisSettings(project,'PV1',{modelId:'gfl-dq-reference-v1',sync:{fnHz:32,damping:.9}});
 assert.deepEqual(next.components,project.components);
 for(const key of ['gains','gainBank','advisor','dqAnalysis'])assert.deepEqual(next.extensions.gflPi.PV1[key],project.extensions.gflPi.PV1[key]);
 assert.equal(readGflAnalysisSettings(next,'PV1').sources['sync.fnHz'],'user');
 assert.equal(readGflAnalysisSettings(next,'PV1').sources['sync.damping'],'user');
 assert.equal(JSON.stringify(project),before);
});

test('analysis settings remain isolated for distinct inverter IDs',()=>{
 const project=original(),second=structuredClone(project.components.find(c=>c.id==='PV1'));
 second.id='PV2';project.components.push(second);
 project.extensions.gflPi.PV2=structuredClone(project.extensions.gflPi.PV1);
 const next=saveGflAnalysisSettings(project,'PV1',{modelId:'gfl-dq-reference-v1',sync:{fnHz:33}});
 assert.deepEqual(next.extensions.gflPi.PV2,project.extensions.gflPi.PV2);
 assert.equal(readGflAnalysisSettings(next,'PV2').modelId,'legacy-scalar');
 assert.throws(()=>saveGflAnalysisSettings(project,'not-a-gfl',{modelId:'gfl-dq-reference-v1'}),invalid);
});

test('valid __proto__ inverter saves own settings without prototype pollution or implicit opt-in',()=>{
 const project=original(),selected=project.components.find(c=>c.id==='PV1'),other=structuredClone(selected);
 selected.id='__proto__';other.id='OTHER';project.components.push(other);
 for(const component of project.components)if(component.parametersSI.primaryIbrId==='PV1')component.parametersSI.primaryIbrId='__proto__';
 for(const wire of project.wires)for(const end of ['from','to'])if(wire[end].startsWith('PV1.'))wire[end]=wire[end].replace('PV1.','__proto__.');
 delete project.extensions.gflPi.PV1;project.extensions.gflPi.OTHER={};
 assert.deepEqual(validateProject(project),[]);
 const before=JSON.stringify(project),prototypeBefore=Object.getOwnPropertyDescriptor(Object.prototype,'analysis');
 try{
  const next=saveGflAnalysisSettings(project,'__proto__',{modelId:'gfl-dq-reference-v1'});
  assert.deepEqual(Object.getOwnPropertyDescriptor(Object.prototype,'analysis'),prototypeBefore);
  assert.ok(Object.hasOwn(next.extensions.gflPi,'__proto__'));
  assert.ok(Object.hasOwn(next.extensions.gflPi.__proto__,'analysis'));
  assert.equal(readGflAnalysisSettings(next,'__proto__').modelId,'gfl-dq-reference-v1');
  assert.equal(readGflAnalysisSettings(project,'__proto__').modelId,'legacy-scalar');
  assert.equal(readGflAnalysisSettings(next,'OTHER').modelId,'legacy-scalar');
  assert.deepEqual(next.extensions.gflPi.OTHER,project.extensions.gflPi.OTHER);
  assert.equal(JSON.stringify(project),before);
  assert.deepEqual(validateProject(next),[]);
 }finally{
  // A failing red must not leave global contamination for subsequent tests.
  if(prototypeBefore)Object.defineProperty(Object.prototype,'analysis',prototypeBefore);
  else delete Object.prototype.analysis;
 }
});

test('inverter records and analysis fields are read only from own-property storage',()=>{
 const {settings}=mainlineFixture(),project=original();
 project.extensions.gflPi=Object.create({PV1:{analysis:settings,dqAnalysis:{frequencyHz:39}}});
 let read=readGflAnalysisSettings(project,'PV1');
 assert.equal(read.modelId,'legacy-scalar');assert.equal(read.sync.fnHz,20);
 project.extensions.gflPi.PV1=Object.create({analysis:settings,dqAnalysis:{frequencyHz:39}});
 read=readGflAnalysisSettings(project,'PV1');
 assert.equal(read.modelId,'legacy-scalar');assert.equal(read.sync.fnHz,20);
 const next=saveGflAnalysisSettings(project,'PV1',{modelId:'gfl-dq-reference-v1'});
 assert.ok(Object.hasOwn(next.extensions.gflPi.PV1,'analysis'));
 assert.equal(readGflAnalysisSettings(next,'PV1').sync.fnHz,20);
});

test('invalid sync parameters and unsupported choices are rejected without writes',()=>{
 const {project,input,settings,sourceMap}=mainlineFixture(),before=JSON.stringify(project);
 for(const sync of [{fnHz:0},{fnHz:-1},{fnHz:NaN},{fnHz:Infinity},{damping:0},{damping:-1},{damping:null},{filterMs:-1},{filterMs:null},{filterMs:NaN},{decouplingFrequency:'unknown'}]){
  assert.throws(()=>saveGflAnalysisSettings(project,'PV1',{modelId:'gfl-dq-reference-v1',sync}),invalid);
  assert.throws(()=>resolveGflSnapshot(input,{...settings,sync:{...settings.sync,...sync}},sourceMap),invalid);
 }
 for(const patch of [{modelId:'unknown'},{schemaVersion:2},{modelVersion:999}])assert.throws(()=>saveGflAnalysisSettings(project,'PV1',patch),unsupported);
 for(const patch of [{syncMode:'unknown'},{dcModel:'unknown'},{extra:true},{sync:{extra:true}}])assert.throws(()=>saveGflAnalysisSettings(project,'PV1',patch),invalid);
 assert.throws(()=>resolveGflSnapshot(input,{...settings,modelVersion:999},sourceMap),unsupported);
 assert.equal(JSON.stringify(project),before);
});

test('invalid source records and out-of-contract settings fail at the typed boundary',()=>{
 const {project,input,settings,sourceMap}=mainlineFixture(),before=JSON.stringify(project);
 for(const sources of [null,[],{fs:3}]){
  assert.throws(()=>saveGflAnalysisSettings(project,'PV1',{modelId:'gfl-dq-reference-v1',sync:{fnHz:25},sources}),invalid);
  assert.throws(()=>resolveGflSnapshot(input,{...settings,sources},sourceMap),invalid);
 }
 assert.throws(()=>resolveGflSnapshot(input,settings,{...sourceMap,fs:3}),invalid);
 assert.throws(()=>resolveGflSnapshot(input,{...settings,gains:{d:{kp:1,ki:2}}},sourceMap),invalid);
 assert.throws(()=>resolveGflSnapshot(input,{...settings,sync:{...settings.sync,extra:true}},sourceMap),invalid);
 assert.equal(JSON.stringify(project),before);
});

test('zero filter bypass differs from unknown null filters',()=>{
 const {input,settings,sourceMap}=mainlineFixture();
 const bypass=resolveGflSnapshot({...input,filterCurrentMs:0,filterVoltageMs:0},{...settings,sync:{...settings.sync,filterMs:0}},sourceMap);
 assert.equal(bypass.input.filterCurrentMs,0);
 assert.equal(bypass.input.filterVoltageMs,0);
 assert.equal(bypass.analysis.sync.filterMs,0);
 for(const key of ['filterCurrentMs','filterVoltageMs','filterPqMs','filterVdcMs'])assert.throws(()=>resolveGflSnapshot({...input,[key]:null},settings,sourceMap),invalid);
 assert.throws(()=>resolveGflSnapshot(input,{...settings,sync:{...settings.sync,filterMs:null}},sourceMap),invalid);
});

test('periods and sources remain distinct',()=>{
 const {input,settings,sourceMap}=mainlineFixture();
 assert.equal(input.switchingFrequencyHz,2000);
 const snapshot=resolveGflSnapshot({...input,fs:20000,frequencyHz:50,switchingFrequencyHz:2500},settings,{...sourceMap,fs:'control-setting',frequencyHz:'project-frequency',switchingFrequencyHz:'component.extensions.filterDesign.fs'});
 assert.equal(snapshot.nominalFrequencyHz,50);
 assert.equal(snapshot.controlStepSeconds,1/20000);
 assert.equal(snapshot.pwmPeriodSeconds,1/2500);
 assert.equal(snapshot.analysis.sync.fnHz,20);
 assert.equal(snapshot.parameterSources.fs,'control-setting');
 assert.equal(snapshot.parameterSources.frequencyHz,'project-frequency');
 assert.equal(snapshot.parameterSources.switchingFrequencyHz,'component.extensions.filterDesign.fs');
 assert.equal(snapshot.parameterSources['sync.fnHz'],'engineering-default');
});

test('settings provenance cannot overwrite independent physical source provenance',()=>{
 const {project,input,sourceMap}=mainlineFixture();
 const next=saveGflAnalysisSettings(project,'PV1',{modelId:'gfl-dq-reference-v1',sync:{fnHz:25},dcModel:'rigid',
  sources:{switchingFrequencyHz:'control-setting',fs:'other-setting','sync.fnHz':'independent-pll-fact',dcModel:'independent-dc-fact'}});
 const settings=readGflAnalysisSettings(next,'PV1'),snapshot=resolveGflSnapshot(input,settings,sourceMap);
 assert.equal(snapshot.parameterSources.switchingFrequencyHz,'component.extensions.filterDesign.fs');
 assert.equal(snapshot.parameterSources.fs,sourceMap.fs);
 assert.equal(snapshot.parameterSources['sync.fnHz'],'independent-pll-fact');
 assert.equal(snapshot.parameterSources.dcModel,'independent-dc-fact');
 assert.equal(snapshot.input.switchingFrequencyHz,2000);assert.equal(snapshot.pwmPeriodSeconds,1/2000);
 const withoutPhysicalSource={...sourceMap};delete withoutPhysicalSource.switchingFrequencyHz;delete withoutPhysicalSource.fs;
 const unknown=resolveGflSnapshot(input,settings,withoutPhysicalSource);
 assert.ok(!Object.hasOwn(unknown.parameterSources,'switchingFrequencyHz'));
 assert.ok(!Object.hasOwn(unknown.parameterSources,'fs'));
});

test('unknown PWM never falls back to control sampling frequency',()=>{
 const {input,settings,sourceMap}=mainlineFixture();
 const absent={...input};delete absent.switchingFrequencyHz;
 for(const p of [absent,{...input,switchingFrequencyHz:null}]){
  const snapshot=resolveGflSnapshot(p,settings,sourceMap);
  assert.equal(snapshot.input.switchingFrequencyHz,null);
  assert.equal(snapshot.pwmPeriodSeconds,null);
  assert.equal(snapshot.controlStepSeconds,1/input.fs);
 }
 for(const switchingFrequencyHz of [0,-1,NaN,Infinity])assert.throws(()=>resolveGflSnapshot({...input,switchingFrequencyHz},settings,sourceMap),invalid);
 for(const fs of [0,null,NaN,Infinity])assert.throws(()=>resolveGflSnapshot({...input,fs},settings,sourceMap),invalid);
});

test('unrepresentable sampling periods are invalid instead of infinite snapshot values',()=>{
 const {input,settings,sourceMap}=mainlineFixture();
 assert.throws(()=>resolveGflSnapshot({...input,fs:Number.MIN_VALUE},{...settings,syncMode:'fixed-angle'},sourceMap),invalid);
 assert.throws(()=>resolveGflSnapshot({...input,switchingFrequencyHz:Number.MIN_VALUE},settings,sourceMap),invalid);
});

test('auto, rigid and capacitor DC choices are preserved without inference',()=>{
 const {input,settings,sourceMap}=mainlineFixture();
 for(const dcModel of ['auto','rigid','capacitor']){
  const snapshot=resolveGflSnapshot(input,{...settings,dcModel},sourceMap);
  assert.equal(snapshot.analysis.dcModel,dcModel);
  assert.equal(snapshot.input.dMode,'P');
 }
});

test('resolved snapshots are deeply immutable and detached from callers',()=>{
 const {input,settings,sourceMap}=mainlineFixture();
 const snapshot=resolveGflSnapshot(input,settings,sourceMap),before=gflCanonicalSnapshot(snapshot);
 input.fs=100;settings.sync.fnHz=12;sourceMap.fs='changed';
 assert.equal(gflCanonicalSnapshot(snapshot),before);
 for(const value of [snapshot,snapshot.input,snapshot.analysis,snapshot.analysis.sync,snapshot.analysis.sources,snapshot.parameterSources])assert.ok(Object.isFrozen(value));
 assert.throws(()=>{snapshot.analysis.sync.fnHz=7;},TypeError);
 assert.ok(Object.isFrozen(readGflAnalysisSettings(original(),'PV1').sync));
});

test('physical snapshot excludes PI, targets and presentation state',()=>{
 const {input,settings,sourceMap}=mainlineFixture();
 const clean=resolveGflSnapshot(input,settings,sourceMap);
 const enriched=resolveGflSnapshot({...input,gains:{d:{kp:1,ki:2}},fi:999,fp:99,request:{maxOvershootPercent:1},display:{units:'SI'},zoom:4},settings,sourceMap);
 assert.equal(gflCanonicalSnapshot(enriched),gflCanonicalSnapshot(clean));
 assert.equal(clean.equationVersion,'gfl-dq-srf-pll-v1');
 assert.equal(clean.modelId,'gfl-dq-reference-v1');
});

test('canonical keys ignore object insertion order while arrays retain order',()=>{
 const a={b:{z:3,a:1},a:[{b:2,a:1},0]},b={a:[{a:1,b:2},0],b:{a:1,z:3}};
 assert.equal(gflCanonicalSnapshot(a),gflCanonicalSnapshot(b));
 assert.equal(tuningSnapshot(a),gflCanonicalSnapshot(a));
 assert.equal(gflFingerprint('model',{a:1,b:2}),gflFingerprint('model',{b:2,a:1}));
 assert.notEqual(gflFingerprint('model',{a:[1,2]}),gflFingerprint('model',{a:[2,1]}));
 assert.notEqual(gflFingerprint('model',{a:1}),gflFingerprint('experiment',{a:1}));
 assert.notEqual(gflFingerprint('model',{a:1}),gflFingerprint('model',{a:1+Number.EPSILON}));
 assert.match(gflFingerprint('model',{a:1}),/v1.*model/);
});

test('canonical serialization preserves existing unsupported JSON-value behavior',()=>{
 for(const value of [undefined,null,NaN,Infinity,{a:undefined,b:NaN,c:[undefined,Infinity]},[3,undefined]]){
  const stable=v=>v&&typeof v==='object'?(Array.isArray(v)?v.map(stable):Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]))):v;
  assert.equal(gflCanonicalSnapshot(value),JSON.stringify(stable(value)));
  assert.equal(tuningSnapshot(value),JSON.stringify(stable(value)));
 }
 assert.throws(()=>gflCanonicalSnapshot({value:1n}),TypeError);
});

test('fingerprints retain changed physical settings and parameter provenance',()=>{
 const {input,settings,sourceMap}=mainlineFixture(),snapshot=resolveGflSnapshot(input,settings,sourceMap),identity=gflFingerprint('model',snapshot);
 assert.notEqual(identity,gflFingerprint('model',resolveGflSnapshot(input,{...settings,sync:{...settings.sync,fnHz:21}},sourceMap)));
 assert.notEqual(identity,gflFingerprint('model',resolveGflSnapshot(input,settings,{...sourceMap,fs:'measured'})));
 assert.notEqual(identity,gflFingerprint('model',resolveGflSnapshot({...input,activePowerW:210000},settings,sourceMap)));
});

test('numerical policy publishes existing model thresholds separately from response identity',()=>{
 const policy=gflNumericalPolicy();
 assert.equal(policy.model.id,'gfl-dq-linearization-v1');
 assert.equal(policy.response.id,'gfl-dq-response-v1');
 assert.equal(policy.model.operatingPointResidualMax,1e-7);
 assert.equal(policy.model.jacobian.coarseStep,2e-6);
 assert.equal(policy.model.jacobian.fineStep,1e-6);
 assert.equal(policy.model.jacobian.maxNormalizedDifference,1e-5);
 assert.equal(policy.model.poleRealPartTolerance,1e-6);
 assert.equal(policy.model.jacobian.method,'central-difference');
 assert.ok(Object.isFrozen(policy.model.jacobian));
 const error=new GflAnalysisError('unsupported','unknown model');
 assert.ok(error instanceof Error);assert.equal(error.code,'unsupported');assert.equal(error.message,'unknown model');
});

test('mainline fixture clones baseline and applies only the tested strong PQ analysis facts',()=>{
 const baseline=original(),before=JSON.stringify(baseline),fixture=mainlineFixture({gains:{d:{kp:.2}},settings:{sync:{fnHz:25}}});
 assert.deepEqual(fixture.project,baseline);
 assert.equal(fixture.ibrId,'PV1');
 assert.equal(fixture.input.dMode,'P');assert.equal(fixture.input.qMode,'Q');
 assert.equal(fixture.input.activePowerW,2e5);
 assert.equal(fixture.input.filterCurrentMs,.1);assert.equal(fixture.input.filterVoltageMs,.1);
 assert.equal(fixture.settings.modelId,'gfl-dq-reference-v1');assert.equal(fixture.settings.sync.fnHz,25);
 assert.equal(fixture.settings.sources['sync.fnHz'],'test-fixture');
 assert.equal(fixture.gains.d.kp,.2);assert.equal(fixture.gains.d.ki,baseline.extensions.gflPi.PV1.gains.d.ki);
 assert.equal(JSON.stringify(original()),before);
 fixture.project.components[0].name='changed';
 assert.equal(JSON.stringify(original()),before);
});

// Final review M1/M2: imported values retain honest provenance and validation.
test('explicit canonical fields without provenance are stored-unknown, including partial sources',()=>{
 const {input,sourceMap}=mainlineFixture();
 for(const sources of [undefined,{'sync.damping':'measured'}]){
  const p=original(),a={schemaVersion:1,modelVersion:1,modelId:'gfl-dq-reference-v1',syncMode:'fixed-angle',sync:{fnHz:37,damping:.8},dcModel:'rigid',...(sources?{sources}:{})};
  p.extensions.gflPi.PV1.analysis=a;const before=JSON.stringify(p),read=readGflAnalysisSettings(p,'PV1'),resolved=resolveGflSnapshot(input,a,sourceMap);
  for(const settings of [read,resolved.analysis]){
   for(const k of ['syncMode','sync.fnHz','dcModel'])assert.equal(settings.sources[k],'stored-unknown');
   assert.equal(settings.sources['sync.damping'],sources?'measured':'stored-unknown');assert.equal(settings.sources['sync.filterMs'],'engineering-default');
  }
  assert.equal(JSON.stringify(p),before);
 }
});
test('malformed legacy PLL booleans remain readable but cannot opt in without a valid explicit replacement',()=>{
 const {input,sourceMap}=mainlineFixture();
 for(const pllEnabled of [null,0,1,'false','true','srf-pll','fixed-angle',{},[]]){
  const p=original();p.extensions.gflPi.PV1.dqAnalysis={enabled:true,pllEnabled};const before=JSON.stringify(p),legacy=readGflAnalysisSettings(p,'PV1');
  assert.equal(legacy.modelId,'legacy-scalar');assert.equal(JSON.stringify(p),before);
  assert.throws(()=>saveGflAnalysisSettings(p,'PV1',{modelId:'gfl-dq-reference-v1'}),invalid);
  assert.throws(()=>resolveGflSnapshot(input,{...legacy,modelId:'gfl-dq-reference-v1'},sourceMap),invalid);
  for(const syncMode of ['srf-pll','fixed-angle']){const next=saveGflAnalysisSettings(p,'PV1',{modelId:'gfl-dq-reference-v1',syncMode});assert.equal(readGflAnalysisSettings(next,'PV1').syncMode,syncMode);assert.deepEqual(next.extensions.gflPi.PV1.dqAnalysis,p.extensions.gflPi.PV1.dqAnalysis);}
 }
 for(const pllEnabled of [true,false]){const p=original();p.extensions.gflPi.PV1.dqAnalysis={pllEnabled};assert.equal(readGflAnalysisSettings(saveGflAnalysisSettings(p,'PV1',{modelId:'gfl-dq-reference-v1'}),'PV1').syncMode,pllEnabled?'srf-pll':'fixed-angle');}
});
