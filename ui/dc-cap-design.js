import {operatingSummary} from './operating-summary.js?v=pq1';
import {dcCapContext,designDcCapacitor} from '../analysis/dc-capacitor.js?v=pq1';
import {installFormulaTooltip} from './formula-tooltip.js?v=linkage1';
import {markDesignInputs} from './design-input-validation.js?v=pq1';
import {escapeHtml as esc} from './symbols.js?v=transformer-rx3';
import {math,sub,mi,mn,mo,frac,sup} from './paper-math.js';
const fmt=v=>v==null?'待补充':Number(v.toPrecision(6)).toString();
const metric=(a,b)=>`<div class="metric-row"><span>${a}</span><b>${b}</b></div>`;
export function mountDcCapDesign(host,project,c,save,apply){
 const stored=c.extensions?.dcCapDesign||{},applied=c.extensions?.dcCapacitor;
 const settings={etaPercent:98,timeMode:'period',holdMs:20,seriesCount:applied?.seriesCount??2,selectedMf:applied?applied.capacitanceF*1000:null,...stored};
 const field=(k,label,unit)=>`<label class="field"><span>${label}</span><div class="field-input"><input data-cap="${k}" type="number" step="any" aria-label="${label}" value="${esc(String(settings[k]==null?'':k==='selectedMf'?settings[k]*1000:settings[k]))}"><small>${unit}</small></div></label>`;
 host.innerHTML=`<div class="filter-design-grid"><section><h3>01 · 设计输入</h3><p class="help-label">DC 母线总等效电容 · 保持时间与储能 · ${esc(c.name)}</p><div data-cap-context></div>${field('etaPercent','变流器效率 η','%')}<p class="help-label">98% 为可修改的初始假设，请按实际效率填写。</p><label class="field"><span>保持时间来源</span><select data-cap="timeMode" aria-label="保持时间来源"><option value="period">跟随基波周期 · Th = 1/f₀</option><option value="custom">独立设定保持时间</option></select></label>${field('holdMs','保持时间 Th','ms')}<label class="field"><span>电容配置</span><select data-cap="seriesCount" aria-label="电容配置"><option value="2">两个相同电容串联</option><option value="1">整体等效电容</option></select></label><div class="note">按所选逆变器额定有功 Pcon 计算，额定选型保留额定有功基准，并单独展示运行 P 下的储能需求；无功不直接代入保持时间能量公式。此准则使用全部储能，未限定最低允许 DC 电压；不代表母线能在保持时间内维持额定电压，也未校核纹波电流、ESR 或寿命。</div></section><section><h3>02 · 能量与电容选值</h3><div data-cap-result aria-live="polite"></div>${field('selectedMf','选用总等效电容 Cbus','μF')}<div data-cap-preview></div><button data-cap-min class="contribution">选用最低总等效电容</button><button data-cap-apply class="primary calculate">应用到此逆变器</button><div data-cap-status role="status"></div><p class="help-label">应用后保存至本逆变器，支持撤销、工程导出及 PI 页面同步。PI 页选择 Vdc 外环时可使用此电容建立母线动态；电路 DC 理想源与 SCR 计算不受此选值影响。</p></section><section class="derived-equations filter-design-formulas"><h3>03 · 设计公式与定义</h3><p class="help-label">悬停或 Tab 聚焦变量查看实时数值与单位。</p>${formulas()}</section></div>`;
 for(const k of ['timeMode','seriesCount'])host.querySelector(`[data-cap="${k}"]`).value=String(settings[k]);
 const inputs=[...host.querySelectorAll('[data-cap]')],read=()=>Object.fromEntries(inputs.map(e=>[e.dataset.cap,e.dataset.cap==='timeMode'?e.value:e.value===''?null:Number(e.value)/(e.dataset.cap==='selectedMf'?1000:1)]));
 const result=host.querySelector('[data-cap-result]'),preview=host.querySelector('[data-cap-preview]'),context=host.querySelector('[data-cap-context]'),button=host.querySelector('[data-cap-apply]'),min=host.querySelector('[data-cap-min]'),status=host.querySelector('[data-cap-status]'),setVariables=installFormulaTooltip(host);
 const calc=()=>{const p=read(),ctx=dcCapContext(project,c.id);return {p,ctx,r:designDcCapacitor({...ctx,...p})};};
 function update(){
  const p=read(),errors={};if(!(p.etaPercent>0&&p.etaPercent<=100))errors.etaPercent='效率须在 0% 至 100% 之间，不含 0%。';if(p.timeMode==='custom'&&!(p.holdMs>0))errors.holdMs='保持时间必须为正数。';if(!(p.selectedMf>0))errors.selectedMf='请输入正的总等效电容。';
  const time=host.querySelector('[data-cap="holdMs"]');time.disabled=p.timeMode==='period';if(time.disabled)time.value=1000/project.frequencyHz;
  try{const {ctx,r}=calc();context.innerHTML=operatingSummary(ctx)+metric('额定有功 Pcon',fmt(ctx.ratedW/1e6)+' MW')+metric('DC 电压 · '+esc(ctx.sourceName),fmt(ctx.dcVoltage)+' V')+metric('基波频率',fmt(ctx.frequencyHz)+' Hz')+(ctx.sharedCount>1?'<div class="note warning">多个逆变器共用 DC 节点，本窗口仅设计当前单机电容，不作为全站合计容量。</div>':'');
   result.innerHTML=metric('运行有功下的储能需求',ctx.activeW>0?fmt(ctx.activeW/r.eta*r.holdSeconds/1000)+' kJ':'非送电工况，不作保持供电校核')+metric('要求保持时间',fmt(r.holdSeconds*1000)+' ms')+metric('所需储能',fmt(r.energyRequired/1000)+' kJ')+metric('最低总等效电容 Cbus',fmt(r.minF*1e6)+' μF');
   preview.innerHTML=metric('选用电容储能',fmt(r.energy==null?null:r.energy/1000)+' kJ')+metric('可提供能量对应时间',fmt(r.actualHoldSeconds==null?null:r.actualHoldSeconds*1000)+' ms')+metric(p.seriesCount===2?'每只串联电容 C1 = C2':'整体电容',fmt(r.eachF==null?null:r.eachF*1e6)+' μF')+metric('已应用总等效电容',c.extensions?.dcCapacitor?fmt(c.extensions.dcCapacitor.capacitanceF*1e6)+' μF':'未设置')+`<div class="note ${r.pass?'':'error'}">${r.pass?'选用电容满足能量准则。':'选用电容不足或尚未填写。'}</div>`;
   if(p.selectedMf>0&&!r.pass)errors.selectedMf='至少需要 '+fmt(r.minF*1e6)+' μF。';button.disabled=!r.pass;min.disabled=false;
   const val=(a,b,u)=>a+'：'+fmt(b)+' '+u;setVariables({P:val('额定有功',ctx.ratedW/1e6,'MW'),V:val('实际连接 DC 电压',ctx.dcVoltage,'V'),eta:val('效率',r.eta,'（无量纲）'),T:val('保持时间',r.holdSeconds*1000,'ms'),f:val('基波频率',ctx.frequencyHz,'Hz'),C:val('选用总等效电容',p.selectedMf==null?null:p.selectedMf*1000,'μF'),min:val('最低总等效电容',r.minF*1e6,'μF'),each:val('两个相同电容串联时单只容量',r.selectedF==null?null:2*r.selectedF*1e6,'μF'),E:val('所需储能',r.energyRequired/1000,'kJ')});
  }catch(e){context.innerHTML='';result.innerHTML='<div class="note error">'+esc(e.message)+'</div>';preview.innerHTML='';button.disabled=true;min.disabled=true;setVariables({});}
  markDesignInputs(host,'data-cap',errors);
 }
 const persist=()=>{const p=read();if(!Object.values(p).some(v=>typeof v==='number'&&!Number.isFinite(v)))save(p);};
 inputs.forEach(e=>{e.oninput=()=>{status.textContent='';update();};e.onchange=()=>{update();persist();};});
 min.onclick=()=>{try{host.querySelector('[data-cap="selectedMf"]').value=calc().r.minF*1e6;update();persist();}catch{}};
 button.onclick=()=>{try{const {p,r}=calc();if(r.pass){apply({capacitanceF:r.selectedF,seriesCount:p.seriesCount},p);update();status.textContent='已保存到 '+c.name+'，主页面及 PI 页同步。';}}catch{update();}};update();
}
function formulas(){
 const v=(k,a,b)=>'<mrow class="formula-variable" data-formula-var="'+k+'" tabindex="0" aria-describedby="filterVariableTooltip">'+(b?sub(a,b):mi(a))+'</mrow>',C=v('C','C','bus'),V=v('V','V','dc'),P=v('P','P','con'),T=v('T','T','h'),eta=v('eta','η'),f=v('f','f','0');
 const line=(label,s)=>'<div class="rc-equation"><div class="help-label">'+label+'</div>'+math(s)+'</div>';
 return line('储能要求',frac(mn(1),mn(2))+C+sup(V,2)+mo('≥')+frac(P,eta)+T+mo('=')+v('E','E','req'))+line('最低总等效电容',v('min','C','bus,min')+mo('=')+frac(mn(2)+P+T,sup(V,2)+eta))+line('默认保持时间 · 可切换独立设定',T+mo('=')+frac(mn(1),f))+line('两个相同电容串联',v('each','C','1')+mo('=')+v('each','C','2')+mo('=')+mn(2)+C)+'<p class="help-label">Cbus 是 DC 正负母线之间的总等效电容。两个相同电容串联时，每只容量为 2Cbus，不能将单只值当作总等效值。效率以比例代入：98% = 0.98。当前仅校核保持时间储能准则。</p>';
}
