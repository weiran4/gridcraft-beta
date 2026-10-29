/** PI-only mainline transactions. Request ownership is ephemeral; persisted
 * fingerprints describe history and never authorize a future application. */
import {gflCanonicalSnapshot,gflFingerprint,gflNumericalPolicy,assertGflSettlingDefinition} from '../analysis/gfl-analysis-contract.js';
import {createGflExperimentDefinitions} from '../analysis/gfl-experiments.js';
import {readGflModelInput,validateTuningRequest} from '../analysis/gfl-model-input.js';
import {validateGains} from '../analysis/gfl-frequency.js';
import {checkGflMainlineTargets} from '../analysis/gfl-mainline-evaluation.js';
import {readGflAnalysisSettings,resolveGflSnapshot} from './gfl-analysis-settings.js';
import {applyCandidate,createTuningState,previewCandidate} from './gfl-tuning-state.js';

const copy=v=>structuredClone(v),same=(a,b)=>gflCanonicalSnapshot(a)===gflCanonicalSnapshot(b);
const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
const tickets=new WeakMap(),requestPrefix='gfl-analysis-contract/v1/application-request:';
const fail=message=>{throw Error(message);};
const mode=s=>`${s.dMode??'P'}/${s.qMode??'Q'}`;
const requestKeys=Object.keys(validateTuningRequest({}).request);

/** Resolve the active history pointer. Older full records remain readable and
 * are never silently pruned or rewritten; neither shape grants apply authority. */
export function readGflApplicationEvidence(stored={}){
 const advisor=stored.advisor,pointer=advisor?.mainlineEvidence;
 if(!pointer)return null;
 if(pointer.kind!=='gfl-mainline-evidence-pointer')return freeze(copy(pointer));
 if(pointer.schemaVersion!==1||!Number.isInteger(pointer.historyIndex)||pointer.historyIndex<0)return null;
 const proof=advisor.evidenceHistory?.[pointer.historyIndex];
 if(proof?.schemaVersion!==1||proof.kind!=='gfl-mainline-application-proof')return null;
 return freeze({...copy(proof),status:pointer.status});
}

const fields=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value??{},key)).map(key=>[key,copy(value[key])]));
const qualityKeys=['requestedWindowSeconds','requiredWindowSeconds','resolvedWindowSeconds','windowSource','windowCapped','method','steadyStateMethod',
 'steadyStateResidualDefinition','numericalCriteria','approximateDelay','refined','coarseBins','fineBins','steadyState','tailConverged','oscillationSampling',
 'coarseSamples','fineSamples','settlingBoundaryRefinement','channels'];
// Scalar diagnostics contain seed crossings/refinement needed for historical
// target inspection. Trace fields are intentionally outside persisted proofs.
const withoutTraces=value=>Array.isArray(value)?value.map(withoutTraces):value&&typeof value==='object'?
 Object.fromEntries(Object.entries(value).filter(([key])=>!['points','series','closedSeries','keptPoints','keepIndices'].includes(key)).map(([key,child])=>[key,withoutTraces(child)])):value;
