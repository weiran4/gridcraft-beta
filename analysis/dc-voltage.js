import {operatingPoint,inverterOperatingContext} from './operating-point.js?v=pq1';
import {buildGraph} from '../core/network/graph.js?v=transformer-rx3';
export function dcDesignCandidates(project,id){
 if(!project.components.some(c=>c.id===id&&c.type==='dc'))throw Error('请选择 DC 电源。');
 const g=buildGraph(project),net=g.net(id+'.DC');return project.components.filter(c=>['gfl','gfm'].includes(c.type)&&g.net(c.id+'.DC')===net);
}
export function dcDesignContext(project,id,ibrId){
 const candidates=dcDesignCandidates(project,id),ibr=candidates.find(c=>c.id===ibrId);
 if(!ibr)throw Error('请选择与该 DC 电源相连的 GFL / GFM。');
 const g=buildGraph(project),sources=project.components.filter(c=>c.type==='dc'&&g.net(c.id+'.DC')===g.net(id+'.DC'));
 if(sources.length!==1)throw Error('同一 DC 节点连接了多个电源，请先明确唯一供电源后设计。');
 const p=ibr.parametersSI,dc=sources[0].parametersSI;
 return {...inverterOperatingContext(project,ibr),ratedVA:p.ratedApparentPowerVA,voltageLL:p.ratedAcVoltageV,frequencyHz:project.frequencyHz,L:p.filterInductanceH,currentV:dc.voltageV,dcResistance:dc.resistanceOhm,sharedCount:candidates.length,referenceAngleDeg:Math.atan2(p.ratedReactivePowerVar,p.ratedActivePowerW)*180/Math.PI};
}
export function designDcVoltage(p){
 for(const k of ['ratedVA','voltageLL','frequencyHz'])if(!Number.isFinite(p[k])||p[k]<=0)throw Error('额定容量、交流电压和频率必须为正数。');
 if(!Number.isFinite(p.L)||p.L<0)throw Error('滤波电感不得为负数。');
 if(p.designMode!=='operating'&&(!Number.isFinite(p.phaseAngleDeg)||Math.abs(p.phaseAngleDeg)>90))throw Error('功率因数角须在 −90° 至 90° 之间（逆变送电工况）。');
 if(!Number.isFinite(p.marginPercent)||p.marginPercent<0||p.marginPercent>=100)throw Error('调制裕量须在 0% 至 100% 之间，不含 100%。');
 if(!['spwm','third'].includes(p.modulation))throw Error('请选择调制方式。');
 if(p.selectedV!=null&&(!Number.isFinite(p.selectedV)||p.selectedV<=0))throw Error('选用 DC 电压必须为正数。');
 if(p.designMode!==undefined&&!['operating','rated'].includes(p.designMode))throw Error('请选择电压设计工况。');
 const operating=p.designMode==='operating'?operatingPoint({...p,dcVoltage:p.selectedV}):null;
 const phaseRms=p.voltageLL/Math.sqrt(3),currentRms=operating?operating.currentRms:p.ratedVA/(Math.sqrt(3)*p.voltageLL),omega=2*Math.PI*p.frequencyHz,phi=operating?operating.phi:p.phaseAngleDeg*Math.PI/180;
 const inductorDropRms=omega*p.L*currentRms,converterRms=Math.hypot(phaseRms+inductorDropRms*Math.sin(phi),inductorDropRms*Math.cos(phi));
 const maxModulation=p.modulation==='third'?1.15:1,allowedModulation=(1-p.marginPercent/100)*maxModulation,minimumV=2*Math.sqrt(2)*converterRms/allowedModulation;
 const modulationIndex=p.selectedV==null?null:2*Math.sqrt(2)*converterRms/p.selectedV;
 if([phaseRms,currentRms,omega,inductorDropRms,converterRms,minimumV].some(v=>!Number.isFinite(v))||minimumV<=0||(modulationIndex!=null&&!Number.isFinite(modulationIndex)))throw Error('参数超出数值计算范围，请检查单位和数量级。');
 return {operating,phaseRms,currentRms,omega,phi,inductorDropRms,converterRms,maxModulation,allowedModulation,minimumV,modulationIndex,powerFactor:Math.cos(phi),designP:operating?p.activeW:p.ratedVA*Math.cos(phi),designQ:operating?p.reactiveVar:p.ratedVA*Math.sin(phi),availableMarginPercent:modulationIndex==null?null:100*(1-modulationIndex/maxModulation),pass:p.selectedV!=null&&p.selectedV>=minimumV*(1-1e-12),overmodulation:modulationIndex!=null&&modulationIndex>maxModulation*(1+1e-12)};
}
export function dcInputIssues(p,r){
 const errors={};if(!p.ibrId)errors.ibrId='请选择已连接的逆变器。';
 if(p.designMode!=='operating'&&(!Number.isFinite(p.phaseAngleDeg)||Math.abs(p.phaseAngleDeg)>90))errors.phaseAngleDeg='请输入 −90°～90° 的功率因数角。';
 if(!Number.isFinite(p.marginPercent)||p.marginPercent<0||p.marginPercent>=100)errors.marginPercent='裕量须满足 0% ≤ 裕量 < 100%。';
 if(!Number.isFinite(p.selectedV)||p.selectedV<=0)errors.selectedV='请输入正的 DC 电压。';
 else if(r&&!r.pass)errors.selectedV=(r.overmodulation?'已过调制。':'调制裕量不足。')+'最低需要 '+Number(r.minimumV.toPrecision(6))+' V。';
 return errors;
}
