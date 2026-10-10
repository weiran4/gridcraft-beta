/** Coupled-response ordering for an already bounded scalar seed pool.
 * Scalar margins are seed constraints, never coupled performance objectives.
 */
export const rankingPolicyId='gfl-mainline-ranking-v1';
const groups=['satisfied','reduced','unmet'];
const byId=(a,b)=>{
 const left=Array.from(a.id),right=Array.from(b.id);
 for(let i=0;i<Math.min(left.length,right.length);i++){const difference=left[i].codePointAt(0)-right[i].codePointAt(0);if(difference)return difference;}
 return left.length-right.length;
};
const metrics=c=>c.mainlineEvaluation.performance;
const finitePerformance=c=>['T','O','E'].every(k=>Number.isFinite(metrics(c)?.[k])&&metrics(c)[k]>=0);
const verified=c=>{
 const e=c?.mainlineEvaluation;
 return typeof c?.id==='string'&&e?.solveStatus==='completed'&&e.stability?.status==='stable'&&e.responseQuality==='completed'&&!e.model?.delayRepresentation?.approximate&&finitePerformance(c);
};
const pareto=items=>items.filter(a=>!items.some(b=>a!==b&&metrics(b).T<=metrics(a).T&&metrics(b).O<=metrics(a).O&&(metrics(b).T<metrics(a).T||metrics(b).O<metrics(a).O)));

/** @returns {{ordered:object[],fronts:Record<string,object[]>,diagnostics:object,rankingPolicyId:string}} */
export function rankGflMainlineCandidates(candidates,request={}){
 const eligible=Object.fromEntries(groups.map(g=>[g,[]])),fronts=Object.fromEntries(groups.map(g=>[g,[]])),
  diagnostics={assessed:candidates.length,qualified:0,unmet:0,rejected:0,unverified:0,incomplete:0,unauthorizedReduced:0,dominated:0,groups:{}};
 for(const c of candidates){
  const e=c?.mainlineEvaluation;
  if(e?.solveStatus==='completed'&&['unstable','marginal'].includes(e.stability?.status)){diagnostics.rejected++;continue;}
  if(!verified(c)){diagnostics.unverified++;continue;}
  if(c.incompleteSearch){diagnostics.incomplete++;continue;}
  const group=c.mainlineEvaluation.targetResult?.group;
  if(group==='reduced'&&request.allowReduction!==true){diagnostics.unauthorizedReduced++;continue;}
  if(!groups.includes(group)||group!=='unmet'&&c.mainlineEvaluation.application?.eligible!==true){diagnostics.unverified++;continue;}
  eligible[group].push(c);if(group==='unmet')diagnostics.unmet++;else diagnostics.qualified++;
 }
 const ordered=[];
 for(const group of groups){
  const members=eligible[group],maxT=Math.max(0,...members.map(c=>metrics(c).T)),maxO=Math.max(1,...members.map(c=>metrics(c).O)),front=pareto(members);
  // Denominators include dominated finite members in this same group.
  const score=c=>.5*((maxT===0?0:metrics(c).T/maxT)+metrics(c).O/maxO);
  front.sort((a,b)=>request.focus==='tracking'?
   metrics(a).T-metrics(b).T||metrics(a).O-metrics(b).O||metrics(a).E-metrics(b).E||byId(a,b):
   score(a)-score(b)||metrics(a).E-metrics(b).E||byId(a,b));
  fronts[group]=front;ordered.push(...front);diagnostics.dominated+=members.length-front.length;
  diagnostics.groups[group]={eligible:members.length,front:front.length,maxT,maxO};
 }
 return {ordered,fronts,diagnostics,rankingPolicyId};
}
