/** One selected-model numerical boundary. Pure data in/out; no candidate names,
 * stored certificates, search state, Worker messages or project writes. */
import {GflAnalysisError,gflFingerprint,gflNumericalPolicy,assertGflSettlingDefinition} from './gfl-analysis-contract.js';
import {buildGflExperiment,createGflExperimentDefinitions,findPortIndex} from './gfl-experiments.js';
import {classifyDqPoles} from './gfl-dq-analysis.js';
import {stateSpaceStepResponse} from './gfl-state-response.js';
import {frequencyMatrix} from './port-response.js';
import {evaluateGfl} from './gfl-linear-evaluation.js';
import {gflLinearModels} from './gfl-linear-model.js';
import {linearStepMetrics} from './gfl-step-metrics.js';
import {validateTuningRequest,validateModelFacts} from './gfl-model-input.js';
import {validateGains} from './gfl-frequency.js';
import {targetCheck} from './gfl-tuning-search.js';

const outerId='outer-reference-closed',currentId='current-reference-frozen-outer',loops=['d','q','P','Q'];
const rankingPolicyId='gfl-mainline-performance-v1';
const requestKeys=['mode','focus','minMargin','preferredMargin','separationRatio','tolerance','allowReduction','fi','fp','minimumFi','minimumFp',
 'maxOvershootPercent','maxSettlingSeconds','maxSteadyStateErrorPercent','currentTargets','crossAxisLimits'];
const legacyRequest=raw=>Object.fromEntries(Object.entries(raw??{}).filter(([k])=>!['maxSteadyStateErrorPercent','currentTargets','crossAxisLimits'].includes(k)));
const normalizedRequest=raw=>{
 const check=validateTuningRequest(Object.fromEntries(requestKeys.filter(k=>Object.hasOwn(raw??{},k)).map(k=>[k,raw[k]])));
 return {...check,request:Object.fromEntries(requestKeys.map(k=>[k,check.request[k]]))};
};
const fail=(code,message)=>{throw new GflAnalysisError(code,message);};
function checkpoint(runtime){
 if(runtime.isCancelled?.())fail('cancelled','计算已取消。');
 if((runtime.now??(()=>performance.now()))()>=(runtime.deadlineMs??Infinity))fail('budgetExceeded','计算时间预算耗尽。');
}
const hasLimit=value=>value!==null&&value!==undefined;
const needsCurrentTracking=request=>request.currentTargets&&Object.values(request.currentTargets).some(hasLimit);
const needsCurrentResponses=request=>needsCurrentTracking(request)||['currentPeakAbsPu','currentResidualAbsPu'].some(k=>hasLimit(request.crossAxisLimits?.[k]));
const usable=response=>['completed','approximateDelay'].includes(response?.status);
const trackedResponses=e=>e?.responses??[];
const trackingChannel=r=>r.channels?.find(c=>c.role==='tracking'&&c.outputId===r.targetOutputId)??r.channels?.find(c=>c.role==='tracking');
const requiredResponses=(evaluation,request)=>[...trackedResponses(evaluation.experiments[outerId]),...(needsCurrentResponses(request)?trackedResponses(evaluation.experiments[currentId]):[])];
const requiredTracking=(evaluation,request)=>[...trackedResponses(evaluation.experiments[outerId]),...(needsCurrentTracking(request)?trackedResponses(evaluation.experiments[currentId]):[])];
const qualityStatus=responses=>['cancelled','budgetExceeded','numericalFailure','resolutionLimited','windowExceeded','approximateDelay'].find(status=>responses.some(r=>r.status===status))??(responses.length?'completed':'notEvaluated');

/** Frequency diagnostics retain scalar crossover/margin/separation meaning.
 * Their scalar time metrics are deliberately outside coupled target ownership. */
