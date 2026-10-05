import {gfmContext,gfmSettings,gfmModes,setGfmField} from '../project/gfm-settings.js?v=gfm-pi1';
import {autoTuneGfm,gfmSweep,gfmPolynomials,validateGfmInput,validateGfmGains} from '../analysis/gfm-pi.js?v=gfm-pi1';
import {isHurwitz} from '../analysis/gfl-autotune.js?v=autotune1';
import {crossings} from '../analysis/gfl-frequency.js?v=outer1';
import {kiFromTi,tiFromKi} from '../analysis/pi-time.js?v=ti1';
import {projectStore} from '../project/sync.js?v=sync1';
import {parseProject,serializeProject} from '../project/model.js?v=transformer-rx3';
import {bodeSvg,bodeLegend} from './bode-plot.js?v=outer1';
import {escapeHtml as esc} from './symbols.js?v=transformer-rx3';
const $=id=>document.getElementById(id),fmt=n=>Number.isFinite(n)?Number(n.toPrecision(7)).toString():'—';
const labels={d:'电流 d',q:'电流 q',P:'电压 d',Q:'电压 q'},key='gridcraft-v1',shared=projectStore(localStorage,parseProject,serializeProject);
const electrical=[['ratedVA','额定容量 S','MVA',1e6,0],['voltageLL','额定线电压 VLL','V',1,0],['L','滤波电感 Lf','μH',1e-6,0],['R','电感电阻 Rf','Ω',1,0],['C','支路电容 Cf','μF',1e-6,0],['Rc','支路阻尼 Rc','Ω',1,0],['dcVoltage','DC 电压','V',1,0],['activePowerW','运行 P / 初始 P*','MW',1e6,null],['reactivePowerVar','运行 Q / 初始 Q*','Mvar',1e6,null]];
const targets=[['fs','控制步长 Ts','μs'],['fi','电流交越上限','Hz'],['fv','电压交越上限','Hz'],['pm','目标相位裕度','°'],['delaySamples','纯延时 N × Ts','Ts']];
const filters=[['filterPqMs','P/Q 时间常数','ms'],['filterVdcMs','Vdc 时间常数（预留）','ms'],['filterVoltageMs','交流电压时间常数','ms'],['filterCurrentMs','电感电流时间常数','ms'],['feedforwardCurrent','送网电流前馈 F','pu'],['feedforwardVoltage','电压前馈 av','pu']];
const modeDefs={droop:[['mp','P–f 下垂','%'],['nq','Q–V 下垂','%']],vsg:[['h','虚拟惯量 H','s'],['d','频率阻尼 D','pu'],['nq','Q–V 下垂','%'],['kv','电压积分增益 Kv','s⁻¹']],sync:[['h','虚拟惯量 H','s'],['d','频率阻尼 D','pu'],['nq','Q–V 下垂','%'],['ke','励磁积分增益 Ke','s⁻¹']]};
let project,id,settings,input,gains,tuning,valid=false;
function field(k,label,unit,value,scope,min=0,max){return '<label class="field"><span>'+label+'</span><input aria-label="'+label+'" type="number" step="any" required data-'+scope+'="'+k+'" value="'+fmt(value)+'"'+(min!==null?' min="'+min+'"':'')+(max!==undefined?' max="'+max+'"':'')+'><small>'+unit+'</small></label>';}
function read(){return {...gfmContext(project,id),...Object.fromEntries([...targets,...filters].map(([k])=>[k,settings[k]]))};}
function renderInputs(){
 input=read();$('electrical').innerHTML=electrical.map(([k,l,u,f,min])=>field(k,l,u,input[k]/f,'electrical',min)).join('');
 $('electricalNote').textContent='Cf / Rc 关联 '+input.rcId+'；'+input.pccName+'；电网 Rth='+fmt(input.gridR)+' Ω，Lth='+fmt(input.gridL*1e3)+' mH。';
 $('targets').innerHTML=targets.map(([k,l,u])=>field(k,l,u,k==='fs'?1e6/settings.fs:settings[k],'setting',k==='pm'?30:0,k==='pm'?89.999:undefined)).join('');
 $('filters').innerHTML=filters.map(([k,l,u])=>field(k,l,u,settings[k],'setting',0,k.startsWith('feedforward')?1:undefined)).join('');
 renderMode();renderFilters();
}
function renderMode(){
 const mode=settings.mode,m=settings.modes[mode];document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 $('modeHeading').textContent='成网参数 · '+gfmModes[mode];$('modeFields').innerHTML=modeDefs[mode].map(([k,l,u])=>field(k,l,u,m[k],'outer',.000000001)).join('');$('outerTitle').textContent=gfmModes[mode]+' · 成网层';
 const ref='P* = '+fmt(input.activePowerW/input.ratedVA)+' pu；Q* = '+fmt(input.reactivePowerVar/input.ratedVA)+' pu；V₀ = 1 pu。';
 const formulas={droop:'ω = 1 + mp(P* − Pf)<br>V* = V₀ + nq(Q* − Qf)<br>θ̇ = ωb·ω',vsg:'2H·ω̇ = P* − Pf − D(ω−1)<br>V̇* = Kv[(V₀−Vf)/nq + Q*−Qf]<br>θ̇ = ωb·ω',sync:'2H·ω̇ = P*/ω − Pf/ω − D(ω−1)<br>ψ̇ = Ke[(V₀−Vf)/nq + Q*−Qf]<br>V* = ω·ψ；θ̇ = ωb·ω'};
 $('outerDiagram').innerHTML=formulas[mode];$('modeExplanation').innerHTML=formulas[mode]+'<p>'+ref+'</p><p>ω 为 pu，θ 为 rad，ωb = 2πf₀；mp、nq 输入百分数，计算时除以 100；Pf/Qf 经 P/Q 滤波，Vf 经电压滤波。Vdc 滤波仅保存备用，本页没有 Vdc 外环。送网 P/Q 为正。</p>';
}
function renderFilters(){
 $('feedback').innerHTML=[['filterPqMs','成网层 · P/Q（外环未校核）'],['filterVoltageMs','电压反馈与前馈'],['filterCurrentMs','电感电流反馈']].map(([k,l])=>'<div class="filter-card"><div class="filter-label">'+l+'<small>一阶低通</small></div><div class="filter-transfer"><div class="fraction"><span>1</span><span>1 + sT</span></div><label class="filter-edit">T = <input type="number" step="any" min="0" required aria-label="图内 '+l+'时间常数" data-setting="'+k+'" value="'+settings[k]+'">ms</label></div></div>').join('');
}
function renderGains(){
 $('piCards').innerHTML=Object.entries(labels).map(([k,l])=>'<div class="pi-card"><h3>'+l+' PI</h3><label>Kp<input type="number" step="any" min="0" required aria-label="'+l+' Kp" data-gain="'+k+'.kp" value="'+fmt(gains[k].kp)+'"></label><label>Ti<input type="text" required aria-label="'+l+' Ti" data-gain="'+k+'.ti" value="'+(gains[k].ki===0?'∞':fmt(tiFromKi(gains[k].ki)))+'"></label><small>Ti 单位 s · Ki = 1/Ti</small></div>').join('');
}
function invalidate(e){valid=false;$('error').textContent=e.message||String(e);$('exportPi').disabled=true;for(const n of ['bodePlot','metrics','stability','baseSummary','operatingNote'])$(n).innerHTML='';$('validation').textContent='当前输入无效，结果已清除；请修正标红字段。';$('saveStatus').textContent='修改尚未保存';}
function checkFields(){const bad=Array.from(document.querySelectorAll('input')).find(el=>!el.checkValidity()||el.getAttribute('aria-invalid')==='true');if(bad)throw Error('请先修正标红或空白输入。');}
function plot(){
 validateGfmInput(input);validateGfmGains(gains);
 const sweep=gfmSweep(input,gains,$('bodeMode').value,1201),open=$('bodeMode').value==='open'?sweep:gfmSweep(input,gains,'open',1201);
 $('bodeLegend').innerHTML=bodeLegend(labels);$('bodePlot').innerHTML=bodeSvg(sweep);
 const polys=input.delaySamples===0?gfmPolynomials(input,gains):null,stable=polys?Object.fromEntries(Object.entries(polys).map(([k,c])=>[k,isHurwitz(c)])):null;
 const good=stable&&Object.values(stable).every(Boolean);
 $('stability').textContent=stable?(good?'四个标量闭环通过 Routh 校核':'存在未通过 Routh 校核的闭环'):'含纯延时 · 未给出极点稳定性结论';$('stability').className=stable&&!good?'error':'small-note';
 $('metrics').innerHTML='<table><thead><tr><th>环路</th><th>Kp</th><th>Ti / s</th><th>交越 / Hz</th><th>裕度 / °</th><th>零延时 Routh</th></tr></thead><tbody>'+Object.entries(labels).map(([k,l])=>{const xs=crossings(open.series[k]),warn=xs.length!==1||xs.some(x=>x.margin<input.pm-.2)||stable?.[k]===false;return '<tr class="'+(warn?'warning':'')+'"><td>'+l+'</td><td>'+fmt(gains[k].kp)+'</td><td>'+(gains[k].ki?fmt(1/gains[k].ki):'∞')+'</td><td>'+(xs.length?xs.map(x=>fmt(x.frequency)).join(' / '):'频段内无交越')+'</td><td>'+(xs.length?xs.map(x=>fmt(x.margin)).join(' / '):'—')+'</td><td>'+(stable?(stable[k]?'通过':'未通过'):'未判定')+'</td></tr>';}).join('')+'</tbody></table>';
 const Z=input.voltageLL**2/input.ratedVA,Irms=input.ratedVA/(Math.sqrt(3)*input.voltageLL),ratio=Math.hypot(input.activePowerW,input.reactivePowerVar)/input.ratedVA;
 $('baseSummary').innerHTML='<span>Zb = '+fmt(Z)+' Ω</span><span>Ib,rms = '+fmt(Irms)+' A</span><span>SCR = '+fmt(input.scr)+'</span><span>局部理想 LC = '+fmt(1/(2*Math.PI*Math.sqrt(input.L*input.C)))+' Hz</span><span>Td = '+fmt(input.delaySamples*1e6/input.fs)+' μs</span>';
 $('operatingNote').textContent='运行点 |S|/Sbase = '+fmt(ratio)+'；额定 VLL 处功率因数 '+fmt(Math.hypot(input.activePowerW,input.reactivePowerVar)?Math.abs(input.activePowerW)/Math.hypot(input.activePowerW,input.reactivePowerVar):1)+'。'+(ratio>1?'当前 P/Q 超出额定视在容量。':'')+'基波 RC 电流、内部压降及实际调制余量仍需完整运行点校核；本页未求解潮流。';
 $('operatingNote').className=ratio>1?'warning':'small-note';
 $('gainMode').textContent=(settings.manual?'手动 PI · 电气参数修改后保留增益并重新校核。':'自动 PI · 固定零点策略，目标相位裕度 ≥ '+settings.pm+'°；必要时自动降低实际交越。')+(tuning?' 建议电流 / 电压交越：'+fmt(tuning.loops.d.frequency)+' / '+fmt(tuning.loops.P.frequency)+' Hz。':'');
 $('validation').textContent=settings.manual?'手动参数已计算频响，是否满足目标请看校核表。':'自动整定完成；结果仅对应声明的标量内环模型。';
 $('error').textContent='';$('exportPi').disabled=false;valid=true;
}
function refresh(force=false){
 input=read();validateGfmInput(input);
 for(const v of Object.values(settings.modes[settings.mode]))if(!Number.isFinite(v)||v<=0)throw Error('成网模式参数须为正的有限数。');
 if(force||!settings.manual||!gains){tuning=autoTuneGfm(input);gains=structuredClone(tuning.gains);settings.manual=false;}
 else tuning=null;
 renderGains();plot();$('retune').disabled=false;
}
function save(){settings.gains=structuredClone(gains);project.extensions??={};project.extensions.gfmPi??={};project.extensions.gfmPi[id]=structuredClone(settings);const merged=shared.write(project);$('saveStatus').textContent='已同步至工程 · '+id;if(serializeProject(merged)!==serializeProject(project))queueMicrotask(()=>receive(merged));}
function receive(p){if(!p||serializeProject(p)===serializeProject(project))return;project=p;shared.accept(p);load();}
function load(){try{const c=project.components.find(c=>c.id===id&&c.type==='gfm');if(!c)throw Error('指定 GFM 不存在，请返回电路选择 GFM 元件。');$('identity').textContent=project.name+' · '+c.name+' · '+id;settings=gfmSettings(project,id);gains=settings.gains;renderInputs();refresh();$('saveStatus').textContent='已读取工程 · '+id;}catch(e){$('retune').disabled=true;invalidate(e);}}
// Commit only valid edits. Invalid DOM input remains visible and blocks other changes.
document.addEventListener('change',e=>{
 const el=e.target,k=el.dataset.electrical||el.dataset.setting||el.dataset.outer,tag=el.dataset.gain;if(!k&&!tag)return;
 try{el.removeAttribute('aria-invalid');if(!el.checkValidity())throw Error('请输入有效参数。');checkFields();
  if(tag){const [loop,name]=tag.split('.'),value=name==='ti'?kiFromTi(el.value):el.valueAsNumber;if(!Number.isFinite(value)||value<0)throw Error('Kp 必须非负；Ti 必须为正数或 ∞。');gains[loop][name==='ti'?'ki':'kp']=value;settings.manual=true;tuning=null;plot();save();return;}
  const value=el.valueAsNumber;if(!Number.isFinite(value))throw Error('请输入有限数值。');
  if(el.dataset.electrical){const factor=electrical.find(d=>d[0]===k)[3];setGfmField(project,id,k,value*factor);}
  else if(el.dataset.outer){if(value<=0)throw Error('成网参数必须大于 0。');settings.modes[settings.mode][k]=value;}
  else settings[k]=k==='fs'?1e6/value:value;
  // Validate before rerendering so an invalid field never disappears.
  input=read();validateGfmInput(input);renderInputs();refresh();save();
 }catch(err){el.setAttribute('aria-invalid','true');invalidate(err);}
});
document.addEventListener('click',e=>{const mode=e.target.dataset.mode;if(!mode)return;try{checkFields();settings.mode=mode;renderMode();plot();save();}catch(err){invalidate(err);}});
$('retune').onclick=()=>{try{checkFields();refresh(true);save();}catch(e){invalidate(e);}};
$('bodeMode').onchange=()=>{if(valid)try{plot();}catch(e){invalidate(e);}};
$('exportPi').onclick=()=>{if(!valid)return;const parameters=Object.fromEntries(Object.entries(labels).map(([k,l])=>[k,{label:l,kp:gains[k].kp,tiSeconds:gains[k].ki?1/gains[k].ki:null,integratorEnabled:gains[k].ki>0,kiPerSecond:gains[k].ki}]));const data={schema:'gridcraft-gfm-pi-v1',project:project.name,ibrId:id,mode:settings.mode,modeParameters:settings.modes[settings.mode],inputs:input,parameters,piForm:'Kp + 1/(Ti*s)',convention:{current:'converter-to-grid',park:'d=cos,q=-sin',error:'reference-minus-measured',piOutputSign:1},analysisScope:'Frozen forming references; scalar ideal dq decoupling; single RC and grid RL; filtered voltage feedforward; instantaneous grid-current feedforward; no outer-mode or full dq stability certification',outerDynamicsValidated:false,manual:settings.manual,autoTuning:tuning,zeroDelayRouth:input.delaySamples===0?Object.fromEntries(Object.entries(gfmPolynomials(input,gains)).map(([k,p])=>[k,isHurwitz(p)])):null};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='gfm-pi-'+id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
try{project=shared.read();if(!project)throw Error('请先在电路页面载入 BESS_GFM_demo，再选择 GFM 的 PI 参数设计。');shared.accept(project);id=new URLSearchParams(location.search).get('ibr');load();if(valid)save();}catch(e){invalidate(e);}
window.addEventListener('storage',e=>{if(e.key===key)try{receive(shared.read());}catch(err){invalidate(err);}});
window.addEventListener('pageshow',()=>{try{receive(shared.read());}catch(err){invalidate(err);}});
