/** Pure analytical strategy: no trajectory or step-response dependencies. */
import {solveOperatingPoint} from './gfl-operating-point.js';
import {gflDqModel} from './gfl-dq-model.js';
import {classifyDqPoles} from './gfl-dq-analysis.js';
import {frequencyMatrix} from './port-response.js';
import {evaluateGfl} from './gfl-linear-evaluation.js';
import {gflFingerprint} from './gfl-analysis-contract.js';
export const offlinePolicyId='gfl-offline-design-v1';
export function evaluateOfflineDesign({snapshot,gains,policy={}},runtime={}){
 const result={policyId:offlinePolicyId,identity:gflFingerprint('offline-assessment',{snapshot,gains,policy}),solveStatus:'notEvaluated',stability:{status:'notEvaluated',alpha:null},frequencyChecks:{status:'notEvaluated'},scenarioCoverage:{evaluated:0,total:1},pending:[],violations:[],eligibility:'incomplete',assumptions:[snapshot.implementation.operatingBias,snapshot.implementation.dcPort,'balanced averaged continuous model; no saturation or current limit dynamics']};
 const checkpoint=()=>{if(runtime.isCancelled?.())throw Error('cancelled');if(runtime.deadlineMs!==undefined&&(runtime.now??(()=>performance.now()))()>=runtime.deadlineMs)throw Error('budgetExceeded');};
 try{
  checkpoint();const op=solveOperatingPoint(snapshot);result.operatingPoint=op;result.physicalChecks=op.capability;
  if(op.status!=='solved'){result.solveStatus=op.status;result.eligibility=op.status==='infeasible'?'infeasible':op.status==='unsupported'?'unsupported':'incomplete';return result;}
  const s=op.finalSnapshot,p=s.resolvedModel.input,a=s.resolvedModel.analysis,i=s.implementation,t=s.requirements.targets;
  if(i.dcPort!=='constant-input-power'||i.actuator!=='ideal-voltage-command'||i.piForm!=='parallel'){result.solveStatus='unsupported';result.eligibility='unsupported';return result;}
  const m=gflDqModel(p,gains,{pllEnabled:a.syncMode==='srf-pll',frequencyHz:a.sync.fnHz,damping:a.sync.damping,pllFilterMs:a.sync.filterMs,dcModel:a.dcModel,decouplingFrequency:a.sync.decouplingFrequency,detector:i.pllDetector});
  result.stability=classifyDqPoles(m.A);result.order=m.A.length;result.numericalQuality={operatingResidual:m.residual,jacobianError:m.jacobianError,delayModel:m.delayModel};
  result.solveStatus='completed';result.scenarioCoverage={evaluated:1,total:1};
  if(result.stability.status!=='stable')result.violations.push('完整闭环不稳定或临界');
  for(const [k,c]of Object.entries(op.capability)){if(c.status==='failed')result.violations.push(k+' 能力超限');if(c.status==='unknown')result.pending.push(k+' 能力未知');}
  if(m.delayModel!=='none')result.pending.push('显式延时使用 Padé 近似，未验证实际数字实现');
  for(const k of ['maxOvershootPercent','maxSettlingSeconds'])if(t[k]!=null)result.pending.push(k+' 时域目标待单独核验');
  if(t.minimumDecayRate!=null&&result.stability.alpha> -t.minimumDecayRate)result.violations.push('衰减率目标未满足');
  if(runtime.frequency!==false){
   const min=policy.minHz??.01,max=policy.maxHz??Math.min(p.fs/10,p.switchingFrequencyHz?p.switchingFrequencyHz/10:2000),count=policy.frequencyPoints??81;
   if(!(min>0&&max>min&&Number.isInteger(count)&&count>=17&&count<=1001&&max<p.fs/2))throw Error('频率策略范围无效');
   const series=[],peak=[0,0],cross=[0,0],low=[];
   for(let n=0;n<count;n++){checkpoint();const f=min*(max/min)**(n/(count-1)),h=frequencyMatrix(m,f),mag=h.slice(0,2).map(row=>row.slice(0,2).map(z=>Math.hypot(z.re,z.im)));
    if(mag.flat().some(v=>!Number.isFinite(v)))throw Error('频响非有限数');
    for(let k=0;k<2;k++){peak[k]=Math.max(peak[k],mag[k][k]);cross[k]=Math.max(cross[k],mag[k][1-k]);if(n===0)low[k]=mag[k][k];}series.push({f,magnitude:mag});
   }
   result.frequencyChecks={status:'completed',minHz:min,maxHz:max,count,peak,cross,lowFrequencyGain:low,series,meaning:'sampled closed reference transfer; not open-loop margin or Ms'};
   if(t.maxTrackingPeak!=null&&Math.max(...peak)>t.maxTrackingPeak)result.violations.push('采样跟踪峰值超限');
   if(t.maxCrossGain!=null&&Math.max(...cross)>t.maxCrossGain)result.violations.push('采样交叉通道增益超限');
   if(t.maxLowFrequencyError!=null&&Math.max(...low.map(v=>Math.abs(v-1)))>t.maxLowFrequencyError)result.violations.push('低频增益偏差超限');
   if(t.scalarMinMargin!=null||t.separationRatio!=null){
    const scalar=evaluateGfl(p,gains);result.scalarDiagnostics=scalar;
    for(const k of ['d','q','P','Q'])if(t.scalarMinMargin!=null&&(scalar.loops[k].minMargin===null||scalar.loops[k].minMargin<t.scalarMinMargin))result.violations.push(k+' 显式标量裕度要求未满足');
    if(t.separationRatio!=null)for(const [outer,inner]of [['P','d'],['Q','q']])if(!(scalar.loops[outer].crossings.length===1&&scalar.loops[inner].crossings.length===1&&scalar.loops[outer].crossings[0].frequency<=scalar.loops[inner].crossings[0].frequency/t.separationRatio))result.violations.push('显式级联间隔未满足');
   }
  }else result.pending.push('频域尚未评估');
  checkpoint();result.eligibility=result.violations.length?'requirementsNotMet':result.pending.length?'conditional':'recommended';
 }catch(error){result.solveStatus=['cancelled','budgetExceeded'].includes(error.message)?error.message:'numericalFailure';result.eligibility='incomplete';result.error=error.message;}
 return result;
}