function scalarConstraints(scalar,request){
 const unmet=[];
 if(!scalar?.loops||loops.some(k=>!scalar.loops[k]))return {unmet:['标量种子交越诊断未完成。'],reduced:false};
 const tc=targetCheck(scalar,{...request,maxOvershootPercent:null,maxSettlingSeconds:null});unmet.push(...tc.unmet);
 for(const k of loops){
  const l=scalar.loops[k],r=scalar.refinement?.loops?.[k];
  if(l.crossings.length!==1||l.nearTangency||l.scanStatus!=='ok'||r&&(r.crossings.length!==1||r.nearTangency||r.scanStatus!=='ok'))unmet.push(`${k} 交越不唯一或频域校核未完成`);
  else if(r&&Math.abs(l.crossings[0].frequency/r.crossings[0].frequency-1)>.002)unmet.push(`${k} 交越精度未确认`);
  if(l.minMargin===null||!Number.isFinite(l.minMargin)||l.minMargin<request.minMargin-.005)unmet.push(`${k} 相位裕度低于设定下限`);
 }
 for(const [o,i]of [['P','d'],['Q','q']]){
  const a=scalar.loops[o].crossings[0]?.frequency,b=scalar.loops[i].crossings[0]?.frequency;
  if(!(Number.isFinite(a)&&Number.isFinite(b)&&a<=b/request.separationRatio*1.0001))unmet.push(`${o} 内外环交越比未满足`);
 }
 return {unmet,reduced:tc.accepted&&tc.targetStatus==='partiallySatisfied'&&request.allowReduction===true};
}

/** @returns {import('./gfl-analysis-contract.js').EvaluationResult['targetResult']} */
export function checkGflMainlineTargets(evaluation,rawRequest={},scalarSeed){
 if(evaluation.modelId==='legacy-scalar'){
  const check=validateTuningRequest(legacyRequest(rawRequest)),scalar=scalarSeed?.evaluation??scalarSeed??evaluation.legacyEvaluation;
  if(!check.valid)return {group:'unmet',unmet:check.errors.map(e=>e.message),request:check.request};
  const tc=targetCheck(scalar,check.request);
  return {group:!tc.accepted?'unmet':tc.targetStatus==='partiallySatisfied'?'reduced':'satisfied',unmet:tc.unmet,request:check.request};
 }
 const check=normalizedRequest(rawRequest),request=check.request;
 if(!check.valid)return {group:'unmet',unmet:check.errors.map(e=>e.message),request};
 const scalar=scalarSeed?.evaluation??scalarSeed??evaluation.scalarDiagnostics,constraints=scalarConstraints(scalar,request),unmet=[...constraints.unmet];
 const checkTracking=(id,limits,required)=>{
  if(!required)return;
  const responses=trackedResponses(evaluation.experiments[id]);
  if(responses.length!==2){unmet.push(`${id} 两个独立参考响应未完成评估`);return;}
  for(const response of responses){
   const channel=trackingChannel(response),m=channel?.metrics;
   if(!usable(response)||!m||!Number.isFinite(m.settlingTimeSeconds)||!Number.isFinite(m.overshootPercent)||!Number.isFinite(m.steadyStateErrorPercent)){
    unmet.push(`${id} ${channel?.outputId??response.targetOutputId??'跟踪量'} 请求目标时域校核未完成`);continue;
   }
   for(const [key,metric,label]of [['maxOvershootPercent','overshootPercent','超调'],['maxSettlingSeconds','settlingTimeSeconds','稳定时间'],['maxSteadyStateErrorPercent','steadyStateErrorPercent','稳态误差']])
    if(hasLimit(limits?.[key])&&Math.abs(m[metric])>limits[key])unmet.push(`${id} ${channel.outputId} ${label}超限`);
  }
 };
 checkTracking(outerId,request,true);checkTracking(currentId,request.currentTargets,needsCurrentTracking(request));
 for(const [id,prefix]of [[outerId,'outer'],[currentId,'current']]){
  for(const [suffix,metric]of [['PeakAbsPu','peakAbsPu'],['ResidualAbsPu','residualOffsetPu']]){
   const limit=request.crossAxisLimits?.[prefix+suffix];if(!hasLimit(limit))continue;
   const responses=trackedResponses(evaluation.experiments[id]);
   if(responses.length!==2){unmet.push(`${id} 交叉响应未完成评估`);continue;}
   for(const response of responses){const cross=response.channels?.filter(c=>c.role==='cross')??[];
    if(!usable(response)||cross.length!==1||!Number.isFinite(cross[0].metrics?.[metric]))unmet.push(`${id} 交叉 ${metric} 未完成评估`);
    else if(Math.abs(cross[0].metrics[metric])>limit)unmet.push(`${id} ${cross[0].outputId} 交叉 ${metric} 超限`);
   }
  }
 }
 return {group:unmet.length?'unmet':constraints.reduced?'reduced':'satisfied',unmet,request};
}

