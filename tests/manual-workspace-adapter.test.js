import test from 'node:test';
import assert from 'node:assert/strict';
import {mountManualWorkspace} from '../ui/gfl-manual-workspace.js';
// Minimal DOM contract, while all draft/state/client logic is production code.
function dom(){const nodes=new Map(),created=[];function node(key=''){if(nodes.has(key))return nodes.get(key);const attrs={},listeners={};const n={dataset:{},value:key==='#manualIntegralForm'?'ki':'',checked:false,disabled:false,innerHTML:'',textContent:'',addEventListener(t,f){listeners[t]=f;},fire(t){listeners[t]?.();},querySelector:node,querySelectorAll:()=>[],before(){},append(){},remove(){},setAttribute(k,v){attrs[k]=v;},getAttribute(k){return attrs[k]??null;},removeAttribute(k){delete attrs[k];}};const m=key.match(/data-manual-(gain|slider)="([^"]+)"/);if(m)n.dataset[m[1]==='gain'?'manualGain':'manualSlider']=m[2];nodes.set(key,n);return n;}globalThis.document={createElement(){const n=node('created'+created.length);created.push(n);return n;},activeElement:null};return {node,created,nodes};}
const wait=()=>new Promise(r=>setTimeout(r,180));
const gains=()=>Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:1,ki:2}]));
test('manual workspace accepts a GFM adapter, preserves range and rejects late results',async()=>{
 const d=dom(),workers=[],comparisons=[];let model={modelInput:{L:1},settings:{mode:'droop',modes:{droop:{mp:1}}},currentGains:gains(),request:{},manualCandidates:[]},view;
 const adapter={contextKey:m=>JSON.stringify(m.settings),factsKey:m=>JSON.stringify({input:m.modelInput,gains:m.currentGains,settings:m.settings}),payload:(m,g,record)=>({input:m.modelInput,settings:m.settings,gains:g,request:m.request,record}),workerFactory:()=>{const w={postMessage(p){this.sent=p;},terminate(){this.stopped=true;}};workers.push(w);return w;}};
 globalThis.Worker=class{constructor(){throw Error('default GFL worker must not run');}};
 const workspace=mountManualWorkspace(d.node('host'),{onChange(){view=workspace.sync(model,null);},onComparison:c=>comparisons.push(c)},adapter);
 view=workspace.sync(model,null);assert.equal([...d.nodes.keys()].filter(k=>k.startsWith('[data-manual-slider=')).length,8);
 const slider=d.node('[data-manual-slider="P.kp"]'),original=JSON.stringify(model.currentGains),max=slider.max;
 slider.value='2';slider.fire('input');await wait();assert.equal(workers.length,1);assert.equal(workers[0].sent.payload.settings.mode,'droop');assert.equal(slider.max,max);assert.equal(JSON.stringify(model.currentGains),original);
 slider.value='3';slider.fire('input');await wait();assert.equal(workers.length,2);assert.equal(workers[0].stopped,true);
 const reply=(w,kp)=>w.onmessage({data:{...w.sent,type:'result',result:{gains:{...gains(),P:{kp,ki:2}},requirementsMet:true,evaluation:{tag:kp}}}});
 reply(workers[0],2);assert.equal(comparisons.at(-1).evaluation,null);reply(workers[1],3);await Promise.resolve();assert.equal(comparisons.at(-1).evaluation.tag,3);
 const integral=d.node('[data-manual-gain="P.ki"]');d.node('#manualIntegralForm').value='ti';d.node('#manualIntegralForm').onchange();integral.value='∞';integral.fire('input');assert.equal(d.node('[data-manual-slider="P.ki"]').disabled,true);d.node('#manualIntegralForm').value='ki';d.node('#manualIntegralForm').onchange();assert.equal(integral.value,'0');
 model={...model,settings:{...model.settings,mode:'vsg'}};view=workspace.sync(model,null);assert.equal(view.active,false);assert.equal(comparisons.at(-1).active,false);workspace.destroy();
});
test('GFM tuning panel mounts eight trial controls and routes manual comparison without applying',async()=>{
 const d=dom();for(const key of ['host','#gfmStepPreview'])Object.assign(d.node(key),{classList:{add(){}},replaceChildren(){}});
 const {mountGfmTuningPanel}=await import('../ui/gfm-tuning-panel.js');let comparisons=0,applied=0;
 const panel=mountGfmTuningPanel(d.node('host'),{onManualComparison(){comparisons++;},onManualApply(){applied++;}});
 assert.equal([...d.nodes.keys()].filter(k=>k.startsWith('[data-manual-slider=')).length,8);assert.equal(applied,0);panel.destroy();
});
