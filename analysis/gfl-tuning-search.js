/** Bounded beam search, not a globally optimal tuner. No input/project mutation. */
import {gflDqModel,dqDefaults} from './gfl-dq-model.js';
import {analyzeGflDq} from './gfl-dq-analysis.js';
import {loopResponse} from './gfl-frequency.js';
import {closedLoopPolynomials,isHurwitz} from './gfl-autotune.js';
import {modelFacts,validateModelFacts,validateTuningRequest} from './gfl-model-input.js';
import {gflLinearModels} from './gfl-linear-model.js';
import {evaluateGfl} from './gfl-linear-evaluation.js';
import {linearStepMetrics} from './gfl-step-metrics.js';
import {diagnoseGfl} from './gfl-tuning-diagnostics.js';
import {evaluateGflMainline} from './gfl-mainline-evaluation.js';
import {rankGflMainlineCandidates,rankingPolicyId} from './gfl-mainline-ranking.js';
import {gflFingerprint} from './gfl-analysis-contract.js';
export const policyId='gfl-tuning-advisor-v1';
const keys=['d','q','P','Q'],logGrid=(a,b,n)=>Array.from({length:n},(_,i)=>a*(b/a)**(i/(n-1)));
const unit=()=>Object.fromEntries(keys.map(k=>[k,{kp:1,ki:0}]));
const gainAt=(z,f,r)=>{const kp=1/(Math.hypot(z.re,z.im)*Math.hypot(1,r));return {kp,ki:kp*r*2*Math.PI*f};};
export function targetCheck(e,request){
 const unmet=[];let exact=true,accepted=true;
 for(const k of keys){const l=e.loops[k],fc=l.crossings[0]?.frequency,desired=k==='d'||k==='q'?request.fi:request.fp,min=k==='d'||k==='q'?request.minimumFi:request.minimumFp;
  if(request.mode==='target'){
   const onTarget=fc>=desired*(1-request.tolerance)-1e-8&&fc<=desired*(1+request.tolerance)+1e-8;
   const lower=request.allowReduction?(min??.000000001):desired*(1-request.tolerance);
   if(!onTarget)exact=false;if(!(fc>=lower-1e-8&&fc<=desired*(1+request.tolerance)+1e-8)){accepted=false;unmet.push(`${k} 交越未在允许范围内`);}
  }
  for(const [setting,metric,label]of [['maxOvershootPercent','overshootPercent','超调'],['maxSettlingSeconds','settlingTimeSeconds','稳定时间']])if(request[setting]!==null){
   if(l.step.status!=='ok'||!Number.isFinite(l.step[metric])){accepted=false;unmet.push(`${k} ${label}未完成评估`);}
   else if(l.step[metric]>request[setting]){accepted=false;unmet.push(`${k} ${label}超限`);}
  }
 }
 return {accepted,unmet,targetStatus:!accepted?'notSatisfied':request.mode==='automatic'?'notSpecified':exact?'satisfied':'partiallySatisfied'};
}
function diverse(items,limit,target=null){
 if(items.length<=limit)return items;
 const out=[],take=x=>{if(x&&!out.includes(x)&&out.length<limit)out.push(x);};
 if(target)take([...items].sort((a,b)=>Math.abs(Math.log(a.frequency/target))-Math.abs(Math.log(b.frequency/target))||b.gain.ki-a.gain.ki)[0]);
 const max=Math.max(...items.map(x=>x.frequency));
 for(const fraction of [1,.5,.25,.125,.0625]){
  const sorted=[...items].sort((a,b)=>Math.abs(Math.log(a.frequency/(max*fraction)))-Math.abs(Math.log(b.frequency/(max*fraction)))||b.gain.ki-a.gain.ki);
  take(sorted[0]);const nearby=sorted.filter(x=>Math.abs(Math.log(x.frequency/sorted[0].frequency))<.01);take(nearby.sort((a,b)=>b.margin-a.margin)[0]);
 }
 for(const x of [...items].sort((a,b)=>b.frequency-a.frequency))take(x);
 return out;
}
const boundedLimit=(value,maximum,integer=false)=>{const n=typeof value==='number'&&!Number.isNaN(value)?value:maximum;return Math.min(maximum,Math.max(0,integer?Math.floor(n):n));};
function pareto(items){return items.filter(a=>!items.some(b=>a!==b&&b.speed<=a.speed&&b.overshoot<=a.overshoot&&b.minMargin>=a.minMargin&&(b.speed<a.speed||b.overshoot<a.overshoot||b.minMargin>a.minMargin)));}
export function searchGflCandidates(input,rawRequest={},baselineGains=null,options={}){
 const mainline=options.snapshot?.modelId!==undefined&&options.snapshot.modelId!=='legacy-scalar',now=mainline?(options.runtime?.now??(()=>performance.now())):(()=>performance.now()),started=now();
 const check=validateTuningRequest(mainline?rawRequest:Object.fromEntries(Object.entries(rawRequest??{}).filter(([k])=>!['maxSteadyStateErrorPercent','currentTargets','crossAxisLimits'].includes(k)))),request=check.request;
 const result={policyId,policyVersion:1,inputStatus:'valid',searchStatus:'notRun',targetStatus:'notSpecified',request,candidates:[],probes:[],rejections:{},diagnostics:[],budget:{evaluations:0,maxEvaluations:mainline?boundedLimit(options.maxEvaluations,18000,true):options.maxEvaluations??18000,maxMilliseconds:mainline?boundedLimit(options.maxMilliseconds,25000):options.maxMilliseconds??25000},searchRange:null};
 if(!check.valid)return {...result,searchStatus:'invalidRequest',diagnostics:check.errors.map(e=>({code:'invalid-target',severity:'error',...e}))};
 try{validateModelFacts(input);}catch(error){return {...result,inputStatus:'invalid',searchStatus:'notRun',diagnostics:[{code:'invalid-model',severity:'error',message:error.message}]};}
 const dqSettings={...dqDefaults,...options.dqSettings};
 const isCancelled=()=>!!(options.runtime?.isCancelled?.()||options.isCancelled?.()),onProgress=event=>{options.runtime?.onProgress?.(event);if(options.onProgress!==options.runtime?.onProgress)options.onProgress?.(event);};
 const requestedDeadline=options.runtime?.deadlineMs,deadline=typeof requestedDeadline==='number'&&!Number.isNaN(requestedDeadline)?requestedDeadline:Infinity;
 const runtime={now,deadlineMs:Math.min(deadline,started+result.budget.maxMilliseconds),isCancelled,onProgress,cache:options.runtime?.cache??new Map()};
 if(mainline){
  result.rankingPolicyId=rankingPolicyId;result.modelId=options.snapshot.modelId;result.diagnosticCandidates=[];result.budget.maxCoupledEvaluations=boundedLimit(options.maxDqEvaluations,64,true);
  result.mainlineScreening={evaluated:0,accepted:0,rejected:0,unverified:0,maxEvaluations:result.budget.maxCoupledEvaluations,scope:'one shared selected-model evaluation per canonical PI seed'};
 }
 result.dqScreening={enabled:!mainline&&dqSettings.enabled,evaluated:0,accepted:0,rejected:0,unverified:0,maxEvaluations:options.maxDqEvaluations??64,configuration:dqSettings,scope:'dq-constrained scalar search; scalar performance ranking; no MIMO optimization or robustness guarantee'};
 if(!mainline&&dqSettings.enabled){
  try{
   gflDqModel(input,unit(),dqSettings); // Validate topology/settings once before the expensive scalar search.
   if(input.delaySamples!==0)throw Error('非零延时仅有 Padé 近似；不能生成已完成 PLL/dq 校核的推荐候选。');
  }catch(error){return {...result,diagnostics:[{code:'dq-unavailable',severity:'error',message:error.message}]};}
 }
 const p=modelFacts(input),maxFrequency=p.fs/10,minFrequency=request.mode==='target'?Math.min(.01,request.fi/50,request.fp/50):.01;
 result.searchRange={...(mainline?{scope:'scalar-seed'}:{}),minimumHz:minFrequency,maximumInnerHz:maxFrequency,zeroRatio:[.01,10],beamWidth:options.maxInner??8,globallyOptimal:false};
 const ratios=[...new Set([...logGrid(.01,10,13),.05,.2,5])].sort((a,b)=>a-b),cache=new Map(),all=[];
 const reject=reason=>result.rejections[reason]=(result.rejections[reason]||0)+1;
 const checkpoint=()=>{if(isCancelled())throw Error('cancelled');if(now()>=runtime.deadlineMs)throw Error('budgetExceeded');};
 const tick=()=>{
  if(mainline){checkpoint();if(result.budget.evaluations>=result.budget.maxEvaluations)throw Error('budgetExceeded');result.budget.evaluations++;if(result.budget.evaluations%200===0)onProgress({evaluations:result.budget.evaluations,phase:'search'});return;}
  result.budget.evaluations++;if(options.isCancelled?.())throw Error('cancelled');if(result.budget.evaluations>result.budget.maxEvaluations||performance.now()-started>result.budget.maxMilliseconds)throw Error('budgetExceeded');if(result.budget.evaluations%200===0)options.onProgress?.({evaluations:result.budget.evaluations,phase:'search'});
 };
 let baselineEvaluation=null;const seen=new Set();
 function assembleMainline(g,isBaseline){
  const id=gflFingerprint('candidate',{gains:Object.fromEntries(keys.map(k=>[k,{kp:g[k].kp,ki:g[k].ki}]))});
  if(seen.has(id))return;seen.add(id);checkpoint();
  if(result.mainlineScreening.evaluated>=result.budget.maxCoupledEvaluations)throw Error('budgetExceeded');
  result.mainlineScreening.evaluated++;result.budget.coupledEvaluations=result.mainlineScreening.evaluated;
  onProgress({phase:'coupled-evaluation',evaluations:result.budget.evaluations,coupledEvaluations:result.mainlineScreening.evaluated});
  const e=evaluateGflMainline({snapshot:options.snapshot,gains:g,experiments:options.experiments,policy:options.policy,request},runtime),scalar=e.scalarDiagnostics;
  const tagSeed=e=>({...e,scope:'scalar-seed',scan:{...e.scan,scope:'scalar-seed'},loops:Object.fromEntries(keys.map(k=>[k,{...e.loops[k],scope:'scalar-seed',crossings:e.loops[k].crossings.map(c=>({...c,scope:'scalar-seed'}))}]))});
  const evaluation=scalar?{...tagSeed(scalar),refinement:tagSeed(scalar.refinement)}:null;
  if(isBaseline)baselineEvaluation=evaluation;
  const verified=e.solveStatus==='completed'&&e.stability.status==='stable'&&e.responseQuality==='completed'&&!e.model?.delayRepresentation?.approximate,requirementsMet=verified&&e.application.eligible;
  const candidate={id,isBaseline,gains:structuredClone(g),mainlineEvaluation:e,evaluation,verified,requirementsMet,targetStatus:requirementsMet?(e.targetResult.group==='reduced'?'partiallySatisfied':request.mode==='automatic'?'notSpecified':'satisfied'):'notSatisfied',unmet:e.targetResult.unmet,speed:e.performance.T,overshoot:e.performance.O,minMargin:scalar?Math.min(...keys.map(k=>scalar.loops[k].minMargin)):null,diagnosticOnly:!requirementsMet};
  all.push(candidate);
  if(requirementsMet)result.mainlineScreening.accepted++;
  else if(e.solveStatus==='completed'&&['unstable','marginal'].includes(e.stability.status)){result.mainlineScreening.rejected++;reject('mainline-'+e.stability.status);}
  else if(!verified){result.mainlineScreening.unverified++;reject('mainline-'+e.solveStatus+'-'+e.responseQuality);}else{result.mainlineScreening.rejected++;reject('mainline-target-unmet');}
  if(!requirementsMet)result.diagnosticCandidates.push(candidate);
  if(e.solveStatus!=='completed'){
   result.diagnostics.push(...e.diagnostics.map(d=>({...d,candidateId:id})));
   // A local numerical outcome does not exhaust the bounded pool. Keep its
   // diagnostic evidence and continue independent seeds under the same budget.
   if(e.solveStatus==='numericalFailure')checkpoint();
   else throw Object.assign(Error(e.solveStatus),{code:e.solveStatus});
  }
 }
 function screen(k,known,cap){
  if(cap<minFrequency)return [];
  const desired=request.mode==='target'?(k==='d'||k==='q'?request.fi:request.fp):null;
  const fs=[...new Set([...logGrid(minFrequency,cap,30),...[desired,desired?desired*(1-request.tolerance):null,k==='d'?50:null,k==='d'?request.minimumFi:request.minimumFp].filter(f=>f>=minFrequency&&f<=cap)])].sort((a,b)=>a-b);
  const trial={...known,[k]:{kp:1,ki:0}},grid=logGrid(Math.max(1e-12,minFrequency*.0001),p.fs/2,481),pts=[];let last;
  for(const f of grid){const z=loopResponse(p,trial,f).open[k];let phase=Math.atan2(z.im,z.re)*180/Math.PI;
   if(last!==undefined){while(phase-last>180)phase-=360;while(phase-last< -180)phase+=360;}last=phase;pts.push({f,z,phase});}
  const survivors=[];
  for(const f of fs){const plant=loopResponse(p,trial,f).open[k];for(const r of ratios){tick();const gain=gainAt(plant,f,r);
   if(!Number.isFinite(gain.kp)||!Number.isFinite(gain.ki)||gain.kp<=0||gain.ki<=0){reject('numeric');continue;}
   const points=pts.map(v=>({f:v.f,db:20*Math.log10(Math.hypot(v.z.re,v.z.im)*Math.hypot(gain.kp,gain.ki/(2*Math.PI*v.f))),phase:v.phase-Math.atan2(gain.ki,2*Math.PI*v.f*gain.kp)*180/Math.PI}));
   const xs=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(a.db*b.db<=0){const t=-a.db/(b.db-a.db);xs.push({frequency:a.f*(b.f/a.f)**t,margin:180+a.phase+t*(b.phase-a.phase)});}}
   const reason=xs.length!==1?'multiple-or-missing-crossovers':xs[0].margin<request.minMargin-.015?'phase-margin':points[0].db<=0?'unresolved-low-frequency':null;
   const probe=k==='d'&&Math.abs(f-50)<1e-9&&Math.abs(r-.05)<1e-10;
   if(reason){reject(reason);if(probe)result.probes.push({frequency:f,zeroRatio:r,screened:false,reason});continue;}
   const g={...known,[k]:gain};if(k==='d')g.q=gain;
   if(p.delaySamples===0&&!isHurwitz(closedLoopPolynomials(p,g)[k])){reject('unstable-polynomial');if(probe)result.probes.push({frequency:f,zeroRatio:r,screened:false,reason:'unstable-polynomial'});continue;}
   const item={frequency:f,zeroRatio:r,margin:xs[0].margin,gain};survivors.push(item);if(probe)result.probes.push({...item,screened:true});
  }}
  return survivors;
 }
 function stepFor(k,g){
  if(p.delaySamples!==0)return {status:'unsupportedDelay',points:[]};
  const token=JSON.stringify([k,g[k],g[k==='P'?'d':k==='Q'?'q':k]]);
  if(!cache.has(token))cache.set(token,linearStepMetrics(gflLinearModels(p,g)[k],{includePoints:false}));return cache.get(token);
 }
 function assemble(g,isBaseline=false){
  tick();if(mainline)return assembleMainline(g,isBaseline);const evaluation=evaluateGfl(p,g,{count:2001});
  if(keys.some(k=>evaluation.loops[k].crossings.length!==1||evaluation.loops[k].scanStatus!=='ok'||evaluation.loops[k].minMargin<request.minMargin-.005||evaluation.loops[k].nearTangency)){reject('dense-frequency-validation');return;}
  // Repeat at a different grid density so narrow resonance crossings cannot be
  // accepted solely because the candidate was constructed on the first grid.
  const second=evaluateGfl(p,g,{count:3201});
  if(keys.some(k=>second.loops[k].crossings.length!==1||Math.abs(second.loops[k].crossings[0].frequency/evaluation.loops[k].crossings[0].frequency-1)>.002)){reject('frequency-resolution');return;}
  if(p.delaySamples===0&&evaluation.stability.status!=='stable'){reject('pole-verification');return;}
  if(evaluation.loops.P.crossings[0].frequency>evaluation.loops.d.crossings[0].frequency/request.separationRatio*1.0001||evaluation.loops.Q.crossings[0].frequency>evaluation.loops.q.crossings[0].frequency/request.separationRatio*1.0001){reject('cascade-separation');return;}
  for(const k of keys)evaluation.loops[k].step=stepFor(k,g);
  const verified=evaluation.stability.status==='stable'&&keys.every(k=>evaluation.loops[k].step.status==='ok'),tc=targetCheck(evaluation,request);
  if(p.delaySamples===0&&!verified){reject('step-unresolved');return;}
  const speed=verified?Math.max(...keys.map(k=>evaluation.loops[k].step.settlingTimeSeconds)):Infinity,overshoot=verified?Math.max(...keys.map(k=>evaluation.loops[k].step.overshootPercent)):Infinity,minMargin=Math.min(...keys.map(k=>evaluation.loops[k].minMargin));
  let dqVerification=null;
  if(!mainline&&dqSettings.enabled){
   if(result.dqScreening.evaluated>=result.dqScreening.maxEvaluations)throw Error('budgetExceeded');
   tick();result.dqScreening.evaluated++;
   options.onProgress?.({evaluations:result.budget.evaluations,phase:'PLL/dq 联立筛选',dqEvaluations:result.dqScreening.evaluated});
   try{
    const dq=analyzeGflDq(p,g,dqSettings,{includeSeries:false});
    dqVerification={status:dq.applicationEligible?'stable':dq.poleStatus,alpha:dq.alpha,version:dq.model.version,configuration:{...dqSettings}};
    if(!dq.applicationEligible){result.dqScreening.rejected++;reject('dq-'+dq.poleStatus);return;}
   }catch(error){result.dqScreening.unverified++;reject('dq-unverified');if(!result.diagnostics.some(d=>d.code==='dq-unverified'))result.diagnostics.push({code:'dq-unverified',severity:'warning',message:'部分候选的联立计算未完成，不能视为不稳定：'+error.message});return;}
   result.dqScreening.accepted++;
  }
  all.push({dqVerification,id:isBaseline?'baseline':`candidate-${all.length+1}`,isBaseline,gains:structuredClone(g),evaluation,verified,requirementsMet:verified&&tc.accepted,targetStatus:verified?tc.targetStatus:'notSatisfied',unmet:verified?tc.unmet:[...tc.unmet,'延时模型未完成稳定性/时域验证'],speed,overshoot,minMargin});
 }
 try{
  const initial=unit(),inner=screen('d',initial,maxFrequency),beam=diverse(inner,options.maxInner??8,request.mode==='target'?request.fi:null);
  const probe=inner.find(x=>Math.abs(x.frequency-50)<1e-9&&Math.abs(x.zeroRatio-.05)<1e-10);if(probe&&!beam.includes(probe))beam.push(probe);
  for(const i of beam){tick();const g={...initial,d:i.gain,q:i.gain},cap=i.frequency/request.separationRatio;
   const best={};for(const k of ['P','Q']){
    const choices=diverse(screen(k,g,cap),10,request.mode==='target'?request.fp:null).map(x=>{const gg={...g,[k]:x.gain},step=stepFor(k,gg);return {...x,step};}).filter(x=>mainline||p.delaySamples!==0||x.step.status==='ok');
    // Target-near and time-efficient shapes both survive the outer beam.
    choices.sort((a,b)=>{if(request.mode==='target'){const da=Math.abs(Math.log(a.frequency/request.fp)),db=Math.abs(Math.log(b.frequency/request.fp));if(Math.abs(da-db)>.05)return da-db;}if(!mainline)return p.delaySamples!==0?b.margin-a.margin:(a.step.settlingTimeSeconds*(1+a.step.overshootPercent/100))-(b.step.settlingTimeSeconds*(1+b.step.overshootPercent/100));const cost=x=>x.step.status==='ok'?x.step.settlingTimeSeconds*(1+x.step.overshootPercent/100):Infinity;return p.delaySamples!==0?b.margin-a.margin:cost(a)-cost(b)||b.margin-a.margin;});
    best[k]=choices.slice(0,2);
   }
   for(const d of best.P)for(const q of best.Q)assemble({...g,P:d.gain,Q:q.gain});
  }
  if(baselineGains){if(!mainline)baselineEvaluation=evaluateGfl(p,baselineGains);assemble(baselineGains,true);}
  result.searchStatus=all.length?(!all.some(c=>c.requirementsMet)&&(request.mode==='target'||request.maxOvershootPercent!==null||request.maxSettlingSeconds!==null)?'targetNotMet':'feasibleFound'):'noCandidateFound';
 }catch(error){result.searchStatus=(mainline&&error.code)||(['cancelled','budgetExceeded'].includes(error.message)?error.message:'numericalFailure');if(result.searchStatus==='numericalFailure')result.diagnostics.push({code:'search-failure',severity:'error',message:error.message});}
 if(mainline){
  const ranking=rankGflMainlineCandidates(all,request);result.ranking={fronts:ranking.fronts,diagnostics:ranking.diagnostics,rankingPolicyId:ranking.rankingPolicyId};
  result.candidates=ranking.ordered.slice(0,3);
  if(!['cancelled','budgetExceeded','unsupported','invalidInput','operatingPointFailure','numericalFailure'].includes(result.searchStatus))result.searchStatus=ranking.diagnostics.qualified?'feasibleFound':all.some(c=>c.verified)?'targetNotMet':'noCandidateFound';
  result.targetStatus=result.candidates.some(c=>c.requirementsMet&&c.mainlineEvaluation.targetResult.group==='satisfied')?(request.mode==='automatic'&&request.maxOvershootPercent===null&&request.maxSettlingSeconds===null&&request.maxSteadyStateErrorPercent===null&&!request.currentTargets&&!request.crossAxisLimits?'notSpecified':'satisfied'):result.candidates.some(c=>c.requirementsMet&&c.mainlineEvaluation.targetResult.group==='reduced')?'partiallySatisfied':'notSatisfied';
  const complete=['feasibleFound','targetNotMet','noCandidateFound'].includes(result.searchStatus);
  result.completionScope={complete,scope:'bounded scalar-seed pool evaluated by the selected coupled model',globallyOptimal:false};
  if(!complete){
   for(const c of all){
    c.incompleteSearch=true;c.diagnosticOnly=true;c.requirementsMet=false;c.targetStatus='notSatisfied';
    c.mainlineEvaluation={...c.mainlineEvaluation,application:{eligible:false,reasons:[...c.mainlineEvaluation.application.reasons,'本次有界搜索未完成，候选仅供诊断。']}};
    if(!result.diagnosticCandidates.includes(c))result.diagnosticCandidates.push(c);
   }
   // Retain selected partial records for diagnosis, never in a qualified front.
   const diagnosticRanking=rankGflMainlineCandidates(all,request);result.ranking={fronts:diagnosticRanking.fronts,diagnostics:diagnosticRanking.diagnostics,rankingPolicyId};
   result.targetStatus='notSatisfied';
  }
  result.probes=result.probes.map(probe=>({...probe,scope:'scalar-seed'}));
  result.budget.coupledEvaluations=result.mainlineScreening.evaluated;result.budget.elapsedMilliseconds=now()-started;result.budget.completedCandidates=all.filter(c=>c.mainlineEvaluation.solveStatus==='completed').length;
  result.diagnostics.push(...diagnoseGfl(input,request,baselineEvaluation,result));return result;
 }
 let pool=all.filter(c=>c.requirementsMet);if(!pool.length)pool=all;
 // Exact crossover goals precede optional reductions, before Pareto selection.
 if(request.mode==='target'&&pool.some(c=>c.targetStatus==='satisfied'))pool=pool.filter(c=>c.targetStatus==='satisfied');
 let front=pool.every(c=>Number.isFinite(c.speed))?pareto(pool):pool;
 const score=c=>{const t=Math.max(...front.map(v=>Number.isFinite(v.speed)?v.speed:1)),o=Math.max(1,...front.map(v=>Number.isFinite(v.overshoot)?v.overshoot:1)),m=Math.max(...front.map(v=>v.minMargin),request.preferredMargin);return Number.isFinite(c.speed)?c.speed/t+c.overshoot/o+(m-c.minMargin)/m:1/c.minMargin;};
 front.sort((a,b)=>request.focus==='tracking'?(a.speed-b.speed||a.overshoot-b.overshoot):score(a)-score(b));
 const selected=[];const take=c=>{if(c&&!selected.includes(c)&&selected.length<3)selected.push(c);};take(front[0]);take([...front].sort((a,b)=>a.speed-b.speed)[0]);take([...front].sort((a,b)=>a.overshoot-b.overshoot||b.minMargin-a.minMargin)[0]);for(const c of front)take(c);
 result.candidates=selected;result.targetStatus=selected.some(c=>c.targetStatus==='satisfied')?'satisfied':selected.some(c=>c.targetStatus==='partiallySatisfied')?'partiallySatisfied':request.mode==='automatic'&&request.maxOvershootPercent===null&&request.maxSettlingSeconds===null?'notSpecified':selected.some(c=>c.requirementsMet)?'satisfied':'notSatisfied';
 if(['budgetExceeded','cancelled','numericalFailure'].includes(result.searchStatus)){result.candidates.forEach(c=>{c.incompleteSearch=true;});result.targetStatus='notSatisfied';}
 if(dqSettings.enabled&&result.searchStatus==='budgetExceeded')result.diagnostics.push({code:'dq-budget',severity:'warning',message:'搜索预算耗尽；未评估部分不代表不稳定，不能据此认定无可行解。'});
 result.budget.elapsedMilliseconds=performance.now()-started;result.budget.completedCandidates=all.length;
 result.diagnostics.push(...diagnoseGfl(input,request,baselineEvaluation,result));
 return result;
}
