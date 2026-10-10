/** Four persistent editors, a volatile draft, and explicit named snapshots. */
import {createStepClient} from './gfl-step-client.js';
import {editManualGains} from '../project/gfl-manual-candidates.js';
import {tuningSnapshot} from '../project/gfl-tuning-state.js';
import {tiFromKi} from '../analysis/pi-time.js';
import {gainSliderMax} from './gain-slider.js';
const keys=['d','q','P','Q'],zero=()=>Object.fromEntries(keys.map(k=>[k,{kp:0,ki:0}]));
export const manualContextKey=m=>tuningSnapshot({input:m.modelInput,currentGains:m.currentGains??null,request:m.request});
export function mountManualWorkspace(host,callbacks){
 const bar=document.createElement('section');bar.id='manualWorkspace';bar.className='manual-workspace';
 bar.innerHTML=`<div class="manual-controls"><strong>手动试调 · 不覆盖当前 PI</strong><label>积分参数 <select id="manualIntegralForm"><option value="ki">Kp / Ki</option><option value="ti">Kp / Ti</option></select></label><label class="manual-link"><input id="manualLinkedDq" type="checkbox">同步调整 d/q 电流环参数</label><button id="manualReset">恢复到当前 PI</button><button id="manualApply" class="primary" disabled>应用试调参数</button></div>
 <div class="manual-names"><label>方案名称<input id="manualName" maxlength="80" placeholder="例如：外环更稳 · 方案 A"></label><button id="manualSave">暂存为命名候选</button><button id="manualRename" disabled>重命名所选</button><button id="manualDelete" disabled>删除所选</button></div>
 <p id="manualStatus" role="status">拖动下方滑条开始试调；暂存会保存全部四环参数，不会替换当前 PI。</p>`;
 host.querySelector('.step-loop-grid').before(bar);
 const q=id=>bar.querySelector('#'+id),numbers={},sliders={};
 for(const k of keys){const box=document.createElement('div');box.className='manual-loop-editor';box.innerHTML=`<div class="manual-editor-caption">试调参数 <small>拖动或输入，绿色曲线更新</small></div>`+['kp','ki'].map(f=>`<label class="manual-gain-row"><span data-manual-label="${k}.${f}">${f==='kp'?'Kp':'Ki / s⁻¹'}</span><input type="text" inputmode="decimal" data-manual-gain="${k}.${f}" aria-label="${k} 试调 ${f}" autocomplete="off" spellcheck="false"><input type="range" min="0" max="1" step="any" data-manual-slider="${k}.${f}" aria-label="${k} 试调 ${f} 滑条"></label>`).join('');
  host.querySelector(`[data-step-loop="${k}"]`).append(box);
  for(const f of ['kp','ki']){numbers[k+'.'+f]=box.querySelector(`[data-manual-gain="${k}.${f}"]`);sliders[k+'.'+f]=box.querySelector(`[data-manual-slider="${k}.${f}"]`);}
 }
 let model=null,auto=null,draft=null,result=null,busy=false,message='',invalid='',factsKey=null,seenSelection=null,forceSelection=false,framePending=false,destroyed=false,evalKey=null;
 const display=(g,k,f)=>f==='ki'&&q('manualIntegralForm').value==='ti'?tiFromKi(g[k].ki):g[k][f];
 const base=()=>draft?.gains??(!model?.stale?auto?.gains:null)??model?.currentGains??zero();
 const contextKey=()=>manualContextKey(model);
 const notify=()=>{if(framePending||destroyed)return;framePending=true;queueMicrotask(()=>{framePending=false;if(!destroyed)callbacks.onChange();});};
 function comparison(){callbacks.onComparison?.({active:!!draft,name:draft?.name??'手动试调（未应用）',evaluation:!invalid&&!busy?result?.evaluation:null});}
 const client=createStepClient({workerFactory:()=>new Worker(new URL('./gfl-manual-worker.js',import.meta.url),{type:'module'}),onEvent:e=>{
  if(e.type==='loading'){busy=true;result=null;}
  else if(e.type==='result'){busy=false;result=e.result;}
  else{busy=false;result=null;if(e.type==='error')message=e.message;}
  comparison();notify();
 }});
 function evaluate(){
  if(!draft||invalid||model?.invalid||!model?.modelInput){if(evalKey!==null){evalKey=null;client.clear();}return;}
  const payload={input:model.modelInput,gains:draft.gains,request:model.request,record:{...(draft.record??{}),name:draft.name}};
  const token=JSON.stringify(payload);if(token===evalKey)return;evalKey=token;client.update(payload);
 }
 function syncFields({resetScale=false,fromSlider=null}={}){
  const gains=base(),ti=q('manualIntegralForm').value==='ti';
  for(const k of keys)for(const f of ['kp','ki']){const tag=k+'.'+f,n=numbers[tag],s=sliders[tag],v=display(gains,k,f),disabled=Boolean(model?.invalid);
   host.querySelector(`[data-manual-label="${tag}"]`).textContent=f==='kp'?'Kp':ti?'Ti / s':'Ki / s⁻¹';
   n.disabled=disabled;s.disabled=disabled||!Number.isFinite(v);
   // Explicit form/reset/selection changes must update even the focused field.
   // Otherwise Ti=Infinity can remain visible under a Ki label after switching.
   if(resetScale||document.activeElement!==n||fromSlider===tag)n.value=Number.isFinite(v)?String(v):'∞';
   if(resetScale||!s.dataset.initialized){s.max=String(gainSliderMax(Number.isFinite(v)?v:1,Number.isFinite(v)?v:1));s.min=f==='ki'&&ti?'1e-9':'0';s.dataset.initialized='true';}
   if(Number.isFinite(v)){if(v>Number(s.max)&&fromSlider!==tag)s.max=String(gainSliderMax(v,v));s.value=String(v);}
  }
 }
 function draw(){
  syncFields();bar.dataset.busy=String(busy);bar.dataset.active=String(!!draft);
  q('manualSave').disabled=Boolean(invalid||model?.invalid);q('manualApply').disabled=Boolean(invalid||model?.invalid||busy||!draft||!result?.requirementsMet);
  q('manualRename').disabled=!draft?.record;q('manualDelete').disabled=!draft?.record;q('manualReset').disabled=Boolean(model?.invalid);
  const title=result?.conditionsChanged?'保存时的条件已变化，已按当前模型重新评估。 ':'';
  q('manualStatus').textContent=invalid||message||(busy?'正在校核试调参数；当前 PI 未改变。':draft?title+(result?.requirementsMet?'试调参数已通过当前模型与目标校核，尚未应用。':'手动方案可暂存；'+(result?.unmet?.join('；')||'等待校核。')):'拖动下方滑条开始试调；暂存保存全部四环参数，不覆盖当前 PI。');
 }
 function changed(el,slider){const tag=el.dataset.manualGain||el.dataset.manualSlider,[k,f]=tag.split('.');
  if(!model||model.invalid)return;
  try{
   const next=editManualGains(base(),k,f==='ki'&&q('manualIntegralForm').value==='ti'?'ti':f,el.value,{linkedDq:q('manualLinkedDq').checked});
   el.removeAttribute('aria-invalid');numbers[tag].removeAttribute('aria-invalid');
   if(Object.values(numbers).some(n=>n.getAttribute('aria-invalid')==='true'))return;
   if(draft&&!invalid&&tuningSnapshot(next)===tuningSnapshot(draft.gains)){syncFields({fromSlider:slider?tag:null});return;}
   invalid='';message='';draft={gains:next,name:'手动试调（未应用）',record:null};result=null;callbacks.onStart?.();
   syncFields({fromSlider:slider?tag:null});comparison();evaluate();notify();
  }catch(error){invalid=error.message;el.setAttribute('aria-invalid','true');result=null;evalKey=null;client.clear();comparison();notify();}
 }
 for(const [tag,n]of Object.entries(numbers)){n.addEventListener('input',()=>changed(n,false));n.addEventListener('change',()=>changed(n,false));sliders[tag].addEventListener('input',()=>changed(sliders[tag],true));}
 q('manualIntegralForm').onchange=()=>{invalid='';Object.values(numbers).forEach(n=>n.removeAttribute('aria-invalid'));syncFields({resetScale:true});notify();};
 q('manualReset').onclick=()=>{invalid='';message='';Object.values(numbers).forEach(n=>n.removeAttribute('aria-invalid'));draft={gains:structuredClone(model.currentGains??zero()),name:'手动试调（未应用）',record:null};result=null;evalKey=null;client.clear();callbacks.onStart?.();syncFields({resetScale:true});evaluate();notify();};
 q('manualSave').onclick=()=>{try{const nextId=callbacks.onSave({name:q('manualName').value.trim()||`手动方案 ${(model.manualCandidates?.length??0)+1}`,gains:structuredClone(base()),contextKey:contextKey()});if(nextId){forceSelection=true;callbacks.onSelect(nextId);}message='已暂存全部四环参数；当前 PI 未改变。';notify();}catch(error){message=error.message;notify();}};
 q('manualRename').onclick=()=>{try{callbacks.onRename(draft.record.id,q('manualName').value);message='已重命名，参数未改变。';notify();}catch(error){message=error.message;notify();}};
 q('manualDelete').onclick=()=>{try{callbacks.onDelete(draft.record.id);draft=null;result=null;evalKey=null;client.clear();callbacks.onSelect(null);message='已删除所选暂存方案；当前 PI 未改变。';comparison();notify();}catch(error){message=error.message;notify();}};
 q('manualApply').onclick=()=>{if(!result?.requirementsMet||busy||invalid)return;callbacks.onApply(result,contextKey());};
 return {
  sync(next,selectedAuto){
   const key=tuningSnapshot({input:next.modelInput,currentGains:next.currentGains??null,labels:next.labels});
   const contextChanged=factsKey!==null&&key!==factsKey;model=next;auto=selectedAuto;
   if(contextChanged){draft=null;result=null;evalKey=null;invalid='';message='当前模型或已应用 PI 已变化；旧试调已清除，命名方案仍保留。';client.clear();Object.values(numbers).forEach(n=>n.removeAttribute('aria-invalid'));comparison();}
   factsKey=key;
   if(forceSelection||next.selectedId!==seenSelection){seenSelection=next.selectedId;forceSelection=false;const record=next.manualCandidates?.find(c=>c.id===next.selectedId);
    draft=record?{gains:structuredClone(record.gains),name:record.name,record}:null;result=null;invalid='';message='';evalKey=null;client.clear();
    Object.values(numbers).forEach(n=>n.removeAttribute('aria-invalid'));if(record)q('manualName').value=record.name;syncFields({resetScale:true});comparison();
   }
   if(draft?.record){const record=next.manualCandidates?.find(c=>c.id===draft.record.id);if(!record){draft=null;result=null;evalKey=null;client.clear();comparison();}else draft={...draft,name:record.name,record};}
   evaluate();draw();
   return {active:!!draft,candidate:result??(draft?{id:draft.record?.id??'manual-draft',name:draft.name,source:'manual',gains:draft.gains,verified:false,requirementsMet:false}:null),busy,invalid:!!invalid||Boolean(next.invalid),contextKey:contextKey()};
  },
  select(){forceSelection=true;},
  destroy(){destroyed=true;client.destroy();bar.remove();host.querySelectorAll('.manual-loop-editor').forEach(n=>n.remove());}
 };
}
