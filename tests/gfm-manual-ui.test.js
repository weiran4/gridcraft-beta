import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../examples/demo.js';
import {readGfmAdvisor} from '../project/gfm-advisor-state.js';
import {autoTuneGfm} from '../analysis/gfm-pi.js';
import {evaluateGfmManualCandidate} from '../analysis/gfm-manual-evaluation.js';
import {buildGfmStepPreview} from '../analysis/gfm-step-preview.js';
import {serializeProject,parseProject} from '../project/model.js';
test('GFM slider live-wires trial Bode, metrics and step response without persisting',async()=>{
 const p=demo('gfm480'),a=readGfmAdvisor(p,'GFM1');p.extensions.gfmPi.GFM1.gains=autoTuneGfm({...a.input,fi:500,fv:50,pm:60}).gains;
 let raw=serializeProject(p);const nodes=new Map(),stepPayloads=[];
 function node(key){if(nodes.has(key))return nodes.get(key);const attrs={},events={};const n={dataset:{},classList:{add(){}},value:key==='#bodeMode'?'open':key==='#manualIntegralForm'?'ki':'',innerHTML:'',textContent:'',checked:true,clientWidth:1200,addEventListener(t,f){events[t]=f;},fire(t){events[t]?.();},querySelector:node,querySelectorAll:()=>[],before(){},append(){},remove(){},replaceChildren(){},setAttribute(k,v){attrs[k]=v;},getAttribute(k){return attrs[k]??null;},removeAttribute(k){delete attrs[k];},checkValidity(){return true;}};
  const m=key.match(/data-manual-(gain|slider)="([^"]+)"/);if(m)n.dataset[m[1]==='gain'?'manualGain':'manualSlider']=m[2];nodes.set(key,n);return n;
 }
 globalThis.document={getElementById:id=>node('#'+id),createElement:tag=>node(tag+nodes.size),querySelectorAll:()=>[],addEventListener(){}};
 globalThis.window={addEventListener(){}};globalThis.location={search:'?ibr=GFM1'};globalThis.matchMedia=()=>({matches:false});
 globalThis.localStorage={getItem:()=>raw,setItem:(_,v)=>raw=v};
 globalThis.Worker=class{constructor(url){this.manual=String(url).includes('manual-worker');}terminate(){this.stopped=true;}postMessage(data){queueMicrotask(()=>{if(this.stopped)return;const result=this.manual?evaluateGfmManualCandidate(data.payload):buildGfmStepPreview(data.payload);if(!this.manual)stepPayloads.push(data.payload);this.onmessage({data:{...data,type:'result',result}});});}};
 await import('../ui/gfm-design.js?manual-ui-test');
 await new Promise(r=>setTimeout(r,250));const before=raw,basePlot=node('#bodePlot').innerHTML;
 const slider=node('[data-manual-slider="d.kp"]');slider.value=String(p.extensions.gfmPi.GFM1.gains.d.kp*1.03);slider.fire('input');await new Promise(r=>setTimeout(r,500));
 assert.equal(node('#bodePiSource').value,'comparison');assert.match(node('#bodeParameterStatus').textContent,/试调/);assert.match(node('#stability').textContent,/试调 PI/);
 assert.notEqual(node('#bodePlot').innerHTML,basePlot);assert.match(node('#bodePlot').innerHTML,/<svg/);assert.match(node('#metrics').innerHTML,/试调控制环/);
 assert.equal(raw,before);assert.deepEqual(parseProject(raw).extensions.gfmPi.GFM1.gains,p.extensions.gfmPi.GFM1.gains);
 assert.equal(stepPayloads.at(-1).candidateGains.d.kp,Number(slider.value));assert.deepEqual(stepPayloads.at(-1).currentGains,p.extensions.gfmPi.GFM1.gains);
});