function performanceSummary(evaluation,request){
 // Inner constraints add eligibility gates, not outer Pareto performance.
 // Only E spans all explicitly required tracked channels (shared contract).
 const outerChannels=trackedResponses(evaluation.experiments[outerId]).map(trackingChannel),requiredChannels=requiredTracking(evaluation,request).map(trackingChannel),
  worst=(channels,metric)=>channels.length&&channels.every(c=>Number.isFinite(c?.metrics?.[metric]))?Math.max(...channels.map(c=>Math.abs(c.metrics[metric]))):null;
 return {T:worst(outerChannels,'settlingTimeSeconds'),O:worst(outerChannels,'overshootPercent'),E:worst(requiredChannels,'steadyStateErrorPercent'),units:{T:'s',O:'%',E:'%'},rankingPolicyId};
}
function emptyResult(modelId,request){
 return {modelId,modelFingerprint:null,experimentFingerprints:{},evaluationFingerprint:null,solveStatus:'completed',
  stability:{status:'notEvaluated',alpha:null,poles:[],scope:outerId},responseQuality:'notEvaluated',targetResult:{group:'unmet',unmet:['评估未完成。'],request},
  performance:{T:null,O:null,E:null,units:{T:'s',O:'%',E:'%'},rankingPolicyId},application:{eligible:false,reasons:[]},
  model:null,experiments:{},frequencyResponse:null,scalarDiagnostics:null,diagnostics:[]};
}
function applicationStatus(result){
 const reasons=[];
 if(result.solveStatus!=='completed')reasons.push('计算未完成：'+result.solveStatus);
 if(result.stability.status!=='stable')reasons.push('所选完整外环模型未稳定：'+result.stability.status);
 if(result.model?.delayRepresentation?.approximate||result.responseQuality==='approximateDelay')reasons.push('含 Padé 显式延时近似，不能作为精确可应用证据。');
 if(result.responseQuality!=='completed')reasons.push('所需响应质量未完成：'+result.responseQuality);
 if(!['satisfied','reduced'].includes(result.targetResult.group))reasons.push(...result.targetResult.unmet);
 if(!result.evaluationFingerprint)reasons.push('缺少当前评估指纹。');
 if(result.modelId!=='legacy-scalar')for(const [id,entry]of Object.entries(result.experiments)){
  const fp=result.experimentFingerprints[id];
  if(!fp||entry.experiment.experimentFingerprint!==fp||entry.responses.length!==2||entry.responses.some(r=>r.experimentFingerprint!==fp||r.quality.sourceExperimentFingerprint!==entry.experiment.sourceExperimentFingerprint))reasons.push('响应证据指纹不一致：'+id);
 }
 return {eligible:reasons.length===0,reasons:[...new Set(reasons)]};
}

/** Preserve the original four-loop scalar evaluator, metrics and target rules.
 * This is the old manual adapter's numerical pipeline, without candidate identity. */
