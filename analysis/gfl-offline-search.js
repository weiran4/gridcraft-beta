/** Bounded deterministic multi-start coordinate search guided by complete poles. */
import {evaluateOfflineDesign} from './gfl-offline-evaluation.js';
import {validateGains} from './gfl-frequency.js';
const axes=['d','q','P','Q'],tags=axes.flatMap(k=>['kp','ki'].map(f=>k+'.'+f));
const clone=x=>structuredClone(x);
export function searchOfflineDesign(snapshot,request={},runtime={}){
 const now=runtime.now??(()=>performance.now()),start=now(),budgetMs=request.maxMilliseconds??10000,maxEvaluations=request.maxEvaluations??900;
 if(![10000,25000].includes(budgetMs)||!Number.isInteger(maxEvaluations)||maxEvaluations<1||maxEvaluations>10000)throw Error('搜索预算无效');
 const initial=clone(request.initialGains);validateGains(initial);
 const locks=new Set(request.locks??[]);if([...locks].some(k=>!tags.includes(k)))throw Error('未知锁定项');
 const bounds=Object.fromEntries(tags.map(tag=>{const f=tag.split('.')[1],v=request.bounds?.[tag]??(f==='kp'?[.005,20]:[.01,3000]);if(v.length!==2||v.some(x=>!Number.isFinite(x))||v[0]<=0||v[1]<v[0])throw Error('搜索边界无效');return [tag,v];}));
 if(request.symmetricDq&&['kp','ki'].some(f=>locks.has('d.'+f)!==locks.has('q.'+f)||locks.has('d.'+f)&&initial.d[f]!==initial.q[f]))throw Error('d/q 对称约束与锁定项冲突');
 if(request.symmetricDq)for(const f of ['kp','ki']){const lo=Math.max(bounds['d.'+f][0],bounds['q.'+f][0]),hi=Math.min(bounds['d.'+f][1],bounds['q.'+f][1]);if(lo>hi)throw Error('d/q 对称搜索边界无交集');bounds['d.'+f]=bounds['q.'+f]=[lo,hi];}
 let evaluations=0,stop=null,seed=request.seed??1701;const tried=new Set(),ranked=[];
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;};
 const normalize=g=>{g=clone(g);for(const tag of tags){const [k,f]=tag.split('.'),[lo,hi]=bounds[tag];g[k][f]=locks.has(tag)?initial[k][f]:Math.min(hi,Math.max(lo,g[k][f]));}if(request.symmetricDq)g.q=clone(g.d);return g;};
 const interrupted=()=>{if(runtime.isCancelled?.())stop='cancelled';else if(now()-start>=budgetMs)stop='budgetExceeded';else if(evaluations>=Math.max(1,maxEvaluations-5))stop='evaluationLimit';return !!stop;};
 const score=a=>a.stability.status==='notEvaluated'?1e9:a.stability.status!=='stable'?1e5+Math.max(0,a.stability.alpha):Math.max(-50,a.stability.alpha);
 function probe(g){if(interrupted())return null;g=normalize(g);const key=JSON.stringify(g);if(tried.has(key))return null;tried.add(key);evaluations++;
  const assessment=evaluateOfflineDesign({snapshot,gains:g},{frequency:false,isCancelled:runtime.isCancelled,deadlineMs:start+budgetMs,now});
  const item={gains:g,assessment,score:score(assessment)};ranked.push(item);runtime.onProgress?.({evaluations,maxEvaluations,bestAlpha:ranked.reduce((b,x)=>Math.min(b,x.assessment.stability.alpha??Infinity),Infinity)});return item;
 }
 probe(initial);
 for(const scale of [.25,.5,2,4,8])probe(Object.fromEntries(axes.map(k=>[k,{kp:initial[k].kp*scale,ki:initial[k].ki*scale}])));
 for(let n=0;n<18&&!interrupted();n++)probe(Object.fromEntries(axes.map(k=>[k,Object.fromEntries(['kp','ki'].map(f=>{const [lo,hi]=bounds[k+'.'+f];return [f,lo*(hi/lo)**rand()];}))])));
 const starts=[...ranked].sort((a,b)=>a.score-b.score).slice(0,5);
 for(let best of starts){for(const factor of [3,1.7,1.2]){let improved=true,round=0;while(improved&&round++<4&&!interrupted()){improved=false;for(const tag of tags){if(locks.has(tag)||request.symmetricDq&&tag.startsWith('q.'))continue;const [k,f]=tag.split('.');for(const multiplier of [factor,1/factor]){const g=clone(best.gains);g[k][f]*=multiplier;const item=probe(g);if(item&&item.score<best.score){best=item;improved=true;}}}}}}
 const selected=[],unique=new Set();
 for(const item of ranked.sort((a,b)=>a.score-b.score)){
  if(unique.has(JSON.stringify(item.gains)))continue;unique.add(JSON.stringify(item.gains));
  if(selected.length===5||runtime.isCancelled?.())break;
  if(now()-start>=budgetMs||evaluations>=maxEvaluations){selected.push({gains:item.gains,assessment:item.assessment,screeningOnly:true});continue;}
  evaluations++;
  const assessment=evaluateOfflineDesign({snapshot,gains:item.gains,policy:{frequencyPoints:161}},{deadlineMs:start+budgetMs,now,isCancelled:runtime.isCancelled});
  selected.push({gains:item.gains,assessment});
 }
 selected.sort((a,b)=>{const rank=x=>x.assessment.violations.length?2:x.assessment.eligibility==='recommended'?0:1;return rank(a)-rank(b)||(a.assessment.frequencyChecks.peak?Math.max(...a.assessment.frequencyChecks.peak):Infinity)-(b.assessment.frequencyChecks.peak?Math.max(...b.assessment.frequencyChecks.peak):Infinity);});
 return {status:stop==='cancelled'?'cancelled':now()-start>=budgetMs?'budgetExceeded':selected.some(x=>x.assessment.stability.status==='stable')?'stableCandidatesFound':'noCandidateFound',candidates:selected,budget:{evaluations,maxEvaluations,milliseconds:now()-start,maxMilliseconds:budgetMs,termination:stop??'local-search-complete'},coverage:{scope:'bounded multi-start search; not global infeasibility proof',seed:request.seed??1701,bounds,locks:[...locks],symmetricDq:!!request.symmetricDq},screenedBest:ranked[0]?{gains:ranked[0].gains,alpha:ranked[0].assessment.stability.alpha}:null};
}
