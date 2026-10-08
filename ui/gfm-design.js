import {gfmFacts,evaluateGfm,validateGfmMode,checkGfmRequirements} from '../analysis/gfm-tuning-advisor.js';
import {validateTuningRequest} from '../analysis/gfl-model-input.js';
import {readGfmAdvisor,gfmFactKeys,gfmAdvisorRequest,gfmSnapshot,saveGfmAdvisorSettings,switchGfmMode,applyGfmCandidate,restoreGfmCandidate} from '../project/gfm-advisor-state.js';
import {mountGfmTuningPanel} from './gfm-tuning-panel.js';
import {createTuningClient} from './gfl-tuning-client.js';
import {gfmDiagram} from './gfm-diagram.js?v=scr1';
import {analyzeGfmMode} from '../analysis/gfm-dynamics.js?v=scr1';
import {gfmContext,gfmSettings,gfmModes,setGfmField} from '../project/gfm-settings.js?v=scr1';
import {gfmSweep,gfmPolynomials,validateGfmGains} from '../analysis/gfm-pi.js?v=scr1';
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
const targets=[['fs','控制步长 Ts','μs'],['delaySamples','纯延时 N × Ts','Ts']];
const filters=[['filterPqMs','P/Q 时间常数','ms'],['filterVdcMs','Vdc 时间常数（预留）','ms'],['filterVoltageMs','交流电压时间常数','ms'],['filterCurrentMs','电感电流时间常数','ms'],['feedforwardCurrent','送网电流前馈 F','pu'],['feedforwardVoltage','电压前馈 av','pu']];
const modeDefs={droop:[['mp','P–f 下垂','%'],['nq','Q–V 下垂','%']],vsg:[['h','虚拟惯量 H','s'],['d','频率阻尼 D','pu'],['nq','Q–V 下垂','%'],['kv','电压积分增益 Kv','s⁻¹']],sync:[['h','虚拟惯量 H','s'],['d','频率阻尼 D','pu'],['nq','Q–V 下垂','%'],['ke','励磁积分增益 Ke','s⁻¹']]};
let project,id,settings,input,gains,tuning,coupled={},valid=false,busy=false,revision=0,pendingRemote=false;
let currentEvaluation=null,request=validateTuningRequest({}).request,advisorResult=null,selectedId=null,stale=false,advisorMessage='',advisor;
const emptyGains=()=>Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:0,ki:0}]));
const activeSnapshot=()=>gfmSnapshot({input,settings,gains,request});
const searchClient=createTuningClient({workerFactory:()=>new Worker(new URL('./gfm-tuning-worker.js',import.meta.url),{type:'module'}),onEvent:e=>{
 if(e.type==='started'){advisorMessage='正在搜索 GFM PI；当前参数保持不变。';stale=false;}
 else if(e.type==='progress')advisorMessage='GFM 候选搜索 / 模式校核：'+e.progress.evaluations+' 次评价';
 else if(e.type==='result'){if(!valid||e.snapshotKey!==activeSnapshot())return;advisorResult=e.result;selectedId=advisorResult.candidates[0]?.id??null;advisorMessage='';stale=false;}
 else if(e.type==='error')advisorMessage='GFM 搜索执行失败：'+e.message+'。当前 PI 保持原值。';
 else if(e.type==='stale'||e.type==='cancelled'){stale=Boolean(advisorResult);advisorMessage=e.message;}
 renderAdvisor();
}});
function field(k,label,unit,value,scope,min=0,max){return '<label class="field"><span>'+label+'</span><input aria-label="'+label+'" type="number" step="any" required data-'+scope+'="'+k+'" value="'+fmt(value)+'"'+(min!==null?' min="'+min+'"':'')+(max!==undefined?' max="'+max+'"':'')+'><small>'+unit+'</small></label>';}
function read(p=project,s=settings){return {...gfmContext(p,id),considerScr:s.considerScr,...Object.fromEntries(gfmFactKeys.map(k=>[k,s[k]]))};}
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
function renderGains(){$('diagramHost').innerHTML=gfmDiagram(gains??emptyGains(),settings);}
function invalidate(e){valid=false;searchClient.invalidate('模型输入无效，旧候选已过期。');currentEvaluation=null;$('error').textContent=e.message||String(e);$('exportPi').disabled=true;for(const n of ['bodePlot','metrics','stability','baseSummary','operatingNote','coupledSummary','coupledTable','polePlot','gainMode'])$(n).innerHTML='';$('validation').textContent='当前输入无效，结果已清除；请修正标红字段。';$('saveStatus').textContent='修改尚未保存';$('bodePlot').textContent='尚未生成 Bode 图：'+(e.message||String(e));renderAdvisor();}
function checkFields(){const bad=Array.from(document.querySelectorAll('#electrical input, #targets input, #filters input, #modeFields input, #diagramHost input:not([type=range])')).find(el=>!el.checkValidity()||el.getAttribute('aria-invalid')==='true');if(bad)throw Error('请先修正标红或空白输入。');}
function plot(){
 gfmFacts(input);
 if(!gains){currentEvaluation=null;$('gainMode').textContent='当前成网模式尚无已保存 PI；框图中 0 为未配置值。请生成候选后明确应用，或手动填写。';
  for(const n of ['bodePlot','metrics','stability','baseSummary','operatingNote','coupledSummary','coupledTable','polePlot'])$(n).innerHTML='';
  $('bodePlot').textContent='尚无已保存 PI，不自动生成或覆盖。';$('validation').textContent='模型输入可用；当前模式尚未应用 PI。';$('error').textContent='';valid=true;$('exportPi').disabled=true;renderAdvisor();return;
 }
 validateGfmGains(gains);currentEvaluation=evaluateGfm(input,gains,settings.mode,settings.modes[settings.mode]);
 const sweep=gfmSweep(input,gains,$('bodeMode').value,1201),open=$('bodeMode').value==='open'?sweep:gfmSweep(input,gains,'open',1201);
 $('bodeLegend').innerHTML=bodeLegend(labels);$('bodePlot').innerHTML=bodeSvg(sweep);
 const polys=input.delaySamples===0?gfmPolynomials(input,gains):null,stable=polys?Object.fromEntries(Object.entries(polys).map(([k,c])=>[k,isHurwitz(c)])):null;
 const good=stable&&Object.values(stable).every(Boolean);
 $('stability').textContent=stable?(good?'四个标量闭环通过 Routh 校核':'存在未通过 Routh 校核的闭环'):'含纯延时 · 未给出极点稳定性结论';$('stability').className=stable&&!good?'error':'small-note';
 $('metrics').innerHTML='<table><thead><tr><th>环路</th><th>Kp</th><th>Ti / s</th><th>交越 / Hz</th><th>裕度 / °</th><th>零延时 Routh</th></tr></thead><tbody>'+Object.entries(labels).map(([k,l])=>{const xs=crossings(open.series[k]),warn=xs.length!==1||xs.some(x=>x.margin<request.minMargin-.005)||stable?.[k]===false;return '<tr class="'+(warn?'warning':'')+'"><td>'+l+'</td><td>'+fmt(gains[k].kp)+'</td><td>'+(gains[k].ki?fmt(1/gains[k].ki):'∞')+'</td><td>'+(xs.length?xs.map(x=>fmt(x.frequency)).join(' / '):'频段内无交越')+'</td><td>'+(xs.length?xs.map(x=>fmt(x.margin)).join(' / '):'—')+'</td><td>'+(stable?(stable[k]?'通过':'未通过'):'未判定')+'</td></tr>';}).join('')+'</tbody></table>';
 const Z=input.voltageLL**2/input.ratedVA,Irms=input.ratedVA/(Math.sqrt(3)*input.voltageLL),ratio=Math.hypot(input.activePowerW,input.reactivePowerVar)/input.ratedVA;
 $('baseSummary').innerHTML='<span>Zb = '+fmt(Z)+' Ω</span><span>Ib,rms = '+fmt(Irms)+' A</span><span>电路 SCR（'+(settings.considerScr?'已纳入':'未纳入')+'） = '+fmt(input.scr)+'</span><span>局部理想 LC = '+fmt(1/(2*Math.PI*Math.sqrt(input.L*input.C)))+' Hz</span><span>Td = '+fmt(input.delaySamples*1e6/input.fs)+' μs</span>';
 const dyn=coupled[settings.mode],op=dyn?.op;
 $('operatingNote').textContent=op?'潮流工作点：PCC 电压 '+fmt(op.voltageLL)+' V；电感电流 '+fmt(op.currentPu)+' pu；所需调制比 '+fmt(op.modulation)+'。'+(op.currentPu>1?'电感电流超过额定基准，需核对器件电流能力。':'')+'直流电压按刚性电源处理；未加入限流和饱和。':'SCR 未启用：本地模型不求解并网工作点，未校核额定电流与调制需求。';
 $('operatingNote').className=op?.currentPu>1?'warning':'small-note';
 $('gainMode').textContent=(settings.manual?'当前手动 PI · ':'当前已保存 PI · ')+(input.delaySamples>0?'含纯延时；耦合极点为一阶 Padé 近似，精确时域未验证。':'分析不改增益，候选需明确应用。');
 $('validation').textContent='标量内环频响用于裕度校核；是否启用并网 dq 校核由 SCR 开关决定。';
 renderCoupled();
 $('error').textContent='';$('exportPi').disabled=false;valid=true;renderAdvisor();
}