function evaluateLegacy(input,gains,rawRequest,runtime,result){
 const check=validateTuningRequest(legacyRequest(rawRequest)),request=check.request;
 try{validateModelFacts(input);validateGains(gains);}catch(error){fail('invalidInput',error.message);}
 checkpoint(runtime);const evaluation=evaluateGfl(input,gains,{includeSeries:true,count:2001});
 if(input.delaySamples===0){const models=gflLinearModels(input,gains);for(const k of loops){checkpoint(runtime);evaluation.loops[k].step=linearStepMetrics(models[k],{includePoints:false});}}
 result.legacyEvaluation=evaluation;result.scalarDiagnostics=evaluation;
 result.stability={status:['stable','unstable','marginal'].includes(evaluation.stability.status)?evaluation.stability.status:'notEvaluated',alpha:null,poles:[],scope:outerId};
 const verified=evaluation.stability.status==='stable'&&loops.every(k=>evaluation.loops[k].step.status==='ok');
 result.responseQuality=verified?'completed':input.delaySamples!==0?'approximateDelay':'windowExceeded';
 const unmet=[];let targetStatus='notSatisfied';
 if(!verified)unmet.push('稳定性或时域校核未完成：可保存试验参数，但不能作为通过校核的方案应用。');
 if(!check.valid)unmet.push(...check.errors.map(e=>e.message));
 else{
  const target=targetCheck(evaluation,request);targetStatus=target.targetStatus;unmet.push(...target.unmet);
  checkpoint(runtime);const refined=evaluateGfl(input,gains,{count:3201});checkpoint(runtime);
  for(const k of loops){const l=evaluation.loops[k],r=refined.loops[k];
   if(l.crossings.length!==1||r.crossings.length!==1||l.nearTangency||r.nearTangency||l.scanStatus!=='ok'||r.scanStatus!=='ok')unmet.push(`${k} 交越不唯一或频域校核未完成`);
   else if(Math.abs(l.crossings[0].frequency/r.crossings[0].frequency-1)>.002)unmet.push(`${k} 交越精度未确认`);
   if(l.minMargin===null||l.minMargin<request.minMargin-.005)unmet.push(`${k} 相位裕度低于设定下限`);
  }
  for(const [o,i]of [['P','d'],['Q','q']]){const a=evaluation.loops[o].crossings[0]?.frequency,b=evaluation.loops[i].crossings[0]?.frequency;if(!(a<=b/request.separationRatio*1.0001))unmet.push(`${o} 内外环交越比未满足`);}
 }
 result.legacyVerified=verified;result.legacyTargetStatus=verified&&check.valid&&!unmet.length?targetStatus:'notSatisfied';
 result.targetResult={group:unmet.length?'unmet':targetStatus==='partiallySatisfied'?'reduced':'satisfied',unmet,request};
 const worst=metric=>verified?Math.max(...loops.map(k=>evaluation.loops[k].step[metric])):null;
 const dcErrors=loops.map(k=>Math.abs(evaluation.loops[k].step.dcGain-1)*100);
 result.performance={T:worst('settlingTimeSeconds'),O:worst('overshootPercent'),E:verified&&dcErrors.every(Number.isFinite)?Math.max(...dcErrors):null,units:{T:'s',O:'%',E:'%'},rankingPolicyId:'gfl-tuning-advisor-v1'};
 if(evaluation.stability.status==='numericalFailure'||loops.some(k=>evaluation.loops[k].step.status==='numericalFailure')){
  result.solveStatus='numericalFailure';result.responseQuality='numericalFailure';
  result.diagnostics.push({code:'numericalFailure',severity:'error',message:'标量稳定性或阶跃数值校核未完成。'});
 }
 result.modelFingerprint=gflFingerprint('model',{modelId:'legacy-scalar',input,gains});
 result.evaluationFingerprint=gflFingerprint('evaluation',{modelFingerprint:result.modelFingerprint,experimentFingerprints:{},request,rankingPolicyId:result.performance.rankingPolicyId});
}

function closedFrequency(experiment,runtime){
 const {model}=experiment,inputIds=experiment.steps.map(s=>s.inputId),outputIds=experiment.steps.map(s=>s.targetOutputId),
  inputIndices=inputIds.map(id=>findPortIndex(model.inputs,id)),outputIndices=outputIds.map(id=>findPortIndex(model.outputs,id)),
  port={A:model.A,B:model.B.map(row=>inputIndices.map(i=>row[i])),C:outputIndices.map(i=>model.C[i]),D:outputIndices.map(i=>inputIndices.map(j=>model.D[i][j]))},
  display=experiment.policy.frequencyDisplay,series=outputIds.map(()=>inputIds.map(()=>[])),last=outputIds.map(()=>inputIds.map(()=>null));
 runtime.onProgress?.({phase:'closed-reference-frequency',count:display.count});checkpoint(runtime);
 for(let i=0;i<display.count;i++){
  checkpoint(runtime);const f=i===display.count-1?display.maximumHz:display.minimumHz*(display.maximumHz/display.minimumHz)**(i/(display.count-1)),matrix=frequencyMatrix(port,f);
  for(let row=0;row<2;row++)for(let col=0;col<2;col++){
   const z=matrix[row][col];if(!Number.isFinite(z.re)||!Number.isFinite(z.im))fail('numericalFailure','联立闭合参考频响非有限。');
   let phase=Math.atan2(z.im,z.re)*180/Math.PI,previous=last[row][col];
   if(previous!==null){while(phase-previous>180)phase-=360;while(phase-previous< -180)phase+=360;}last[row][col]=phase;
   series[row][col].push({f,db:20*Math.log10(Math.max(1e-20,Math.hypot(z.re,z.im))),phase});
  }
 }
 checkpoint(runtime);return {scope:'closed-reference',experimentFingerprint:experiment.experimentFingerprint,inputIds,outputIds,series};
}