function responseQualitySummary(quality){
 const summary=fields(quality,qualityKeys);
 // Preserve the actual verification errors, criteria and resolved window. Raw
 // state increments, per-row residuals and per-mode sampling tables are transient
 // diagnostics; their acceptance maxima/status remain in the historical proof.
 if(summary.steadyState)summary.steadyState=fields(summary.steadyState,['status','normalizedResidual','minScaledPivot']);
 if(summary.oscillationSampling){
  const sampling=summary.oscillationSampling,modes=sampling.modes??[],finiteBounds=modes.map(m=>m.logAmplitudeBound).filter(Number.isFinite);
  summary.oscillationSampling={...fields(sampling,['resolved','coarseRequestedSamples','fineRequestedSamples','tailRelativeBound','extremaRefinement']),
   modeCount:modes.length,unboundedModeCount:modes.filter(m=>!Number.isFinite(m.logAmplitudeBound)).length,maxLogAmplitudeBound:finiteBounds.length?Math.max(...finiteBounds):null};
 }
 if(summary.channels)summary.channels=summary.channels.map(({peakIndex,troughIndex,...channel})=>channel);
 return summary;
}
function evaluationSummary(evaluation){
 return {...fields(evaluation,['modelId','solveStatus','stability','responseQuality','targetResult','performance','application','diagnostics']),
  model:fields(evaluation.model,['operatingPoint','states','inputs','outputs','quality','delayRepresentation','coverage','realizationId']),
  scalarDiagnostics:withoutTraces(evaluation.scalarDiagnostics),
  experiments:Object.fromEntries(Object.entries(evaluation.experiments).map(([id,item])=>[id,{
   // Exact fingerprints live once at proof level. Each experiment/response is
   // scoped by this dictionary key, not repeated full canonical identities.
   experiment:fields(item.experiment,['id','feedback','steps','policy']),stability:copy(item.stability),
   responses:item.responses.map(response=>({...fields(response,['inputId','targetOutputId','amplitudePu','status','channels']),quality:responseQualitySummary(response.quality)}))
  }]))};
}

/** Resolve the latest persisted facts, including sync sources and the existing
 * filter-design PWM source. Baseline PI/manual/bank identity also fences writes.
 * Experiments/policy are explicit task context, separate from stored settings. */
export function readGflApplicationContext(project,ibrId,{gains=null,experiments=createGflExperimentDefinitions(),policy=null}={}){
 policy=policy??{...gflNumericalPolicy(),response:{...gflNumericalPolicy().response,maxPoints:project.extensions?.gflPi?.[ibrId]?.advisor?.request?.responseMaxPoints??20000}};
 assertGflSettlingDefinition(policy.response);
 const stored=project.extensions?.gflPi?.[ibrId]??{},facts=readGflModelInput(project,ibrId,stored);
 if(facts.inputStatus!=='valid')fail('当前模型输入无效或已改变，请重新校核。');
 const component=project.components.find(c=>c.id===ibrId),snapshot=resolveGflSnapshot({...facts.modelInput,switchingFrequencyHz:component.extensions?.filterDesign?.fs??null},
  readGflAnalysisSettings(project,ibrId),{...facts.sourceMap,switchingFrequencyHz:'component.extensions.filterDesign.fs'});
 const raw={fi:stored.fi??500,fp:stored.fp??50,...stored.advisor?.request},check=validateTuningRequest(Object.fromEntries(requestKeys.filter(k=>Object.hasOwn(raw,k)).map(k=>[k,raw[k]])));
 if(!check.valid)fail('当前整定目标无效，请重新校核。');
 const scope={ibrId,snapshot,request:check.request,experiments:copy(experiments),policy:copy(policy),gains:gains===null?null:copy(gains),
  baselineGains:copy(stored.gains??null),baselineManual:stored.manual===true,baselineGainBankEntry:copy(stored.gainBank?.[mode(stored)]??null)};
 return freeze({...scope,requestKey:gflFingerprint('application-request',scope)});
}

/** Compare independent evidence layers; a goal edit retains model/response
 * freshness, but cannot retain evaluation eligibility. Missing keys are stale. */
export function gflEvidenceFreshness(evidence,currentKeys={}){
 const assessed=evidence?.status!=='unassessed'&&evidence?.status!=='stale';
 const modelCurrent=!!(assessed&&evidence?.modelFingerprint&&currentKeys.modelFingerprint&&evidence.modelFingerprint===currentKeys.modelFingerprint);
 const responseCurrent=!!(modelCurrent&&Object.keys(evidence.experimentFingerprints??{}).length&&same(evidence.experimentFingerprints,currentKeys.experimentFingerprints));
 const evaluationCurrent=!!(responseCurrent&&evidence.evaluationFingerprint&&evidence.evaluationFingerprint===currentKeys.evaluationFingerprint);
 return {modelCurrent,responseCurrent,evaluationCurrent};
}

