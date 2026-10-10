/** Direct, zero-initial-increment LTI trajectories; no MIMO polynomial conversion
 * or pole cancellation. Accuracy thresholds are inherited engineering policy,
 * not a physical model/standards validation. Legacy scalar metrics are unchanged.
 */
import {matrixExponential} from './gfl-step-metrics.js';
import {classifyDqPoles} from './gfl-dq-analysis.js';
import {findPortIndex} from './gfl-experiments.js';
import {gflNumericalPolicy,gflFingerprint,assertGflSettlingDefinition} from './gfl-analysis-contract.js';

const emptyMetrics=()=>({overshootPercent:null,settlingTimeSeconds:null,steadyStateErrorPu:null,
 steadyStateErrorPercent:null,peakAbsPu:null,residualOffsetPu:null});
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const finitePoints=(points,index)=>points.length>0&&Number.isInteger(index)&&index>=0&&points.every((p,i)=>
 Number.isFinite(p.t)&&p.t>=0&&Number.isFinite(p.y?.[index])&&(i===0||p.t>points[i-1].t));

function inspect(points,index,target,steady,band=.02){
 const metrics=emptyMetrics();
 if(!finitePoints(points,index))return {metrics,peakIndex:null,troughIndex:null,settlingIntervalSeconds:null,lastOutside:null};
 let peakIndex=0,troughIndex=0,lastOutside=-1,peakAbs=0;
 const tracking=Number.isFinite(target)&&target!==0;
 for(let i=0;i<points.length;i++){
  const v=points[i].y[index];peakAbs=Math.max(peakAbs,Math.abs(v));
  const norm=tracking?v/target:v;
  if(!Number.isFinite(norm))throw Error('目标归一化数值溢出。');
  if(norm>(tracking?points[peakIndex].y[index]/target:points[peakIndex].y[index]))peakIndex=i;
  if(norm<(tracking?points[troughIndex].y[index]/target:points[troughIndex].y[index]))troughIndex=i;
  if(tracking&&Math.abs(v-target)>band*Math.abs(target))lastOutside=i;
 }
 metrics.peakAbsPu=peakAbs;metrics.residualOffsetPu=points.at(-1).y[index];
 let interval=null;
 if(tracking){
  metrics.overshootPercent=Math.max(0,points[peakIndex].y[index]/target-1)*100;
  if(Number.isFinite(steady)){
   metrics.steadyStateErrorPu=steady-target;
   metrics.steadyStateErrorPercent=Math.abs(steady-target)/Math.abs(target)*100;
   if(Math.abs(steady-target)<=band*Math.abs(target)&&lastOutside<points.length-1){
    interval=lastOutside<0?[0,0]:[points[lastOutside].t,points[lastOutside+1].t];
    // Conservative right endpoint, not a rounded/interpolated false early pass.
    metrics.settlingTimeSeconds=interval[1];
   }
  }
 }
 if(Object.values(metrics).some(v=>v!==null&&!Number.isFinite(v)))throw Error('响应指标数值溢出。');
 return {metrics,peakIndex,troughIndex,lastOutside,settlingIntervalSeconds:interval};
}

/** Sampled requested-target metrics. A finite steady reference is independently
 * supplied by the caller; this utility alone does not certify tail/refinement.
 * @returns {import('./gfl-analysis-contract.js').ChannelMetrics}
 */
export function measureTargetResponse(points,{outputIndex,targetDelta,steadyStateDelta}){
 return inspect(points,outputIndex,targetDelta,steadyStateDelta).metrics;
}

/** Preserve exact input points (including every mandatory metric neighbor).
 * If mandatory indices alone exceed the display budget, preserve them all.
 */
