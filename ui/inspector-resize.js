
export function installInspectorResize(handle){
 const root=document.documentElement;
 const clamp=value=>Math.min(Math.max(280,value),Math.max(280,Math.min(640,window.innerWidth-650)));
 let width=344,drag=null;
 try{const saved=Number(localStorage.getItem('gridcraft-inspector-width'));if(saved>=280)width=saved;}catch{}
 function apply(value){width=value;const visibleWidth=clamp(value);root.style.setProperty('--inspector-width',visibleWidth+'px');handle.setAttribute('aria-valuenow',Math.round(visibleWidth));handle.setAttribute('aria-valuemax',clamp(640));}
 function save(){try{localStorage.setItem('gridcraft-inspector-width',width);}catch{}}
 handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();drag={x:e.clientX,width:clamp(width)};handle.setPointerCapture(e.pointerId);document.body.classList.add('resizing-inspector');});
 handle.addEventListener('pointermove',e=>{if(drag)apply(clamp(drag.width+drag.x-e.clientX));});
 function end(){if(!drag)return;drag=null;document.body.classList.remove('resizing-inspector');save();}
 handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);handle.addEventListener('lostpointercapture',end);
 handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();apply(clamp(e.key==='Home'?280:e.key==='End'?640:width+(e.key==='ArrowLeft'?20:-20)));save();});
 window.addEventListener('resize',()=>apply(width));apply(width);
}
