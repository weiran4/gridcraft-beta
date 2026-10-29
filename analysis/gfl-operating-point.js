/** Mode-driven high-voltage equilibrium. Inputs and project remain immutable. */
import {gflDqOperatingPoint} from './gfl-dq-model.js';
import {sealDesign} from '../project/design-snapshot.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export function solveOperatingPoint(snapshot){
 const p=structuredClone(snapshot.resolvedModel.input),r=snapshot.requirements;
 const fail=(status,message)=>({status,point:null,residuals:null,capability:null,diagnostics:[message]});
 try{
  if(snapshot.implementation.operatingBias!=='initialized-equilibrium')return fail('unsupported','当前仅支持声明固定平衡偏置的增量实现；未替零偏置实现补偏置。');
  if(r.pointPolicy==='mode-reference'&&p.qMode==='Vac'){
   if(!(r.vacRefPu>0))return fail('conflict','Vac 模式必须明确 VacRef');
   const Z=p.voltageLL**2/p.ratedVA,R=p.gridROhm/Z,X=p.gridXOhm/Z,P=p.activePowerW/p.ratedVA,V=r.vacRefPu,E=p.gridVoltagePu??1;
   const a=R*R+X*X,b=-2*V*V*X,c=V**4-2*V*V*R*P+a*P*P-E*E*V*V,disc=b*b-4*a*c;
   if(disc<0||a<=0)return fail('infeasible','指定 P/Vac 无实数无功解');
   const roots=[(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)];
   const candidates=roots.map(Q=>{try{const point=gflDqOperatingPoint({...p,reactivePowerVar:Q*p.ratedVA});return Math.abs(point.V-V)<1e-7?point:null;}catch{return null;}}).filter(Boolean).sort((a,b)=>Math.abs(a.Q)-Math.abs(b.Q));
   if(!candidates.length)return fail('infeasible','给定 Vac 不在支持的高电压支路');
   p.reactivePowerVar=candidates[0].Q*p.ratedVA;
  }
  if(r.lockedQVar!==null&&Math.abs(p.reactivePowerVar-r.lockedQVar)>1e-6*p.ratedVA)return fail('conflict','锁定 Q 与当前工作点给定冲突');
  const point=gflDqOperatingPoint(p),pdcW=point.bridgePower*p.ratedVA;
  if(r.pdcW!==null&&Math.abs(r.pdcW-pdcW)>1e-6*p.ratedVA)return fail('conflict','本策略指定 AC 运行 P 并反求 Pdc；独立 Pdc 与功率平衡不一致');
  const check=(actual,limit)=>({actual,limit,status:limit===null?'unknown':actual<=limit?'passed':'failed'});
  const capability={current:check(point.bridgeCurrentPu,r.limits.currentPu),modulation:check(point.modulation,r.limits.modulation)};
  if(Object.hasOwn(r.limits,'gridCurrentPu'))capability.gridCurrent=check(Math.hypot(...point.ig),r.limits.gridCurrentPu);
  if(Object.hasOwn(r.limits,'qAxisCurrentPu'))capability.qAxisCurrent=check(Math.abs(point.il[1]),r.limits.qAxisCurrentPu);
  const residuals={powerPu:Math.abs(point.bridgePower-point.P-point.losses),sourceVoltagePu:Math.abs(Math.hypot(...point.eg)-point.E),referencePu:p.qMode==='Vac'&&r.pointPolicy==='mode-reference'?Math.abs(point.V-r.vacRefPu):0};
  if(Object.values(residuals).some(v=>!Number.isFinite(v)||v>1e-7))return fail('numericalFailure','稳态残差未通过');
  return {status:'solved',point:{...point,pdcW},residuals,capability,finalSnapshot:sealDesign({...snapshot,resolvedModel:{...snapshot.resolvedModel,input:p}}),diagnostics:[r.pointPolicy==='historical-pq'?'历史 PQ 工作点；Vac 参考取实际工作电压':'按模式指定量求解；AC 运行 P 为设计输入，Pdc 由损耗平衡确定']};
 }catch(error){return fail(error.code==='operatingPointFailure'?'infeasible':'numericalFailure',error.message);}
}