// Canonical JSON preserves exact supported data, but non-finite numbers would
// collapse to null. Reject such scope data before any cache lookup can bypass
// the model/experiment's ordinary validation.
function cacheData(value,seen=new Set()){
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
 if(!value||typeof value!=='object'||(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))||seen.has(value))fail('invalidInput','模型及实验缓存作用域须为有限、无循环的 JSON 数据。');
 seen.add(value);for(const child of Array.isArray(value)?Array.from(value):Object.values(value))cacheData(child,seen);seen.delete(value);
}
/** Exact pre-compute scope: targets/display do not own response identity. */
function cacheScope(payload){
 const policy=payload.policy??gflNumericalPolicy(),experiments=payload.experiments??createGflExperimentDefinitions();
 assertGflSettlingDefinition(policy.response);
 cacheData({snapshot:payload.snapshot,gains:payload.gains,experiments,policy});
 const modelKey=gflFingerprint('cache-model',{snapshot:payload.snapshot,gains:payload.gains,policy:policy.model});
 const experimentKey=gflFingerprint('cache-experiment',{modelKey,experiments,policy:policy.response});
 return {key:experimentKey,modelKey,experimentKey};
}
const evidenceIdentity=e=>gflFingerprint('cache-evidence',e);
function mainlinePolicy(snapshot,policy){
 const maximumHz=Math.min(1/snapshot.controlStepSeconds/10,snapshot.pwmPeriodSeconds===null?Infinity:1/snapshot.pwmPeriodSeconds/10);
 return {...policy,response:{...policy.response,frequencyDisplay:{count:151,minimumHz:.01,maximumHz,upperRule:'min(controlFrequencyHz, knownPwmFrequencyHz) / 10; engineering-display-only'}}};
}
function cachedExperimentMatches(id,item,definition,projection,evaluation){
 const experiment=item.experiment,model=experiment.model,frozen=id===currentId,outerWindow=evaluation.experiments[outerId].responses[0].quality.resolvedWindowSeconds;
 if(experiment.id!==id||model.realizationId!==id+'-v1')return false;
 const sourcePolicy={...mainlinePolicy(projection.snapshot,projection.policy).response,windowSeconds:definition.windowSeconds};
 const inherited=frozen&&evaluation.stability.status==='stable'&&Number.isFinite(outerWindow)?{resolvedOuterWindowSeconds:outerWindow,outerStabilityStatus:'stable'}:{};
 const policy={...gflNumericalPolicy().response,...sourcePolicy,...inherited};
 const inputIds=frozen?['reference.current.d','reference.current.q']:model.inputs.slice(0,2).map(p=>p.id),outputIds=frozen?['current.bridge.d','current.bridge.q']:model.outputs.slice(0,2).map(p=>p.id);
 const steps=inputIds.map((inputId,i)=>({inputId,targetOutputId:outputIds[i],amplitudePu:definition.amplitudePu}));
 if(gflFingerprint('cache-steps',steps)!==gflFingerprint('cache-steps',experiment.steps)||gflFingerprint('cache-policy',policy)!==gflFingerprint('cache-policy',experiment.policy))return false;
 const sourceFingerprint=gflFingerprint('experiment',{modelFingerprint:model.modelFingerprint,feedback:experiment.feedback,inputIds:model.inputs.map(p=>p.id),outputIds:model.outputs.map(p=>p.id),steps,windowSeconds:definition.windowSeconds,policy:sourcePolicy,
  realization:{id:model.realizationId,stateIds:model.states.map(p=>p.id),A:model.A,B:model.B,C:model.C,D:model.D}});
 if(experiment.sourceExperimentFingerprint!==sourceFingerprint)return false;
 const required=item.stability.status==='stable'?policy.slowRateWindowFactor/Math.min(...item.stability.poles.map(p=>-p.re)):null;
 let desired=definition.windowSeconds,windowSource='explicit';
 if(desired===null){if(required!==null){desired=required;windowSource='stable-experiment';}else if(frozen&&inherited.outerStabilityStatus==='stable'&&outerWindow>0){desired=outerWindow;windowSource='stable-outer';}else windowSource='unresolved';}
 const resolvedWindow=desired===null?null:Math.min(desired,policy.maxWindowSeconds);
 const resolvedFingerprint=gflFingerprint('experiment',{sourceExperimentFingerprint:sourceFingerprint,policy,requestedWindowSeconds:definition.windowSeconds,resolvedWindowSeconds:resolvedWindow,windowSource});
 return experiment.experimentFingerprint===resolvedFingerprint&&item.responses.every((r,i)=>r.inputId===steps[i].inputId&&r.targetOutputId===steps[i].targetOutputId&&r.amplitudePu===definition.amplitudePu&&r.quality.sourceExperimentFingerprint===sourceFingerprint&&r.experimentFingerprint===resolvedFingerprint&&
  r.quality.requestedWindowSeconds===definition.windowSeconds&&r.quality.requiredWindowSeconds===required&&r.quality.resolvedWindowSeconds===resolvedWindow&&r.quality.windowSource===windowSource&&gflFingerprint('cache-policy',r.quality.policy)===gflFingerprint('cache-policy',policy));
}
/** Transfer data is accepted only as exact, completed numerical evidence. Stored
 * eligibility is never authority: every request runs target/application derivation.
 * No cache for interrupted or local numerical-failure evaluations. */
