import test from 'node:test';
import assert from 'node:assert/strict';
import {Editor} from '../ui/editor.js';
import {EditorState} from '../ui/history.js';
function setup(t){
 const canvasEvents={},windowEvents={},docEvents={};
 const saved={window:globalThis.window,document:globalThis.document,ResizeObserver:globalThis.ResizeObserver};
 globalThis.window={addEventListener:(n,f)=>windowEvents[n]=f};
 globalThis.document={addEventListener:(n,f)=>docEvents[n]=f};
 globalThis.ResizeObserver=class{observe(){}};
 t.after(()=>{for(const [k,v] of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;});
 const editor=Object.create(Editor.prototype);
 const captured=new Set();
 Object.assign(editor,{canvas:{clientWidth:1200,addEventListener:(n,f)=>canvasEvents[n]=f,setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)},state:new EditorState({components:[{id:'PV1',type:'gfl',x:100,y:200}],wires:[],editor:{zoom:1,viewCenter:{x:600,y:350}}}),tool:'select',onSelect(){},render(){},onChange(){},onStatus(){},autoGlue(){},toSvgPoint:e=>({x:e.clientX,y:e.clientY})});
 const event=(x,y,buttons=1,pointerId=1)=>({clientX:x,clientY:y,buttons,pointerId,button:0,preventDefault(){},target:{closest:s=>s==='[data-component]'?{dataset:{component:'PV1'}}:null}});
 return {editor,canvasEvents,windowEvents,event};
}
test('a missed pointerup cannot turn later hover into a component drag',t=>{
 const {editor,canvasEvents,windowEvents,event}=setup(t);editor.bind();
 canvasEvents.pointerdown(event(100,200));windowEvents.pointermove(event(400,50,0));
 assert.deepEqual([editor.project.components[0].x,editor.project.components[0].y],[100,200]);
 assert.equal(editor.state.history.length,0);
});
test('cancel, lost capture and blur terminate component dragging',t=>{
 const {editor,canvasEvents,windowEvents,event}=setup(t);editor.bind();
 for(const cancel of [()=>windowEvents.pointercancel?.(event(100,200)),()=>canvasEvents.lostpointercapture?.(event(100,200)),()=>windowEvents.blur()]){
  canvasEvents.pointerdown(event(100,200));cancel();windowEvents.pointermove(event(400,50));
  assert.deepEqual([editor.project.components[0].x,editor.project.components[0].y],[100,200]);
 }
});
test('a different pointer cannot move a selected component; normal dragging remains undoable',t=>{
 const {editor,canvasEvents,windowEvents,event}=setup(t);editor.bind();
 canvasEvents.pointerdown(event(100,200));windowEvents.pointermove(event(400,50,1,2));
 assert.deepEqual([editor.project.components[0].x,editor.project.components[0].y],[100,200]);
 windowEvents.pointermove(event(130,240));windowEvents.pointerup(event(130,240,0));
 assert.deepEqual([editor.project.components[0].x,editor.project.components[0].y],[130,240]);
 editor.state.undo();assert.deepEqual([editor.project.components[0].x,editor.project.components[0].y],[100,200]);
});
