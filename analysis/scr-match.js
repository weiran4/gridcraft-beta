import {analyzeGridStrength} from './grid-strength.js?v=transformer-rx3';
export function matchScr(project,pccId,rlId,target){
 if(!Number.isFinite(target)||target<=0)throw Error('目标 SCR 必须为正的有限数值。');
 const before=analyzeGridStrength(project,pccId);
 if(before.status==='error')throw Error(before.errors.join('；'));
 if(!before.powerBaseVA)throw Error('请先选择 IBR 额定容量基准。');
 if(!(before.magnitudeOhm>0))throw Error('当前电网阻抗为零，无法保持原 X/R；请先为上游 RL 设置非零阻抗。');
 const part=before.contributions.find(c=>c.id===rlId&&c.type==='rl');
 if(!part||!(part.factor>0))throw Error('请选择当前 PCC 上游路径中的串联 RL。');
 const targetMagnitude=before.zBaseOhm/target;
 const fixedR=before.zTheveninOhm.re-part.referredOhm.re,fixedX=before.zTheveninOhm.im-part.referredOhm.im;
 const targetR=targetMagnitude*(before.zTheveninOhm.re/before.magnitudeOhm),targetX=targetMagnitude*(before.zTheveninOhm.im/before.magnitudeOhm);
 let re=targetR-fixedR,im=targetX-fixedX;
 const tolerance=1e-12*Math.max(targetMagnitude,before.magnitudeOhm);
 if(re < -tolerance||im < -tolerance)throw Error('目标不可实现：保持当前 PCC 的 X/R 且其他阻抗不变时，需要负 R 或负 L。请降低目标 SCR，或选择其他 RL。');
 re=Math.max(0,re);im=Math.max(0,im);
 const resistanceOhm=re/part.factor,inductanceH=im/part.factor/(2*Math.PI*project.frequencyHz);
 if(!Number.isFinite(resistanceOhm)||!Number.isFinite(inductanceH))throw Error('反算超出数值范围。');
 const copy=structuredClone(project),c=copy.components.find(c=>c.id===rlId);Object.assign(c.parametersSI,{resistanceOhm,inductanceH});
 const verified=analyzeGridStrength(copy,pccId);
 if(verified.status!=='ok'||Math.abs(verified.scr/target-1)>1e-8)throw Error('反算精度不足，未修改电路；请调整目标。');
 return {resistanceOhm,inductanceH,verifiedScr:verified.scr,xr:before.xr};
}
