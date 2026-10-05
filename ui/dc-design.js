import {operatingSummary} from './operating-summary.js?v=pq1';
import {operatingPoint} from '../analysis/operating-point.js?v=pq1';
import {designDcVoltage,dcDesignCandidates,dcDesignContext,dcInputIssues} from '../analysis/dc-voltage.js?v=pq1';
import {installFormulaTooltip} from './formula-tooltip.js?v=linkage1';
import {markDesignInputs} from './design-input-validation.js?v=pq1';
import {escapeHtml as esc} from './symbols.js?v=transformer-rx3';
import {math,sub,mi,mn,mo,frac,sqrt,sup} from './paper-math.js';
const fmt=v=>v==null?'待补充':Number.isFinite(v)?Number(v.toPrecision(6)).toString():'不可计算';
const metric=(label,value)=>`<div class="metric-row"><span>${label}</span><b>${value}</b></div>`;
export function mountDcDesign(host,project,c,save,apply){
 const candidates=dcDesignCandidates(project,c.id),stored=c.extensions?.dcDesign||{},ibrId=stored.ibrId??(candidates.length===1?candidates[0].id:'');
 let angle=0;try{angle=dcDesignContext(project,c.id,ibrId).referenceAngleDeg;}catch{}
 const settings={designMode:'operating',ibrId,phaseAngleDeg:angle,modulation:'spwm',marginPercent:5,selectedV:c.parametersSI.voltageV,...stored};
 const field=(key,label,unit,value,min=0)=>`<label class="field"><span>${label}</span><div class="field-input"><input data-dc="${key}" aria-label="${label}" type="number" step="any" min="${min}" value="${esc(String(value??''))}"><small>${unit}</small></div></label>`;
 host.innerHTML=`<div class="filter-design-grid"><section><h3>01 · 设计输入</h3><p class="help-label">DC 电压选型 · 调制上限与电压裕量</p>
 <label class="field"><span>关联 GFL / GFM（同一 DC 节点）</span><select data-dc="ibrId" aria-label="DC 设计关联逆变器"><option value="">请选择设计对象</option>${candidates.map(x=>`<option value="${esc(x.id)}">${esc(x.name)} · ${esc(x.id)}</option>`).join('')}</select></label>
 <div data-dc-context></div>
 <label class="field"><span>电压设计工况</span><select data-dc="designMode"><option value="operating">运行 P/Q · 自动联动</option><option value="rated">额定电流 · 自定功率因数角</option></select></label>
 ${field('phaseAngleDeg','设计功率因数角 φ','°',settings.phaseAngleDeg,-90)}
 <button type="button" data-dc-angle class="contribution">读取关联元件的额定 P/Q 角</button>
 <p class="help-label">电流正方向：逆变器 → 电网；φ &gt; 0 表示输出正无功，φ &lt; 0 表示吸收无功。运行模式自动读取 P/Q、电流和相角；额定模式保持额定电流，按指定角度校核。</p>
 <label class="field"><span>调制方式</span><select data-dc="modulation" aria-label="DC 设计调制方式"><option value="spwm">SPWM，无三次谐波注入 · mmax = 1.00</option><option value="third">三次谐波注入 · mmax = 1.15</option></select></label>
 ${field('marginPercent','要求调制裕量 ε','%',settings.marginPercent)}
 <div class="note">模型忽略电容基波电流、电感电阻和 DC 内阻压降；交流电压使用变流器侧额定线电压。多工况设计需分别校核，取最低 DC 电压要求的最大值。</div>
 </section><section><h3>02 · 电压与调制校核</h3><div data-dc-result aria-live="polite"></div>
 ${field('selectedV','选用 DC 电压 Vdc','V',settings.selectedV)}
 <div data-dc-preview></div>
 <button type="button" data-dc-min class="contribution">选用最低电压（向上取整至 1 V）</button>
 <button type="button" data-dc-apply class="primary calculate">应用到此 DC 电源</button>
 <div data-dc-applied role="status"></div>
 <p class="help-label">仅应用 DC 电压，支持撤销。电感设计与 PI 页面同步读取最新 DC 值；选用电感和 RC 参数仍需各自应用。</p>
 </section><section class="derived-equations filter-design-formulas"><h3>03 · 设计公式与定义</h3><p class="help-label">悬停或 Tab 聚焦变量查看值与单位；Vdc 和 m 使用窗口选用值。</p>${formulas(settings.designMode)}</section></div>`;
 host.querySelector('[data-dc="ibrId"]').value=settings.ibrId;host.querySelector('[data-dc="modulation"]').value=settings.modulation;host.querySelector('[data-dc="designMode"]').value=settings.designMode;
 let shownMode=settings.designMode;
 const inputs=[...host.querySelectorAll('[data-dc]')],context=host.querySelector('[data-dc-context]'),result=host.querySelector('[data-dc-result]'),preview=host.querySelector('[data-dc-preview]'),status=host.querySelector('[data-dc-applied]'),button=host.querySelector('[data-dc-apply]'),min=host.querySelector('[data-dc-min]'),angleButton=host.querySelector('[data-dc-angle]'),setVariables=installFormulaTooltip(host);
 const read=()=>Object.fromEntries(inputs.map(el=>[el.dataset.dc,el.tagName==='SELECT'?el.value:el.value===''?null:el.valueAsNumber]));
 const calc=()=>{const values=read(),ctx=dcDesignContext(project,c.id,values.ibrId);return {values,ctx,r:designDcVoltage({...ctx,...values})};};
 const persist=()=>{const p=read();if(!Object.values(p).some(v=>typeof v==='number'&&!Number.isFinite(v)))save(p);};
 function update(){
  const mode=read().designMode,angleField=host.querySelector('[data-dc="phaseAngleDeg"]');
  angleField.disabled=mode==='operating';angleButton.disabled=mode==='operating';
  if(mode==='operating')try{angleField.value=operatingPoint(dcDesignContext(project,c.id,read().ibrId)).angleDeg;}catch{}
  if(shownMode!==mode){host.querySelector('.filter-design-formulas').innerHTML='<h3>03 · 设计公式与定义</h3>'+formulas(mode);shownMode=mode;}
  markDesignInputs(host,'data-dc',dcInputIssues(read(),null));
  try{const {values,ctx,r}=calc();markDesignInputs(host,'data-dc',dcInputIssues(values,r));
   context.innerHTML=operatingSummary(ctx)+metric('额定容量 / 线电压',fmt(ctx.ratedVA/1e6)+' MVA / '+fmt(ctx.voltageLL)+' V')+metric('滤波电感 / 基波频率',fmt(ctx.L*1000)+' mH / '+fmt(ctx.frequencyHz)+' Hz')+metric('本次校核相电流 RMS',fmt(r.currentRms)+' A')+metric('功率因数 cos φ',fmt(r.powerFactor))+metric('本校核工况 P / Q',fmt(r.designP/1e6)+' MW / '+fmt(r.designQ/1e6)+' Mvar');
   result.innerHTML=metric('并网侧相电压 RMS',fmt(r.phaseRms)+' V')+metric('电感基波压降幅值',fmt(r.inductorDropRms)+' V')+metric('所需变流器相电压 RMS',fmt(r.converterRms)+' V')+metric('最低 DC 电压（含裕量）',fmt(r.minimumV)+' V')+metric('调制上限 mmax',fmt(r.maxModulation))+metric('含裕量允许调制比',fmt(r.allowedModulation));
   const actual=designDcVoltage({...ctx,...values,selectedV:ctx.currentV});
   preview.innerHTML=metric('选用电压的调制比 m',fmt(r.modulationIndex))+metric('选用电压的实际调制裕量',r.availableMarginPercent==null?'待补充':fmt(r.availableMarginPercent)+'%')+`<div class="note ${r.pass?'':'error'}">${r.pass?'选用 DC 电压满足此工况及设定裕量。':values.selectedV==null?'请输入选用 DC 电压。':r.overmodulation?'已超过线性调制上限，请提高 DC 电压。':'未达到设定调制裕量，请提高 DC 电压。'}</div>`+metric('拓扑当前 DC 电压',fmt(ctx.currentV)+' V')+metric('当前电压对应 m',fmt(actual.modulationIndex))+(ctx.sharedCount>1?'<div class="note warning">此 DC 电源连接 '+ctx.sharedCount+' 个逆变器；这里只校核所选对象，应用电压会影响全部连接对象。</div>':'')+(ctx.dcResistance>0?'<div class="note warning">此电源存在内阻；上述计算未扣除 DC 内阻压降，请另行核实负载下端电压。</div>':'');
   button.disabled=!r.pass;min.disabled=false;angleButton.disabled=false;setVariables(variableValues(ctx,values,r));
  }catch(e){context.innerHTML='';result.innerHTML='<div class="note error">'+esc(e.message)+'</div>';preview.innerHTML='';button.disabled=true;min.disabled=true;angleButton.disabled=!candidates.some(x=>x.id===read().ibrId);setVariables({});}
 }
 inputs.forEach(el=>{el.oninput=()=>{status.textContent='';update();};el.onchange=()=>{status.textContent='';update();persist();};});
 min.onclick=()=>{try{const {r}=calc();host.querySelector('[data-dc="selectedV"]').value=Math.ceil(r.minimumV);status.textContent='';update();persist();}catch{}};
 angleButton.onclick=()=>{try{host.querySelector('[data-dc="phaseAngleDeg"]').value=dcDesignContext(project,c.id,read().ibrId).referenceAngleDeg;status.textContent='';update();persist();}catch{}};
 button.onclick=()=>{try{const {values,r}=calc();if(r.pass){apply(values.selectedV,values);update();status.textContent='已应用到 '+c.name+'，DC 电压已同步。';}}catch{update();}};
 update();
}
function variableValues(ctx,p,r){
 const val=(label,v,u)=>label+'：'+fmt(v)+' '+u;
 return {P:val('运行有功',ctx.activeW/1e6,'MW'),Q:val('运行无功',ctx.reactiveVar/1e6,'Mvar'),S:val('三相额定容量',ctx.ratedVA/1e6,'MVA'),Vll:val('额定线电压 RMS',ctx.voltageLL,'V'),Vph:val('并网侧相电压 RMS',r.phaseRms,'V'),I:val('本次校核相电流 RMS',r.currentRms,'A'),omega:val('基波角频率',r.omega,'rad/s'),f:val('基波频率',ctx.frequencyHz,'Hz'),L:val('当前滤波电感',ctx.L*1000,'mH'),phi:val('功率因数角',r.phi*180/Math.PI,'°')+'（'+fmt(r.phi)+' rad）',drop:val('电感基波压降幅值',r.inductorDropRms,'V'),U:val('所需变流器相电压 RMS',r.converterRms,'V'),dc:val('选用 DC 电压',p.selectedV,'V'),m:val('调制比',r.modulationIndex,'（无量纲）'),max:val('调制上限',r.maxModulation,'（无量纲）'),epsilon:val('要求裕量',p.marginPercent/100,'（无量纲；'+fmt(p.marginPercent)+'%）'),min:val('最低 DC 电压',r.minimumV,'V')};
}
function formulas(mode='operating'){
 const v=(key,a,b)=>'<mrow class="formula-variable" data-formula-var="'+key+'" tabindex="0" aria-describedby="filterVariableTooltip">'+(b?sub(a,b):mi(a))+'</mrow>';
 const S=v('S','S','rated'),P=v('P','P','op'),Q=v('Q','Q','op'),Vll=v('Vll','V','LL,con'),Vph=v('Vph','V','ph'),I=v('I','I','n'),w=v('omega','ω','0'),f=v('f','f','0'),L=v('L','L','t'),phi=v('phi','φ'),U=v('U','V','c'),E=v('drop','V','L'),dc=v('dc','V','dc'),m=v('m','m'),max=v('max','m','max'),ep=v('epsilon','ε'),min=v('min','V','dc,min');
 const eq=mo('='),plus=mo('+'),two=mn(2),root2=sqrt(two),group=s=>'<mrow>'+s+'</mrow>',sq=s=>sup(group(mo('(')+s+mo(')')),2),trig=name=>mi(name)+mo('(')+phi+mo(')');
 const line=(label,s)=>'<div class="rc-equation"><div class="help-label">'+label+'</div>'+math(s)+'</div>';
 return line(mode==='operating'?'运行电流 · 跟随 P/Q':'额定基准',Vph+eq+frac(Vll,sqrt(mn(3)))+mo('；')+I+eq+frac(mode==='operating'?sqrt(sup(P,2)+plus+sup(Q,2)):S,sqrt(mn(3))+Vll))+
 line('电感基波压降幅值',E+eq+w+L+I)+
 line('所需变流器相电压',U+mo('≈')+sqrt('<mtable columnalign="left"><mtr><mtd>'+sq(Vph+plus+E+trig('sin'))+'</mtd></mtr><mtr><mtd>'+plus+sq(E+trig('cos'))+'</mtd></mtr></mtable>'))+
 line('调制指数',m+eq+frac(root2+U,frac(dc,two)))+
 line('含裕量的最低电压',dc+mo('≥')+min+eq+frac(two+root2+U,group(mo('(')+mn(1)+mo('−')+ep+mo(')'))+max))+
 line('允许调制比',m+mo('≤')+mo('(')+mn(1)+mo('−')+ep+mo(')')+max)+
 line('基波角频率',w+eq+two+mi('π')+f)+
 '<p class="help-label">为便于阅读，Vc、Vph 均为相电压 RMS，In 为所选工况的电流 RMS，VL 为电感压降幅值。无三次谐波注入：mmax = 1.00；有三次谐波注入：取 1.15。默认 ε = 0.05，对应分母 0.95 mmax。φ 用弧度参与运算，界面输入角度。Lt 对应逆变器滤波电感 Lf。</p>';
}
