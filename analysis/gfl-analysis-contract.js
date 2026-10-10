/** Data-only contracts shared by project readers, numerical Workers and exports.
 * This module deliberately imports neither project state nor the physical model.
 * Ordered descriptor/port arrays are authoritative; matrices contain no functions.
 */

/** @typedef {{kp:number,ki:number}} PiGain */
/** @typedef {{d:PiGain,q:PiGain,P:PiGain,Q:PiGain}} Gains Existing pu PI units. */
/** @typedef {'legacy-scalar'|'gfl-dq-reference-v1'} GflModelId */
/** @typedef {{fnHz:number,damping:number,filterMs:number,decouplingFrequency:'pll'|'nominal'}} SyncSettings */
/** @typedef {{schemaVersion:1,modelId:GflModelId,modelVersion:1,syncMode:'srf-pll'|'fixed-angle',sync:SyncSettings,dcModel:'auto'|'rigid'|'capacitor',sources:Record<string,string>}} AnalysisSettings */
/** @typedef {AnalysisSettings|Record<string,unknown>} StoredAnalysisSettings
 * Unknown-version records remain unchanged and exportable. They are not supported
 * AnalysisSettings until the resolver explicitly verifies their identity.
 */
/** @typedef {{modelId:GflModelId,modelVersion:1,equationVersion:string,input:Record<string,unknown>,analysis:AnalysisSettings,nominalFrequencyHz:number,parameterSources:Record<string,string>,controlStepSeconds:number,pwmPeriodSeconds:number|null}} ResolvedSnapshot
 * input.fs is control sampling; optional input.switchingFrequencyHz is a separate
 * caller-supplied PWM fact. No PI, tuning goals or display state belong here.
 */
/** @typedef {{id:string,labelZh:string,unit:string,frame:string,meaning:string,baseSI:number|null,baseUnit:string|null,legacyName:string|null,applicable:boolean,enabledWhen:string|null}} Descriptor
 * baseSI is null for dimensionless, angle/time or unsupported conversions.
 */
/** @typedef {{id:'gfl-dq-linearization-v1',operatingPointResidualMax:number,jacobian:{method:'central-difference',coarseStep:number,fineStep:number,perturbationScale:string,rowNormalization:string,maxNormalizedDifference:number},poleRealPartTolerance:number}} ModelNumericalPolicy */
/** @typedef {{id:'gfl-dq-response-v1',slowRateWindowFactor:number,maxWindowSeconds:number,maxPoints:number,coarseBins:number,fineBins:number,settlingBandFraction:0.02,settlingAbsoluteToleranceSeconds:number,settlingRelativeTolerance:number,settlingBracketToleranceFraction:number,overshootTolerancePercentagePoints:number,tailRelativeTolerance:number,steadyStatePivotRelativeTolerance:number,steadyStateResidualTolerance:number,samplingBlockSize:number,oscillationTailRelativeBound:number,oscillationPoleSeparationRelativeTolerance:number,oscillationExtremumRelativeTolerance:number,oscillationExtremumMaxIterations:number,windowSeconds?:number|null,resolvedOuterWindowSeconds?:number,outerStabilityStatus?:'stable'|'unstable'|'marginal'|'notEvaluated'}} ResponseNumericalPolicy
 * Inherited numerical engineering settings, not physical/device accuracy or a
 * standard. Gate 1 requires independent response error evidence. For an automatic
 * frozen-current drift window, the evaluator supplies resolvedOuterWindowSeconds
 * together with outerStabilityStatus:'stable' from the full closed outer model.
 * Explicit windowSeconds always takes precedence. Resolved windows participate
 * in response experiment identity before any sample evidence is produced.
 */
