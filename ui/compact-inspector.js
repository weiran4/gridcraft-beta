// Compact screens expose the same inspector in a drawer, without moving project data.
export function installCompactInspector({panel,toggle,close,label,canvas,canOpen=()=>true}){
 const media=window.matchMedia('(max-width: 1000px)');let opened=false,gesture=null;
 function render(){const visible=!media.matches||opened;panel.inert=!visible;panel.setAttribute('aria-hidden',String(!visible));toggle.setAttribute('aria-expanded',String(media.matches&&opened));toggle.textContent=opened&&media.matches?'收起设计栏':'参数与设计';document.body.classList.toggle('compact-inspector-open',media.matches&&opened);}
 function show(){if(!media.matches)return;opened=true;render();close.focus();}
 function hide(){opened=false;render();if(media.matches)toggle.focus();}
 toggle.addEventListener('click',()=>opened?hide():show());close.addEventListener('click',hide);
 media.addEventListener('change',()=>{opened=media.matches&&panel.contains(document.activeElement);gesture=null;render();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&media.matches&&opened&&!document.querySelector('dialog[open]')){e.preventDefault();e.stopPropagation();hide();}},true);
 panel.addEventListener('keydown',e=>{if(media.matches)e.stopPropagation();});
 // Wait for a true click to finish, so selection cannot interrupt a canvas drag.
 canvas.addEventListener('pointerdown',e=>{gesture=null;if(!media.matches||e.button!==0||e.shiftKey||!canOpen()||e.target.closest('[data-terminal]'))return;if(e.target.closest('[data-component]'))gesture={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};},true);
 window.addEventListener('pointermove',e=>{if(gesture?.id===e.pointerId&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>4)gesture.moved=true;});
 window.addEventListener('pointerup',e=>{if(!gesture||gesture.id!==e.pointerId)return;const click=!gesture.moved&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)<=4;gesture=null;if(click&&canOpen())show();});
 window.addEventListener('pointercancel',e=>{if(gesture?.id===e.pointerId)gesture=null;});window.addEventListener('blur',()=>{gesture=null;});
 render();return {show,hide,setSelection(c){label.textContent=c?c.name+' · '+c.id:'选择元件后编辑参数';}};
}
