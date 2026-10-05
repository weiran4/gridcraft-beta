
import {buildGraph} from '../core/network/graph.js?v=transformer-rx3';
import {catalog} from '../components/catalog.js?v=transformer-rx3';
export function getGfl(project,id){const c=project.components.find(c=>c.id===id&&c.type==='gfl');if(!c)throw Error('指定GFL不存在，请从元件参数栏打开。');return c;}
export function connectedDc(project,id){getGfl(project,id);const g=buildGraph(project);const all=project.components.filter(c=>c.type==='dc'&&g.net(c.id+'.DC')===g.net(id+'.DC'));if(all.length!==1)throw Error('所选GFL需要连接一个明确的DC源。');return all[0];}
export function setGflField(project,id,key,value){
 const c=getGfl(project,id);
 if(!Number.isFinite(value))throw Error('请输入有限数值。');
 if(key==='frequencyHz'){if(value<=0)throw Error('频率必须大于0');project.frequencyHz=value;for(const s of project.components.filter(c=>c.type==='source'))s.parametersSI.frequencyHz=value;return;}
 const dc=key==='dcVoltage'||key==='dcResistance';const target=dc?connectedDc(project,id):c;
 const param=key==='dcVoltage'?'voltageV':key==='dcResistance'?'resistanceOhm':key;
 const field=catalog[target.type].fields.find(f=>f.key===param);
 if(!field||value<field.min||(field.strict&&value===field.min))throw Error('参数不在允许范围内。');
 target.parametersSI[param]=value;
}