export function isGflEvaluationCacheEntry(entry){
 try{
  const e=entry?.evidence;
  if(entry?.schemaVersion!==1||entry.key!==entry.experimentKey||typeof entry.modelKey!=='string'||e?.modelId!=='gfl-dq-reference-v1'||e.solveStatus!=='completed'||!e.model||!e.scalarDiagnostics||!e.frequencyResponse||entry.evidenceFingerprint!==evidenceIdentity(e))return false;
  const scope=cacheScope(entry.projection);
  if(scope.key!==entry.key||scope.modelKey!==entry.modelKey||scope.experimentKey!==entry.experimentKey)return false;
  const gains=Object.fromEntries(loops.map(k=>[k,{kp:entry.projection.gains[k].kp,ki:entry.projection.gains[k].ki}]));
  if(gflFingerprint('cache-configuration',e.model.configurationSnapshot)!==gflFingerprint('cache-configuration',{...entry.projection.snapshot,gains,policy:entry.projection.policy.model}))return false;
  if(e.modelFingerprint!==e.model.modelFingerprint||e.modelFingerprint!==e.experiments[outerId]?.experiment.modelFingerprint||e.frequencyResponse.experimentFingerprint!==e.experimentFingerprints[outerId])return false;
  const entries=Object.entries(e.experiments),definitions=entry.projection.experiments;
  if(!entries.length||definitions.length!==entries.length||new Set(definitions.map(d=>d.id)).size!==definitions.length||definitions.some(d=>!Object.hasOwn(e.experiments,d.id)))return false;
  return entries.every(([id,item])=>cachedExperimentMatches(id,item,definitions.find(d=>d.id===id),entry.projection,e)&&item.experiment.modelFingerprint===e.modelFingerprint&&item.experiment.model.modelFingerprint===e.modelFingerprint&&item.experiment.experimentFingerprint===e.experimentFingerprints[id]&&item.responses.length===2&&item.responses.every(r=>r.experimentFingerprint===e.experimentFingerprints[id]&&r.quality.sourceExperimentFingerprint===item.experiment.sourceExperimentFingerprint&&!['cancelled','budgetExceeded','numericalFailure'].includes(r.status)));
 }catch{return false;}
}
function recheckCachedEvidence(entry,request,runtime){
 const result=structuredClone(entry.evidence);checkpoint(runtime);runtime.onProgress?.({phase:'target-recheck',modelFingerprint:result.modelFingerprint});checkpoint(runtime);
 result.responseQuality=qualityStatus(requiredResponses(result,request));result.performance=performanceSummary(result,request);
 result.targetResult=checkGflMainlineTargets(result,request,result.scalarDiagnostics);
 result.evaluationFingerprint=gflFingerprint('evaluation',{modelFingerprint:result.modelFingerprint,experimentFingerprints:result.experimentFingerprints,request:result.targetResult.request,rankingPolicyId:result.performance.rankingPolicyId});
 result.application=applicationStatus(result);checkpoint(runtime);return result;
}
function cacheCompletedEvidence(payload,result,runtime){
 if(!(runtime.cache instanceof Map)||result.solveStatus!=='completed'||result.modelId!=='gfl-dq-reference-v1')return;
 const scope=cacheScope(payload),projection=structuredClone({snapshot:payload.snapshot,gains:payload.gains,experiments:payload.experiments??createGflExperimentDefinitions(),policy:payload.policy??gflNumericalPolicy()}),entry={schemaVersion:1,...scope,projection,evaluationKey:gflFingerprint('cache-evaluation',{experimentKey:scope.experimentKey,request:result.targetResult.request,rankingPolicyId:result.performance.rankingPolicyId}),evidence:structuredClone(result),evidenceFingerprint:evidenceIdentity(result)};
 if(!isGflEvaluationCacheEntry(entry))return;
 checkpoint(runtime);runtime.cache.delete(entry.key);runtime.cache.set(entry.key,entry);
 try{checkpoint(runtime);}catch(error){runtime.cache.delete(entry.key);throw error;}
 while(runtime.cache.size>8)runtime.cache.delete(runtime.cache.keys().next().value);
}