function renderCoupled(){
 if(!settings.considerScr){$('coupledSummary').textContent='未勾选 SCR：未运行并网工作点及三模式耦合极点校核。';$('coupledSummary').className='small-note';$('coupledTable').innerHTML='';$('polePlot').innerHTML='';return;}
 const d=coupled[settings.mode];
 $('coupledSummary').textContent=gfmModes[settings.mode]+'：'+(d?.stable?'耦合小信号极点全部位于左半平面':d?.error||'存在不稳定或临界极点')+'。表中三种模式使用同一组当前 PI；切换模式后保留该模式已存 PI；生成候选不自动应用。'+(input.delaySamples>0?'延时极点采用一阶 Padé 近似。':'');
 $('coupledSummary').className=d?.stable?'small-note':'warning';
 $('coupledTable').innerHTML='<table><thead><tr><th>模式</th><th>状态数</th><th>最大实部 / s⁻¹</th><th>最小振荡阻尼比</th><th>小信号校核</th></tr></thead><tbody>'+Object.entries(coupled).map(([k,v])=>'<tr class="'+(k===settings.mode?'selected':'')+'"><td>'+gfmModes[k]+'</td><td>'+(v.order??'—')+'</td><td>'+fmt(v.alpha)+'</td><td>'+fmt(v.damping?.[0]?.zeta)+'</td><td class="'+(v.stable?'stable':'unstable')+'">'+esc(v.error||(v.stable?'稳定':v.marginal?'临界':'不稳定'))+'</td></tr>').join('')+'</tbody></table>';
 if(!d?.poles){$('polePlot').innerHTML='';return;}
 const poles=d.poles.slice(0,6),min=Math.min(-1,...poles.map(z=>z.re))*1.2,max=Math.max(1,...poles.map(z=>z.re))*1.2,im=Math.max(1,...poles.map(z=>Math.abs(z.im)))*1.2,x=v=>60+690*(v-min)/(max-min),y=v=>150-115*v/im;
 $('polePlot').innerHTML='<svg viewBox="0 0 820 320" role="img" aria-label="当前模式主导六个极点"><rect x="60" y="35" width="690" height="230" fill="#f5faf9"/><path d="M60 150H750M'+x(0)+' 35V265" stroke="#9badb5"/>'+poles.map(z=>'<circle cx="'+x(z.re)+'" cy="'+y(z.im)+'" r="4" fill="'+(z.re<0?'#087b70':'#b23b28')+'"><title>'+fmt(z.re)+' + j('+fmt(z.im)+')</title></circle>').join('')+'<text x="60" y="290">Re: '+fmt(min)+'</text><text x="660" y="290">'+fmt(max)+' s⁻¹</text><text x="65" y="25">主导六极点 · Im ±'+fmt(im)+' rad/s</text></svg>';
}
async function apply(p,s,g,force=false,saveAfter=true,keepControls=false){
 const token=++revision;busy=true;
 try{
  const nextInput=read(p,s);gfmFacts(nextInput);validateGfmMode(s.mode,s.modes[s.mode]);
  if(g)validateGfmGains(g);
  searchClient.invalidate(advisorResult?'模型或当前 PI 已变化，旧候选已过期。':'当前 PI 保持原值。');
  const results={};
  for(const mode of g&&s.considerScr?Object.keys(gfmModes):[]){try{results[mode]=analyzeGfmMode(gfmFacts(nextInput),g,mode,s.modes[mode]);}catch(e){results[mode]={error:e.message};}}
  if(token!==revision)return;
  project=p;settings=s;input=nextInput;gains=g?structuredClone(g):null;tuning=null;coupled=results;
  if(!keepControls){renderInputs();renderGains();}else syncCurrentGains();
  plot();if(saveAfter)save();else $('saveStatus').textContent='已读取工程 · '+id;
 }finally{if(token===revision){busy=false;$('exportPi').disabled=!valid||!gains;$('retune').disabled=!settings;renderAdvisor();if(pendingRemote){pendingRemote=false;queueMicrotask(()=>receive(shared.read()).catch(invalidate));}}}
}
function syncCurrentGains(){
 if(!gains)return;
 for(const el of document.querySelectorAll('#diagramHost [data-gain]')){const [loop,k]=el.dataset.gain.split('.'),v=k==='ti'?tiFromKi(gains[loop].ki):gains[loop].kp;
  if(document.activeElement!==el)el.value=Number.isFinite(v)?String(v):'∞';
  if(el.type==='range'){el.disabled=!Number.isFinite(v);if(Number.isFinite(v)&&v>Number(el.max))el.max=String(v*2);}
 }
}
function save(){
 const next=saveGfmAdvisorSettings(project,id,settings,gains,request),merged=shared.write(next);project=next;
 $('saveStatus').textContent='已同步至工程 · '+id;
 if(serializeProject(merged)!==serializeProject(project)){if(busy)pendingRemote=true;else queueMicrotask(()=>receive(shared.read()).catch(invalidate));}
}
async function receive(p){if(busy){pendingRemote=true;return;}if(!p||serializeProject(p)===serializeProject(project))return;shared.accept(p);await load(p,false);}
async function load(p,saveAfter=false){try{
 const a=readGfmAdvisor(p,id);request=a.request;advisorResult=null;selectedId=null;stale=false;
 const c=p.components.find(c=>c.id===id);$('identity').textContent=p.name+' · '+c.name+' · '+id;
 await apply(p,a.settings,a.gains,false,saveAfter);
 }catch(e){project=p;settings=gfmSettings(p,id);gains=settings.gains;coupled={};try{renderInputs();renderGains();$('retune').disabled=false;}catch{}invalidate(e);}}