export function decimateResponse(points,keepIndices,maxDisplayPoints=600){
 if(!Number.isInteger(maxDisplayPoints)||maxDisplayPoints<2)throw Error('显示点数须为至少 2 的整数。');
 if(points.length<=maxDisplayPoints)return points.slice();
 const keep=new Set([0,points.length-1,...keepIndices.filter(i=>Number.isInteger(i)&&i>=0&&i<points.length)]);
 const available=points.length-keep.size,slots=Math.max(0,maxDisplayPoints-keep.size);
 let rank=0,selected=0;
 for(let i=0;i<points.length&&selected<slots;i++)if(!keep.has(i)){
  if(Math.floor((rank+1)*slots/available)>Math.floor(rank*slots/available)){keep.add(i);selected++;}rank++;
 }
 return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}

function validateMatrices({A,B,C,D,inputs,outputs}){
 const n=A?.length,m=inputs?.length,p=outputs?.length;
 const matrix=(value,rows,cols)=>Array.isArray(value)&&value.length===rows&&value.every(row=>Array.isArray(row)&&row.length===cols&&row.every(Number.isFinite));
 if(!(n>0&&m>0&&p>0)||!matrix(A,n,n)||!matrix(B,n,m)||!matrix(C,p,n)||!matrix(D,p,m))throw Error('响应矩阵维数或有限数检查失败。');
}
function responsePolicy(experiment,policy){
 const defaults=gflNumericalPolicy().response,provided=policy?.response??policy??{};
 const p={...defaults,...experiment.policy,...provided};
 // Experiment selection owns its explicit window; policy overrides cannot
 // silently replace the requested experiment's duration.
 p.windowSeconds=experiment.policy?.windowSeconds??null;
 if(p.id!==defaults.id)throw Error('未支持的响应数值策略。');
 assertGflSettlingDefinition(p);
 for(const key of ['slowRateWindowFactor','maxWindowSeconds','settlingBandFraction','settlingAbsoluteToleranceSeconds',
  'settlingRelativeTolerance','settlingBracketToleranceFraction','overshootTolerancePercentagePoints','tailRelativeTolerance','steadyStatePivotRelativeTolerance','steadyStateResidualTolerance','oscillationTailRelativeBound','oscillationPoleSeparationRelativeTolerance','oscillationExtremumRelativeTolerance'])
  if(!Number.isFinite(p[key])||p[key]<=0)throw Error('响应策略须为正有限数：'+key);
 for(const key of ['maxPoints','coarseBins','fineBins','samplingBlockSize','oscillationExtremumMaxIterations'])if(!Number.isInteger(p[key])||p[key]<1)throw Error('响应策略须为正整数：'+key);
 if(p.windowSeconds!==null&&(!Number.isFinite(p.windowSeconds)||p.windowSeconds<=0))throw Error('响应窗口须为正有限数或 null。');
 // The identity cannot silently collapse non-finite data or executable values.
 const data=v=>{if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return;
  if(!v||typeof v!=='object'||(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype))throw Error('响应策略须为有限 JSON 数据。');
  for(const child of Object.values(v))data(child);};
 data(p);return p;
}

/** Real Gaussian elimination, same 1e-13 scaled pivot guard as port-response.
 * Residual is a row-scaled normwise backward error in the original system:
 * |A*x-b| / (sum_j |A_ij| * ||x||inf + |b_i|). A row-relative
 * normwise scale avoids division by a roundoff-sized nominal-zero state.
 */