/** @returns {object} Frozen data handle. A clone/import is never in the registry. */
export function createGflApplicationTicket({requestKey,candidateId,gains,evaluationFingerprint,source='auto',name=null}){
 validateGains(gains);
 if(typeof requestKey!=='string'||!requestKey.startsWith(requestPrefix)||typeof candidateId!=='string'||!candidateId||typeof evaluationFingerprint!=='string'||!evaluationFingerprint)fail('主线应用须提供当前请求与评估指纹。');
 let scope;try{scope=JSON.parse(requestKey.slice(requestPrefix.length));}catch{fail('主线应用请求票据无效。');}
 if(gflFingerprint('application-request',scope)!==requestKey||!same(scope.gains,gains))fail('主线应用请求与所选 PI 已改变。');
 assertGflSettlingDefinition(scope.policy?.response);
 const ticket=freeze({requestKey,candidateId,gains:copy(gains),evaluationFingerprint,source:source==='manual'?'manual':'auto',name:typeof name==='string'?name:null});
 tickets.set(ticket,{scope:freeze(scope),status:'pending'});return ticket;
}
export function invalidateGflApplicationTicket(ticket){const record=tickets.get(ticket);if(record)record.status='invalid';}

/** Internal transaction authority used by the legacy-compatible PI primitive.
 * Only commit can enter this state, immediately before the single PI write. */
export function assertGflApplicationTicket(ticket,project,ibrId,state,currentRequestKey){
 const record=tickets.get(ticket);
 if(record?.status!=='committing'||record.scope.ibrId!==ibrId||ticket.requestKey!==currentRequestKey||!same(ticket.gains,state.candidate?.gains))fail('主线 PI 应用需要重新进行 Worker 校核与有效票据。');
}

function checkEvaluation(e,ticket,scope){
 if(e?.modelId!=='gfl-dq-reference-v1'||e.solveStatus!=='completed'||e.responseQuality!=='completed')fail('主线计算或响应证据未完成，不能应用。');
 if(e.stability?.status!=='stable'||e.stability.scope!=='outer-reference-closed')fail('完整外环模型未稳定，不能应用。');
 if(e.model?.delayRepresentation?.approximate!==false)fail('显式延时近似或缺失延时证据，不能应用。');
 if(!['satisfied','reduced'].includes(e.targetResult?.group)||e.application?.eligible!==true)fail('当前目标或共享应用证据未通过，不能应用。');
 // This shared check reads completed metrics only. It performs no model,
 // operating-point, matrix, pole or response computation on the UI thread.
 const targets=checkGflMainlineTargets(e,scope.request,e.scalarDiagnostics);
 if(!['satisfied','reduced'].includes(targets.group)||!same(targets,e.targetResult))fail('当前目标证据未通过共享复核，不能应用。');
 if(!e.modelFingerprint||e.modelFingerprint!==e.model?.modelFingerprint||e.evaluationFingerprint!==ticket.evaluationFingerprint||
  !same(e.model?.configurationSnapshot,{...scope.snapshot,gains:ticket.gains,policy:scope.policy.model})||!same(e.targetResult.request,scope.request))fail('当前模型、目标或 PI 证据指纹已过期。');
 const expectedEvaluation=gflFingerprint('evaluation',{modelFingerprint:e.modelFingerprint,experimentFingerprints:e.experimentFingerprints,request:e.targetResult.request,rankingPolicyId:e.performance?.rankingPolicyId});
 if(e.evaluationFingerprint!==expectedEvaluation)fail('评估证据指纹不一致。');
 const ids=scope.experiments.map(d=>d.id);
 if(ids.length!==2||new Set(ids).size!==2||!ids.includes('outer-reference-closed')||!ids.includes('current-reference-frozen-outer')||!same([...Object.keys(e.experiments??{})].sort(),[...ids].sort()))fail('所选实验响应证据未完成。');
 for(const definition of scope.experiments){
  const item=e.experiments[definition.id],experiment=item?.experiment,fp=e.experimentFingerprints?.[definition.id];
  assertGflSettlingDefinition({settlingBandFraction:experiment?.policy?.settlingBandFraction});
  for(const response of item?.responses??[])assertGflSettlingDefinition({settlingBandFraction:response.quality?.policy?.settlingBandFraction});
  if(!fp||experiment?.experimentFingerprint!==fp||experiment.modelFingerprint!==e.modelFingerprint||item.responses?.length!==2||
   item.responses.some(r=>r.experimentFingerprint!==fp||r.quality?.sourceExperimentFingerprint!==experiment.sourceExperimentFingerprint||r.amplitudePu!==definition.amplitudePu||r.quality?.requestedWindowSeconds!==definition.windowSeconds||
    Object.entries(scope.policy.response).some(([key,value])=>key!=='windowSeconds'&&!same(r.quality?.policy?.[key],value))))fail('实验或响应证据指纹已过期。');
 }
}

