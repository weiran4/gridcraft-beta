import test from 'node:test';
import assert from 'node:assert/strict';
import {installCompactInspector} from '../ui/compact-inspector.js';
function setup(t,compact=true){
 const previous={window:globalThis.window,document:globalThis.document},events={},docEvents={},canvasEvents={},media={matches:compact,addEventListener:(name,fn)=>media.change=fn};
 const element=()=>({attrs:{},style:{},inert:false,addEventListener(name,fn){this[name]=fn;},setAttribute(k,v){this.attrs[k]=String(v);},removeAttribute(k){delete this.attrs[k];},focus(){globalThis.document.activeElement=this;},contains(el){return el===this;}});
 const panel=element(),toggle=element(),close=element(),label=element(),canvas=element();canvas.addEventListener=(name,fn)=>canvasEvents[name]=fn;
 const classes=new Set();globalThis.document={activeElement:null,body:{classList:{toggle(k,v){v?classes.add(k):classes.delete(k);}}},querySelector:()=>null,addEventListener:(n,f)=>docEvents[n]=f};
 globalThis.window={matchMedia:()=>media,addEventListener:(n,f)=>events[n]=f};
 t.after(()=>Object.assign(globalThis,previous));
 const control=installCompactInspector({panel,toggle,close,label,canvas,canOpen:()=>true});
 const pointer=(x,y)=>({button:0,pointerId:1,clientX:x,clientY:y,shiftKey:false,target:{closest:s=>s==='[data-component]'?{dataset:{component:'RC1'}}:null}});
 return {panel,toggle,close,label,canvas,control,events,docEvents,canvasEvents,media,classes,pointer};
}
test('compact panel can be opened, closed and escaped without losing access to its toggle',t=>{
 const s=setup(t);assert.equal(s.panel.inert,true);s.toggle.click();assert.equal(s.panel.inert,false);assert.equal(s.toggle.attrs['aria-expanded'],'true');
 let prevented=false;s.docEvents.keydown({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){}});assert.equal(prevented,true);assert.equal(s.panel.inert,true);assert.equal(document.activeElement,s.toggle);
});
test('desktop always exposes the inspector and shrinking preserves focused editing',t=>{
 const s=setup(t,false);assert.equal(s.panel.inert,false);document.activeElement=s.panel;s.media.matches=true;s.media.change();assert.equal(s.panel.inert,false);
 s.close.click();s.media.matches=false;s.media.change();assert.equal(s.panel.inert,false);
});
test('component clicks open the panel only after release; dragging and cancelled gestures do not',t=>{
 const s=setup(t);s.canvasEvents.pointerdown(s.pointer(50,50));assert.equal(s.panel.inert,true);s.events.pointerup(s.pointer(51,50));assert.equal(s.panel.inert,false);
 s.close.click();s.canvasEvents.pointerdown(s.pointer(50,50));s.events.pointerup(s.pointer(100,50));assert.equal(s.panel.inert,true);
 s.canvasEvents.pointerdown(s.pointer(50,50));s.events.pointercancel(s.pointer(50,50));s.events.pointerup(s.pointer(50,50));assert.equal(s.panel.inert,true);
});
