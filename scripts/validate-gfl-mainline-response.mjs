/** Export exact matrices/times/policy for offline SciPy validation. No browser or
 * product Python dependency; run this and the adjacent Python script together.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {mainlineFixture} from '../tests/fixtures/gfl-mainline.js';
import {buildGflExperiment,createGflExperimentDefinitions} from '../analysis/gfl-experiments.js';
import {gflNumericalPolicy,gflFingerprint} from '../analysis/gfl-analysis-contract.js';
import {stateSpaceStepResponse} from '../analysis/gfl-state-response.js';

const policy=gflNumericalPolicy(),items=[];
const port=id=>({id,applicable:true});
function toy(name,A,B,C,D,{amplitudePu=.01,windowSeconds=null,id='outer-reference-closed'}={}){
 const model={A,B,C,D,inputs:B[0].map((_,i)=>port('in'+i)),outputs:C.map((_,i)=>port('out'+i)),states:A.map((_,i)=>port('state'+i)),delayRepresentation:{approximate:false}};
 const steps=model.inputs.map((p,i)=>({inputId:p.id,targetOutputId:model.outputs[i]?.id??model.outputs[0].id,amplitudePu}));
 const experiment={id,model,modelFingerprint:'offline-toy/'+name,experimentFingerprint:gflFingerprint('experiment',{name,model,steps,windowSeconds}),feedback:{outer:id==='outer-reference-closed'?'closed':'frozen-output-increments'},steps,policy:{...policy.response,windowSeconds}};
 append(name,experiment);
}
function append(name,experiment,selectedPolicy=policy){
 for(const step of experiment.steps){
  const result=stateSpaceStepResponse(experiment,step,selectedPolicy);
  if(['numericalFailure','cancelled','budgetExceeded'].includes(result.status)||!result.points.length)throw Error(`${name}/${step.inputId}: ${result.status} ${result.quality.message??''}`);
  items.push({name,experimentId:experiment.id,model:experiment.model,step,steps:experiment.steps,policy:result.quality.policy,
   inputIndex:experiment.model.inputs.findIndex(p=>p.id===step.inputId),targetIndex:experiment.model.outputs.findIndex(p=>p.id===step.targetOutputId),
   exactSampleTimes:result.points.map(p=>p.t),result});
 }
}
toy('one-pole',[[-1]],[[1]],[[1]],[[0]]);
toy('nonunit-gain',[[-1]],[[1]],[[.8]],[[0]]);
toy('negative-step',[[-1]],[[1]],[[1]],[[0]],{amplitudePu:-.01});
toy('direct-D',[[-1]],[[.6]],[[1]],[[.4]]);
toy('repeated-poles',[[-1,1],[0,-1]],[[0],[1]],[[1,0]],[[0]]);
toy('coupled-2x2',[[-1,0],[.5,-2]],[[1,0],[0,2]],[[1,0],[0,1]],[[0,0],[0,0]]);
toy('oscillatory-crossing',[[-1,10],[-10,-1]],[[1],[10]],[[1,0]],[[0]]);
toy('oscillatory-recrossing-60',[[-1,60],[-60,-1]],[[1],[60]],[[1,0]],[[0]]);
toy('oscillatory-narrow-20.87364095',[[-1,20.87364095],[-20.87364095,-1]],[[1],[20.87364095]],[[1,0]],[[0]]);
toy('oscillatory-narrow-61.03079885',[[-1,61.03079885],[-61.03079885,-1]],[[1],[61.03079885]],[[1,0]],[[0]]);
toy('oscillatory-budget-20000',[[-1,20000],[-20000,-1]],[[1],[20000]],[[1,0]],[[0]]);
toy('very-slow',[[-1e-4]],[[1e-4]],[[1]],[[0]]);
toy('stiff',[[-1e6,0],[0,-.001]],[[1e6],[.001]],[[0,1],[1,0]],[[0],[0]]);
toy('zero-DC-drift',[[-1,0],[1,0]],[[1],[0]],[[1,0],[0,1]],[[0],[0]],{windowSeconds:12,id:'current-reference-frozen-outer'});
toy('unstable-diagnostic',[[1]],[[1]],[[1]],[[0]],{windowSeconds:2});
toy('short-window',[[-1]],[[1]],[[1]],[[0]],{windowSeconds:.1});
for(const dMode of ['P','Vdc'])for(const qMode of ['Q','Vac']){
 const f=mainlineFixture({input:{dMode,qMode}}),[outerDef,currentDef]=createGflExperimentDefinitions();
 const outer=buildGflExperiment(f.snapshot,f.gains,outerDef),current=buildGflExperiment(f.snapshot,f.gains,currentDef);
 append('mainline-'+dMode+(qMode==='Q'?'':'-Vac'),outer);
 const outerResponse=stateSpaceStepResponse(outer,outer.steps[0]);
 append('mainline-'+dMode+(qMode==='Q'?'':'-Vac'),current,{...policy,response:{...policy.response,resolvedOuterWindowSeconds:outerResponse.quality.resolvedWindowSeconds,outerStabilityStatus:outerResponse.quality.stability.status}});
}
const out=new URL('../artifacts/gfl-mainline-response/',import.meta.url);mkdirSync(out,{recursive:true});
writeFileSync(new URL('response-input.json',out),JSON.stringify({schemaVersion:1,policy,items},null,2)+'\n');
console.log(JSON.stringify({exported:items.length,statuses:items.map(i=>({name:i.name,experimentId:i.experimentId,input:i.step.inputId,status:i.result.status,samples:i.exactSampleTimes.length}))},null,2));
