import {operatingPoint} from '../analysis/operating-point.js?v=pq1';
const fmt=v=>v==null?'—':Number(v.toPrecision(6)).toString();
export function operatingSummary(ctx){
 const r=operatingPoint(ctx),row=(a,b)=>`<div class="metric-row"><span>${a}</span><b>${b}</b></div>`;
 return `<div class="operating-summary" data-operating-summary>${row('运行 P / Q',fmt(ctx.activeW/1e6)+' MW / '+fmt(ctx.reactiveVar/1e6)+' Mvar')}${row('运行视在功率 |S|',fmt(r.apparentVA/1e6)+' MVA')}${row('运行电流 RMS',fmt(r.currentRms)+' A')}${row('运行功率因数角 φ',fmt(r.angleDeg)+'°')}<p class="help-label">I运行 = √(P² + Q²) / (√3 × VLL)。按当前交流额定电压计算，忽略电容基波电流和电感电阻。</p>${r.overRated?`<div class="note error">运行视在功率达到额定容量的 ${fmt(r.loadingPercent)}%，已超过额定容量。</div>`:''}</div>`;
}
