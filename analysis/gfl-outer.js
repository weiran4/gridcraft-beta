import {buildGraph} from '../core/network/graph.js?v=transformer-rx3';
import {analyzeGridStrength} from './grid-strength.js?v=transformer-rx3';
export function outerContext(project,id){
 const c=project.components.find(c=>c.id===id&&c.type==='gfl');if(!c)throw Error('请选择 GFL。');
 const g=buildGraph(project),net=g.net(id+'.AC');
 const bus=project.components.find(c=>c.type==='bus'&&g.net(c.id+'.AC')===net);
 const out={dcCapacitanceF:c.extensions?.dcCapacitor?.capacitanceF??null,gridXOhm:null,gridROhm:null,gridError:''};
 if(!bus){out.gridError='Vac 控制需要逆变器交流端同节点的母线。';return out;}
 const copy=structuredClone(project),b=copy.components.find(c=>c.id===bus.id);b.parametersSI.isPcc=true;b.parametersSI.primaryIbrId=id;
 const r=analyzeGridStrength(copy,bus.id);
 if(r.status==='error')out.gridError=r.errors.join('；');else Object.assign(out,{gridXOhm:r.zTheveninOhm.im,gridROhm:r.zTheveninOhm.re,pccName:bus.name,scr:r.scr});
 return out;
}
export function outerModels(p){
 const dMode=p.dMode??'P',qMode=p.qMode??'Q',wi=2*Math.PI*(p.fi??500),wo=2*Math.PI*(p.fp??50);
 if(!['P','Vdc'].includes(dMode)||!['Q','Vac'].includes(qMode))throw Error('外环模式须为 P/Vdc 和 Q/Vac。');
 const make=(label,sign)=>({label,sign,gain:1,integrator:false,filter:'pq',kp:wo/wi,ki:wo});
 const result={P:make(dMode,1),Q:make(qMode,-1)};
 if(dMode==='Vdc'){
  if(!Number.isFinite(p.dcCapacitanceF)||p.dcCapacitanceF<=0)throw Error('Vdc 控制需要正的 DC 母线总等效电容；请应用电容设计值或填写独立电容。');
  const gain=p.ratedVA/(p.dcCapacitanceF*p.dcVoltage**2);
  Object.assign(result.P,{sign:-1,gain,integrator:true,filter:'vdc',kp:2*Math.SQRT1_2*wo/gain,ki:wo**2/gain});
 }
 if(qMode==='Vac'){
  if(!Number.isFinite(p.gridXOhm)||p.gridXOhm<=0)throw Error(p.gridError||'Vac 控制需要正的上游电抗；理想刚性母线或纯电阻网络不适用此电压调节模型。');
  const gain=p.gridXOhm*p.ratedVA/p.voltageLL**2;
  Object.assign(result.Q,{gain,filter:'voltage',kp:wo/(wi*gain),ki:wo/gain});
 }
 for(const m of Object.values(result))if(![m.gain,m.kp,m.ki].every(v=>Number.isFinite(v)&&v>0))throw Error('外环模型参数超出计算范围。');
 return result;
}
