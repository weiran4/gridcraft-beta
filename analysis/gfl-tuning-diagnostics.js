/** Explanations separate physical facts, search policy and unknown coverage. */
export function diagnoseGfl(input,request,evaluation,result){
 const out=[],add=(code,severity,message,evidence={})=>out.push({code,severity,message,evidence});
 add('scope','info','额定点标量模型；不含 PLL、dq 耦合、限流、扰动/不确定性试验或 HIL 实测。');
 add('separation-policy','info',`内外环间隔 ${request.separationRatio} 倍是可配置工程策略，不是物理定律。`,{separationRatio:request.separationRatio});
 if(input.considerScr&&input.filterVoltageMs>0)add('voltage-feedforward-filter','info',`交流电压 ${input.filterVoltageMs} ms 滤波同时作用于电网/RC 前馈残余与 Vac 反馈。`,{filterVoltageMs:input.filterVoltageMs});
 if(input.dMode==='Vdc')add('dc-energy-model','warning','Vdc 使用电容能量＋恒定输入功率模型，不等同于理想 DC 电压源钳位电路。');
 if(input.delaySamples!==0)add('delay-unverified','warning','含纯延时：只做频域筛查，未完成延时系统稳定性与时域验证。');
 if(result.searchStatus==='targetNotMet')add('target-not-met','warning','当前模型、PI 族、搜索范围及预算内未找到满足全部目标的候选；不等于物理上绝对不可行。',{targets:{fi:request.fi,fp:request.fp},rejections:result.rejections});
 if(result.searchStatus==='budgetExceeded')add('search-budget','warning','搜索预算耗尽；不能据此宣称目标不可行。');
 if(result.searchStatus==='noCandidateFound')add('no-candidate','warning','本次范围内没有完成校核的候选；现有 PI 仍可单独分析。',{rejections:result.rejections});
 if(evaluation){const inner=evaluation.loops.d.crossings[0]?.frequency,outer=evaluation.loops.P.crossings[0]?.frequency;
  if(inner&&outer)add('current-cascade','info',`现有内环交越 ${inner.toPrecision(4)} Hz，d 轴外环 ${outer.toPrecision(4)} Hz；搜索不使用输入目标替代实际内环。`,{innerHz:inner,outerHz:outer});}
 return out;
}
