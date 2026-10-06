import {buildGraph} from '../core/network/graph.js';
import {defaults} from './pq-capability.js';
export function pqSnapshot(project,id){
 const list=project.components.filter(c=>['gfl','gfm'].includes(c.type));
 const c=list.find(c=>c.id===id)||(list.length===1?list[0]:null);
 if(!c)throw Error('请选择当前工程中的逆变器。');
 const graph=buildGraph(project),p=c.parametersSI,rc=project.components.filter(r=>r.type==='rc'&&graph.net(r.id+'.AC')===graph.net(c.id+'.AC')),dc=project.components.filter(r=>r.type==='dc'&&graph.net(r.id+'.DC')===graph.net(c.id+'.DC'));
 if(rc.length>1||dc.length!==1)throw Error('此预览需要单一关联 DC 电源及最多一条同节点 RC 支路。');
 const r=rc[0]?.parametersSI,design=dc[0].extensions?.dcDesign;
 const state={...defaults,S:p.ratedApparentPowerVA/1e6,V:p.ratedAcVoltageV,f:project.frequencyHz,R:p.filterResistanceOhm,L:p.filterInductanceH*1e6,C:(r?.capacitanceF||0)*1e6,Rc:r?.resistanceOhm||0,Vdc:dc[0].parametersSI.voltageV,P:p.activePowerW/p.ratedApparentPowerVA,Q:p.reactivePowerVar/p.ratedApparentPowerVA,pout:p.ratedActivePowerW/1e6,pin:c.type==='gfm'?p.ratedActivePowerW/1e6:0};
 if(design?.modulation)state.m=design.modulation==='third'?1.15:1;
 if(Number.isFinite(design?.marginPercent))state.margin=design.marginPercent;
 return {state,id:c.id,label:project.name+' · '+c.name+' · '+c.id};
}