/** @param {import('./gfl-analysis-contract.js').EvaluationRequest} payload
 * @param {Partial<import('./gfl-analysis-contract.js').Runtime>} runtime
 * @returns {import('./gfl-analysis-contract.js').EvaluationResult} */
export function evaluateGflMainline(payload,runtime={}){
 const snapshot=payload?.snapshot,modelId=snapshot&&Object.hasOwn(snapshot,'modelId')?snapshot.modelId:'legacy-scalar',rawRequest=payload?.request??{},result=emptyResult(modelId,rawRequest);
 try{
  checkpoint(runtime);
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))fail('invalidInput','模型快照须为对象。');
  if(modelId==='legacy-scalar'){
   if(snapshot.modelVersion!==undefined&&snapshot.modelVersion!==1||snapshot.equationVersion!==undefined&&snapshot.equationVersion!=='legacy-scalar-v1')fail('unsupported','未支持的标量模型或方程版本。');
   evaluateLegacy(snapshot?.input,payload?.gains,rawRequest,runtime,result);
  }
  else{
   if(modelId!=='gfl-dq-reference-v1')fail('unsupported','未支持的 GFL 所选模型。');
   const check=normalizedRequest(rawRequest);result.targetResult.request=check.request;
   if(!check.valid)fail('invalidInput',check.errors.map(e=>e.message).join(' '));
   const request=check.request,definitions=payload.experiments??createGflExperimentDefinitions();
   if(!Array.isArray(definitions)||definitions.some(d=>!d)||new Set(definitions.map(d=>d.id)).size!==definitions.length)fail('invalidInput','实验定义须为无重复 ID 的数组。');
   if(definitions.some(d=>![outerId,currentId].includes(d.id)))fail('unsupported','未支持的 dq 实验。');
   if(!definitions.some(d=>d.id===outerId)||needsCurrentResponses(request)&&!definitions.some(d=>d.id===currentId))fail('invalidInput','所需参考实验定义缺失。');
   const maximumHz=Math.min(1/snapshot.controlStepSeconds/10,snapshot.pwmPeriodSeconds===null?Infinity:1/snapshot.pwmPeriodSeconds/10);
   if(!Number.isFinite(maximumHz)||maximumHz<=.01)fail('invalidInput','频率显示范围过小；请核对控制与 PWM 周期。');
   const scope=cacheScope(payload),cached=runtime.cache?.get(scope.key);
   if(isGflEvaluationCacheEntry(cached)&&cached.modelKey===scope.modelKey&&cached.experimentKey===scope.experimentKey)return recheckCachedEvidence(cached,check.request,runtime);
   const sourcePolicy=payload.policy??gflNumericalPolicy(),policy=mainlinePolicy(snapshot,sourcePolicy);
   let outerWindow=null;
   for(const id of [outerId,currentId]){
    const definition=definitions.find(d=>d.id===id);if(!definition)continue;
    checkpoint(runtime);runtime.onProgress?.({phase:'model-construction',experimentId:id});checkpoint(runtime);
    const source=buildGflExperiment(snapshot,payload.gains,definition,policy);checkpoint(runtime);
    const stability=classifyDqPoles(source.model.A);checkpoint(runtime);
    if(id===outerId){result.model=source.model;result.modelFingerprint=source.modelFingerprint;result.stability={...stability,scope:outerId};}
    const responsePolicy=id===currentId&&result.stability.status==='stable'&&Number.isFinite(outerWindow)?{...source.policy,resolvedOuterWindowSeconds:outerWindow,outerStabilityStatus:'stable'}:source.policy;
    const responses=[];result.experiments[id]={experiment:source,responses,stability};
    for(const step of source.steps){
     checkpoint(runtime);const response=stateSpaceStepResponse(source,step,responsePolicy,runtime);responses.push(response);
     // Publish the resolved identity before interruption can return partial
     // evidence. Every column still receives the original construction record.
     const fingerprint=response.experimentFingerprint;
     if(responses.some(r=>r.experimentFingerprint!==fingerprint))fail('numericalFailure','同一参考实验的响应指纹不一致。');
     result.experiments[id].experiment={...source,sourceExperimentFingerprint:source.experimentFingerprint,experimentFingerprint:fingerprint,policy:response.quality.policy??responsePolicy};
     result.experimentFingerprints[id]=fingerprint;
     if(['cancelled','budgetExceeded'].includes(response.status))fail(response.status,response.quality.message);
     if(id===outerId&&outerWindow===null)outerWindow=response.quality.resolvedWindowSeconds??null;
    }
    if(responses.some(r=>r.status==='numericalFailure')&&(id===outerId||needsCurrentResponses(request)))fail('numericalFailure',responses.find(r=>r.status==='numericalFailure').quality.message);
   }
   result.responseQuality=qualityStatus(requiredResponses(result,request));result.performance=performanceSummary(result,request);
   runtime.onProgress?.({phase:'scalar-diagnostics'});checkpoint(runtime);
   const scalar=evaluateGfl(snapshot.input,payload.gains,{count:2001});checkpoint(runtime);
   const refinement=evaluateGfl(snapshot.input,payload.gains,{count:3201});checkpoint(runtime);
   result.scalarDiagnostics={...scalar,refinement,scope:'scalar-seed-crossover-margin-separation-only'};
   result.targetResult=checkGflMainlineTargets(result,request,result.scalarDiagnostics);
   result.frequencyResponse=closedFrequency(result.experiments[outerId].experiment,runtime);
   result.evaluationFingerprint=gflFingerprint('evaluation',{modelFingerprint:result.modelFingerprint,experimentFingerprints:result.experimentFingerprints,request:result.targetResult.request,rankingPolicyId:result.performance.rankingPolicyId});
  }
  checkpoint(runtime);result.application=applicationStatus(result);cacheCompletedEvidence(payload,result,runtime);checkpoint(runtime);
 }catch(error){
  result.solveStatus=['unsupported','invalidInput','operatingPointFailure','numericalFailure','budgetExceeded','cancelled'].includes(error.code)?error.code:'numericalFailure';
  if(['budgetExceeded','cancelled','numericalFailure'].includes(result.solveStatus))result.responseQuality=result.solveStatus;
  result.diagnostics.push({code:result.solveStatus,severity:'error',message:error.message});
  if(result.targetResult.unmet[0]==='评估未完成。')result.targetResult.unmet=[error.message];
 }
 result.application=applicationStatus(result);return result;
}