function renderAdvisor(){
 if(!advisor||!settings)return;const undo=project?.extensions?.gfmPi?.[id]?.advisor?.undo;
 advisor.render({request,current:currentEvaluation,result:advisorResult,selectedId,busy:searchClient.busy,stale,message:advisorMessage,invalid:!valid,
  canRestore:Boolean(undo&&undo.mode===settings.mode),modeName:gfmModes[settings.mode]});
}
function generateCandidates(){
 const v=validateTuningRequest(request);if(!v.valid){advisorMessage='整定目标无效：'+v.errors.map(e=>e.message).join('；');renderAdvisor();return;}
 if(!valid){advisorMessage='请先修正 GFM 模型输入；现有 PI 不会被重新生成。';renderAdvisor();return;}
 advisorResult=null;selectedId=null;searchClient.start({snapshotKey:activeSnapshot(),input,request:v.request,baselineGains:gains?structuredClone(gains):null,mode:settings.mode,modeParameters:settings.modes[settings.mode]});
}
async function applySelected(){try{
 const c=advisorResult?.candidates.find(c=>c.id===selectedId)??advisorResult?.candidates[0];if(!c||stale||searchClient.busy)throw Error('候选已过期或未完成。');
 const latest=shared.read()??project,ctx=readGfmAdvisor(latest,id);if(gfmSnapshot(ctx)!==advisorResult.snapshotKey)throw Error('当前模式、事实参数或 PI 已改变，候选已过期。');
 // Recheck at the current model before saving; never trust a display label.
 const e=evaluateGfm(ctx.input,c.gains,ctx.settings.mode,ctx.settings.modes[ctx.settings.mode]);
 const status=checkGfmRequirements(e,validateTuningRequest(ctx.request).request);
 const next=applyGfmCandidate(latest,id,{...c,...status,verified:e.verified,evaluation:e},advisorResult.snapshotKey);
 await receive(shared.write(next));advisorMessage='已应用所选 GFM 候选；仅更新 PI，不改变成网或电气参数。';renderAdvisor();
 }catch(error){stale=true;advisorMessage=error.message;renderAdvisor();}}