function equilibrium(A,b,p){
 const n=A.length,mat=A.map((row,i)=>[...row,b[i]]),scales=A.map(row=>Math.max(...row.map(Math.abs)));
 let minScaledPivot=Infinity;
 for(let k=0;k<n;k++){
  let pivot=k;
  for(let i=k+1;i<n;i++)if(scales[i]&&Math.abs(mat[i][k])/scales[i]>(scales[pivot]?Math.abs(mat[pivot][k])/scales[pivot]:-1))pivot=i;
  const ratio=scales[pivot]?Math.abs(mat[pivot][k])/scales[pivot]:0;minScaledPivot=Math.min(minScaledPivot,ratio);
  if(ratio<p.steadyStatePivotRelativeTolerance)return {status:'unavailable',reason:'singular-or-ill-conditioned',minScaledPivot,normalizedResidual:null,rowScaledResiduals:null};
  [mat[k],mat[pivot]]=[mat[pivot],mat[k]];[scales[k],scales[pivot]]=[scales[pivot],scales[k]];
  for(let i=k+1;i<n;i++){const factor=mat[i][k]/mat[k][k];for(let j=k+1;j<=n;j++)mat[i][j]-=factor*mat[k][j];mat[i][k]=0;}
 }
 const x=Array(n).fill(0);
 for(let i=n-1;i>=0;i--){let rhs=mat[i][n];for(let j=i+1;j<n;j++)rhs-=mat[i][j]*x[j];x[i]=rhs/mat[i][i];}
 if(x.some(v=>!Number.isFinite(v)))throw Error('稳态求解数值溢出。');
 const stateNorm=Math.max(...x.map(Math.abs));
 const rowScaledResiduals=A.map((row,i)=>{
  const numerator=Math.abs(dot(row,x)-b[i]),denominator=row.reduce((s,v)=>s+Math.abs(v)*stateNorm,Math.abs(b[i]));
  return denominator===0?(numerator===0?0:Infinity):numerator/denominator;
 });
 const normalizedResidual=Math.max(...rowScaledResiduals);
 if(!Number.isFinite(normalizedResidual)||normalizedResidual>p.steadyStateResidualTolerance)
  return {status:'failed',reason:'residual-exceeded',normalizedResidual,rowScaledResiduals,minScaledPivot};
 return {status:'verified',stateDelta:x,normalizedResidual,rowScaledResiduals,minScaledPivot};
}
function checkpoint(runtime){
 if(runtime.isCancelled?.())throw Object.assign(Error('响应计算已取消。'),{status:'cancelled'});
 if((runtime.now??(()=>performance.now()))()>=(runtime.deadlineMs??Infinity))throw Object.assign(Error('响应时间预算耗尽。'),{status:'budgetExceeded'});
}
/** Conservative active horizons for oscillatory sampling. For a simple pole,
 * the spectral-projector norm is bounded by the PRODUCT OF MATRIX NORMS
 * ||A-mu*I||inf / |lambda-mu|, not an evaluated polynomial or a reduced response.
 * Combined with ||C||inf ||x_ss||inf this bounds the transient mode amplitude.
 * Repeated/unseparated oscillatory poles receive no finite decay exemption.
 * Every pole still participates in full-state stability and propagation.
 */
