import {operatingPoint,inverterOperatingContext} from './operating-point.js?v=pq1';
import {buildGraph} from '../core/network/graph.js?v=transformer-rx3';
export function dcCapContext(project,id){
 const c=project.components.find(c=>c.id===id&&['gfl','gfm'].includes(c.type));if(!c)throw Error('请选择 GFL / GFM。');
 const g=buildGraph(project),net=g.net(id+'.DC'),sources=project.components.filter(c=>c.type==='dc'&&g.net(c.id+'.DC')===net);
 if(sources.length!==1)throw Error('请连接唯一 DC 电源后设计电容。');
 return {...inverterOperatingContext(project,c),ratedW:c.parametersSI.ratedActivePowerW,dcVoltage:sources[0].parametersSI.voltageV,frequencyHz:project.frequencyHz,sourceName:sources[0].name,sharedCount:project.components.filter(c=>['gfl','gfm'].includes(c.type)&&g.net(c.id+'.DC')===net).length};
}
export function designDcCapacitor(p){
 for(const k of ['ratedW','dcVoltage','frequencyHz'])if(!Number.isFinite(p[k])||p[k]<=0)throw Error('额定有功、DC 电压及基波频率必须为正数。');
 if(!Number.isFinite(p.etaPercent)||p.etaPercent<=0||p.etaPercent>100)throw Error('效率须满足 0% < η ≤ 100%。');
 if(!['period','custom'].includes(p.timeMode))throw Error('请选择保持时间模式。');
 if(p.timeMode==='custom'&&(!Number.isFinite(p.holdMs)||p.holdMs<=0))throw Error('保持时间必须为正数。');
 if(![1,2].includes(p.seriesCount))throw Error('请选择整体电容或两个相同电容串联。');
 if(p.selectedMf!==null&&p.selectedMf!==undefined&&(!Number.isFinite(p.selectedMf)||p.selectedMf<=0))throw Error('选用总等效电容必须为正数。');
 const eta=p.etaPercent/100,holdSeconds=p.timeMode==='period'?1/p.frequencyHz:p.holdMs/1000,energyRequired=p.ratedW/eta*holdSeconds,minF=2*energyRequired/p.dcVoltage**2,selectedF=p.selectedMf==null?null:p.selectedMf/1000;
 const energy=selectedF==null?null:.5*selectedF*p.dcVoltage**2,eachF=selectedF==null?null:selectedF*p.seriesCount,actualHoldSeconds=energy==null?null:energy*eta/p.ratedW;
 if([holdSeconds,energyRequired,minF,energy,eachF,actualHoldSeconds].some(v=>v!==null&&!Number.isFinite(v))||minF<=0)throw Error('参数超出计算范围，请检查单位。');
 return {eta,holdSeconds,energyRequired,minF,selectedF,energy,eachF,actualHoldSeconds,pass:selectedF!=null&&selectedF>=minF*(1-1e-12)};
}