/** Consume once on every attempt, successful or rejected. Writes only PI,
 * its matching gain-bank entry and an independent immutable evidence history. */
export function commitGflMainlineCandidate(project,ibrId,{ticket,evaluation,currentRequestKey,searchComplete,appliedAt=new Date().toISOString()}){
 const record=tickets.get(ticket);
 if(record?.status!=='pending')fail('应用票据已消费、失效或来自导入，请重新校核。');
 record.status='invalid';
 if(record.scope.ibrId!==ibrId||ticket.requestKey!==currentRequestKey)fail('工程请求已改变，应用票据已过期。');
 if(searchComplete!==true)fail('本次搜索尚未完成，不能应用诊断候选。');
 let current;try{current=readGflApplicationContext(project,ibrId,{gains:ticket.gains,experiments:record.scope.experiments,policy:record.scope.policy});}catch{fail('工程设置或模式已改变，应用票据已过期。');}
 if(current.requestKey!==ticket.requestKey||current.snapshot.modelId!=='gfl-dq-reference-v1')fail('工程、目标或现有 PI 已改变，应用票据已过期。');
 checkEvaluation(evaluation,ticket,record.scope);
 const previous=project.extensions.gflPi[ibrId].advisor,previousEvidence=readGflApplicationEvidence(project.extensions.gflPi[ibrId]);
 if(previous?.applicationStatus==='applied'&&previousEvidence?.candidateId===ticket.candidateId&&previousEvidence.evaluationFingerprint===evaluation.evaluationFingerprint&&same(project.extensions.gflPi[ibrId].gains,ticket.gains))fail('该候选与当前证据已应用，不能重复创建恢复记录。');
 if(typeof appliedAt!=='string'||!Number.isFinite(Date.parse(appliedAt)))fail('应用证据时间无效。');
 const candidate={id:ticket.candidateId,name:ticket.name,source:ticket.source,gains:ticket.gains,verified:true,requirementsMet:true,incompleteSearch:false,
  targetStatus:evaluation.targetResult.group==='reduced'?'partiallySatisfied':'satisfied'};
 const state={...previewCandidate(createTuningState(project.extensions?.gflPi?.[ibrId]),candidate,currentRequestKey),mainlineTicket:ticket};
 record.status='committing';let next;
 try{next=applyCandidate(project,ibrId,state,currentRequestKey);}finally{record.status='consumed';}
 const advisor=next.extensions.gflPi[ibrId].advisor;
 const evidence=freeze({schemaVersion:1,kind:'gfl-mainline-application-proof',status:'applied',appliedAt,candidateId:ticket.candidateId,candidateSource:ticket.source,candidateName:ticket.name,
  requestKey:ticket.requestKey,modelFingerprint:evaluation.modelFingerprint,experimentFingerprints:copy(evaluation.experimentFingerprints),evaluationFingerprint:evaluation.evaluationFingerprint,
  versions:{modelId:evaluation.modelId,modelVersion:evaluation.model.modelVersion,equationVersion:evaluation.model.equationVersion,numericalVersion:evaluation.model.numericalVersion,
   responsePolicyId:record.scope.policy.response.id,rankingPolicyId:evaluation.performance.rankingPolicyId},configurationSnapshot:copy(evaluation.model.configurationSnapshot),
  experiments:copy(record.scope.experiments),request:copy(record.scope.request),policy:copy(record.scope.policy),evaluationSummary:evaluationSummary(evaluation)});
 // Append-only compact history: retain every existing entry exactly. No silent
 // count cap, expiry or eviction. A genuine exhausted store fails atomically.
 advisor.evidenceHistory=[...(advisor.evidenceHistory??[]),evidence];
 advisor.mainlineEvidence=freeze({schemaVersion:1,kind:'gfl-mainline-evidence-pointer',historyIndex:advisor.evidenceHistory.length-1,status:'applied'});
 delete advisor.evaluation;delete advisor.snapshotKey;advisor.request=copy(record.scope.request);
 return next;
}

