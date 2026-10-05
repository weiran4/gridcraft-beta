import {operatingPoint,inverterOperatingContext} from './operating-point.js?v=pq1';
import {buildGraph} from '../core/network/graph.js?v=transformer-rx3';
export function rcDesignCandidates(project,rcId){
 const rc=project.components.find(c=>c.id===rcId&&c.type==='rc');if(!rc)throw Error('请选择 RC 滤波器。');
 const graph=buildGraph(project),net=graph.net(rcId+'.AC');
 return project.components.filter(c=>['gfl','gfm'].includes(c.type)&&graph.net(c.id+'.AC')===net);
}
export function rcDesignContext(project,rcId,ibrId){
 const ibr=rcDesignCandidates(project,rcId).find(c=>c.id===ibrId);
 if(!ibr)throw Error('请选择与 RC 同一交流节点的 GFL / GFM；不能跨变压器或电网 RL 直接套用。');
 const p=ibr.parametersSI,rc=project.components.find(c=>c.id===rcId).parametersSI;
 return {...inverterOperatingContext(project,ibr),ratedW:p.ratedActivePowerW,voltageLL:p.ratedAcVoltageV,frequencyHz:project.frequencyHz,L:p.filterInductanceH,currentC:rc.capacitanceF,currentR:rc.resistanceOhm};
}
export function designRcFilter(p){
 for(const key of ['ratedW','voltageLL','frequencyHz','L','fs','reactivePercent','qualityFactor','currentC'])if(!Number.isFinite(p[key])||p[key]<=0)throw Error('额定有功、交流电压、电感、电容、频率、无功限值和 QF 必须为正数。');
 if(p.reactivePercent>100)throw Error('无功限值应不超过 100%。');
 if(!Number.isFinite(p.currentR)||p.currentR<0)throw Error('阻尼电阻必须为非负有限数。');
 if(p.capacitanceF!=null&&(!Number.isFinite(p.capacitanceF)||p.capacitanceF<=0))throw Error('选用电容必须为正数。');
 const omega=2*Math.PI*p.frequencyHz,resonanceMinHz=10*p.frequencyHz,resonanceMaxHz=p.fs/2;
 const capReactiveMaxF=p.reactivePercent/100*p.ratedW/(omega*p.voltageLL**2);
 const capMinF=1/((2*Math.PI*resonanceMaxHz)**2*p.L),capResonanceMaxF=1/((2*Math.PI*resonanceMinHz)**2*p.L),capMaxF=Math.min(capReactiveMaxF,capResonanceMaxF);
 const feasible=resonanceMinHz<=resonanceMaxHz&&capMinF<=capMaxF;
 const C=p.capacitanceF;
 const resonanceHz=C==null?null:1/(2*Math.PI*Math.sqrt(p.L*C)),qVar=C==null?null:omega*C*p.voltageLL**2,resistanceOhm=C==null?null:Math.sqrt(p.L/C)/p.qualityFactor;
 const currentResonanceHz=1/(2*Math.PI*Math.sqrt(p.L*p.currentC)),currentQVar=omega*p.currentC*p.voltageLL**2,currentQualityFactor=p.currentR===0?Infinity:Math.sqrt(p.L/p.currentC)/p.currentR;
 for(const v of [capReactiveMaxF,capMinF,capResonanceMaxF,capMaxF,currentResonanceHz,currentQVar])if(!Number.isFinite(v)||v<=0)throw Error('参数超出数值计算范围，请检查单位和数量级。');
 if(C!=null&&[resonanceHz,qVar,resistanceOhm].some(v=>!Number.isFinite(v)||v<=0))throw Error('选值超出数值计算范围。');
 return {omega,resonanceMinHz,resonanceMaxHz,capReactiveMaxF,capMinF,capResonanceMaxF,capMaxF,feasible,resonanceHz,qVar,resistanceOhm,selectedPass:C!=null&&feasible&&C>=capMinF&&C<=capMaxF,currentResonanceHz,currentQVar,currentQualityFactor,currentPass:feasible&&p.currentC>=capMinF&&p.currentC<=capMaxF};
}