/** @typedef {{model:ModelNumericalPolicy,response:ResponseNumericalPolicy}} NumericalPolicy */
/** @typedef {{op:Record<string,unknown>,x0:number[],u0:number[],y0:number[],bases:Record<string,unknown>,branch:'high-voltage'}} OperatingPoint */
/** @typedef {{modelId:GflModelId,modelVersion:1,equationVersion:string,numericalVersion:string,modelFingerprint:string,configurationSnapshot:ResolvedSnapshot&{gains:Gains,policy:ModelNumericalPolicy},operatingPoint:OperatingPoint,states:Descriptor[],inputs:Descriptor[],outputs:Descriptor[],A:number[][],B:number[][],C:number[][],D:number[][],quality:Record<string,unknown>,delayRepresentation:Record<string,unknown>,coverage:Record<string,unknown>,parameterSources:Record<string,string>,realizationId:string}} ModelRecord */
/** @typedef {{id:'outer-reference-closed'|'current-reference-frozen-outer',amplitudePu:number,windowSeconds:number|null}} ExperimentDefinition
 * Defaults: 0.01 pu, automatic window. Amplitude must be finite and nonzero;
 * negative steps are permitted. Reference steps are independent runs.
 */
/** @typedef {{inputId:string,targetOutputId:string,amplitudePu:number}} StepDefinition */
/** @typedef {{id:ExperimentDefinition['id'],model:ModelRecord,modelFingerprint:string,experimentFingerprint:string,feedback:Record<string,unknown>,steps:StepDefinition[],policy:ResponseNumericalPolicy}} ExperimentRecord */
/** @typedef {{overshootPercent:number|null,settlingTimeSeconds:number|null,steadyStateErrorPu:number|null,steadyStateErrorPercent:number|null,peakAbsPu:number|null,residualOffsetPu:number|null}} ChannelMetrics
 * Settling means remaining within the requested target's ±2% amplitude band,
 * never a band normalized to the measured final gain. Unverified metrics are null.
 */
/** @typedef {{outputId:string,role:'tracking'|'cross'|'diagnostic',targetDelta:number,steadyStateDelta:number|null,metrics:ChannelMetrics}} ResponseChannel */
/** @typedef {'notEvaluated'|'completed'|'approximateDelay'|'windowExceeded'|'resolutionLimited'|'numericalFailure'|'budgetExceeded'|'cancelled'} ResponseQualityStatus */
/** @typedef {{inputId:string,targetOutputId:string,amplitudePu:number,experimentFingerprint:string,status:ResponseQualityStatus,points:{t:number,y:number[]}[],channels:ResponseChannel[],quality:Record<string,unknown>}} StepResponse points.y contains increments in model output order. */
/** @typedef {{maxOvershootPercent:number|null,maxSettlingSeconds:number|null,maxSteadyStateErrorPercent:number|null}} CurrentTargets */
/** @typedef {{outerPeakAbsPu:number|null,outerResidualAbsPu:number|null,currentPeakAbsPu:number|null,currentResidualAbsPu:number|null}} CrossAxisLimits */
/** @typedef {Record<string,unknown>&{maxSteadyStateErrorPercent?:number|null,currentTargets?:CurrentTargets|null,crossAxisLimits?:CrossAxisLimits|null}} EvaluationTargets
 * Existing request fields keep their meaning. Null adds no hidden target gate;
 * legacy mode ignores the new scoped fields and retains its four-loop targets.
 */
/** @typedef {{snapshot:ResolvedSnapshot,gains:Gains,experiments:ExperimentDefinition[],request:EvaluationTargets,policy:NumericalPolicy}} EvaluationRequest */
/** @typedef {'unsupported'|'invalidInput'|'operatingPointFailure'|'numericalFailure'|'budgetExceeded'|'cancelled'|'completed'} SolveStatus */
/** @typedef {{re:number,im:number}} Pole */
/** @typedef {{status:'notEvaluated'|'stable'|'unstable'|'marginal',alpha:number|null,poles:Pole[]}} Stability */
/** @typedef {{experiment:ExperimentRecord,responses:StepResponse[],stability:Stability}} ExperimentEvaluation Experiment stability is diagnostic only. */
/** @typedef {{scope:'closed-reference',experimentFingerprint:string,inputIds:string[],outputIds:string[],series:Record<string,unknown>}} ClosedReferenceFrequencyResponse Outer 2×2 reference/output submatrix only. */
/** @typedef {{modelId:GflModelId,modelFingerprint:string|null,experimentFingerprints:Record<string,string>,evaluationFingerprint:string|null,solveStatus:SolveStatus,stability:Stability&{scope:'outer-reference-closed'},responseQuality:ResponseQualityStatus,targetResult:{group:'satisfied'|'reduced'|'unmet',unmet:unknown[],request:EvaluationTargets},performance:{T:number|null,O:number|null,E:number|null,units:Record<string,string>,rankingPolicyId:string},application:{eligible:boolean,reasons:string[]},model:ModelRecord|null,experiments:Record<string,ExperimentEvaluation>,frequencyResponse:ClosedReferenceFrequencyResponse|null,scalarDiagnostics:unknown,diagnostics:unknown[]}} EvaluationResult
 * E is the largest absolute target-relative steady-state error percentage among
 * required tracked channels. application is derived, never imported authority.
 * Legacy results retain their scalar payload without fabricating coupled matrices.
 */
