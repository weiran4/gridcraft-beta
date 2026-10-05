import {dcCapContext,designDcCapacitor} from '../analysis/dc-capacitor.js?v=pq1';
import {escapeHtml as esc} from './symbols.js?v=transformer-rx3';
const fmt=x=>Number(x.toPrecision(6)).toString();
export function dcCapSummary(project,c){
 const a=c.extensions?.dcCapacitor;if(!a)return '<p class="help-label">DC 母线电容：尚未应用设计值。</p>';
 let status='';try{const r=designDcCapacitor({...dcCapContext(project,c.id),etaPercent:98,timeMode:'period',holdMs:20,...c.extensions?.dcCapDesign,seriesCount:a.seriesCount,selectedMf:a.capacitanceF*1000});status='<p class="note '+(r.pass?'':'error')+'">'+(r.pass?'已应用电容满足当前能量准则。':'已应用电容不足，请重新设计。')+' 当前最低 '+fmt(r.minF*1e6)+' μF。</p>';}catch(e){status='<p class="note error">'+esc(e.message)+'</p>';}
 return '<table><thead><tr><th colspan="2">DC 母线电容 · 已应用</th></tr></thead><tbody><tr><td>总等效 Cbus</td><td>'+fmt(a.capacitanceF*1e6)+' μF</td></tr><tr><td>'+ (a.seriesCount===2?'串联单只 C1 = C2':'整体电容')+'</td><td>'+fmt(a.capacitanceF*a.seriesCount*1e6)+' μF</td></tr></tbody></table>'+status+'<p class="help-label">电容选型采用能量准则；PI 页选择 Vdc 外环时，可使用此总等效电容建立母线动态。</p>';
}
