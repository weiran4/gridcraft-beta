import {operatingPoint,inverterOperatingContext} from './operating-point.js?v=pq1';
import {buildGraph} from '../core/network/graph.js?v=transformer-rx3';
export function filterDesignContext(project,id){
 const c=project.components.find(c=>c.id===id);
 if(!c||!['gfl','gfm'].includes(c.type))throw Error('请选择 GFL 或 GFM。');
 const g=buildGraph(project),sources=project.components.filter(x=>x.type==='dc'&&g.net(x.id+'.DC')===g.net(id+'.DC'));
 return {...inverterOperatingContext(project,c),ratedVA:c.parametersSI.ratedApparentPowerVA,voltageLL:c.parametersSI.ratedAcVoltageV,frequencyHz:project.frequencyHz,L:c.parametersSI.filterInductanceH,dcVoltage:sources.length===1?sources[0].parametersSI.voltageV:null};
}
export function designFilterInductor(p){
 for(const key of ['ratedVA','voltageLL','frequencyHz','fs','ripplePercent','dropPercent'])if(!Number.isFinite(p[key])||p[key]<=0)throw Error('额定值、频率及限值必须为正数。');
 if(p.ripplePercent>100||p.dropPercent>100)throw Error('百分比限值应在 0 到 100% 之间。');
 if(!Number.isFinite(p.L)||p.L<0)throw Error('电感不得为负数。');
 if(!['N-2','2N-1','custom'].includes(p.sideband))throw Error('请选择主导谐波。');
 const harmonicBasis=p.harmonicBasis??'line';if(!['phase','line'].includes(harmonicBasis))throw Error('请选择相电压或线电压谐波口径。');
 const harmonicHz=p.sideband==='custom'?p.harmonicOrder*p.frequencyHz:p.sideband==='N-2'?p.fs-2*p.frequencyHz:2*p.fs-p.frequencyHz;
 if(!Number.isFinite(harmonicHz)||harmonicHz<=p.frequencyHz)throw Error('开关频率过低，主导谐波必须高于基波。');
 if(p.harmonicPu!=null&&(!Number.isFinite(p.harmonicPu)||p.harmonicPu<=0))throw Error('谐波峰值 pu 必须为正数；未知时留空。');
 if(p.dcVoltage!=null&&(!Number.isFinite(p.dcVoltage)||p.dcVoltage<=0))throw Error('DC 电压必须为正数。');
 const efficiencyPercent=p.currentEfficiencyPercent===undefined?100:p.currentEfficiencyPercent;
 const baseCurrentRms=p.ratedVA/(Math.sqrt(3)*p.voltageLL);
 const operating=Number.isFinite(p.activeW)&&Number.isFinite(p.reactiveVar)?operatingPoint(p):null;
 let currentRms,referenceCurrentRms,marginFactor;
 if(p.currentMode!==undefined){
  if(!['rated','operating'].includes(p.currentMode))throw Error('请选择设计电流依据。');
  if(!Number.isFinite(p.currentMarginPercent)||p.currentMarginPercent<100)throw Error('设计电流倍率须不低于 100%。');
  referenceCurrentRms=p.currentMode==='operating'?operating?.currentRms:baseCurrentRms;
  if(!(referenceCurrentRms>0))throw Error('当前运行电流为零或 P/Q 不完整，请切换额定电流设计。');
  marginFactor=p.currentMarginPercent/100;currentRms=referenceCurrentRms*marginFactor;
 }else{
  if(!Number.isFinite(efficiencyPercent)||efficiencyPercent<=0||efficiencyPercent>100)throw Error('电流修正系数须大于 0 且不超过 100%。');
  referenceCurrentRms=baseCurrentRms;marginFactor=100/efficiencyPercent;currentRms=referenceCurrentRms*marginFactor;
 }
 const baseL=p.voltageLL/(Math.sqrt(3)*2*Math.PI*p.frequencyHz*currentRms);
 const maxH=p.dropPercent/100*baseL;
 const harmonicPhasePeakV=p.harmonicPu==null||p.dcVoltage==null?null:p.harmonicPu*p.dcVoltage/2/(harmonicBasis==='phase'?1:Math.sqrt(3));
 // Peak-to-peak ripple is twice the peak harmonic current.
 const minH=harmonicPhasePeakV==null?null:2*harmonicPhasePeakV/(2*Math.PI*harmonicHz*(p.ripplePercent/100)*currentRms);
 const feasible=minH===null?null:minH<=maxH;
 const finiteBounds=Number.isFinite(minH)&&minH>0&&Number.isFinite(maxH)&&maxH>0;
 const midpointH=finiteBounds?minH/2+maxH/2:null;
 const canApply=finiteBounds&&p.L>0&&(p.L>=Math.min(minH,maxH)&&p.L<=Math.max(minH,maxH));
 return {operating,referenceCurrentRms,marginFactor,baseCurrentRms,efficiencyPercent,currentRms,baseL,harmonicHz,harmonicPhasePeakV,minH,maxH,feasible,midpointH,canApply,currentPass:minH===null?null:feasible&&p.L>=minH&&p.L<=maxH,dropPercent:100*p.L/baseL,ripplePercent:minH===null?null:p.L===0?Infinity:p.ripplePercent*minH/p.L};
}
