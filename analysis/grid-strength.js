import {transformerImpedance} from '../core/electrical/transformer.js?v=transformer-rx3';
import {validateProject} from '../project/model.js?v=transformer-rx3';
import {buildGraph,referenceIbrCandidates} from '../core/network/graph.js?v=transformer-rx3';
import {isIbr} from '../components/catalog.js?v=transformer-rx3';
import {rlImpedance,magnitude,scale,add,ratio} from '../core/electrical/impedance.js?v=transformer-rx3';
export function analyzeGridStrength(project,pccId){
 const errors=validateProject(project),warnings=['V1：RC Filter 不计入 Zth / SCR；逆变器侧 Rf/Lf 与 DC 支路不计入上游电网阻抗。'];
 const fail=(message)=>({status:'error',errors:message?[...errors,message]:errors,warnings});
 if(errors.length)return fail();
 const pcc=project.components.find(c=>c.id===pccId&&c.type==='bus'&&c.parametersSI.isPcc);if(!pcc)return fail('请选择标记为 PCC 的母线。');
 const g=buildGraph(project),pccNet=g.net(pcc.id+'.AC');
 const visited=new Set(),parents=new Map(),queue=[pccNet];visited.add(pccNet);let cycle=false;
 for(let i=0;i<queue.length;i++){const n=queue[i];for(const link of g.adjacency.get(n)||[]){if(parents.get(n)?.edge.id===link.edge.id)continue;if(visited.has(link.next)){cycle=true;continue;}visited.add(link.next);parents.set(link.next,{node:n,edge:link.edge});queue.push(link.next);}}
 const sources=project.components.filter(c=>c.type==='source'&&visited.has(g.net(c.id+'.AC')));
 if(sources.length===0)return fail('PCC 未连接上游理想交流电源；请检查导线与端口。');
 if(sources.length>1)return fail('检测到多个上游理想电源；V1 只支持单电源径向网络。');
 if(cycle)return fail('检测到环网或多条并联路径；V1 只支持径向电网。');
 const source=sources[0],path=[];let node=g.net(source.id+'.AC');
 while(node!==pccNet){const link=parents.get(node);path.push({edge:link.edge,from:node,to:link.node});node=link.node;}
 // Propagate nominal voltage through every reachable branch, catching inconsistent transformer terminals.
 const volts=new Map([[g.net(source.id+'.AC'),source.parametersSI.ratedVoltageV]]),vq=[g.net(source.id+'.AC')];
 const matches=(a,b)=>Math.abs(a-b)<=.001*Math.max(Math.abs(a),Math.abs(b));
 for(let i=0;i<vq.length;i++){const n=vq[i],v=volts.get(n);for(const {edge,next} of g.adjacency.get(n)||[]){if(volts.has(next))continue;let out=v;if(edge.component.type==='transformer'){const p=edge.component.parametersSI,forward=edge.a===n,vin=forward?p.primaryVoltageV:p.secondaryVoltageV,vout=forward?p.secondaryVoltageV:p.primaryVoltageV;if(!matches(v,vin))return fail(`${edge.component.name}: 变压器额定电压与连接侧母线不一致。`);out=v*vout/vin;}if(!Number.isFinite(out)||out<=0)return fail('电压折算超出数值范围。');volts.set(next,out);vq.push(next);}}
 for(const c of project.components){if(!['bus','gfl','gfm','source'].includes(c.type))continue;const n=g.net(c.id+'.AC');if(!volts.has(n))continue;const rated=isIbr(c)?c.parametersSI.ratedAcVoltageV:c.parametersSI.ratedVoltageV;if(!matches(volts.get(n),rated))return fail(`${c.name}: 额定电压与电网/变压器折算电压不一致。`);}
 if(!matches(source.parametersSI.frequencyHz,project.frequencyHz))return fail('交流电源频率与工程频率不一致。');
 const ibrs=referenceIbrCandidates(project,pccId,g);
 let ibr=ibrs.find(c=>c.id===pcc.parametersSI.primaryIbrId);
 if(pcc.parametersSI.primaryIbrId&&!ibr)return fail('所选主要 IBR 未直接或经变压器连接到当前分析母线。');
 if(!ibr&&ibrs.length===1)ibr=ibrs[0];if(!ibr&&ibrs.length>1)return fail('当前 PCC 连接多个 IBR，请明确选择主要 IBR。');
 if(!ibr)warnings.push('未连接主要 IBR：可以计算 Zth 和 Ssc；SCR 与标幺值需要额定容量。');
 const voltage=pcc.parametersSI.ratedVoltageV,sbase=ibr?.parametersSI.ratedApparentPowerVA??null,zbase=sbase?voltage*voltage/sbase:null;
 let total={re:0,im:0};const contributions=[];
 for(const step of path){const c=step.edge.component,p=c.parametersSI;const local=c.type==='rl'?rlImpedance(p.resistanceOhm,p.inductanceH,project.frequencyHz):transformerImpedance(p,project.frequencyHz,step.edge.a===step.from);const factor=(voltage/volts.get(step.from))**2;const referred=scale(local,factor);total=add(total,referred);contributions.push({id:c.id,name:c.name,type:c.type,localOhm:local,factor,referredOhm:referred,pu:zbase?scale(referred,1/zbase):null});}
 const abs=magnitude(total),ideal=abs===0,ssc=ideal?'Infinity':voltage*voltage/abs,scr=ibr?(ideal?'Infinity':ssc/sbase):null;
 if(!Number.isFinite(total.re)||!Number.isFinite(total.im)||(!ideal&&!Number.isFinite(ssc))||(zbase!==null&&(!Number.isFinite(zbase)||zbase<=0))||(typeof scr==='number'&&!Number.isFinite(scr)))return fail('计算超出数值范围，请检查阻抗、变比及容量。');
 const pathNets=new Set([pccNet,g.net(source.id+'.AC'),...path.flatMap(s=>[s.from,s.to])]);
 // Only wires connecting participating terminals are highlighted (exclude dangling RC/IBR branches).
 const terminalTargets=new Set([source.id+'.AC',pcc.id+'.AC',...path.flatMap(s=>[s.edge.id+'.A',s.edge.id+'.B'])]);
 const wireAdj=new Map();project.wires.forEach(w=>{for(const [a,b]of [[w.from,w.to],[w.to,w.from]]){if(!wireAdj.has(a))wireAdj.set(a,[]);wireAdj.get(a).push({next:b,id:w.id});}});
 const wireIds=new Set();for(const net of pathNets){const targets=[...terminalTargets].filter(t=>g.net(t)===net);if(targets.length<2)continue;const seen=new Set([targets[0]]),q=[targets[0]],prev=new Map();for(let i=0;i<q.length;i++)for(const link of wireAdj.get(q[i])||[]){if(seen.has(link.next))continue;seen.add(link.next);prev.set(link.next,{from:q[i],id:link.id});q.push(link.next);}for(const target of targets.slice(1)){let t=target;while(prev.has(t)){const p=prev.get(t);wireIds.add(p.id);t=p.from;}}}
 return {status:ideal?'ideal-grid':'ok',errors:[],warnings,pccId,sourceId:source.id,primaryIbrId:ibr?.id??null,voltageBaseV:voltage,powerBaseVA:sbase,zBaseOhm:zbase,zTheveninOhm:total,magnitudeOhm:abs,xr:ratio(total),zTheveninPu:zbase?scale(total,1/zbase):null,shortCircuitVA:ssc,scr,contributions,upstreamComponentIds:[source.id,...path.map(s=>s.edge.id),pcc.id],upstreamWireIds:[...wireIds]};
}
