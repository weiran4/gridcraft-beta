/** Bounded beam search, not a globally optimal tuner. No input/project mutation. */
import {loopResponse} from './gfl-frequency.js';
import {closedLoopPolynomials,isHurwitz} from './gfl-autotune.js';
import {modelFacts,validateModelFacts,validateTuningRequest} from './gfl-model-input.js';
import {gflLinearModels} from './gfl-linear-model.js';
import {evaluateGfl} from './gfl-linear-evaluation.js';
import {linearStepMetrics} from './gfl-step-metrics.js';
import {diagnoseGfl} from './gfl-tuning-diagnostics.js';
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
function pareto(items){return items.filter(a=>!items.some(b=>a!==b&&b.speed<=a.speed&&b.overshoot<=a.overshoot&&b.minMargin>=a.minMargin&&(b.speed<a.speed||b.overshoot<a.overshoot||b.minMargin>a.minMargin)));}
export function searchGflCandidates(input,rawRequest={},baselineGains=null,options={}){
 const started=performance.now(),check=validateTuningRequest(rawRequest),request=check.request;
 const result={policyId,policyVersion:1,inputStatus:'valid',searchStatus:'notRun',targetStatus:'notSpecified',request,candidates:[],probes:[],rejections:{},diagnostics:[],budget:{evaluations:0,maxEvaluations:options.maxEvaluations??18000,maxMilliseconds:options.maxMilliseconds??25000},searchRange:null};
 if(!check.valid)return {...result,searchStatus:'invalidRequest',diagnostics:check.errors.map(e=>({code:'invalid-target',severity:'error',...e}))};
 try{validateModelFacts(input);}catch(error){return {...result,inputStatus:'invalid',searchStatus:'notRun',diagnostics:[{code:'invalid-model',severity:'error',message:error.message}]};}
 const p=modelFacts(input),maxFrequency=p.fs/10,minFrequency=request.mode==='target'?Math.min(.01,request.fi/50,request.fp/50):.01;
 result.searchRange={minimumHz:minFrequency,maximumInnerHz:maxFrequency,zeroRatio:[.01,10],beamWidth:options.maxInner??8,globallyOptimal:false};
 const ratios=[...new Set([...logGrid(.01,10,13),.05,.2,5])].sort((a,b)=>a-b),cache=new Map(),all=[];
 const reject=reason=>result.rejections[reason]=(result.rejections[reason]||0)+1;
 const tick=()=>{result.budget.evaluations++;if(options.isCancelled?.())throw Error('cancelled');if(result.budget.evaluations>result.budget.maxEvaluations||performance.now()-started>result.budget.maxMilliseconds)throw Error('budgetExceeded');if(result.budget.evaluations%200===0)options.onProgress?.({evaluations:result.budget.evaluations,phase:'search'});};
 let baselineEvaluation=null;
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
  tick();const evaluation=evaluateGfl(p,g,{count:2001});
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
  all.push({id:isBaseline?'baseline':`candidate-${all.length+1}`,isBaseline,gains:structuredClone(g),evaluation,verified,requirementsMet:verified&&tc.accepted,targetStatus:verified?tc.targetStatus:'notSatisfied',unmet:verified?tc.unmet:[...tc.unmet,'延时模型未完成稳定性/时域验证'],speed,overshoot,minMargin});
 }
 try{
  const initial=unit(),inner=screen('d',initial,maxFrequency),beam=diverse(inner,options.maxInner??8,request.mode==='target'?request.fi:null);
  const probe=inner.find(x=>Math.abs(x.frequency-50)<1e-9&&Math.abs(x.zeroRatio-.05)<1e-10);if(probe&&!beam.includes(probe))beam.push(probe);
  for(const i of beam){tick();const g={...initial,d:i.gain,q:i.gain},cap=i.frequency/request.separationRatio;
   const best={};for(const k of ['P','Q']){
    const choices=diverse(screen(k,g,cap),10,request.mode==='target'?request.fp:null).map(x=>{const gg={...g,[k]:x.gain},step=stepFor(k,gg);return {...x,step};}).filter(x=>p.delaySamples!==0||x.step.status==='ok');
    // Target-near and time-efficient shapes both survive the outer beam.
    choices.sort((a,b)=>{if(request.mode==='target'){const da=Math.abs(Math.log(a.frequency/request.fp)),db=Math.abs(Math.log(b.frequency/request.fp));if(Math.abs(da-db)>.05)return da-db;}return p.delaySamples!==0?b.margin-a.margin:(a.step.settlingTimeSeconds*(1+a.step.overshootPercent/100))-(b.step.settlingTimeSeconds*(1+b.step.overshootPercent/100));});
    best[k]=choices.slice(0,2);
   }
   for(const d of best.P)for(const q of best.Q)assemble({...g,P:d.gain,Q:q.gain});
  }
  if(baselineGains){baselineEvaluation=evaluateGfl(p,baselineGains);assemble(baselineGains,true);}
  result.searchStatus=all.length?(!all.some(c=>c.requirementsMet)&&(request.mode==='target'||request.maxOvershootPercent!==null||request.maxSettlingSeconds!==null)?'targetNotMet':'feasibleFound'):'noCandidateFound';
 }catch(error){result.searchStatus=['cancelled','budgetExceeded'].includes(error.message)?error.message:'numericalFailure';if(result.searchStatus==='numericalFailure')result.diagnostics.push({code:'search-failure',severity:'error',message:error.message});}
 let pool=all.filter(c=>c.requirementsMet);if(!pool.length)pool=all;
 // Exact crossover goals precede optional reductions, before Pareto selection.
 if(request.mode==='target'&&pool.some(c=>c.targetStatus==='satisfied'))pool=pool.filter(c=>c.targetStatus==='satisfied');
 let front=pool.every(c=>Number.isFinite(c.speed))?pareto(pool):pool;
 const score=c=>{const t=Math.max(...front.map(v=>Number.isFinite(v.speed)?v.speed:1)),o=Math.max(1,...front.map(v=>Number.isFinite(v.overshoot)?v.overshoot:1)),m=Math.max(...front.map(v=>v.minMargin),request.preferredMargin);return Number.isFinite(c.speed)?c.speed/t+c.overshoot/o+(m-c.minMargin)/m:1/c.minMargin;};
 front.sort((a,b)=>request.focus==='tracking'?(a.speed-b.speed||a.overshoot-b.overshoot):score(a)-score(b));
 const selected=[];const take=c=>{if(c&&!selected.includes(c)&&selected.length<3)selected.push(c);};take(front[0]);take([...front].sort((a,b)=>a.speed-b.speed)[0]);take([...front].sort((a,b)=>a.overshoot-b.overshoot||b.minMargin-a.minMargin)[0]);for(const c of front)take(c);
 result.candidates=selected;result.targetStatus=selected.some(c=>c.targetStatus==='satisfied')?'satisfied':selected.some(c=>c.targetStatus==='partiallySatisfied')?'partiallySatisfied':request.mode==='automatic'&&request.maxOvershootPercent===null&&request.maxSettlingSeconds===null?'notSpecified':selected.some(c=>c.requirementsMet)?'satisfied':'notSatisfied';
 if(['budgetExceeded','cancelled','numericalFailure'].includes(result.searchStatus)){result.candidates.forEach(c=>{c.incompleteSearch=true;});result.targetStatus='notSatisfied';}
 result.budget.elapsedMilliseconds=performance.now()-started;result.budget.completedCandidates=all.length;
 result.diagnostics.push(...diagnoseGfl(input,request,baselineEvaluation,result));
 return result;
}
