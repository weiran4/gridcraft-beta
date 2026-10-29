// Presentation metadata only. Values are never filled, cleared or converted here
// except after an explicit "restore suggestion" click.
const same=(a,b)=>a!==''&&b!==''&&a!=null&&b!=null&&Number.isFinite(Number(a))&&Number(a)===Number(b);
export function resolveInputSource({value,storedValue,record,suggestion,linked}){
 if(value===''||value==null)return 'missing';
 if(linked&&linked!=='project')return linked;
 if(record&&same(record.value,value)&&['suggested','custom','saved','project','derived'].includes(record.kind))return record.kind;
 if(linked)return linked;
 if(storedValue!==undefined)return 'saved';
 return suggestion!=null&&same(value,suggestion)?'suggested':'saved';
}
const labels={suggested:'建议值 · 当前采用',custom:'自定义',saved:'已保存值',project:'来自工程',linked:'跟随工程',derived:'自动计算',missing:'待填写 / 未设置'};
const mounted=new WeakMap();
export function mountInputSources(host,{selector='input[type="number"]',key=el=>el.name||el.id,stored={},suggestions={},linked=()=>null,onChange=()=>{}}={}){
 mounted.get(host)?.();
 const elements=[...host.querySelectorAll(selector)].filter(el=>el.type==='number');
 if(!elements.length)return {refresh(){},read:()=>({}),set(){}};
 if(!document.querySelector('link[data-input-sources-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./input-sources.css',import.meta.url).href;link.dataset.inputSourcesStyle='';document.head.append(link);}
 const entries=[],records={...stored._inputSources},controller=new AbortController();
 let restoring=false;
 for(const el of elements){
  if(el.type!=='number')continue;
  const k=key(el);if(!k)continue;
  const info=document.createElement('span');info.className='input-source-info';
  const label=document.createElement('span'),reset=document.createElement('button');reset.type='button';reset.className='input-source-reset';reset.textContent='恢复建议';
  const name=el.getAttribute('aria-label')||el.closest('label')?.querySelector('span')?.textContent||k;
  reset.setAttribute('aria-label',name+'：恢复建议值');info.append(label,reset);
  // Keep source text outside unit-bearing flex rows; table inputs stay in their cell.
  const anchor=el.closest('.field-input')||el;
  const fieldLabel=el.closest('label');
  if(fieldLabel&&fieldLabel.querySelectorAll('input').length===1)fieldLabel.append(info);else anchor.after(info);
  const entry={el,k,info,label,reset};entries.push(entry);
  const suggestion=()=>typeof suggestions[k]==='function'?suggestions[k]():suggestions[k];
  entry.refresh=()=>{
   const v=suggestion(),kind=resolveInputSource({value:el.value,storedValue:stored[k],record:records[k],suggestion:v,linked:linked(el,k)});
   el.dataset.valueSource=kind;label.textContent=labels[kind]??labels.saved;
   reset.hidden=el.disabled||v==null||!Number.isFinite(Number(v))||kind==='suggested'||['linked','derived'].includes(kind);
   info.title=kind==='suggested'?'此输入框中的数值已参与计算；建议值是起始假设，不代表实测或保证通过。':kind==='saved'?'保留已有参数；旧工程未记录其来源，不根据数值相等推断为默认值。':labels[kind];
   reset.title=v==null?'':'恢复为 '+v+'；将按原有输入流程更新计算';
  };
  const edited=()=>{records[k]={kind:restoring?'suggested':'custom',value:el.value};entry.refresh();onChange(k,records[k]);};
  for(const event of ['input','change'])el.addEventListener(event,edited,{capture:true,signal:controller.signal});
  reset.addEventListener('click',e=>{e.preventDefault();const v=suggestion();if(el.disabled||v==null)return;restoring=true;try{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}finally{restoring=false;}entry.refresh();});
 }
 const refresh=()=>entries.forEach(e=>e.refresh());
 const read=()=>Object.fromEntries(entries.map(({el,k})=>[k,{kind:resolveInputSource({value:el.value,storedValue:stored[k],record:records[k],suggestion:typeof suggestions[k]==='function'?suggestions[k]():suggestions[k],linked:linked(el,k)}),value:el.value}]));
 mounted.set(host,()=>{controller.abort();entries.forEach(e=>e.info.remove());});
 refresh();return {refresh,read,set(k,kind){const e=entries.find(e=>e.k===k);if(e){records[k]={kind,value:e.el.value};e.refresh();}}};
}
