import test from 'node:test';
import assert from 'node:assert/strict';
import {gflNumericalPolicy,gflFingerprint} from '../analysis/gfl-analysis-contract.js';
import {buildGflExperiment,createGflExperimentDefinitions} from '../analysis/gfl-experiments.js';
import {mainlineFixture} from './fixtures/gfl-mainline.js';
const load=()=>import('../analysis/gfl-state-response.js');
const close=(a,b,t=1e-12)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} (tolerance ${t})`);
const port=id=>({id,applicable:true});
function toy({A=[[-1]],B=[[1]],C=[[1]],D=[[0]],amplitudePu=.01,windowSeconds=null,id='outer-reference-closed',policy={}}={}){
 const inputs=B[0].map((_,i)=>port('in'+i)),outputs=C.map((_,i)=>port('out'+i));
 const steps=inputs.map((p,i)=>({inputId:p.id,targetOutputId:outputs[i]?.id??outputs[0].id,amplitudePu}));
 const model={A,B,C,D,inputs,outputs,states:A.map((_,i)=>port('x'+i)),delayRepresentation:{approximate:false}};
 return {id,model,modelFingerprint:'toy',experimentFingerprint:gflFingerprint('experiment',{model,steps,windowSeconds}),steps,
  feedback:{outer:id==='current-reference-frozen-outer'?'frozen-output-increments':'closed'},policy:{...gflNumericalPolicy().response,...policy,windowSeconds}};
}
async function run(options={},policy,runtime){const e=toy(options);return (await load()).stateSpaceStepResponse(e,e.steps[0],policy,runtime);}

test('response policy exports inherited engineering settings and residual criteria',()=>{
 const p=gflNumericalPolicy().response;
 assert.equal(p.slowRateWindowFactor,12);assert.equal(p.maxWindowSeconds,1e6);assert.equal(p.maxPoints,20000);
 assert.equal(p.coarseBins,48);assert.equal(p.fineBins,96);assert.equal(p.settlingBandFraction,.02);
 assert.equal(p.settlingAbsoluteToleranceSeconds,.00002);assert.equal(p.settlingRelativeTolerance,.005);
 assert.equal(p.overshootTolerancePercentagePoints,.1);assert.equal(p.tailRelativeTolerance,.005);
 assert.equal(p.steadyStatePivotRelativeTolerance,1e-13);assert.equal(p.steadyStateResidualTolerance,1e-12);
});
for(const tau of [.001,.1,2,10000])test(`one pole tau ${tau} settles against the requested target`,async()=>{
 const r=await run({A:[[-1/tau]],B:[[1/tau]]});assert.equal(r.status,'completed');
 const m=r.channels[0].metrics,exact=-Math.log(.02)*tau;
 close(m.settlingTimeSeconds,exact,.005*exact);close(m.overshootPercent,0);
 close(r.channels[0].steadyStateDelta,.01);close(m.steadyStateErrorPercent,0);
 assert.ok(r.quality.steadyState.normalizedResidual<=1e-12);assert.equal(r.quality.stability.poles.length,1);
 close(r.quality.resolvedWindowSeconds,12*tau,1e-12);assert.equal(r.quality.requestedWindowSeconds,null);
 assert.ok(r.quality.refined);assert.ok(r.quality.channels[0].settlingIntervalSeconds[1]>=exact);
});
test('0.8 gain cannot settle around its own final output',async()=>{
 const r=await run({C:[[.8]]});assert.equal(r.channels[0].metrics.settlingTimeSeconds,null);
 close(r.channels[0].metrics.steadyStateErrorPercent,20);close(r.channels[0].metrics.steadyStateErrorPu,-.002);
 assert.equal(r.status,'windowExceeded');
});
test('negative target uses directional overshoot and target-relative error',async()=>{
 const p=await run(),n=await run({amplitudePu:-.01});
 assert.equal(n.status,'completed');close(n.channels[0].metrics.settlingTimeSeconds,p.channels[0].metrics.settlingTimeSeconds);
 close(n.channels[0].metrics.overshootPercent,0);close(n.channels[0].steadyStateDelta,-.01);
 for(let i=0;i<p.points.length;i++)close(n.points[i].y[0],-p.points[i].y[0]);
});
test('direct feedthrough is present at t=0 and in the independent equilibrium',async()=>{
 const r=await run({B:[[.6]],D:[[.4]]});assert.equal(r.points[0].y[0],.004);close(r.channels[0].steadyStateDelta,.01);assert.equal(r.status,'completed');
});
test('repeated poles propagate directly without polynomial cancellation',async()=>{
 const r=await run({A:[[-1,1],[0,-1]],B:[[0],[1]],C:[[1,0]]});assert.equal(r.status,'completed');
 for(const p of r.points)close(p.y[0],.01*(1-(1+p.t)*Math.exp(-p.t)),1e-12);
 assert.equal(r.quality.stability.poles.length,2);
});
test('coupled outputs preserve order and only tracking output has target-rate metrics',async()=>{
 const e=toy({A:[[-1,0],[.5,-2]],B:[[1,0],[0,2]],C:[[1,0],[0,1]],D:[[0,0],[0,0]]});
 const r=(await load()).stateSpaceStepResponse(e,e.steps[0]);assert.equal(r.status,'completed');
 assert.deepEqual(r.channels.map(c=>c.role),['tracking','cross']);
 close(r.channels[1].steadyStateDelta,.0025);assert.equal(r.channels[1].metrics.overshootPercent,null);assert.equal(r.channels[1].metrics.steadyStateErrorPercent,null);
 assert.equal(r.channels[1].metrics.settlingTimeSeconds,null);assert.ok(r.channels[1].metrics.peakAbsPu>0);
 for(const p of r.points){close(p.y[0],.01*(1-Math.exp(-p.t)));close(p.y[1],.0025*(1-Math.exp(-p.t))**2);}
});
test('short explicit window does not manufacture convergence',async()=>{
 const r=await run({windowSeconds:.1});assert.equal(r.status,'windowExceeded');assert.equal(r.channels[0].metrics.settlingTimeSeconds,null);
 assert.equal(r.quality.requestedWindowSeconds,.1);assert.equal(r.quality.resolvedWindowSeconds,.1);
});
test('slow automatic window cap is exported and remains unverified',async()=>{
 const r=await run({A:[[-1e-5]],B:[[1e-5]],policy:{maxWindowSeconds:100}});assert.equal(r.status,'windowExceeded');assert.equal(r.channels[0].metrics.settlingTimeSeconds,null);assert.equal(r.quality.resolvedWindowSeconds,100);
});
test('stiff diagonal system preserves its very slow target and fast cross transient',async()=>{
 const r=await run({A:[[-1e6,0],[0,-.001]],B:[[1e6],[.001]],C:[[0,1],[1,0]],D:[[0],[0]]});
 assert.equal(r.status,'completed');for(const p of r.points){close(p.y[0],.01*(1-Math.exp(-.001*p.t)),1e-7);close(p.y[1],.01*(1-Math.exp(-1e6*p.t)),1e-10);}
 close(r.channels[0].metrics.settlingTimeSeconds,-Math.log(.02)/.001, .005*(-Math.log(.02)/.001));
});
test('retained zero DC mode is diagnostic, without a fabricated steady state',async()=>{
 const r=await run({A:[[-1,0],[1,0]],B:[[1],[0]],C:[[1,0],[0,1]],D:[[0],[0]],windowSeconds:12,id:'current-reference-frozen-outer'});
 assert.equal(r.status,'windowExceeded');assert.equal(r.quality.stability.status,'marginal');assert.equal(r.quality.stability.poles.length,2);
 assert.equal(r.quality.steadyState.status,'unavailable');assert.ok(r.points.at(-1).y[1]>.1);
 for(const c of r.channels){assert.equal(c.steadyStateDelta,null);assert.equal(c.metrics.settlingTimeSeconds,null);assert.equal(c.metrics.steadyStateErrorPercent,null);}
});
test('automatic frozen drift requires the stable outer window; resolved evidence is fingerprinted',async()=>{
 const opts={A:[[-1,0],[1,0]],B:[[1],[0]],C:[[1,0],[0,1]],D:[[0],[0]],id:'current-reference-frozen-outer'};
 const no=await run(opts);assert.equal(no.status,'windowExceeded');assert.equal(no.points.length,0);
 const p={...gflNumericalPolicy().response,resolvedOuterWindowSeconds:12,outerStabilityStatus:'stable'},yes=await run(opts,p);
 assert.equal(yes.quality.resolvedWindowSeconds,12);assert.equal(yes.quality.windowSource,'stable-outer');assert.ok(yes.points.length>0);
 const changed=await run(opts,{...p,resolvedOuterWindowSeconds:24});assert.notEqual(yes.experimentFingerprint,changed.experimentFingerprint);
 const bad=await run(opts,{...p,outerStabilityStatus:'unstable'});assert.equal(bad.points.length,0);
});
test('unstable realization gives only a bounded explicit-window diagnostic',async()=>{
 const r=await run({A:[[1]],windowSeconds:2});assert.equal(r.status,'windowExceeded');assert.equal(r.quality.stability.status,'unstable');assert.equal(r.channels[0].steadyStateDelta,null);
 assert.ok(r.points.at(-1).y[0]>.06);assert.equal(r.channels[0].metrics.settlingTimeSeconds,null);
});
test('forced inadequate refinement cannot return a verified settling time',async()=>{
 const r=await run({A:[[-1,10],[-10,-1]],B:[[1],[10]],C:[[1,0]],policy:{coarseBins:1,fineBins:2}});
 assert.equal(r.status,'resolutionLimited');assert.equal(r.quality.refined,false);assert.equal(r.channels[0].metrics.settlingTimeSeconds,null);
});
test('near-band recrossings and nonunit steady state are not hidden by interpolation',async()=>{
 const {measureTargetResponse}=await load(),pts=[0,.8,1.03,1.019,1.021,1.019,1.01].map((v,t)=>({t,y:[.01*v]}));
 const m=measureTargetResponse(pts,{outputIndex:0,targetDelta:.01,steadyStateDelta:.01});assert.equal(m.settlingTimeSeconds,5);close(m.overshootPercent,3,1e-12);
 assert.equal(measureTargetResponse(pts,{outputIndex:0,targetDelta:.01,steadyStateDelta:.008}).settlingTimeSeconds,null);
 const n=measureTargetResponse(pts.map(p=>({t:p.t,y:[-p.y[0]]})),{outputIndex:0,targetDelta:-.01,steadyStateDelta:-.01});assert.deepEqual(n,{...m,steadyStateErrorPu:0,residualOffsetPu:-m.residualOffsetPu});
});
test('tail must have a full fine segment inside the target band',async()=>{
 const r=await run({windowSeconds:4});assert.equal(r.status,'windowExceeded');assert.equal(r.channels[0].metrics.settlingTimeSeconds,null);assert.equal(r.quality.channels[0].tailInsideTargetBand,false);
});
test('cancellation and deadline are checked within sampling, with finite partial evidence',async()=>{
 const e=toy(),{stateSpaceStepResponse}=await load();
 assert.equal(stateSpaceStepResponse(e,e.steps[0],undefined,{isCancelled:()=>true}).status,'cancelled');
 assert.equal(stateSpaceStepResponse(e,e.steps[0],undefined,{now:()=>10,deadlineMs:10}).status,'budgetExceeded');
 let checks=0;const r=stateSpaceStepResponse(e,e.steps[0],undefined,{isCancelled:()=>++checks>10});assert.equal(r.status,'cancelled');assert.ok(checks>10);assert.equal(r.channels[0].metrics.settlingTimeSeconds,null);
 let time=0;const b=stateSpaceStepResponse(e,e.steps[0],undefined,{now:()=>time++,deadlineMs:10});assert.equal(b.status,'budgetExceeded');
});
test('point budget exhaustion and nonfinite matrices are explicit',async()=>{
 assert.equal((await run({policy:{maxPoints:20}})).status,'budgetExceeded');
 for(const value of [NaN,Infinity]){const r=await run({A:[[value]]});assert.equal(r.status,'numericalFailure');assert.ok(r.quality.message);}
});
test('decimation preserves metric extrema and both settling neighbors from original points',async()=>{
 const {decimateResponse}=await load(),points=Array.from({length:2001},(_,t)=>({t,y:[Math.sin(t)]})),keep=[17,26,998,999],r=decimateResponse(points,keep,30);
 assert.ok(r.length<=30);for(const i of [0,2000,...keep])assert.ok(r.includes(points[i]));assert.ok(r.every((p,i)=>i===0||p.t>r[i-1].t));
 const response=await run();for(const i of response.quality.keepIndices)assert.ok(response.points.some(p=>p.t===response.quality.keptPoints.find(k=>k.index===i).point.t));
});
test('real mainline both experiments and both reference columns retain all outputs',async()=>{
 const f=mainlineFixture(),{stateSpaceStepResponse}=await load();
 for(const def of createGflExperimentDefinitions()){
  const e=buildGflExperiment(f.snapshot,f.gains,def),before=JSON.stringify(e);
  for(const step of e.steps){const r=stateSpaceStepResponse(e,step);assert.equal(r.status,'completed');assert.equal(r.channels.length,e.model.outputs.length);assert.equal(r.channels.filter(c=>c.role==='tracking').length,1);assert.equal(r.channels.filter(c=>c.role==='cross').length,1);assert.ok(r.quality.steadyState.normalizedResidual<=1e-12);assert.deepEqual(structuredClone(r),r);}
  assert.equal(JSON.stringify(e),before);
 }
});
test('Padé response is explicitly approximate even when numerically converged',async()=>{
 const e=toy();e.model.delayRepresentation={approximate:true,kind:'pade',seconds:.01};const r=(await load()).stateSpaceStepResponse(e,e.steps[0]);assert.equal(r.status,'approximateDelay');assert.equal(r.quality.approximateDelay,true);
});

// Self-review regressions: numerical overflow must not leak JSON null-conversion
// as apparently valid evidence; refinement parameters are explicit policy facts.
test('finite trajectory with overflowing target normalization fails explicitly',async()=>{
 const r=await run({B:[[1e308]],C:[[10]],amplitudePu:1e-308});
 assert.equal(r.status,'numericalFailure');assert.ok(r.quality.message);
 const visit=v=>{if(typeof v==='number')assert.ok(Number.isFinite(v));else if(v&&typeof v==='object')for(const x of Object.values(v))visit(x);};visit(r);
});
test('crossing bracket policy is exported and reproduced in response evidence',async()=>{
 assert.equal(gflNumericalPolicy().response.settlingBracketToleranceFraction,.25);
 const r=await run({A:[[-1,1],[0,-1]],B:[[0],[1]],C:[[1,0]]});
 const detail=r.quality.channels[0],interval=detail.settlingIntervalSeconds;
 assert.ok(interval[1]-interval[0]<=r.quality.policy.settlingBracketToleranceFraction*detail.settlingToleranceSeconds);
 assert.equal(r.quality.settlingBoundaryRefinement.bracketToleranceFraction,r.quality.policy.settlingBracketToleranceFraction);
});
test('steady-state solve uses row scaling and reports scaled pivot guard evidence',async()=>{
 const r=await run({A:[[-1e-8,1],[-1,-1]],B:[[1],[0]],C:[[1,0]],windowSeconds:40});
 assert.equal(r.quality.steadyState.status,'verified');close(r.channels[0].steadyStateDelta,.01/(1+1e-8));
 assert.ok(r.quality.steadyState.normalizedResidual<=1e-12);assert.ok(r.quality.steadyState.minScaledPivot>=1e-13);
 const ill=await run({A:[[-1,1e14],[0,-1]],B:[[0],[1]],C:[[0,1]],windowSeconds:12});
 assert.equal(ill.quality.steadyState.status,'unavailable');assert.equal(ill.quality.steadyState.reason,'singular-or-ill-conditioned');assert.equal(ill.channels[0].steadyStateDelta,null);
});
test('explicit experiment window remains authoritative and both steps have the same resolved fingerprint',async()=>{
 const {stateSpaceStepResponse}=await load(),e=toy({A:[[-1,0],[0,-2]],B:[[1,0],[0,2]],C:[[1,0],[0,1]],D:[[0,0],[0,0]],windowSeconds:12});
 const a=stateSpaceStepResponse(e,e.steps[0],{...gflNumericalPolicy().response,windowSeconds:24}),b=stateSpaceStepResponse(e,e.steps[1]);
 assert.equal(a.quality.resolvedWindowSeconds,12);assert.equal(a.experimentFingerprint,b.experimentFingerprint);
 const payload=JSON.parse(a.experimentFingerprint.slice('gfl-analysis-contract/v1/experiment:'.length));
 assert.equal(payload.resolvedWindowSeconds,12);assert.equal(payload.sourceExperimentFingerprint,e.experimentFingerprint);
});
test('mainline retained Vdc drift remains visible on both input columns and progress is emitted',async()=>{
 const {stateSpaceStepResponse}=await load(),f=mainlineFixture({input:{dMode:'Vdc'}}),e=buildGflExperiment(f.snapshot,f.gains,{id:'current-reference-frozen-outer',amplitudePu:.01,windowSeconds:4}),events=[];
 for(const step of e.steps){const r=stateSpaceStepResponse(e,step,undefined,{onProgress:event=>events.push(event)});
  assert.equal(r.status,'windowExceeded');assert.equal(r.quality.stability.status,'marginal');assert.equal(r.quality.stability.poles.length,e.model.A.length);
  assert.ok(r.channels.every(c=>c.steadyStateDelta===null&&c.metrics.settlingTimeSeconds===null));
  if(step.inputId.endsWith('.d'))assert.ok(Math.abs(r.points.at(-1).y[0])>.1);
 }
 assert.ok(events.some(e=>e.pass==='coarse'));assert.ok(events.some(e=>e.pass==='fine'));assert.ok(events.every(e=>e.samples>0));
});
test('malformed matrix, port, policy, amplitude and standalone samples never become passing responses',async()=>{
 const {stateSpaceStepResponse,measureTargetResponse}=await load();
 const bad=[e=>{e.model.D=[[0,0]];},e=>{e.steps[0].amplitudePu=0;},e=>{e.policy.fineBins=0;},e=>{e.policy.id='future';},e=>{e.model.outputs[0].applicable=false;},e=>{e.policy.foo=Infinity;}];
 for(const change of bad){const e=toy();change(e);assert.equal(stateSpaceStepResponse(e,e.steps[0]).status,'numericalFailure');}
 for(const points of [[],[{t:0,y:[NaN]}],[{t:1,y:[0]},{t:0,y:[.01]}]])assert.equal(measureTargetResponse(points,{outputIndex:0,targetDelta:.01,steadyStateDelta:.01}).settlingTimeSeconds,null);
});

test('angle diagnostic stays in radians and never mislabels its peak or residual as pu',async()=>{
 const f=mainlineFixture(),e=buildGflExperiment(f.snapshot,f.gains,createGflExperimentDefinitions()[0]);
 const r=(await load()).stateSpaceStepResponse(e,e.steps[0]),index=e.model.outputs.findIndex(p=>p.id==='sync.angle'),channel=r.channels[index];
 assert.equal(e.model.outputs[index].unit,'rad');assert.equal(channel.role,'diagnostic');
 assert.equal(channel.metrics.peakAbsPu,null);assert.equal(channel.metrics.residualOffsetPu,null);
 assert.equal(r.quality.channels[index].unit,'rad');
 close(r.quality.channels[index].sampledPeakAbs,Math.max(...r.points.map(p=>Math.abs(p.y[index]))));
 close(r.quality.channels[index].sampledResidualOffset,r.points.at(-1).y[index]);
});

// R1: geometric coarse/fine grids shared a missed late oscillatory excursion.
function analyticOscillationSettling(omega){
 const band=.02,phase=Math.atan(1/omega),envelopeEnd=-Math.log(band);
 let k=Math.floor((omega*envelopeEnd+phase)/Math.PI),peak=(k*Math.PI-phase)/omega;
 while(Math.exp(-peak)*Math.abs(Math.cos(omega*peak))<=band){k--;peak=(k*Math.PI-phase)/omega;}
 let lo=peak,hi=(k+.5)*Math.PI/omega;
 for(let j=0;j<60;j++){const mid=(lo+hi)/2;if(Math.exp(-mid)*Math.abs(Math.cos(omega*mid))>band)lo=mid;else hi=mid;}
 return hi;
}
test('R1 60 rad/s cannot certify settling before the later exact band excursion',async()=>{
 const omega=60,r=await run({A:[[-1,omega],[-omega,-1]],B:[[1],[omega]],C:[[1,0]]});
 const exact=analyticOscillationSettling(omega),time=r.channels[0].metrics.settlingTimeSeconds;
 assert.equal(r.status,'completed');assert.ok(time>=exact-1e-10,`${time} precedes exact ${exact}`);close(time,exact,Math.max(.002,.01*exact));
 assert.ok(r.points.some(p=>p.t>3.83&&p.y[0]<.0098));
 assert.equal(r.quality.oscillationSampling.resolved,true);
});
test('R1 20000 rad/s cannot certify oscillations unresolved within the unchanged point budget',async()=>{
 const omega=20000,r=await run({A:[[-1,omega],[-omega,-1]],B:[[1],[omega]],C:[[1,0]]});
 assert.equal(r.status,'resolutionLimited');assert.equal(r.channels[0].metrics.settlingTimeSeconds,null);
 assert.equal(r.quality.oscillationSampling.resolved,false);assert.ok(r.quality.oscillationSampling.fineRequestedSamples>20000);
 assert.ok(r.points.length<=20000);assert.equal(r.quality.stability.poles.length,2);
});
test('R1 frequency sweep never returns a completed early oscillatory settling certificate',async()=>{
 for(const omega of [20,20.87364095,37,59,61,61.03079885,79,100,300,3000]){
  const r=await run({A:[[-1,omega],[-omega,-1]],B:[[1],[omega]],C:[[1,0]]}),exact=analyticOscillationSettling(omega),time=r.channels[0].metrics.settlingTimeSeconds;
  if(r.status==='completed'){assert.ok(time>=exact-1e-10,`omega=${omega}: ${time} precedes ${exact}`);close(time,exact,Math.max(.002,.01*exact));}
  else {assert.equal(r.status,'resolutionLimited');assert.equal(time,null);}
 }
});

test('R1 extrema solver distinguishes floating-point bracket convergence from missing resolution',async()=>{
 const f=mainlineFixture({input:{dMode:'Vdc'}}),e=buildGflExperiment(f.snapshot,f.gains,createGflExperimentDefinitions()[0]);
 const r=(await load()).stateSpaceStepResponse(e,e.steps[1]);assert.equal(r.status,'completed');
 const limited=await run({A:[[-1,60],[-60,-1]],B:[[1],[60]],C:[[1,0]],policy:{oscillationExtremumMaxIterations:1}});
 assert.equal(limited.status,'resolutionLimited');assert.equal(limited.channels[0].metrics.settlingTimeSeconds,null);
});

test('the supported response contract rejects a changed settling definition, including a nonunit final gain',async()=>{
 for(const settlingBandFraction of [.5,.01,0,null,NaN,Infinity])for(const C of [[[1]],[[.8]]]){
  const r=await run({C,policy:{settlingBandFraction}});assert.equal(r.status,'numericalFailure');assert.match(r.quality.message,/2%/);assert.equal(r.points.length,0);assert.ok(r.channels.every(c=>c.metrics.settlingTimeSeconds===null));
 }
 const e=toy();assert.equal((await load()).stateSpaceStepResponse(e,e.steps[0],{settlingBandFraction:.5}).status,'numericalFailure');
 const implicit=await run(),explicit=await run({policy:{settlingBandFraction:.02}});assert.deepEqual(explicit,implicit);
});