/** @typedef {{now:()=>number,deadlineMs:number,isCancelled:()=>boolean,onProgress:(event:unknown)=>void,cache:Map}} Runtime Functions/cache stay inside the Worker/test. */

/** Typed boundary failure; callers classify by code rather than translated text. */
export class GflAnalysisError extends Error{
 constructor(code,message){super(message);this.name='GflAnalysisError';this.code=code;}
}

/** The requested-target ±2% band defines this response contract; it is not a
 * configurable numerical accuracy/window/budget control. Omission uses .02. */
export function assertGflSettlingDefinition(responsePolicy){
 if(responsePolicy&&Object.hasOwn(responsePolicy,'settlingBandFraction')&&responsePolicy.settlingBandFraction!==.02)
  throw new GflAnalysisError('invalidInput','此响应契约的稳定时间固定采用请求目标 ±2% 幅值带。');
}

/** Exact existing tuningSnapshot algorithm: sort objects, preserve arrays, JSON.
 * No rounding/hash and no change to JSON's unsupported-value behavior.
 * @param {unknown} value
 * @returns {string|undefined}
 */
export function gflCanonicalSnapshot(value){
 const stable=v=>v&&typeof v==='object'?(Array.isArray(v)?v.map(stable):Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]))):v;
 return JSON.stringify(stable(value));
}

/** Lossless identity, namespaced by contract/version/kind. Callers supply the
 * complete identity layer: model facts/PI/op; experiment feedback/ports/steps/
 * window/response policy; evaluation targets/ranking; or pre-compute request data.
 */
export function gflFingerprint(kind,payload){
 return `gfl-analysis-contract/v1/${kind}:${gflCanonicalSnapshot(payload)}`;
}

const freeze=value=>{
 if(value&&typeof value==='object'){
  for(const child of Object.values(value))freeze(child);
  Object.freeze(value);
 }
 return value;
};

/** Existing model numerical settings, distinct from response policy identity.
 * @returns {NumericalPolicy}
 */
export function gflNumericalPolicy(){
 return freeze({
  model:{id:'gfl-dq-linearization-v1',operatingPointResidualMax:1e-7,
   jacobian:{method:'central-difference',coarseStep:2e-6,fineStep:1e-6,
    perturbationScale:'max(1,abs(x0[j])) for states; 1 for input increments',
    rowNormalization:'max(1,max(abs(fine row)))',maxNormalizedDifference:1e-5},
   poleRealPartTolerance:1e-6},
  response:{id:'gfl-dq-response-v1',slowRateWindowFactor:12,maxWindowSeconds:1e6,maxPoints:20000,
   coarseBins:48,fineBins:96,settlingBandFraction:.02,settlingAbsoluteToleranceSeconds:.00002,
   settlingRelativeTolerance:.005,settlingBracketToleranceFraction:.25,overshootTolerancePercentagePoints:.1,tailRelativeTolerance:.005,
   steadyStatePivotRelativeTolerance:1e-13,steadyStateResidualTolerance:1e-12,samplingBlockSize:32,oscillationTailRelativeBound:1e-10,oscillationPoleSeparationRelativeTolerance:1e-7,
   oscillationExtremumRelativeTolerance:1e-10,oscillationExtremumMaxIterations:64}
 });
}