async function restoreSelected(){try{const next=restoreGfmCandidate(shared.read()??project,id);await receive(shared.write(next));advisorMessage='已恢复应用前 PI；电气和成网参数未回滚。';renderAdvisor();}catch(error){advisorMessage=error.message;renderAdvisor();}}
advisor=mountGfmTuningPanel($('gfmAdvisor'),{
 getRequest:()=>request,onRequest:next=>{request=next;searchClient.invalidate('整定目标已改变；当前 PI 不变。');save();renderAdvisor();},
 onAnalyze:()=>apply(structuredClone(project),structuredClone(settings),gains,false,false).catch(invalidate),
 onSearch:generateCandidates,onCancel:()=>searchClient.cancel(),onSelect:id=>{selectedId=id;renderAdvisor();},onApply:applySelected,onRestore:restoreSelected
});

// Edit cloned candidates; invalid edits never reach project storage or in-memory committed values.
document.addEventListener('change',async e=>{
 const el=e.target,k=el.dataset.electrical||el.dataset.setting||el.dataset.outer,tag=el.dataset.gain;const scr=el.id==='considerScr';if((!k&&!tag&&!scr)||busy)return;
 try{el.removeAttribute('aria-invalid');if(!el.checkValidity())throw Error('请输入有效参数。');checkFields();
  const p=structuredClone(project),s=structuredClone(settings),g=structuredClone(gains??emptyGains());
  if(scr){s.considerScr=el.checked;}
  else if(tag){const [loop,name]=tag.split('.'),value=name==='ti'?kiFromTi(el.value):el.valueAsNumber;if(!Number.isFinite(value)||value<0)throw Error('Kp 必须非负；Ti 必须为正数或 ∞。');g[loop][name==='ti'?'ki':'kp']=value;s.manual=true;}
  else{const value=el.valueAsNumber;if(!Number.isFinite(value))throw Error('请输入有限数值。');
   if(el.dataset.electrical)setGfmField(p,id,k,value*electrical.find(d=>d[0]===k)[3]);
   else if(el.dataset.outer)s.modes[s.mode][k]=value;
   else s[k]=k==='fs'?1e6/value:value;
  }
  await apply(p,s,tag?g:gains,false,true,Boolean(tag));
 }catch(err){el.setAttribute('aria-invalid','true');invalidate(err);}
});
document.addEventListener('click',async e=>{const mode=e.target.closest('[data-mode]')?.dataset.mode;if(!mode||busy)return;try{checkFields();const next=switchGfmMode(shared.read()??project,id,mode);await receive(shared.write(next));}catch(err){invalidate(err);}});
$('retune').onclick=generateCandidates;
$('bodeMode').onchange=()=>{if(valid&&!busy)try{plot();}catch(e){invalidate(e);}};
$('exportPi').onclick=()=>{if(!valid||busy||!gains)return;const parameters=Object.fromEntries(Object.entries(labels).map(([k,l])=>[k,{label:l,kp:gains[k].kp,tiSeconds:gains[k].ki?1/gains[k].ki:null,integratorEnabled:gains[k].ki>0,kiPerSecond:gains[k].ki}]));const data={schema:'gridcraft-gfm-pi-v3',project:project.name,ibrId:id,mode:settings.mode,modeParameters:settings.modes,inputs:input,parameters,piForm:'Kp + 1/(Ti*s)',convention:{current:'converter-to-grid',park:'d=cos,q=-sin',error:'reference-minus-measured',piOutputSign:1},analysisScope:settings.considerScr?'Single converter, RC and grid RL; coupled dq linearization about high-voltage equilibrium; rigid DC; no saturation or current limits; synchronverter torque/flux variant with cascaded inner loops':'Local scalar Lf/RC, ideal voltage feedforward and decoupling, fixed load current; grid/forming dynamics excluded',coupledResults:coupled,selectedModeStable:settings.considerScr?coupled[settings.mode]?.stable===true:null,manual:settings.manual,currentEvaluation,autoTuning:{...(project.extensions?.gfmPi?.[id]?.advisor??{}),request,searchStatus:advisorResult?.searchStatus??'notRun',candidateStatus:stale?'stale':'preview',storedGainsPreserved:true}};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='gfm-pi-'+id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
try{const p=shared.read();if(!p)throw Error('请先在电路页面载入 BESS_GFM_demo，再选择 GFM 的 PI 参数设计。');shared.accept(p);id=new URLSearchParams(location.search).get('ibr');await load(p);}catch(e){invalidate(e);}
window.addEventListener('storage',e=>{if(e.key===key)receive(shared.read()).catch(invalidate);});
window.addEventListener('pageshow',()=>receive(shared.read()).catch(invalidate));
