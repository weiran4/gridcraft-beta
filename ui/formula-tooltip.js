export function installFormulaTooltip(host){
 const tooltip=document.createElement('div');tooltip.className='filter-variable-tooltip';tooltip.id='filterVariableTooltip';tooltip.role='tooltip';tooltip.hidden=true;host.append(tooltip);
 let activeVariable=null;
 function showVariable(el){
  activeVariable=el;tooltip.textContent=el.dataset.value||'待补充';tooltip.hidden=false;
  const rect=el.getBoundingClientRect(),box=tooltip.getBoundingClientRect();
  tooltip.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-box.width-12))+'px';
  tooltip.style.top=(rect.top>=box.height+16?rect.top-box.height-10:rect.bottom+10)+'px';
 }
 function hideVariable(){activeVariable=null;tooltip.hidden=true;}
 host.onpointerover=e=>{const el=e.target.closest('[data-formula-var]');if(el)showVariable(el);};
 host.onpointerout=e=>{if(activeVariable&&!activeVariable.contains(e.relatedTarget))hideVariable();};
 host.onfocusin=e=>{const el=e.target.closest('[data-formula-var]');if(el)showVariable(el);};
 host.onfocusout=hideVariable;
 const dialog=host.closest('dialog');if(dialog)dialog.onscroll=hideVariable;
 return descriptions=>{
  host.querySelectorAll('[data-formula-var]').forEach(el=>{el.dataset.value=descriptions[el.dataset.formulaVar]||'待补充 / 不可计算';el.setAttribute('aria-label',el.dataset.value);});
  if(activeVariable)showVariable(activeVariable);
 };
}
