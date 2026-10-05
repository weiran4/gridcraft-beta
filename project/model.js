import {transformerDefaults} from '../core/electrical/transformer.js?v=transformer-rx3';
import {catalog,portDomain} from '../components/catalog.js?v=transformer-rx3';
import {toSI} from '../core/electrical/units.js?v=transformer-rx3';
export function createComponent(type,id,x=300,y=300){const def=Object.hasOwn(catalog,type)?catalog[type]:null;if(!def)throw Error('Unknown component');return {id,type,name:`${def.short} ${id.replace(/[^0-9]/g,'')}`,x,y,rotation:0,parametersSI:{...Object.fromEntries(def.fields.map(f=>[f.key,toSI(f.value,f.unit)])),...(type==='bus'?{isPcc:true,primaryIbrId:''}:{})},extensions:{}};}
export function emptyProject(){return {format:'grid-strength',schemaVersion:1,name:'Untitled network',frequencyHz:60,components:[],wires:[],editor:{zoom:1,viewCenter:{x:600,y:350}},extensions:{}};}
export function validateProject(p){
 const errors=[];
 if(!p||p.format!=='grid-strength'||p.schemaVersion!==1)return ['不支持的工程格式；原 Branch Builder 文件需要先进行电气参数转换。'];
 if(!Array.isArray(p.components)||!Array.isArray(p.wires))return ['工程缺少 components / wires 数组。'];
 if(p.components.length>5000||p.wires.length>10000)return ['工程超过 V1 容量限制。'];
 if(typeof p.name!=='string')errors.push('工程名称必须为文本。');
 if(!Number.isFinite(p.frequencyHz)||p.frequencyHz<=0)errors.push('工程频率必须大于 0。');
 const ids=new Set();
 for(const c of p.components){
  if(!c||typeof c.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(c.id)||ids.has(c.id)){errors.push('元件 ID 无效或重复。');continue;}ids.add(c.id);
  const def=Object.hasOwn(catalog,c.type)?catalog[c.type]:null;if(!def){errors.push(`${c.id}: 未知元件类型。`);continue;}
  if(typeof c.name!=='string')errors.push(`${c.id}: 名称必须为文本。`);
  if(!Number.isFinite(c.x)||!Number.isFinite(c.y)|| (c.rotation!==undefined&&!Number.isFinite(c.rotation)))errors.push(`${c.id}: 坐标或旋转无效。`);
  for(const f of def.fields){const v=c.parametersSI?.[f.key]===undefined&&c.type==='transformer'?transformerDefaults[f.key]:c.parametersSI?.[f.key];if(!Number.isFinite(v)||v<f.min||(f.strict&&v===f.min))errors.push(`${c.name||c.id}: ${f.label} ${f.strict?'必须大于':'不得小于'} ${f.min}，且必须为有限数值。`);}
  if(c.type==='bus'&&typeof c.parametersSI?.isPcc!=='boolean')errors.push(`${c.id}: PCC 标记必须为布尔值。`);
 }
 const wireIds=new Set();
 for(const w of p.wires){if(!w||typeof w.id!=='string'||wireIds.has(w.id)){errors.push('导线 ID 无效或重复。');continue;}wireIds.add(w.id);const a=portDomain(p,w.from),b=portDomain(p,w.to);if(!a||!b)errors.push(`${w.id}: 导线端口不存在。`);else if(a!==b)errors.push(`${w.id}: 禁止 AC/DC 端口混接。`);if(w.from===w.to)errors.push(`${w.id}: 端口不能连接自身。`);if(w.mid&&(!Number.isFinite(w.mid.x)||!Number.isFinite(w.mid.y)))errors.push(`${w.id}: 导线路由无效。`);}
 if(p.editor){const e=p.editor;if(!Number.isFinite(e.zoom)||e.zoom<.2||e.zoom>4||!Number.isFinite(e.viewCenter?.x)||!Number.isFinite(e.viewCenter?.y))errors.push('画布视图参数无效。');}
 return errors;
}
export function serializeProject(p){const errors=validateProject(p);if(errors.length)throw Error(errors.join('\n'));return JSON.stringify(p,null,2);}
export function parseProject(text){const p=JSON.parse(text);const errors=validateProject(p);if(errors.length)throw Error(errors.join('\n'));for(const c of p.components)if(c.type==='transformer'){c.parametersSI={...transformerDefaults,...c.parametersSI};c.name=c.name.replace(/ · ideal$/,'');}return p;}