function oscillatoryHorizons(model,poles,steady,amplitude,window,p){
 if(steady.status!=='verified')return []; // There is no finite settling claim.
 const oscillatory=poles.filter(z=>z.im!==0),stateNorm=Math.max(...steady.stateDelta.map(Math.abs)),outputNorm=Math.max(...model.C.map(row=>row.reduce((sum,v)=>sum+Math.abs(v),0)));
 return oscillatory.map(pole=>{
  let logBound=stateNorm===0||outputNorm===0?-Infinity:Math.log(stateNorm)+Math.log(outputNorm),separated=true;
  for(const other of poles){
   if(other===pole)continue;
   const distance=Math.hypot(pole.re-other.re,pole.im-other.im);
   // Existing eigenvalues are numerical: near-multiple roots must not grant a
   // falsely small mode envelope through an unreliable spectral separation.
   if(distance<=p.oscillationPoleSeparationRelativeTolerance*Math.max(1,Math.hypot(pole.re,pole.im),Math.hypot(other.re,other.im))){separated=false;break;}
   const norm=Math.max(...model.A.map((row,i)=>row.reduce((sum,v,j)=>sum+Math.hypot(v-(i===j?other.re:0),i===j?other.im:0),0)));
   logBound+=Math.log(norm)-Math.log(distance);
  }
  const cutoff=separated?Math.max(0,(logBound-Math.log(Math.abs(amplitude))-Math.log(p.oscillationTailRelativeBound/Math.max(1,oscillatory.length)))/(-pole.re)):window;
  return {pole,activeUntilSeconds:Math.min(window,cutoff),logAmplitudeBound:separated&&Number.isFinite(logBound)?logBound:null,
   boundStatus:separated?'projector-norm-bound':'unseparated-pole-no-decay-exemption'};
 });
}
function samplingPlan(window,poles,bins,p,horizons){
 const fast=Math.max(...poles.map(z=>Math.hypot(z.re,z.im)),1/window),segments=[];
 let start=0,end=Math.min(window,1/fast),requestedSamples=1;
 while(start<window){
  const omega=Math.max(0,...horizons.filter(mode=>start<mode.activeUntilSeconds).map(mode=>Math.abs(mode.pole.im)));
  // Preserve geometric segments but resolve every still-relevant oscillation
  // with at least the pass's 48/96 samples per period throughout each segment.
  const requiredBins=Math.max(bins,Math.ceil((end-start)*omega*bins/(2*Math.PI)));
  segments.push({start,end,requiredBins});requestedSamples+=requiredBins;
  start=end;end=Math.min(window,end*2);
 }
 const resolved=requestedSamples<=p.maxPoints;
 return {segments:segments.map(segment=>({...segment,bins:resolved?segment.requiredBins:bins})),requestedSamples,resolved};
}
function propagate(model,inputIndex,amplitude,window,poles,bins,p,runtime,progress,horizons){
 const {A,B,C,D}=model,n=A.length;
 const augmented=A.map((row,i)=>[...row,B[i][inputIndex]*amplitude]).concat([Array(n+1).fill(0)]);
 let state=Array(n+1).fill(0);state[n]=1;
 const output=()=>C.map((row,i)=>dot(row,state)+D[i][inputIndex]*amplitude);
 const points=[{t:0,y:output()}],states=[state.slice()],segments=[];
 const plan=samplingPlan(window,poles,bins,p,horizons);
 for(const {start,end,bins:segmentBins} of plan.segments){
  bins=segmentBins;
  checkpoint(runtime);
  if(points.length+bins>p.maxPoints)throw Object.assign(Error('响应采样点预算耗尽。'),{status:'budgetExceeded'});
  const dt=(end-start)/bins;
  if(!(dt>0)||!Number.isFinite(dt))throw Error('响应采样时间尺度无效。');
  const M=matrixExponential(augmented.map(row=>row.map(v=>v*dt)));
  const firstIndex=points.length-1;
  for(let j=1;j<=bins;j++){
   if((j-1)%p.samplingBlockSize===0)checkpoint(runtime);
   state=M.map(row=>dot(row,state));const y=output(),t=j===bins?end:start+j*dt;
   if(state.some(v=>!Number.isFinite(v))||y.some(v=>!Number.isFinite(v)))throw Error('响应传播数值溢出。');
   if(t<=points.at(-1).t)throw Error('响应采样时间分辨率不足。');
   points.push({t,y});states.push(state.slice());
  }
  segments.push({startSeconds:start,endSeconds:end,firstIndex,lastIndex:points.length-1,bins});
  runtime.onProgress?.({phase:'response',...progress,completedSeconds:end,windowSeconds:window,samples:points.length});
 }
 checkpoint(runtime);return {points,segments,states,augmented,oscillationRequestedSamples:plan.requestedSamples,oscillationResolved:plan.resolved};
}
// A narrow late excursion can fit between phase-resolved samples. Locate every
// later derivative sign-change extremum before choosing the final band crossing.
// Root samples are propagated by the same full augmented matrix exponential.
function refineLaterExtrema(sample,model,inputIndex,amplitude,targetIndex,steady,p,runtime){
 const {points,states,augmented,segments}=sample,measured=inspect(points,targetIndex,amplitude,steady,p.settlingBandFraction);
 if(!sample.oscillationResolved)return {resolved:false,added:0,maxDerivativeRelativeResidual:null};
 if(!measured.settlingIntervalSeconds)return {resolved:true,added:0,maxDerivativeRelativeResidual:0};
 const row=model.C[targetIndex],CA=model.A[0].map((_,j)=>row.reduce((sum,v,k)=>sum+v*model.A[k][j],0)),forcing=row.reduce((sum,v,k)=>sum+v*model.B[k][inputIndex]*amplitude,0);
 const derivative=state=>dot(CA,state)+forcing,extra=[];
 let maxResidual=0,resolved=true;
 for(let i=Math.max(0,measured.lastOutside);i<points.length-1;i++){
  if(i%p.samplingBlockSize===0)checkpoint(runtime);
  let dl=derivative(states[i]),dr=derivative(states[i+1]);
  if(!Number.isFinite(dl)||!Number.isFinite(dr))throw Error('响应极值导数非有限。');
  if(dl===0||dr===0||Math.sign(dl)===Math.sign(dr))continue;
  let lo=points[i].t,hi=points[i+1].t,root=null,residual=1,rootConverged=false;
  const scale=Math.max(Math.abs(dl),Math.abs(dr));
  for(let iteration=0;iteration<p.oscillationExtremumMaxIterations;iteration++){
   checkpoint(runtime);
   let t=lo+(hi-lo)*Math.abs(dl)/(Math.abs(dl)+Math.abs(dr));
   if(!(t>lo&&t<hi))t=(lo+hi)/2;
   const transition=matrixExponential(augmented.map(row=>row.map(v=>v*(t-points[i].t)))),state=transition.map(row=>dot(row,states[i]));
   const d=derivative(state);if(!Number.isFinite(d)||state.some(v=>!Number.isFinite(v)))throw Error('响应极值细化数值溢出。');
   residual=Math.abs(d)/scale;root={index:i,t,state};
   if(residual<=p.oscillationExtremumRelativeTolerance||hi-lo<=16*Number.EPSILON*Math.max(1,Math.abs(t))){rootConverged=true;break;}
   if(Math.sign(d)===Math.sign(dl)){lo=t;dl=d;}else{hi=t;dr=d;}
  }
  maxResidual=Math.max(maxResidual,residual);
  if(!root||!rootConverged){resolved=false;continue;}
  if(points.length+extra.length+1>p.maxPoints){resolved=false;break;}
  const y=model.C.map((row,k)=>dot(row,root.state)+model.D[k][inputIndex]*amplitude);
  if(y.some(v=>!Number.isFinite(v)))throw Error('响应极值输出非有限。');
  extra.push({...root,point:{t:root.t,y}});
 }
 for(const {index,point,state} of extra.reverse()){
  points.splice(index+1,0,point);states.splice(index+1,0,state);
  for(const segment of segments){if(segment.firstIndex>index)segment.firstIndex++;if(segment.lastIndex>index)segment.lastIndex++;}
 }
 return {resolved,added:extra.length,maxDerivativeRelativeResidual:maxResidual};
}
// Refine the last target crossing locally, preserving a conservative bracket.
// This prevents coarse/fine grid quantization alone from rejecting an otherwise
// converged trajectory. The original 48/96 segment samples are never replaced.
function refineCrossing(sample,model,inputIndex,amplitude,targetIndex,steady,p,runtime){
 const {points,states,augmented,segments}=sample;
 const inspected=inspect(points,targetIndex,amplitude,steady,p.settlingBandFraction),last=inspected.lastOutside;
 if(!inspected.settlingIntervalSeconds||last<0)return 0;
 const left=points[last].t,right=points[last+1].t,tolerance=Math.max(p.settlingAbsoluteToleranceSeconds,p.settlingRelativeTolerance*right);
 const bins=Math.max(1,Math.ceil((right-left)/(tolerance*p.settlingBracketToleranceFraction)));
 if(bins===1)return 0;
 if(points.length+bins-1>p.maxPoints)throw Object.assign(Error('交界细化采样预算耗尽。'),{status:'budgetExceeded'});
 checkpoint(runtime);
 const dt=(right-left)/bins,M=matrixExponential(augmented.map(row=>row.map(v=>v*dt))),extra=[],extraStates=[];
 let state=states[last].slice();
 for(let j=1;j<bins;j++){
  if((j-1)%p.samplingBlockSize===0)checkpoint(runtime);
  state=M.map(row=>dot(row,state));const y=model.C.map((row,i)=>dot(row,state)+model.D[i][inputIndex]*amplitude);
  if(state.some(v=>!Number.isFinite(v))||y.some(v=>!Number.isFinite(v)))throw Error('交界细化数值溢出。');
  extra.push({t:left+j*dt,y});extraStates.push(state.slice());
 }
 points.splice(last+1,0,...extra);states.splice(last+1,0,...extraStates);
 for(const segment of segments){if(segment.firstIndex>last)segment.firstIndex+=extra.length;if(segment.lastIndex>last)segment.lastIndex+=extra.length;}
 return extra.length;
}
const difference=(a,b)=>a===null||b===null?(a===b?0:null):Math.abs(a-b);

