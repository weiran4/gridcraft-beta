/** Data-only diagnostic downloads. No model, pole, response or application
 * computation occurs here. A download/import never grants application authority.
 */
import {gflCanonicalSnapshot,gflNumericalPolicy,gflFingerprint} from '../analysis/gfl-analysis-contract.js';
import {readGflModelInput,validateTuningRequest} from '../analysis/gfl-model-input.js';
import {piTimeParameters} from '../analysis/pi-time.js';
import {readGflAnalysisSettings,resolveGflSnapshot} from './gfl-analysis-settings.js';
import {readGflApplicationEvidence,readGflApplicationContext} from './gfl-analysis-evidence.js';
import {gflDqEvidenceExport} from './gfl-tuning-state.js';
import {readDqSettings} from './gfl-dq-settings.js';

/** Detach JSON data without executing toJSON/functions. Unrepresentable numeric
 * diagnostics remain unavailable (null), never fabricated zero measurements.
 */
export function gflAnalysisExportData(value,ancestors=new Set()){
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value!=='object')return undefined;
 if(ancestors.has(value))return null;
 ancestors.add(value);
 const result=Array.isArray(value)?value.map(v=>gflAnalysisExportData(v,ancestors)??null):Object.fromEntries(Object.entries(value).flatMap(([key,v])=>{
  const child=gflAnalysisExportData(v,ancestors);return child===undefined?[]:[[key,child]];
 }));
 ancestors.delete(value);return result;
}
const same=(a,b)=>gflCanonicalSnapshot(a)===gflCanonicalSnapshot(b);
const scalarRequest=r=>Object.fromEntries(Object.entries(r??{}).filter(([key])=>!['maxSteadyStateErrorPercent','currentTargets','crossAxisLimits'].includes(key)));
const convention=()=>({currentPositive:'converter-to-grid',park:'d=cos, q=-sin; amplitude-invariant',powerPositive:'injection-to-grid',
 currentError:'reference-minus-filtered-measurement',currentPiVoltageSign:1,decoupling:{d:'-omega*L*iq',q:'+omega*L*id'},outerPolarity:{P:1,Q:-1,Vdc:-1,Vac:-1}});
const known=a=>a?.schemaVersion===1&&a?.modelVersion===1&&['legacy-scalar','gfl-dq-reference-v1'].includes(a?.modelId);
function assumptions(analysis,input){
 if(!known(analysis))return ['Unsupported model/settings version; original configuration and PI retained.'];
 if(analysis.modelId==='legacy-scalar')return ['Rated-point scalar linearization with ideal fixed synchronous reference angle and ideal dq decoupling.',
  'No PLL or complete dq/outer cross-channel dynamics; optional dq side-check is separate.',
  'Continuous parallel PI; explicit delay is a scalar frequency-only diagnostic when nonzero; no EMT or HIL validation.'];
 return [analysis.syncMode==='srf-pll'?'Declared SRF PLL dynamics; fn is a characteristic frequency, not an asserted measured bandwidth.':'Fixed synchronous reference angle; no PCC-angle tracking or PLL dynamics.',
  'Balanced single-inverter LCL engineering reference at the high-voltage operating-point branch.',
  'Outer reference experiment retains both outer feedback loops; current reference experiment freezes outer output increments and retains operating biases.',
  'DC model: '+analysis.dcModel+'; selected outer quantities: '+input?.dMode+' / '+input?.qMode+'.',
  'Nonzero explicit delay uses a Padé approximation and cannot authorize application.',
  'No discrete controller, switching EMT, saturation, current/modulation limits, protection, HIL or certification guarantee.'];
}
function currentFacts(project,ibrId,analysis){
 const facts=readGflModelInput(project,ibrId,project.extensions?.gflPi?.[ibrId]??{}),component=project.components?.find(c=>c.id===ibrId);
 const input={...facts.modelInput,switchingFrequencyHz:component?.extensions?.filterDesign?.fs??null};
 const sources={...facts.sourceMap,switchingFrequencyHz:'component.extensions.filterDesign.fs'};
 let snapshot=null,error=null;
 if(known(analysis))try{snapshot=resolveGflSnapshot(input,analysis,sources);}catch(e){error=e.message;}
 return {facts,input,sources,snapshot,error};
}
function currentRequest(stored){
 const defaults=validateTuningRequest({}).request,raw={fi:stored.fi??500,fp:stored.fp??50,...stored.advisor?.request};
 return validateTuningRequest(Object.fromEntries(Object.keys(defaults).filter(k=>Object.hasOwn(raw,k)).map(k=>[k,raw[k]])));
}
function historicalApplications(stored){
 const advisor=stored.advisor??{},legacyAdvisor=Object.fromEntries(Object.entries(advisor).filter(([key])=>!['mainlineEvidence','evidenceHistory'].includes(key)));
 return {mainline:advisor.evidenceHistory??[],activePointer:advisor.mainlineEvidence?.kind==='gfl-mainline-evidence-pointer'?advisor.mainlineEvidence:null,
  active:readGflApplicationEvidence(stored),legacyAdvisor:Object.keys(legacyAdvisor).length?legacyAdvisor:null};
}
function responseIdentity(evaluation){
 const entries=Object.entries(evaluation?.experiments??{});
 return !!entries.length&&entries.every(([id,item])=>{
  const experiment=item?.experiment,fp=evaluation.experimentFingerprints?.[id];
  return !!fp&&experiment?.experimentFingerprint===fp&&typeof experiment.sourceExperimentFingerprint==='string'&&experiment.modelFingerprint===evaluation.modelFingerprint&&
   experiment.model?.modelFingerprint===evaluation.modelFingerprint&&Array.isArray(item.responses)&&Array.isArray(experiment.steps)&&
   item.responses.length>0&&item.responses.length===experiment.steps.length&&
   item.responses.every(r=>r.experimentFingerprint===fp&&r.quality?.sourceExperimentFingerprint===experiment.sourceExperimentFingerprint);
 });
}
function searchExport(search,project,ibrId,resolved,stored,request,legacy){
 if(!search)return null;
 let currentKey=null;
 try{currentKey=legacy?gflCanonicalSnapshot({ibrId,input:resolved.facts.modelInput,gains:stored.gains??null,request,dqSettings:readDqSettings(project,ibrId)}):readGflApplicationContext(project,ibrId).requestKey;}catch{}
 const status=!search.snapshotKey?'unverified':currentKey!==null&&search.snapshotKey===currentKey?'current':'stale';
 return {...search,...(status==='stale'?{candidateStatus:'stale'}:{}),freshness:{status,requestCurrent:status==='current'}};
}

