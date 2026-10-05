import {gfmDiagram} from './gfm-diagram.js?v=scr1';
import {analyzeGfmMode,tuneGfmCoupled} from '../analysis/gfm-dynamics.js?v=scr1';
import {gfmContext,gfmSettings,gfmModes,setGfmField} from '../project/gfm-settings.js?v=scr1';
import {autoTuneGfm,gfmSweep,gfmPolynomials,validateGfmInput,validateGfmGains} from '../analysis/gfm-pi.js?v=scr1';
import {isHurwitz} from '../analysis/gfl-autotune.js?v=scr1';
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
let project,id,settings,input,gains,tuning,coupled={},valid=false,busy=false,revision=0,pendingRemote=false;
function field(k,label,unit,value,scope,min=0,max){return '<label class="field"><span>'+label+'</span><input aria-label="'+label+'" type="number" step="any" required data-'+scope+'="'+k+'" value="'+fmt(value)+'"'+(min!==null?' min="'+min+'"':'')+(max!==undefined?' max="'+max+'"':'')+'><small>'+unit+'</small></label>';}
function read(p=project,s=settings){return {...gfmContext(p,id),considerScr:s.considerScr,...Object.fromEntries([...targets,...filters].map(([k])=>[k,s[k]]))};}
function renderInputs(){
 $('considerScr').checked=settings.considerScr;
 $('scrScope').textContent=settings.considerScr?'已启用：电网 R/L、变压器阻抗与 RC 参与整定，并校核当前成网模式的 dq 耦合极点。':'未启用：本地 Lf / RC、理想电压前馈与解耦；送网电流视为固定外部扰动。F / av 不参与此基线，成网参数只保存和展示，不校核并网极点。';
 $('localEquations').hidden=settings.considerScr;
 $('analysisNotice').textContent=settings.considerScr?'SCR 分析已启用。非零延时的耦合极点采用一阶 Padé 近似；未包含限幅、开关和直流能量动态。':'SCR 分析未启用。结果仅用于本地标量内环，不能据此判定实际电网中的 GFM 稳定性。';
 input=read();$('electrical').innerHTML=electrical.map(([k,l,u,f,min])=>field(k,l,u,input[k]/f,'electrical',min)).join('');
 $('electricalNote').textContent='Cf / Rc 关联 '+input.rcId+'；'+input.pccName+'；电网 Rth='+fmt(input.gridR)+' Ω，Lth='+fmt(input.gridL*1e3)+' mH。';
 $('targets').innerHTML=targets.map(([k,l,u])=>field(k,l,u,k==='fs'?1e6/settings.fs:settings[k],'setting',k==='pm'?30:0,k==='pm'?89.999:undefined)).join('');
 $('filters').innerHTML=filters.map(([k,l,u])=>field(k,l,u,settings[k],'setting',0,k.startsWith('feedforward')?1:undefined)).join('');
 document.querySelectorAll('[data-setting="feedforwardCurrent"], [data-setting="feedforwardVoltage"]').forEach(el=>el.disabled=!settings.considerScr);
 renderMode();
}
function renderMode(){
 const mode=settings.mode,m=settings.modes[mode];document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 $('modeHeading').textContent='成网参数 · '+gfmModes[mode];$('modeFields').innerHTML=modeDefs[mode].map(([k,l,u])=>field(k,l,u,m[k],'outer',.000000001)).join('');
 const ref='P* = '+fmt(input.activePowerW/input.ratedVA)+' pu；Q* = '+fmt(input.reactivePowerVar/input.ratedVA)+' pu；'+(settings.considerScr?'V₀ = '+fmt(coupled[mode]?.op?.V)+' pu（当前潮流工作点）。':'成网层未参与本地标量整定。');
 const formulas={droop:'ω = 1 + mp(P* − Pf)<br>V* = V₀ + nq(Q* − Qf)<br>θ̇ = ωb·ω',vsg:'2H·ω̇ = P* − Pf − D(ω−1)<br>V̇* = Kv[(V₀−Vf)/nq + Q*−Qf]<br>θ̇ = ωb·ω',sync:'2H·ω̇ = P*/ω − Pf/ω − D(ω−1)<br>ψ̇ = Ke[(V₀−Vf)/nq + Q*−Qf]<br>V* = ω·ψ；θ̇ = ωb·ω'};
 $('modeExplanation').innerHTML=formulas[mode]+'<p>'+ref+'</p><p>ω 为 pu，θ 为 rad，ωb = 2πf₀；mp、nq 输入百分数，计算时除以 100；Pf/Qf 经 P/Q 滤波，Vf 经电压滤波。Vdc 滤波仅保存备用，本页没有 Vdc 外环。送网 P/Q 为正。</p>';
}
function renderGains(){$('diagramHost').innerHTML=gfmDiagram(gains,settings);}
function invalidate(e){valid=false;$('error').textContent=e.message||String(e);$('exportPi').disabled=true;for(const n of ['bodePlot','metrics','stability','baseSummary','operatingNote','coupledSummary','coupledTable','polePlot','gainMode'])$(n).innerHTML='';$('validation').textContent='当前输入无效，结果已清除；请修正标红字段。';$('saveStatus').textContent='修改尚未保存';}
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
 $('baseSummary').innerHTML='<span>Zb = '+fmt(Z)+' Ω</span><span>Ib,rms = '+fmt(Irms)+' A</span><span>电路 SCR（'+(settings.considerScr?'已纳入':'未纳入')+'） = '+fmt(input.scr)+'</span><span>局部理想 LC = '+fmt(1/(2*Math.PI*Math.sqrt(input.L*input.C)))+' Hz</span><span>Td = '+fmt(input.delaySamples*1e6/input.fs)+' μs</span>';
 const dyn=coupled[settings.mode],op=dyn?.op;
 $('operatingNote').textContent=op?'潮流工作点：PCC 电压 '+fmt(op.voltageLL)+' V；电感电流 '+fmt(op.currentPu)+' pu；所需调制比 '+fmt(op.modulation)+'。'+(op.currentPu>1?'电感电流超过额定基准，需核对器件电流能力。':'')+'直流电压按刚性电源处理；未加入限流和饱和。':'SCR 未启用：本地模型不求解并网工作点，未校核额定电流与调制需求。';
 $('operatingNote').className=op?.currentPu>1?'warning':'small-note';
 $('gainMode').textContent=(settings.manual?'手动 PI · 保留增益并校核当前模式。':'自动 PI · '+(settings.considerScr?gfmModes[settings.mode]+' 耦合极点约束，局部候选搜索。':'本地 Lf / RC 标量模型。'))+(tuning?' 电流 / 电压交越：'+fmt(tuning.loops.d.frequency)+' / '+fmt(tuning.loops.P.frequency)+' Hz。':'');
 $('validation').textContent='标量内环频响用于裕度校核；是否启用并网 dq 校核由 SCR 开关决定。';
 renderCoupled();
 $('error').textContent='';$('exportPi').disabled=false;valid=true;
}