/** @returns {import('./gfl-analysis-contract.js').StepResponse}
 * points is the complete fine series used for metrics. Decimate only for display,
 * passing quality.keepIndices so displayed annotations remain actual samples.
 * experimentFingerprint is the resolved identity; the construction-stage source
 * identity remains in quality.sourceExperimentFingerprint. The evaluator must
 * use the resolved identity for its experiment/evaluation evidence.
 */
export function stateSpaceStepResponse(experiment,step,policy,runtime={}){
 const result={inputId:step?.inputId,targetOutputId:step?.targetOutputId,amplitudePu:step?.amplitudePu,
  experimentFingerprint:experiment?.experimentFingerprint??null,status:'numericalFailure',points:[],channels:[],quality:{sourceExperimentFingerprint:experiment?.experimentFingerprint??null}};
 try{
  checkpoint(runtime);const model=experiment.model;validateMatrices(model);
  const p=responsePolicy(experiment,policy),inputIndex=findPortIndex(model.inputs,step.inputId),targetIndex=findPortIndex(model.outputs,step.targetOutputId),amplitude=step.amplitudePu;
  if(!Number.isFinite(amplitude)||amplitude===0)throw Error('阶跃幅值须为非零有限数。');
  if(!experiment.steps.some(s=>s.inputId===step.inputId&&s.targetOutputId===step.targetOutputId&&s.amplitudePu===amplitude))throw Error('阶跃不属于此实验。');
  result.channels=model.outputs.map((port,i)=>({outputId:port.id,role:i===targetIndex?'tracking':experiment.steps.some(s=>s.targetOutputId===port.id)?'cross':'diagnostic',
   targetDelta:i===targetIndex?amplitude:0,steadyStateDelta:null,metrics:emptyMetrics()}));
  const stability=classifyDqPoles(model.A),required=stability.status==='stable'?p.slowRateWindowFactor/Math.min(...stability.poles.map(z=>-z.re)):null;
  let desired=p.windowSeconds,source='explicit';
  if(desired===null){
   if(required!==null){desired=required;source='stable-experiment';}
   else if(experiment.id==='current-reference-frozen-outer'&&p.outerStabilityStatus==='stable'&&Number.isFinite(p.resolvedOuterWindowSeconds)&&p.resolvedOuterWindowSeconds>0){desired=p.resolvedOuterWindowSeconds;source='stable-outer';}
   else source='unresolved';
  }
  const window=desired===null?null:Math.min(desired,p.maxWindowSeconds);
  result.quality={...result.quality,policy:p,stability,requestedWindowSeconds:p.windowSeconds,requiredWindowSeconds:required,resolvedWindowSeconds:window,windowSource:source,
   windowCapped:desired!==null&&desired>p.maxWindowSeconds,method:'augmented-state-space-scaling-squaring-taylor-exponential',
   steadyStateMethod:'scaled-partial-pivoting',steadyStateResidualDefinition:'max_i |(A*x-b)_i| / (sum_j |A_ij| * ||x||inf + |b_i|)',
   numericalCriteria:'inherited-engineering-policy; requires Gate 1; not physical accuracy',approximateDelay:model.delayRepresentation?.approximate===true,
   refined:false,coarseBins:p.coarseBins,fineBins:p.fineBins,steadyState:{status:'unavailable',reason:'non-asymptotically-stable-realization',normalizedResidual:null}};
  result.experimentFingerprint=gflFingerprint('experiment',{sourceExperimentFingerprint:experiment.experimentFingerprint,policy:p,
   requestedWindowSeconds:p.windowSeconds,resolvedWindowSeconds:window,windowSource:source});
  if(window===null){result.status='windowExceeded';result.quality.message='无稳定全系统窗口；请显式提供诊断窗口或稳定外环窗口。';return result;}
  checkpoint(runtime);
  if(stability.status==='stable'){
   result.quality.steadyState=equilibrium(model.A,model.B.map(row=>-row[inputIndex]*amplitude),p);
   if(result.quality.steadyState.status==='failed')throw Error('稳态方程残差超过已继承的矩阵恒等式容差。');
   if(result.quality.steadyState.status==='verified'){
    const ss=result.quality.steadyState.stateDelta;
    result.channels.forEach((channel,i)=>{const delta=dot(model.C[i],ss)+model.D[i][inputIndex]*amplitude;
     if(!Number.isFinite(delta))throw Error('稳态输出非有限。');channel.steadyStateDelta=delta;});
   }
  }
  const oscillatoryModes=oscillatoryHorizons(model,stability.poles,result.quality.steadyState,amplitude,window,p);
  const coarse=propagate(model,inputIndex,amplitude,window,stability.poles,p.coarseBins,p,runtime,{pass:'coarse',inputId:step.inputId},oscillatoryModes);
  const fine=propagate(model,inputIndex,amplitude,window,stability.poles,p.fineBins,p,runtime,{pass:'fine',inputId:step.inputId},oscillatoryModes);
  const coarseExtrema=refineLaterExtrema(coarse,model,inputIndex,amplitude,targetIndex,result.channels[targetIndex].steadyStateDelta,p,runtime),
   fineExtrema=refineLaterExtrema(fine,model,inputIndex,amplitude,targetIndex,result.channels[targetIndex].steadyStateDelta,p,runtime);
  const coarseAdded=refineCrossing(coarse,model,inputIndex,amplitude,targetIndex,result.channels[targetIndex].steadyStateDelta,p,runtime),
   fineAdded=refineCrossing(fine,model,inputIndex,amplitude,targetIndex,result.channels[targetIndex].steadyStateDelta,p,runtime);
  result.points=fine.points;
  const keep=new Set([0,fine.points.length-1]),details=[];
  let refined=p.fineBins>=2*p.coarseBins&&coarse.oscillationResolved&&fine.oscillationResolved&&coarseExtrema.resolved&&fineExtrema.resolved,tailConverged=true;
  result.channels.forEach((channel,i)=>{
   const a=inspect(coarse.points,i,channel.targetDelta,channel.steadyStateDelta,p.settlingBandFraction),b=inspect(fine.points,i,channel.targetDelta,channel.steadyStateDelta,p.settlingBandFraction);
   const extremaErrorPu=Math.max(Math.abs(coarse.points[a.peakIndex].y[i]-fine.points[b.peakIndex].y[i]),Math.abs(coarse.points[a.troughIndex].y[i]-fine.points[b.troughIndex].y[i]));
   const extremaErrorPercentagePoints=extremaErrorPu/Math.abs(amplitude)*100,overshootErrorPercentagePoints=difference(a.metrics.overshootPercent,b.metrics.overshootPercent),settlingErrorSeconds=difference(a.metrics.settlingTimeSeconds,b.metrics.settlingTimeSeconds);
   const settlingToleranceSeconds=Math.max(p.settlingAbsoluteToleranceSeconds,p.settlingRelativeTolerance*(b.metrics.settlingTimeSeconds??0));
   const channelRefined=extremaErrorPercentagePoints<=p.overshootTolerancePercentagePoints&&
    (channel.role!=='tracking'||(settlingErrorSeconds!==null&&settlingErrorSeconds<=settlingToleranceSeconds&&overshootErrorPercentagePoints!==null&&overshootErrorPercentagePoints<=p.overshootTolerancePercentagePoints));
   refined&&=channelRefined;
   const tailErrorRelative=channel.steadyStateDelta===null?null:Math.abs(fine.points.at(-1).y[i]-channel.steadyStateDelta)/Math.abs(amplitude);
   if([extremaErrorPu,extremaErrorPercentagePoints,overshootErrorPercentagePoints,settlingErrorSeconds,settlingToleranceSeconds,tailErrorRelative].some(v=>v!==null&&!Number.isFinite(v)))throw Error('响应质量误差数值溢出。');
   const tailStart=fine.segments.at(-1).firstIndex;
   const tailInsideTargetBand=channel.role==='tracking'&&fine.points.slice(tailStart).every(point=>Math.abs(point.y[i]-amplitude)<=p.settlingBandFraction*Math.abs(amplitude));
   // Require transient/steady consistency on every output, and a full final
   // segment inside the requested tracking band. Cross outputs have no zero-target division.
   if(tailErrorRelative===null||tailErrorRelative>p.tailRelativeTolerance||channel.role==='tracking'&&(!tailInsideTargetBand||b.metrics.settlingTimeSeconds===null))tailConverged=false;
   keep.add(b.peakIndex);keep.add(b.troughIndex);
   if(b.settlingIntervalSeconds){keep.add(Math.max(0,b.lastOutside));keep.add(Math.max(0,b.lastOutside+1));}
   const unit=model.outputs[i].unit??'pu',sampledPeakAbs=b.metrics.peakAbsPu,sampledResidualOffset=b.metrics.residualOffsetPu;
   channel.metrics=unit==='pu'?b.metrics:{...b.metrics,peakAbsPu:null,residualOffsetPu:null};
   details.push({outputId:channel.outputId,unit,sampledPeakAbs,sampledResidualOffset,extremaError:extremaErrorPu,extremaErrorPu:unit==='pu'?extremaErrorPu:null,extremaErrorPercentagePoints,overshootErrorPercentagePoints,settlingErrorSeconds,settlingToleranceSeconds,
    settlingIntervalSeconds:b.settlingIntervalSeconds,peakIndex:b.peakIndex,troughIndex:b.troughIndex,tailErrorRelative,tailInsideTargetBand,tailStartSeconds:fine.points[tailStart].t,refined:channelRefined});
  });
  result.quality={...result.quality,refined,tailConverged,oscillationSampling:{resolved:coarse.oscillationResolved&&fine.oscillationResolved&&coarseExtrema.resolved&&fineExtrema.resolved,coarseRequestedSamples:coarse.oscillationRequestedSamples,fineRequestedSamples:fine.oscillationRequestedSamples,modes:oscillatoryModes,tailRelativeBound:p.oscillationTailRelativeBound,extremaRefinement:{coarse:coarseExtrema,fine:fineExtrema}},coarseSamples:coarse.points.length,fineSamples:fine.points.length,settlingBoundaryRefinement:{coarseAdded,fineAdded,bracketToleranceFraction:p.settlingBracketToleranceFraction},segments:fine.segments,channels:details,
   keepIndices:[...keep].sort((a,b)=>a-b),keptPoints:[...keep].sort((a,b)=>a-b).map(index=>({index,point:fine.points[index]}))};
  result.status=!refined?'resolutionLimited':!tailConverged||result.quality.windowCapped?'windowExceeded':result.quality.approximateDelay?'approximateDelay':'completed';
  if(!['completed','approximateDelay'].includes(result.status))for(const channel of result.channels)channel.metrics.settlingTimeSeconds=null;
  checkpoint(runtime);return result;
 }catch(error){
  result.status=error.status??'numericalFailure';result.quality.message=error.message;result.quality.refined=false;
  for(const channel of result.channels)channel.metrics.settlingTimeSeconds=null;
  return result;
 }
}