/** Own one apply-check Worker and its ticket. The second project read occurs
 * inside the result callback, immediately before the synchronous transaction. */
export function createGflMainlineApplicationController({clientFactory,readProject,writeProject,onEvent=()=>{},now=()=>new Date().toISOString()}){
 let pending=null,destroyed=false;
 const clear=()=>{if(pending)invalidateGflApplicationTicket(pending.ticket);pending=null;};
 const client=clientFactory({onEvent:event=>{
  if(event.type==='started'||event.type==='progress'){onEvent(event);return;}
  if(event.type!=='result'){clear();onEvent(event);return;}
  const owner=pending;if(!owner||event.requestKey!==owner.ticket.requestKey)return;pending=null;
  try{
   const latest=readProject(),context=readGflApplicationContext(latest,owner.ibrId,{gains:owner.ticket.gains,experiments:owner.context.experiments,policy:owner.context.policy});
   const next=commitGflMainlineCandidate(latest,owner.ibrId,{ticket:owner.ticket,evaluation:event.result,currentRequestKey:context.requestKey,searchComplete:owner.searchComplete,appliedAt:now()});
   const project=writeProject(next);onEvent({type:'applied',project,evidence:readGflApplicationEvidence(next.extensions.gflPi[owner.ibrId]),evaluation:event.result});
  }catch(error){invalidateGflApplicationTicket(owner.ticket);onEvent({type:'error',message:error.message});}
 }});
 return {
  get busy(){return pending!==null;},
  apply({ibrId,candidate,contextKey=null,searchComplete=false,experiments,policy}){
   if(destroyed||pending)return false;
   try{
    if(searchComplete!==true||candidate?.incompleteSearch)fail('本次搜索尚未完成，不能应用诊断候选。');
    const latest=readProject(),base=readGflApplicationContext(latest,ibrId,{experiments,policy});
    if(contextKey!==null&&contextKey!==base.requestKey)fail('模型、目标或当前 PI 已改变，候选已过期。');
    const context=readGflApplicationContext(latest,ibrId,{gains:candidate.gains,experiments:base.experiments,policy:base.policy}),preview=candidate.mainlineEvaluation??candidate.evaluation;
    const ticket=createGflApplicationTicket({requestKey:context.requestKey,candidateId:candidate.id,gains:candidate.gains,evaluationFingerprint:preview?.evaluationFingerprint,source:candidate.source,name:candidate.name});
    pending={ticket,ibrId,context,searchComplete};
    client.start({kind:'apply-check',requestKey:context.requestKey,payload:{snapshot:context.snapshot,gains:ticket.gains,request:context.request,experiments:context.experiments,policy:context.policy}});
    return true;
   }catch(error){clear();onEvent({type:'error',message:error.message});return false;}
  },
  cancel(){clear();client.cancel();},
  invalidate(message='输入已改变，应用校核已过期。'){clear();client.invalidate(message);},
  destroy(){destroyed=true;clear();client.destroy();}
 };
}