function renderCoupled(){
 if(!settings.considerScr){$('coupledSummary').textContent='未勾选 SCR：未运行并网工作点及三模式耦合极点校核。';$('coupledSummary').className='small-note';$('coupledTable').innerHTML='';$('polePlot').innerHTML='';return;}
 const d=coupled[settings.mode];
 $('coupledSummary').textContent=gfmModes[settings.mode]+'：'+(d?.stable?'耦合小信号极点全部位于左半平面':d?.error||'存在不稳定或临界极点')+'。表中三种模式使用同一组当前 PI；切换模式后可分别自动整定。'+(input.delaySamples>0?'延时极点采用一阶 Padé 近似。':'');
 $('coupledSummary').className=d?.stable?'small-note':'warning';
 $('coupledTable').innerHTML='<table><thead><tr><th>模式</th><th>状态数</th><th>最大实部 / s⁻¹</th><th>最小振荡阻尼比</th><th>小信号校核</th></tr></thead><tbody>'+Object.entries(coupled).map(([k,v])=>'<tr class="'+(k===settings.mode?'selected':'')+'"><td>'+gfmModes[k]+'</td><td>'+(v.order??'—')+'</td><td>'+fmt(v.alpha)+'</td><td>'+fmt(v.damping?.[0]?.zeta)+'</td><td class="'+(v.stable?'stable':'unstable')+'">'+esc(v.error||(v.stable?'稳定':v.marginal?'临界':'不稳定'))+'</td></tr>').join('')+'</tbody></table>';
 if(!d?.poles){$('polePlot').innerHTML='';return;}
 const poles=d.poles.slice(0,6),min=Math.min(-1,...poles.map(z=>z.re))*1.2,max=Math.max(1,...poles.map(z=>z.re))*1.2,im=Math.max(1,...poles.map(z=>Math.abs(z.im)))*1.2,x=v=>60+690*(v-min)/(max-min),y=v=>150-115*v/im;
 $('polePlot').innerHTML='<svg viewBox="0 0 820 320" role="img" aria-label="当前模式主导六个极点"><rect x="60" y="35" width="690" height="230" fill="#f5faf9"/><path d="M60 150H750M'+x(0)+' 35V265" stroke="#9badb5"/>'+poles.map(z=>'<circle cx="'+x(z.re)+'" cy="'+y(z.im)+'" r="4" fill="'+(z.re<0?'#087b70':'#b23b28')+'"><title>'+fmt(z.re)+' + j('+fmt(z.im)+')</title></circle>').join('')+'<text x="60" y="290">Re: '+fmt(min)+'</text><text x="660" y="290">'+fmt(max)+' s⁻¹</text><text x="65" y="25">主导六极点 · Im ±'+fmt(im)+' rad/s</text></svg>';
}
function lock(on){if(on&&busy)return;busy=on;document.querySelectorAll('input,button,select').forEach(el=>{if(on){el.dataset.wasDisabled=String(el.disabled);el.disabled=true;}else if(el.dataset.wasDisabled!==undefined){el.disabled=el.dataset.wasDisabled==='true';delete el.dataset.wasDisabled;}});}
async function apply(p,s,g,force=false,saveAfter=true){
 const token=++revision;lock(true);
 try{
  const nextInput=read(p,s);validateGfmInput(nextInput);
  for(const mode of Object.keys(gfmModes))for(const value of Object.values(s.modes[mode]))if(!Number.isFinite(value)||value<=0)throw Error('成网参数必须为正的有限数。');
  let nextTuning=null;
  if(force||!s.manual||!g){const seed=autoTuneGfm(nextInput);nextTuning=s.considerScr?await tuneGfmCoupled(nextInput,seed.gains,s.mode,s.modes[s.mode],(n,total)=>{if(token===revision)$('saveStatus').textContent='校核候选 PI：'+n+' / '+total;}):seed;g=nextTuning.gains;s.manual=false;}
  validateGfmGains(g);const results={};
  for(const mode of s.considerScr?Object.keys(gfmModes):[]){try{results[mode]=analyzeGfmMode(nextInput,g,mode,s.modes[mode]);}catch(e){if(mode===s.mode)throw e;results[mode]={error:e.message};}}
  if(token!==revision)return;
  project=p;settings=s;input=nextInput;gains=structuredClone(g);tuning=nextTuning;coupled=results;
  settings.gainBank??={};settings.gainBank[settings.mode]={gains:structuredClone(gains),manual:settings.manual};
  renderInputs();renderGains();plot();if(saveAfter)save();else $('saveStatus').textContent='已读取工程 · '+id;
 }catch(e){if(token===revision)throw e;}finally{if(token===revision){lock(false);$('exportPi').disabled=!valid;$('retune').disabled=!settings;if(pendingRemote){pendingRemote=false;queueMicrotask(()=>receive(shared.read()).catch(invalidate));}}}
}
function save(){settings.gains=structuredClone(gains);project.extensions??={};project.extensions.gfmPi??={};project.extensions.gfmPi[id]=structuredClone(settings);const merged=shared.write(project);$('saveStatus').textContent='已同步至工程 · '+id;if(serializeProject(merged)!==serializeProject(project))pendingRemote=true;}
async function receive(p){if(busy){pendingRemote=true;return;}if(!p||serializeProject(p)===serializeProject(project))return;shared.accept(p);await load(p,false);}
async function load(p,saveAfter=true){try{const c=p.components.find(c=>c.id===id&&c.type==='gfm');if(!c)throw Error('指定 GFM 不存在，请返回电路选择 GFM 元件。');$('identity').textContent=p.name+' · '+c.name+' · '+id;const s=gfmSettings(p,id);await apply(p,s,s.gains,false,saveAfter);}catch(e){project=p;settings=gfmSettings(p,id);gains=settings.gains;coupled={};try{renderInputs();$('diagramHost').innerHTML='';$('retune').disabled=false;}catch{}invalidate(e);}}
// Edit cloned candidates; invalid edits never reach project storage or in-memory committed values.
document.addEventListener('change',async e=>{
 const el=e.target,k=el.dataset.electrical||el.dataset.setting||el.dataset.outer,tag=el.dataset.gain;const scr=el.id==='considerScr';if((!k&&!tag&&!scr)||busy)return;
 try{el.removeAttribute('aria-invalid');if(!el.checkValidity())throw Error('请输入有效参数。');checkFields();
  const p=structuredClone(project),s=structuredClone(settings),g=structuredClone(gains);
  if(scr){s.considerScr=el.checked;}
  else if(tag){const [loop,name]=tag.split('.'),value=name==='ti'?kiFromTi(el.value):el.valueAsNumber;if(!Number.isFinite(value)||value<0)throw Error('Kp 必须非负；Ti 必须为正数或 ∞。');g[loop][name==='ti'?'ki':'kp']=value;s.manual=true;}
  else{const value=el.valueAsNumber;if(!Number.isFinite(value))throw Error('请输入有限数值。');
   if(el.dataset.electrical)setGfmField(p,id,k,value*electrical.find(d=>d[0]===k)[3]);
   else if(el.dataset.outer)s.modes[s.mode][k]=value;
   else s[k]=k==='fs'?1e6/value:value;
  }
  await apply(p,s,g);
 }catch(err){el.setAttribute('aria-invalid','true');invalidate(err);}
});
document.addEventListener('click',async e=>{const mode=e.target.closest('[data-mode]')?.dataset.mode;if(!mode||busy)return;try{checkFields();const s=structuredClone(settings);s.gainBank??={};s.gainBank[s.mode]={gains:structuredClone(gains),manual:s.manual};s.mode=mode;const bank=s.gainBank[mode];s.manual=bank?.manual===true;await apply(structuredClone(project),s,bank?.gains||gains);}catch(err){invalidate(err);}});
$('retune').onclick=async()=>{if(busy)return;try{checkFields();await apply(structuredClone(project),structuredClone(settings),gains,true);}catch(e){invalidate(e);}};
$('bodeMode').onchange=()=>{if(valid&&!busy)try{plot();}catch(e){invalidate(e);}};
$('exportPi').onclick=()=>{if(!valid||busy)return;const parameters=Object.fromEntries(Object.entries(labels).map(([k,l])=>[k,{label:l,kp:gains[k].kp,tiSeconds:gains[k].ki?1/gains[k].ki:null,integratorEnabled:gains[k].ki>0,kiPerSecond:gains[k].ki}]));const data={schema:'gridcraft-gfm-pi-v2',project:project.name,ibrId:id,mode:settings.mode,modeParameters:settings.modes,inputs:input,parameters,piForm:'Kp + 1/(Ti*s)',convention:{current:'converter-to-grid',park:'d=cos,q=-sin',error:'reference-minus-measured',piOutputSign:1},analysisScope:settings.considerScr?'Single converter, RC and grid RL; coupled dq linearization about high-voltage equilibrium; rigid DC; no saturation or current limits; synchronverter torque/flux variant with cascaded inner loops':'Local scalar Lf/RC, ideal voltage feedforward and decoupling, fixed load current; grid/forming dynamics excluded',coupledResults:coupled,selectedModeStable:settings.considerScr?coupled[settings.mode]?.stable===true:null,manual:settings.manual,autoTuning:tuning};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='gfm-pi-'+id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
try{const p=shared.read();if(!p)throw Error('请先在电路页面载入 BESS_GFM_demo，再选择 GFM 的 PI 参数设计。');shared.accept(p);id=new URLSearchParams(location.search).get('ibr');await load(p);}catch(e){invalidate(e);}
window.addEventListener('storage',e=>{if(e.key===key)receive(shared.read()).catch(invalidate);});
window.addEventListener('pageshow',()=>receive(shared.read()).catch(invalidate));