/** Full current transient numerical evidence plus unchanged read-only history.
 * snapshot is an optional caller's immutable resolved snapshot: a mismatch is
 * reported, never used to overwrite the latest project's resolved facts.
 */
export function buildGflAnalysisExport({project,ibrId,snapshot=null,evaluation=null,search=null,exportedAt=new Date().toISOString()}){
 const stored=project.extensions?.gflPi?.[ibrId]??{},settings=readGflAnalysisSettings(project,ibrId),supported=known(settings),
  resolved=currentFacts(project,ibrId,settings),requestCheck=currentRequest(stored),request=requestCheck.request,gains=stored.gains??null,
  legacy=settings?.modelId==='legacy-scalar'&&supported,policy=gflNumericalPolicy(),reasons=[];
 const callerCurrent=snapshot===null||same(snapshot,resolved.snapshot);
 const scalar=legacy?(evaluation?.legacyEvaluation??evaluation):null;
 const completed=legacy?!!scalar?.loops&&(!evaluation.solveStatus||evaluation.solveStatus==='completed'):evaluation?.solveStatus==='completed'&&!!evaluation.model;
 const configuration=resolved.snapshot?{...resolved.snapshot,gains,policy:policy.model}:null;
 const legacyModelFingerprint=gflFingerprint('model',{modelId:'legacy-scalar',input:resolved.facts.modelInput,gains});
 const legacyWorkerFingerprint=gflFingerprint('model',{modelId:'legacy-scalar',input:resolved.snapshot?.input,gains});
 const modelCurrent=!!(supported&&resolved.facts.inputStatus==='valid'&&callerCurrent&&completed&&
  (legacy?[legacyModelFingerprint,legacyWorkerFingerprint].includes(evaluation.modelFingerprint):evaluation.modelId===settings.modelId&&evaluation.modelFingerprint===evaluation.model.modelFingerprint&&same(configuration,evaluation.model.configurationSnapshot)));
 const responseCurrent=modelCurrent&&(legacy||responseIdentity(evaluation));
 const evaluationCurrent=!!(responseCurrent&&requestCheck.valid&&(legacy?!evaluation.targetResult||same(scalarRequest(request),scalarRequest(evaluation.targetResult.request)):same(request,evaluation.targetResult?.request)&&!!evaluation.evaluationFingerprint));
 if(!supported)reasons.push('Unsupported model/settings version.');
 if(resolved.facts.inputStatus!=='valid')reasons.push(...resolved.facts.diagnostics.filter(d=>['error','incomplete'].includes(d.severity)).map(d=>d.message));
 if(resolved.error)reasons.push(resolved.error);
 if(!completed)reasons.push('No completed current numerical evaluation is available.');
 if(!callerCurrent)reasons.push('The supplied snapshot differs from the latest project.');
 if(completed&&!modelCurrent)reasons.push('Model facts, parameter sources, settings or PI differ from the evaluated configuration.');
 if(modelCurrent&&!responseCurrent)reasons.push('Experiment/response identities are incomplete or inconsistent.');
 if(responseCurrent&&!evaluationCurrent)reasons.push('Current targets differ or evaluation identity is unavailable.');
 if(!requestCheck.valid)reasons.push(...requestCheck.errors.map(e=>e.message));
 const status=!supported?'unsupported':!completed?'unavailable':evaluationCurrent?'current':'stale';
 const periods={controlStepSeconds:resolved.snapshot?.controlStepSeconds??null,pwmPeriodSeconds:resolved.snapshot?.pwmPeriodSeconds??null,
  responseSampling:'Per-experiment effective response policies and per-response quality/sampling diagnostics; independent of control/PWM periods.'};
 const currentAnalysis={...(legacy?{}:evaluation??{}),status:status==='current'?'completed':status,modelId:settings?.modelId??null,
  evaluatedModelId:evaluation?.modelId??null,settings,snapshot:resolved.snapshot,inputs:resolved.snapshot?.input??resolved.input,gains,mode:`${stored.dMode??'P'}/${stored.qMode??'Q'}`,request,policy:supported?policy:null,periods,
  solveStatus:evaluation?.solveStatus??null,stability:evaluation?.stability??{status:'notEvaluated',alpha:null,poles:[]},responseQuality:evaluation?.responseQuality??'notEvaluated',
  targetResult:evaluation?.targetResult??null,performance:evaluation?.performance??null,application:evaluation?.application??null,
  frequencyResponse:legacy?null:evaluation?.frequencyResponse??null,diagnostics:evaluation?.diagnostics??[],
  model:legacy?null:evaluation?.model??null,modelFingerprint:evaluation?.modelFingerprint??null,experimentFingerprints:legacy?{}:evaluation?.experimentFingerprints??{},
  evaluationFingerprint:evaluation?.evaluationFingerprint??null,experiments:legacy?{}:evaluation?.experiments??{},
  scalarDiagnostics:legacy?scalar:evaluation?.scalarDiagnostics??null,assumptions:assumptions(settings,resolved.input),
  applicationAuthority:'none; application requires a fresh Worker check and a live transaction ticket'};
 const parameters=gains?Object.fromEntries(Object.entries(gains).map(([key,g])=>{
  try{return [key,piTimeParameters(g)];}catch{return [key,{kp:g?.kp??null,tiSeconds:null,integralEnabled:null}];}
 })):null;
 const scalarLegacy=legacy?{scope:'legacy-scalar',inputs:resolved.input,factSources:resolved.sources,request,currentEvaluation:scalar,
  piForm:'Kp + 1/(Ti*s)',tiUnit:'s',parameters,manual:stored.manual===true,dqAnalysis:gflDqEvidenceExport(stored,resolved.facts.modelInput),
  modelCoverage:scalar?.modelCoverage??null,zeroDelayStability:modelCurrent&&resolved.input.delaySamples===0&&scalar?.modelCoverage==='exactZeroDelayScalar'&&scalar?.loops?
   Object.fromEntries(Object.entries(scalar.loops).map(([key,loop])=>[key,['stable','unstable','marginal'].includes(loop.stability?.status)?loop.stability.status==='stable':null])):null}:null;
 return gflAnalysisExportData({schema:'gridcraft-gfl-pi-v9',exportedAt,ibrId,project:{format:project.format,schemaVersion:project.schemaVersion,name:project.name},
  currentAnalysis,historicalApplications:historicalApplications(stored),manualCandidates:Object.values(stored.manualCandidates??{}),search:searchExport(search,project,ibrId,resolved,stored,request,legacy),
  controlConvention:convention(),parameterSources:resolved.snapshot?.parameterSources??{...settings?.sources,...resolved.sources},
  freshness:{status,scope:legacy?(evaluation?.targetResult?'legacy-scalar-targets':'scalar-input-gain-diagnostics'):'coupled-model-experiments-targets',modelCurrent,responseCurrent,evaluationCurrent,reasons:[...new Set(reasons)]},scalarLegacy,
  pi:{form:'Kp + 1/(Ti*s)',tiUnit:'s',gains,parameters,manual:stored.manual===true},
  diagnosticOnly:true,applicationAuthority:'none',serialization:{functions:'omitted',nonFiniteNumbers:'null (unavailable)',cycles:'null (unavailable)'}});
}
