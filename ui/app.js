import {installCompactInspector} from './compact-inspector.js?v=compact1';
import {mountResonance,resonanceSummary} from './resonance-design.js?v=resonance4';
import {operatingSummary} from './operating-summary.js?v=pq1';
import {inverterOperatingContext} from '../analysis/operating-point.js?v=pq1';
import {mountDcCapDesign} from './dc-cap-design.js?v=pq1';
import {dcCapSummary} from './dc-cap-summary.js?v=pq1';
import {projectStore} from '../project/sync.js?v=sync1';
import {mountDcDesign} from './dc-design.js?v=pq1';
import {mountRcDesign} from './rc-design.js?v=pq1';
import {mountFilterDesign} from './filter-design.js?v=pq1';
import {transformerImpedance} from '../core/electrical/transformer.js?v=transformer-rx3';
import {mountScrMatch} from './scr-match.js?v=transformer-rx3';
import {derivedFormulas,transformerFormulas} from './derived-formulas.js?v=tr-units';
import {Editor} from './editor.js?v=pointer-release1';
import {catalog,isIbr} from '../components/catalog.js?v=transformer-rx3';
import {emptyProject,parseProject,serializeProject} from '../project/model.js?v=transformer-rx3';
import {fromSI,toSI} from '../core/electrical/units.js?v=transformer-rx3';
import {rlImpedance,rcImpedance,magnitude,ratio,angleDegrees} from '../core/electrical/impedance.js?v=impedance-angle';
import {createAutomaticAnalysis} from '../analysis/automatic.js?v=transformer-rx3';
import {installInspectorResize} from './inspector-resize.js?v=transformer-rx3';
import {referenceIbrCandidates} from '../core/network/graph.js?v=transformer-rx3';
import {demo} from '../examples/demo.js?v=gfm-pi1';
import {escapeHtml as esc,thumbnail} from './symbols.js?v=transformer-rx3';
const $=id=>document.getElementById(id),fmt=(n,d=4)=>n==='Infinity'?'∞':n===null||n===undefined?'—':Number.isFinite(n)?Number(n.toPrecision(d)).toLocaleString('en-US',{maximumFractionDigits:8}):'—';
const row=(label,value)=>`<div class="metric-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
const automatic=createAutomaticAnalysis();
const shared=projectStore(localStorage,parseProject,serializeProject);
let receiving=false;
let compactInspector=null;
let result=null,selected=null,tab='properties',activePcc='PCC1';
const editor=new Editor($('canvas'),demo(),onChange,onSelect,msg=>$('status').textContent=msg);
function setTab(value){tab=value;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===value));$('propertiesPanel').hidden=value!=='properties';$('analysisPanel').hidden=value!=='analysis';if(value==='analysis')renderAnalysis();}
function summary(){const p=editor.project;$('projectName').value=p.name;$('frequency').value=p.frequencyHz;$('projectSummary').textContent=`${p.components.length} 个元件 · ${p.wires.length} 条连接 · 三相平衡系统`;$('emptyHint').hidden=!!p.components.length;document.querySelector('footer>span:last-child').textContent=`SI ENGINE · ${p.frequencyHz} Hz`;}
function onChange(){selected=editor.project.components.find(c=>c.id===selected?.id)||null;summary();renderProperties();calculate();if(!receiving)try{const merged=shared.write(editor.project);if(serializeProject(merged)!==serializeProject(editor.project))queueMicrotask(()=>receiveProject(shared.read()));}catch(e){$('status').textContent='保存失败：'+e.message;} }
function selectPcc(id){if(activePcc===id)return;activePcc=id;calculate();}
function onSelect(c){selected=c;compactInspector?.setSelection(c);if(c?.type==='bus'&&c.parametersSI.isPcc){selectPcc(c.id);setTab('analysis');}else if(c)setTab('properties');renderProperties();renderAnalysis();}
function commit(change){editor.state.checkpoint();change();editor.changed();}
function renderProperties(){const c=selected;compactInspector?.setSelection(c);if(!c){$('propertiesPanel').innerHTML='<div class="empty-panel"><div class="empty-symbol">⌁</div><strong>选择一个元件</strong><p>点击画布中的元件编辑参数，<br>或选择 PCC 查看电网强度。</p></div><div class="note">工程使用 SI 单位计算。输入框中的 kV、MVA、mH、μF 会自动转换。</div>';return;}
 const def=catalog[c.type];let last='';let fields='';for(const f of def.fields){if(f.group!==last){fields+=`<h3 class="field-group">${esc(f.group)}</h3>`;last=f.group;}fields+=`<label class="field"><span>${esc(f.label)}</span><div class="field-input"><input data-param="${esc(f.key)}" aria-label="${esc(f.label)}" type="number" step="any" value="${Number(fromSI(c.parametersSI[f.key],f.unit).toPrecision(12))}"><small>${esc(f.unit)}</small></div></label>`;}
 let extra='';if(c.type==='rl'||c.type==='rc'){const p=c.parametersSI,z=c.type==='rl'?rlImpedance(p.resistanceOhm,p.inductanceH,editor.project.frequencyHz):rcImpedance(p.resistanceOhm,p.capacitanceF,editor.project.frequencyHz);extra=`<h3 class="field-group">当前频率下的派生值</h3>${row(c.type==='rl'?'X':'Xc',fmt(Math.abs(z.im))+' Ω')}${row('|Z|',fmt(magnitude(z))+' Ω')}${c.type==='rl'?row('X/R（无量纲）',fmt(ratio(z)))+row('阻抗角 θ',angleDegrees(z)===null?'未定义':fmt(angleDegrees(z))+'°'):'<div class="note warning">固定拓扑：AC 母线至中性点的并联串联 RC。V1 不计入 SCR。</div>'}`;}
 if(c.type==='rl'||c.type==='rc')extra+=derivedFormulas(c,editor.project.frequencyHz);
 if(c.type==='transformer'){const z=transformerImpedance(c.parametersSI,editor.project.frequencyHz,false);extra=`<div class="note">理想变比＋串联短路 R/X；pu 基准为本变压器额定容量和电压，X 对应基准频率。R 表示绕组等效损耗，X 表示漏抗；均计入上游 SCR。不含励磁、铁损、饱和、组别和电流缩放。R=X=0 可恢复理想模型。</div>${row('二次侧等效 R',fmt(z.re)+' Ω')}${row('二次侧等效 X（当前频率）',fmt(z.im)+' Ω')}${row('二次侧漏感 L',fmt(z.im/(2*Math.PI*editor.project.frequencyHz)*1000)+' mH')}`;}
 if(c.type==='rc')extra+=resonanceSummary(editor.project,c);
 if(c.type==='transformer')extra+=transformerFormulas(c,editor.project.frequencyHz);
 if(c.type==='bus')extra=`<label class="inline-check"><input id="isPcc" type="checkbox" ${c.parametersSI.isPcc?'checked':''}>标记为 PCC</label><button id="showAnalysis" class="primary calculate">打开 Grid Strength 分析 ↗</button>`;
 if(isIbr(c))extra='<div class="note">SCR 使用额定 S，不使用当前 P/Q。滤波 Rf/Lf 位于逆变器侧，不计入 PCC 上游阻抗。GFL / GFM 的 PI 参数整定可通过上方设计入口打开；模型范围在整定页说明。</div>';
 if(c.type==='dc')extra='<div class="note">DC 参数可保存和连接至逆变器 DC 端口，暂不参与 AC SCR 计算。</div>';
 if(isIbr(c))extra+=operatingSummary(inverterOperatingContext(editor.project,c))+dcCapSummary(editor.project,c);
 $('propertiesPanel').innerHTML=`<div class="section-eyebrow">COMPONENT PROPERTIES</div><h2 class="panel-title">${esc(def.label)}</h2><p class="panel-sub">${esc(def.en)} · ID ${esc(c.id)}</p><label class="field"><span>元件名称</span><input id="componentName" value="${esc(c.name)}"></label>${isIbr(c)?'<button id="openFilterDesign" class="primary design-launch"><span>滤波电感设计</span><b aria-hidden="true">↗</b></button><button id="openDcCapDesign" class="primary design-launch"><span>DC 母线电容设计</span><b aria-hidden="true">↗</b></button>':c.type==='rc'?'<button id="openRcDesign" class="primary design-launch"><span>RC 滤波设计</span><b aria-hidden="true">↗</b></button><button id="openResonance" class="primary design-launch"><span>谐振分析 · 局部与全网</span><b aria-hidden="true">↗</b></button>':c.type==='dc'?'<button id="openDcDesign" class="primary design-launch"><span>DC 电压设计</span><b aria-hidden="true">↗</b></button>':''}${isIbr(c)?'<button id="designSelectedGfl" class="primary design-launch"><span>PI 参数设计</span><b aria-hidden="true">↗</b></button>':''}${fields}${extra}<div id="parameterError" role="alert"></div>`;
 if($('openFilterDesign'))$('openFilterDesign').onclick=()=>{
  const dialog=$('filterDesignDialog');dialog.dataset.returnFocus='openFilterDesign';$('closeFilterDesign').setAttribute('aria-label','关闭滤波电感设计');
  $('filterDesignTitle').textContent=`滤波电感设计 · ${c.name} · ${c.id}`;
  mountFilterDesign($('filterDesign'),editor.project,c,values=>commit(()=>{c.extensions??={};c.extensions.filterDesign=values;}),(l,values)=>commit(()=>{c.extensions??={};c.extensions.filterDesign=values;c.parametersSI.filterInductanceH=l;}));
  dialog.showModal();
 };
 if($('openDcCapDesign'))$('openDcCapDesign').onclick=()=>{
  const dialog=$('filterDesignDialog');dialog.dataset.returnFocus='openDcCapDesign';$('closeFilterDesign').setAttribute('aria-label','关闭 DC 母线电容设计');
  $('filterDesignTitle').textContent=`DC 母线电容设计 · ${c.name} · ${c.id}`;
  mountDcCapDesign($('filterDesign'),editor.project,c,values=>commit(()=>{c.extensions??={};c.extensions.dcCapDesign=values;}),(params,values)=>commit(()=>{c.extensions??={};c.extensions.dcCapDesign=values;c.extensions.dcCapacitor=params;}));dialog.showModal();
 };
 if($('openResonance'))$('openResonance').onclick=()=>{
  const dialog=$('filterDesignDialog');dialog.dataset.returnFocus='openResonance';
  $('filterDesignTitle').textContent=`谐振分析 · ${c.name} · ${c.id}`;
  $('closeFilterDesign').setAttribute('aria-label','关闭谐振分析');
  mountResonance($('filterDesign'),editor.project,c,values=>commit(()=>{c.extensions??={};c.extensions.resonance=values;}));
  dialog.showModal();
 };
 if($('openRcDesign'))$('openRcDesign').onclick=()=>{
  const dialog=$('filterDesignDialog');dialog.dataset.returnFocus='openRcDesign';
  $('filterDesignTitle').textContent=`RC 滤波设计 · ${c.name} · ${c.id}`;
  $('closeFilterDesign').setAttribute('aria-label','关闭 RC 滤波设计');
  mountRcDesign($('filterDesign'),editor.project,c,values=>commit(()=>{c.extensions??={};c.extensions.rcDesign=values;}),(params,values)=>commit(()=>{c.extensions??={};c.extensions.rcDesign=values;Object.assign(c.parametersSI,params);}));
  dialog.showModal();
 };
 if($('openDcDesign'))$('openDcDesign').onclick=()=>{
  const dialog=$('filterDesignDialog');dialog.dataset.returnFocus='openDcDesign';
  $('filterDesignTitle').textContent=`DC 电压设计 · ${c.name} · ${c.id}`;
  $('closeFilterDesign').setAttribute('aria-label','关闭 DC 电压设计');
  mountDcDesign($('filterDesign'),editor.project,c,values=>commit(()=>{c.extensions??={};c.extensions.dcDesign=values;}),(v,values)=>commit(()=>{c.extensions??={};c.extensions.dcDesign=values;c.parametersSI.voltageV=v;}));
  dialog.showModal();
 };
 if($('designSelectedGfl'))$('designSelectedGfl').onclick=()=>{shared.write(editor.project);location.href=(c.type==='gfm'?'gfm.html':'gfl.html')+'?ibr='+encodeURIComponent(c.id);};
 $('componentName').addEventListener('change',e=>commit(()=>c.name=e.target.value));
 document.querySelectorAll('[data-param]').forEach(input=>input.addEventListener('change',()=>{const f=def.fields.find(f=>f.key===input.dataset.param),v=toSI(input.valueAsNumber,f.unit);if(!Number.isFinite(v)||v<f.min||(f.strict&&v===f.min)){$('parameterError').innerHTML='<div class="note error">请输入合法的有限数值；当前修改尚未应用。</div>';input.setAttribute('aria-invalid','true');return;}commit(()=>{c.parametersSI[f.key]=v;if(c.type==='source'&&f.key==='frequencyHz'){editor.project.frequencyHz=v;editor.project.components.filter(x=>x.type==='source').forEach(x=>x.parametersSI.frequencyHz=v);}});}));
 if($('isPcc'))$('isPcc').onchange=e=>commit(()=>c.parametersSI.isPcc=e.target.checked);if($('showAnalysis'))$('showAnalysis').onclick=()=>{selectPcc(c.id);setTab('analysis');};
}
function renderAnalysis(){const p=editor.project,pccs=p.components.filter(c=>c.type==='bus'&&c.parametersSI.isPcc);if(!pccs.some(c=>c.id===activePcc))activePcc=pccs[0]?.id||'';const pcc=pccs.find(c=>c.id===activePcc);let candidates=[];if(pcc){candidates=referenceIbrCandidates(p,pcc.id);}
 const chosen=candidates.find(c=>c.id===pcc?.parametersSI.primaryIbrId)||(candidates.length===1?candidates[0]:null),r=result?.pccId===activePcc?result:null;
 let html=`<div class="section-eyebrow">PCC ANALYSIS</div><h2 class="panel-title">电网强度</h2><p class="panel-sub">Thevenin equivalent & short-circuit ratio</p><label class="field"><span>分析母线 / PCC</span><select id="pccSelect">${pccs.length?pccs.map(c=>`<option value="${esc(c.id)}" ${c.id===activePcc?'selected':''}>${esc(c.name)} · ${fmt(c.parametersSI.ratedVoltageV/1000)} kV</option>`).join(''):'<option value="">请先放置 Bus / PCC</option>'}</select></label>`;
 if(pcc)html+=`<button id="editPcc" class="contribution">编辑母线参数 ↗</button><label class="field"><span>容量基准 IBR · SCR 分母</span><select id="ibrSelect"><option value="">${candidates.length===1?'自动：'+esc(candidates[0].name):'请选择主要 IBR'}</option>${candidates.map(c=>`<option value="${esc(c.id)}" ${c.id===pcc.parametersSI.primaryIbrId?'selected':''}>${esc(c.name)} · ${fmt(c.parametersSI.ratedApparentPowerVA/1e6)} MVA</option>`).join('')}</select></label>`;
 html+=row('额定电压',pcc?fmt(pcc.parametersSI.ratedVoltageV/1000)+' kV':'—')+row('IBR 额定容量',chosen?fmt(chosen.parametersSI.ratedApparentPowerVA/1e6)+' MVA':'—')+row('Operating P / Q',chosen?`${fmt(chosen.parametersSI.activePowerW/1e6)} MW / ${fmt(chosen.parametersSI.reactivePowerVar/1e6)} Mvar`:'—')+'<div id="analysisMode" class="automatic-status">自动计算 · 输入变化时更新</div>';
 if(r?.status==='error')html+=`<div class="note error" role="alert">${r.errors.map(esc).join('<br>')}</div>`;
 else if(r){html+=`<div class="scr-card"><div class="label">SHORT-CIRCUIT RATIO</div><div class="value">${fmt(r.scr)}</div><div class="formula">Ssc / S IBR rated · 额定容量基准</div></div>`;if(r.status==='ideal-grid')html+='<div class="note warning">Theoretical SCR = Infinity<br>The PCC is connected to an ideal zero-impedance voltage source.</div>';
 html+=`<div id="scrMatch"></div><h3 class="field-group">GRID EQUIVALENT · PCC 侧</h3>${row('Rth',fmt(r.zTheveninOhm.re)+' Ω')}${row('Xth',fmt(r.zTheveninOhm.im)+' Ω')}${row('|Zth|',fmt(r.magnitudeOhm)+' Ω')}${row('X/R（无量纲）',fmt(r.xr))}${row('阻抗角 θ',angleDegrees(r.zTheveninOhm)===null?'未定义':fmt(angleDegrees(r.zTheveninOhm))+'°')}${row('短路容量 Ssc',r.shortCircuitVA==='Infinity'?'∞ MVA':fmt(r.shortCircuitVA/1e6)+' MVA')}<h3 class="field-group">PER-UNIT BASE</h3>${row('Vbase / Sbase',fmt(r.voltageBaseV/1000)+' kV / '+fmt(r.powerBaseVA===null?null:r.powerBaseVA/1e6)+' MVA')}${row('Zbase',fmt(r.zBaseOhm)+' Ω')}${row('Zth (pu)',r.zTheveninPu?fmt(r.zTheveninPu.re)+' + j'+fmt(r.zTheveninPu.im):'—')}<h3 class="field-group">IMPEDANCE CONTRIBUTIONS</h3><p class="help-label">点击定位元件 · 数值均折算到 PCC 侧</p>${r.contributions.map(c=>`<button class="contribution" data-focus="${esc(c.id)}"><b>${esc(c.name)} ↗</b><span>${fmt(c.referredOhm.re)} + j${fmt(c.referredOhm.im)} Ω${c.type==='transformer'?' · transformer':''}</span><span>${c.pu?`${fmt(c.pu.re)} + j${fmt(c.pu.im)} pu`:'无容量基准'} · 折算 ×${fmt(c.factor)}</span></button>`).join('')}`;
 }
 html+='<div class="note warning">分析口径：单电源径向网络。RC Filter 不计入 Zth / SCR；逆变器侧滤波器与 DC 支路不计入电网等效。</div>';if(r)html+=r.warnings.filter(w=>!w.startsWith('V1')).map(w=>`<div class="note">${esc(w)}</div>`).join('');
 $('analysisPanel').innerHTML=html;
 if($('scrMatch'))mountScrMatch($('scrMatch'),p,r,(id,values)=>commit(()=>{const c=p.components.find(c=>c.id===id);c.parametersSI.resistanceOhm=values.resistanceOhm;c.parametersSI.inductanceH=values.inductanceH;}));
 $('pccSelect').onchange=e=>{selectPcc(e.target.value);renderAnalysis();};
 if($('ibrSelect'))$('ibrSelect').onchange=e=>commit(()=>pcc.parametersSI.primaryIbrId=e.target.value);
 if($('editPcc'))$('editPcc').onclick=()=>{selected=pcc;editor.select(pcc.id);setTab('properties');renderProperties();};

 document.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>{editor.focus(b.dataset.focus);setTab('analysis');});
}
function calculate(){
 const p=editor.project,pccs=p.components.filter(c=>c.type==='bus'&&c.parametersSI.isPcc);
 if(!pccs.some(c=>c.id===activePcc))activePcc=pccs[0]?.id||'';
 const next=automatic.run(p,activePcc);result=next.result;
 editor.result=result?.status!=='error'?result:null;editor.render();
 renderAnalysis();updateStrip();
 $('analysisPanel').dataset.calculationRevision=next.revision;
 if(next.changed)$('status').textContent=!result?'请放置并连接分析母线':result.status==='error'?result.errors[0]:'自动计算完成 · 绿色路径为当前分析母线的上游电网';
}
function updateStrip(){const r=result?.status!=='error'?result:null;$('stripZ').textContent=r?fmt(r.magnitudeOhm):'—';$('stripS').textContent=r?fmt(r.shortCircuitVA==='Infinity'?'Infinity':r.shortCircuitVA/1e6):'—';$('stripScr').textContent=r?fmt(r.scr):'—';$('analysisHint').textContent=r?`${editor.project.components.find(c=>c.id===r.pccId)?.name} · 上游电网等效已计算`:'选择 PCC，查看电网等效与短路比';renderEquation(r);}

function renderEquation(r){
 const n=v=>'<mn>'+esc(fmt(v,6))+'</mn>',u=t=>'<mtext>'+t+'</mtext>';
 const values=r&&r.powerBaseVA!==null?'<math display="block"><mrow><mi mathvariant="normal">SCR</mi><mo>=</mo><mfrac><mrow><msup>'+n(r.voltageBaseV/1000)+'<mn>2</mn></msup>'+'<mspace width="0.2em"/>'+u('kV²')+'</mrow><mrow>'+n(r.magnitudeOhm)+'<mspace width="0.2em"/>'+u('Ω')+'<mo>×</mo>'+n(r.powerBaseVA/1e6)+'<mspace width="0.2em"/>'+u('MVA')+'</mrow></mfrac><mo>≈</mo>'+n(r.scr)+'</mrow></math>':'<span class="equation-empty">'+(result?.status==='error'?'当前网络无法计算，请查看右侧原因。':'选择分析母线及 IBR 容量基准后显示数值代入。')+'</span>';
 $('equationValues').innerHTML=values;
}

$('closeFilterDesign').onclick=()=>$('filterDesignDialog').close();
$('filterDesignDialog').addEventListener('keydown',e=>e.stopPropagation());
$('filterDesignDialog').addEventListener('close',()=>document.getElementById($('filterDesignDialog').dataset.returnFocus)?.focus());
$('palette').innerHTML=Object.entries(catalog).map(([type,d])=>`<button class="palette-item" draggable="true" data-tool="${type}"><span class="palette-icon">${thumbnail(type)}</span><span><b>${d.label}</b><small>${d.en}</small></span></button>`).join('');
 document.querySelectorAll('[data-tool]').forEach(b=>{b.onclick=()=>editor.setTool(b.dataset.tool);if(catalog[b.dataset.tool])b.ondragstart=e=>e.dataTransfer.setData('component',b.dataset.tool);});document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>editor.action(b.dataset.action));document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
$('zoomIn').onclick=()=>editor.setZoom(editor.project.editor.zoom*1.12);$('zoomOut').onclick=()=>editor.setZoom(editor.project.editor.zoom/1.12);$('fit').onclick=()=>editor.fit();
$('projectName').onchange=e=>commit(()=>editor.project.name=e.target.value||'Untitled network');$('frequency').onchange=e=>{const n=e.target.valueAsNumber;if(!Number.isFinite(n)||n<=0){$('status').textContent='频率必须大于 0';e.target.value=editor.project.frequencyHz;return;}commit(()=>{editor.project.frequencyHz=n;editor.project.components.filter(c=>c.type==='source').forEach(c=>c.parametersSI.frequencyHz=n);});};
function replace(p,fit=false){shared.accept(null);selected=null;activePcc=p.components.find(c=>c.type==='bus'&&c.parametersSI.isPcc)?.id||'';editor.setProject(p);if(fit||!p.editor)editor.fit();}
let replaceAction=null;function requestReplace(action){replaceAction=action;$('replaceDialog').showModal();}$('cancelReplace').onclick=()=>$('replaceDialog').close();$('confirmReplace').onclick=()=>{$('replaceDialog').close();replaceAction?.();replaceAction=null;};$('closeError').onclick=()=>$('errorDialog').close();
$('newProject').onclick=()=>requestReplace(()=>replace(emptyProject(),true));$('loadExample').onclick=()=>requestReplace(()=>{replace(demo($('example').value),true);setTab('analysis');});
$('saveProject').onclick=()=>{try{const text=serializeProject(editor.project),blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=editor.project.name.replace(/[<>:"/\\|?*]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('status').textContent='已导出工程 JSON，参数、连接与画布布局均已保存。';}catch(e){$('status').textContent='保存失败：'+e.message;}};
$('importProject').onclick=()=>$('fileInput').click();$('fileInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10e6)throw Error('工程超过 10 MB 限制。');const p=parseProject(await file.text());replace(p);$('status').textContent='已导入 '+file.name;}catch(error){$('status').textContent='导入失败，原工程已保留：'+error.message;$('importErrorMessage').textContent='原工程已保留。\n'+error.message;$('errorDialog').showModal();}e.target.value='';};
let restored=false;try{const saved=localStorage.getItem('gridcraft-v1');if(saved){replace(parseProject(saved));restored=true;}}catch{}
// Never save an old snapshot on pagehide: every committed edit is already saved.
shared.accept(editor.project);
function receiveProject(p){
 if(!p||serializeProject(p)===serializeProject(editor.project))return;
 const selectedId=selected?.id,dialog=$('filterDesignDialog'),open=dialog.open,launch=dialog.dataset.returnFocus;
 const focused=document.activeElement;
 const activeFormula=focused?.dataset.formulaVar||$('filterDesign').querySelector('[data-formula-var]:hover')?.dataset.formulaVar;
 const draft=focused?.matches('#filterDesign input, #filterDesign select')?{filter:focused.dataset.filter,rc:focused.dataset.rc,dc:focused.dataset.dc,cap:focused.dataset.cap,res:focused.dataset.res,value:focused.value}:null;
 receiving=true;
 try{
  shared.accept(p);editor.state.restore(serializeProject(p));editor.state.history=[];editor.state.future=[];editor.pendingTerminal=null;
  selected=p.components.find(c=>c.id===selectedId)||null;
  onChange();
  if(open){
   const button=$(launch);
   if(button){button.click();
    if(activeFormula){const variable=$('filterDesign').querySelector('[data-formula-var="'+activeFormula+'"]');if(variable){if(focused?.dataset.formulaVar)variable.focus();else variable.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));}}
    if(draft){const attr=draft.filter?'data-filter':draft.rc?'data-rc':draft.cap?'data-cap':draft.res?'data-res':'data-dc',key=draft.filter||draft.rc||draft.dc||draft.cap||draft.res,field=$('filterDesign').querySelector('['+attr+'="'+key+'"]');if(field){field.value=draft.value;field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();}}
   }else dialog.close();
  }
  $('status').textContent='已同步其他页面的参数；计算结果已更新。';
 }catch(e){if(open)dialog.close();$('status').textContent='同步失败：'+e.message;}finally{receiving=false;}
}
window.addEventListener('storage',e=>{if(e.key==='gridcraft-v1')try{receiveProject(shared.read());}catch(e){$('status').textContent='同步失败：'+e.message;}});
window.addEventListener('pageshow',()=>{try{receiveProject(shared.read());}catch{}});
installInspectorResize($('inspectorResize'));
compactInspector=installCompactInspector({panel:$('inspectorPanel'),toggle:$('toggleInspector'),close:$('closeInspector'),label:$('compactSelection'),canvas:$('canvas'),canOpen:()=>editor.tool==='select'&&!editor.space});
summary();renderProperties();if(!restored)editor.fit();calculate();if(editor.project.components.some(c=>c.id===activePcc)){editor.select(activePcc);setTab('analysis');}
