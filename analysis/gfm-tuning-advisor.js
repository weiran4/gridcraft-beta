/** GFM-specific candidate design using the EXISTING gfmResponse and dq model.
 * GFL contributes only numerical utilities/request conventions, never its plant.
 * Inner-loop steps freeze forming commands. Coupled poles are checked separately.
 */
import {gfmResponse,gfmPolynomials,validateGfmInput,validateGfmGains,loops} from './gfm-pi.js';
import {analyzeGfmMode} from './gfm-dynamics.js';
import {polyAdd as add,polyMul as mul,dcGain,poleStability} from './gfl-linear-model.js';
import {locateCrossings} from './gfl-linear-evaluation.js';
import {linearStepMetrics} from './gfl-step-metrics.js';
import {validateTuningRequest} from './gfl-model-input.js';
import {targetCheck} from './gfl-tuning-search.js';
import {isHurwitz} from './gfl-autotune.js';

export const policyId='gfm-tuning-advisor-v1';
export const gfmLoopLabels={d:'电流 d',q:'电流 q',P:'电压 d',Q:'电压 q'};
const grid=(a,b,n)=>Array.from({length:n},(_,i)=>a*(b/a)**(i/(n-1)));
const magnitude=z=>Math.hypot(z.re,z.im);
const unit=()=>Object.fromEntries(loops.map(k=>[k,{kp:1,ki:0}]));
const controller=g=>g.ki===0?{n:[g.kp],d:[1]}:{n:[g.ki,g.kp],d:[0,1]};
const positiveKeys=['ratedVA','voltageLL','frequencyHz','L','C','dcVoltage','fs'];
export function gfmFacts(input){
 for(const k of positiveKeys)if(!Number.isFinite(input[k])||input[k]<=0)throw Error(k+' 必须为正的有限数。');
 // Legacy helpers validate tuning goals even when evaluating a plant. These are
 // compatibility-only values and NEVER the requested or achieved crossovers.
 const p={...input,fi:input.fs/20,fv:input.fs/200,pm:60};validateGfmInput(p);
 for(const k of ['activePowerW','reactivePowerVar'])if(!Number.isFinite(p[k]))throw Error(k+' 必须是有限数。');
 return p;
}
export function validateGfmMode(mode,m){
 const names={droop:['mp','nq'],vsg:['h','d','nq','kv'],sync:['h','d','nq','ke']};
 if(!Object.hasOwn(names,mode))throw Error('未知 GFM 成网模式。');
 for(const k of names[mode])if(!Number.isFinite(m?.[k])||m[k]<=0)throw Error(k+' 必须为正的有限数。');
}
export function gfmLinearModels(input,g){
 const p=gfmFacts(input);validateGfmGains(g);if(p.delaySamples!==0)throw Error('纯延时不使用零延时阶跃模型。');
 const Z=p.voltageLL**2/p.ratedVA,Hi=[1,p.filterCurrentMs/1000],Hv=[1,p.filterVoltageMs/1000],Nc=[1,p.Rc*p.C],out={};
 const connected=p.considerScr!==false,Dp=connected?[1,p.C*(p.Rc+p.gridR),p.C*p.gridL]:[1],Np=mul(Nc,[p.gridR,p.gridL]);
 const A=connected?add(mul([p.R,p.L],Dp,Hv),mul([1-p.feedforwardVoltage,p.filterVoltageMs/1000],Np)):[p.R,p.L];
 for(const [i,v] of [['d','P'],['q','Q']]){
  const ci=controller(g[i]),cv=controller(g[v]),Ni=mul(ci.n,[Z],Dp,connected?Hv:[1]);
  const Di=add(mul(ci.d,Hi,A),Ni);
  out[i]={numerator:mul(Ni,Hi),denominator:Di};
  // Remove the known common passive Dp algebraically before building the
  // outer loop, not by tolerance-based pole cancellation.
  const Nv=connected?mul(ci.n,Hi,Hv,Np):mul(ci.n,Hi,Nc);
  const Dv=connected?add(Di,mul(ci.n,[Z*-p.feedforwardCurrent],Hi,Hv,Nc)):mul(Di,[0,p.C]);
  const No=mul(cv.n,Nv),Do=mul(cv.d,Dv,Hv);
  out[v]={numerator:mul(No,Hv),denominator:add(Do,No)};
 }
 return out;
}
function sweep(p,g,count=1401){
 const zs=loops.map(k=>g[k].kp>0?g[k].ki/g[k].kp/(2*Math.PI):0).filter(x=>x>0&&Number.isFinite(x));
 const min=Math.max(1e-12,Math.min(.00001,p.fs/1e6,...zs.map(f=>f/1000))),max=p.fs/2;
 const required=Math.max(count,Math.ceil(16*Math.log(max/min)*max*p.delaySamples/p.fs));
 const n=Math.min(24001,required),series=Object.fromEntries(loops.map(k=>[k,[]])),closedSeries=Object.fromEntries(loops.map(k=>[k,[]]));
 const last={},lastClosed={};
 for(const f of grid(min,max,n)){
  const z=gfmResponse(p,g,f);
  for(const k of loops)for(const [kind,dest,prev]of [['open',series,last],['closed',closedSeries,lastClosed]]){
   const a=z[kind][k];if(!Number.isFinite(a.re)||!Number.isFinite(a.im))throw Error('GFM 频率响应出现奇点或溢出。');
   let phase=Math.atan2(a.im,a.re)*180/Math.PI;
   if(prev[k]!==undefined){while(phase-prev[k]>180)phase-=360;while(phase-prev[k]<-180)phase+=360;}prev[k]=phase;
   dest[k].push({f,db:20*Math.log10(Math.max(1e-300,magnitude(a))),phase});
  }
 }
 return {min,max,series,closedSeries,count:n,status:required>n?'budgetExceeded':'ok'};
}
function bandwidth(points,gain){
 if(!Number.isFinite(gain)||gain===0)return {status:'undefinedDcGain',hz:null};
 const level=20*Math.log10(Math.abs(gain))-3.01029995664;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(a.db>=level&&b.db<level)return {status:'ok',hz:a.f*(b.f/a.f)**((level-a.db)/(b.db-a.db))};}
 return {status:'outsideScan',hz:null};
}
export function evaluateGfm(input,gains,mode,m,options={}){
 const p=gfmFacts(input);validateGfmGains(gains);validateGfmMode(mode,m);
 const scan=sweep(p,gains,options.count??1401),delayed=p.delaySamples!==0,models=delayed?null:gfmLinearModels(p,gains),out={};
 for(const k of loops){
  const pts=scan.series[k],xs=locateCrossings(pts,f=>gfmResponse(p,gains,f).open[k]);
  const nearTangency=pts.some((v,i)=>i>0&&i<pts.length-1&&Math.abs(v.db)<.03&&(v.db-pts[i-1].db)*(pts[i+1].db-v.db)<0);
  out[k]={crossings:xs,minMargin:xs.length?Math.min(...xs.map(x=>x.margin)):null,nearTangency,
   scanStatus:gains[k].ki>0&&pts[0].db<=0?'lowFrequencyUnresolved':scan.status,
   stability:models?poleStability(models[k].denominator):{status:'unverified'},
   bandwidth:bandwidth(scan.closedSeries[k],models?dcGain(models[k]):NaN),
   step:delayed?{status:'unsupportedDelay'}:options.includeStep===false?{status:'notRun'}:linearStepMetrics(models[k],{includePoints:false})};
 }
 const statuses=loops.map(k=>out[k].stability.status),scalarStatus=delayed?'unverified':statuses.includes('unstable')?'unstable':statuses.includes('marginal')?'marginal':statuses.includes('numericalFailure')?'numericalFailure':'stable';
 let coupled={status:'notIncluded',stable:null};
 if(p.considerScr!==false){
  if(options.includeCoupled===false)coupled={status:'notRun',stable:null};
  else try{const c=analyzeGfmMode(p,gains,mode,m);coupled={...c,status:c.stable?'stable':c.marginal?'marginal':'unstable'};}catch(error){coupled={status:'unverified',stable:null,message:error.message};}
 }
 return {mode,loops:out,scalarStability:{status:scalarStatus},coupled,
  verified:!delayed&&scalarStatus==='stable'&&(p.considerScr===false||coupled.stable===true),
  modelCoverage:delayed?'frequencyAndPadeOnly':p.considerScr===false?'localScalarOnly':'scalarAndSelectedDqMode',
  scan:{min:scan.min,max:scan.max,count:scan.count,status:scan.status},
  ...(options.includeSeries?{series:scan.series,closedSeries:scan.closedSeries}:{})};
}
export function checkGfmRequirements(e,request){
 const unmet=[];
 for(const k of loops){const l=e.loops[k],label=gfmLoopLabels[k];
  if(l.crossings.length!==1||l.nearTangency||l.scanStatus!=='ok')unmet.push(label+' 交越不唯一或扫频校核不足');
  if(!Number.isFinite(l.minMargin)||l.minMargin<request.minMargin-.005)unmet.push(label+' 相位裕度不足');
 }
 for(const [i,v]of [['d','P'],['q','Q']])if(e.loops[v].crossings[0]?.frequency>e.loops[i].crossings[0]?.frequency/request.separationRatio*1.0001)unmet.push(gfmLoopLabels[v]+' 不满足内/外环间隔');
 const target=targetCheck(e,request);unmet.push(...target.unmet.map(s=>s.replace(/^([dqPQ]) /,(_,k)=>gfmLoopLabels[k]+' ')));
 if(!e.verified)unmet.push(e.modelCoverage==='frequencyAndPadeOnly'?'含纯延时：仅频域及 Padé 近似，未完成精确时域/稳定性校核':'当前模式标量/耦合稳定性校核未全部通过');
 return {requirementsMet:unmet.length===0,targetStatus:unmet.length?'notSatisfied':target.targetStatus,unmet};
}
function diverse(items,n,target,preferredRatio=.2){
 const sorted=[...items].sort((a,b)=>b.frequency-a.frequency||b.ratio-a.ratio),out=[];
 const take=c=>{if(c&&!out.includes(c)&&out.length<n)out.push(c);};
 function near(f,r){const byF=[...items].sort((a,b)=>Math.abs(Math.log(a.frequency/f))-Math.abs(Math.log(b.frequency/f)));const at=byF[0]?.frequency;
  return byF.filter(a=>Math.abs(Math.log(a.frequency/at))<.0001).sort((a,b)=>Math.abs(Math.log(a.ratio/r))-Math.abs(Math.log(b.ratio/r)))[0];}
 if(target){take(near(target,preferredRatio));take(near(target,.05));}
 for(const x of [1,.5,.25,.1,.03]){const f=sorted[0]?.frequency*x;take(near(f,preferredRatio));take(near(f,preferredRatio===.2?.05:.2));}
 for(const c of sorted)take(c);return out;
}
export function searchGfmCandidates(input,rawRequest={},baselineGains=null,mode='droop',m={},options={}){
 const started=performance.now(),checked=validateTuningRequest(rawRequest),request=checked.request;
 const r={policyId,mode,request,candidates:[],diagnostics:[],rejections:{},targetStatus:'notSpecified',searchStatus:'notRun',budget:{evaluations:0,maxEvaluations:options.maxEvaluations??18000,maxMilliseconds:options.maxMilliseconds??25000}};
 const note=(code,message)=>r.diagnostics.push({code,severity:'info',message});
 if(!checked.valid)return {...r,searchStatus:'invalidRequest',diagnostics:checked.errors.map(e=>({...e,code:'invalid-target',severity:'error'}))};
 let p;try{p=gfmFacts(input);validateGfmMode(mode,m);}catch(error){return {...r,searchStatus:'invalidInput',diagnostics:[{code:'invalid-model',severity:'error',message:error.message}]};}
 const min=request.mode==='target'?Math.min(.01,request.fi/50,request.fp/50):.01,max=p.fs/10;
 const ratios=[...new Set([...grid(.0001,10,16),.05,.2,5])].sort((a,b)=>a-b);
 r.searchRange={minimumHz:min,maximumInnerHz:max,zeroRatios:ratios,globallyOptimal:false};
 const all=[],reject=code=>r.rejections[code]=(r.rejections[code]??0)+1;
 const tick=()=>{if(options.isCancelled?.())throw Error('cancelled');if(++r.budget.evaluations>r.budget.maxEvaluations||performance.now()-started>r.budget.maxMilliseconds)throw Error('budgetExceeded');if(r.budget.evaluations%200===0)options.onProgress?.({evaluations:r.budget.evaluations,phase:'GFM PI / 耦合校核'});};
 function screen(k,known,cap){
  if(cap<=min)return [];
  const desired=request.mode==='target'?(k==='d'?request.fi:request.fp):null;
  const anchors=[desired,desired?desired*(1-request.tolerance):null,k==='d'?request.minimumFi:request.minimumFp];
  const frequencies=[...new Set([...grid(min,cap,32),...anchors.filter(x=>Number.isFinite(x)&&x>=min&&x<=cap)])];
  const trial={...known,[k]:{kp:1,ki:0}},points=[];let last;
  for(const f of grid(Math.max(1e-12,min/1e4),p.fs/2,601)){
   const z=gfmResponse(p,trial,f).open[k];let phase=Math.atan2(z.im,z.re)*180/Math.PI;
   if(last!==undefined){while(phase-last>180)phase-=360;while(phase-last<-180)phase+=360;}last=phase;points.push({f,mag:magnitude(z),phase});
  }
  const survivors=[];
  for(const f of frequencies){const plant=gfmResponse(p,trial,f).open[k];for(const ratio of ratios){tick();
   const kp=1/(magnitude(plant)*Math.hypot(1,ratio)),ki=kp*ratio*2*Math.PI*f,gain={kp,ki};if(![kp,ki].every(x=>Number.isFinite(x)&&x>0)){reject('numeric');continue;}
   let previous=null;const xs=[];
   for(const a of points){const db=20*Math.log10(a.mag*Math.hypot(kp,ki/(2*Math.PI*a.f))),phase=a.phase-Math.atan2(ki,2*Math.PI*a.f*kp)*180/Math.PI;
    if(previous&&previous.db*db<=0){const t=-previous.db/(db-previous.db);xs.push({frequency:previous.f*(a.f/previous.f)**t,margin:180+previous.phase+t*(phase-previous.phase)});}previous={f:a.f,db,phase};}
   if(xs.length!==1){reject('multiple-or-missing-crossovers');continue;}if(xs[0].margin<request.minMargin-.015){reject('phase-margin');continue;}
   const g={...known,[k]:gain};if(k==='d')g.q={...gain};if(k==='P')g.Q={...gain};
   if(p.delaySamples===0&&!isHurwitz(gfmPolynomials(p,g)[k])){reject('scalar-poles');continue;}
   survivors.push({frequency:f,ratio,margin:xs[0].margin,gain});
  }}return survivors;
 }
 function assemble(g,isBaseline=false){
  tick();let e;
  try{e=evaluateGfm(p,g,mode,m,{includeStep:false,includeCoupled:false,count:2001});}catch{reject('numeric');return;}
  if(loops.some(k=>e.loops[k].crossings.length!==1||e.loops[k].minMargin<request.minMargin-.005||e.loops[k].scanStatus!=='ok'||e.loops[k].nearTangency)){reject('dense-frequency');return;}
  if(p.delaySamples===0&&e.scalarStability.status!=='stable'){reject('scalar-poles');return;}
  if(['P','Q'].some(k=>e.loops[k].crossings[0].frequency>e.loops[k==='P'?'d':'q'].crossings[0].frequency/request.separationRatio*1.0001)){reject('separation');return;}
  const second=sweep(p,g,3201);
  for(const k of loops){const xs=locateCrossings(second.series[k],f=>gfmResponse(p,g,f).open[k]);if(xs.length!==1||Math.abs(xs[0].frequency/e.loops[k].crossings[0].frequency-1)>.002){reject('frequency-resolution');return;}}
  if(p.considerScr!==false){try{const c=analyzeGfmMode(p,g,mode,m);e.coupled={...c,status:c.stable?'stable':'unstable'};}catch(error){reject('coupled-unverified');return;}if(!e.coupled.stable){reject('coupled-unstable');return;}}
  for(const k of loops)e.loops[k].step=linearStepIf(k,g);
  e.verified=p.delaySamples===0&&e.scalarStability.status==='stable'&&(p.considerScr===false||e.coupled.stable===true);
  if(p.delaySamples===0&&loops.some(k=>e.loops[k].step.status!=='ok')){reject('step-unresolved');return;}
  const status=checkGfmRequirements(e,request);
  all.push({id:isBaseline?'baseline':`gfm-candidate-${all.length+1}`,mode,gains:structuredClone(g),evaluation:e,verified:e.verified,isBaseline,...status,
   speed:p.delaySamples===0?Math.max(...loops.map(k=>e.loops[k].step.settlingTimeSeconds)):Infinity,
   overshoot:p.delaySamples===0?Math.max(...loops.map(k=>e.loops[k].step.overshootPercent)):Infinity,
   minMargin:Math.min(...loops.map(k=>e.loops[k].minMargin))});
 }
 function linearStepIf(k,g){return p.delaySamples!==0?{status:'unsupportedDelay'}:linearStepMetrics(gfmLinearModels(p,g)[k],{includePoints:false});}
 try{
  const known=unit(),inners=diverse(screen('d',known,max),10,request.mode==='target'?request.fi:null);
  for(const i of inners){tick();const g={...known,d:i.gain,q:{...i.gain}},outer=diverse(screen('P',g,i.frequency/request.separationRatio),14,request.mode==='target'?request.fp:null,(p.considerScr===false||p.feedforwardCurrent===1)?.2:5);
   // Keep every selected voltage shape through the coupled-mode check; the
   // fastest scalar loop need not stabilize Droop/VSG/Synchronverter.
   for(const v of outer)assemble({...g,P:v.gain,Q:{...v.gain}});
  }
  if(baselineGains)try{validateGfmGains(baselineGains);assemble(baselineGains,true);}catch(error){if(['budgetExceeded','cancelled'].includes(error.message))throw error;note('baseline-unverified','当前 PI 未完成比较校核，但不阻止新候选搜索。');}
  r.searchStatus=all.some(c=>c.requirementsMet)?'feasibleFound':all.length?'targetNotMet':'noCandidateFound';
 }catch(error){r.searchStatus=['budgetExceeded','cancelled'].includes(error.message)?error.message:'numericalFailure';if(r.searchStatus==='numericalFailure')note('numerical-failure',error.message);}
 let pool=all.filter(c=>c.requirementsMet);if(!pool.length)pool=all;
 if(request.mode==='target'&&pool.some(c=>c.targetStatus==='satisfied'))pool=pool.filter(c=>c.targetStatus==='satisfied');
 let front=pool.filter(a=>!pool.some(b=>a!==b&&b.speed<=a.speed&&b.overshoot<=a.overshoot&&b.minMargin>=a.minMargin&&(b.speed<a.speed||b.overshoot<a.overshoot||b.minMargin>a.minMargin)));
 const fastest=Math.max(1e-12,Math.min(...front.map(c=>c.speed))),o=Math.max(1,...front.map(c=>Number.isFinite(c.overshoot)?c.overshoot:1));
 // Log-relative settling cost avoids a very slow outlier making all useful
 // settling times numerically indistinguishable in the balanced score.
 const score=c=>Math.log1p(c.speed/fastest)+c.overshoot/o+Math.max(0,request.preferredMargin-c.minMargin)/request.preferredMargin;
 front.sort((a,b)=>request.focus==='tracking'?a.speed-b.speed||a.overshoot-b.overshoot:score(a)-score(b));
 const chosen=[];const take=c=>{if(c&&!chosen.includes(c)&&chosen.length<3)chosen.push(c);};take(front[0]);take([...front].sort((a,b)=>a.speed-b.speed)[0]);take([...front].sort((a,b)=>a.overshoot-b.overshoot||a.speed-b.speed)[0]);for(const c of front)take(c);
 r.candidates=chosen;r.targetStatus=r.candidates.some(c=>c.targetStatus==='satisfied')?'satisfied':r.candidates.some(c=>c.targetStatus==='partiallySatisfied')?'partiallySatisfied':r.searchStatus==='feasibleFound'&&request.mode==='automatic'?'notSpecified':'notSatisfied';
 if(['budgetExceeded','cancelled','numericalFailure'].includes(r.searchStatus)){r.candidates.forEach(c=>c.incompleteSearch=true);r.targetStatus='notSatisfied';}
 r.budget.elapsedMilliseconds=performance.now()-started;r.budget.completedCandidates=all.length;
 note('model-scope','电压 d/q 外环不是 GFL 的 P/Vdc、Q/Vac 外环；阶跃指标固定成网指令，所选成网模式另作 dq 耦合极点校核。');
 note('fixed-facts','仅搜索 PI；成网参数、RLC、DC 电压、前馈、滤波、控制周期与延时保持原值。');
 if(p.considerScr===false)note('local-only','SCR 未启用：只校核本地标量 Lf/RC，不代表真实并网成网稳定性。');
 if(p.delaySamples!==0)note('delay-scope','纯延时保留精确频域响应与一阶 Padé 耦合极点参考；未完成精确时域验证，不提供可直接应用的推荐。');
 if(r.searchStatus==='targetNotMet')note('target-not-met','当前模型、约束和有限搜索范围内未找到满足全部要求的候选；备选只供比较，不等于全局不可能。');
 return r;
}
