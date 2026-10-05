import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../examples/demo.js';
import {serializeProject,parseProject} from '../project/model.js';

test('GFM automatic edit merges an unrelated remote update received during tuning',async()=>{
 const project=demo('gfm480');project.extensions.gfmPi={GFM1:{considerScr:true}};let raw=serializeProject(project);
 const elements=new Map(),handlers={},windowHandlers={};
 function element(id){if(!elements.has(id))elements.set(id,{id,dataset:{},disabled:false,value:id==='bodeMode'?'open':'',innerHTML:'',textContent:'',setAttribute(){},removeAttribute(){},getAttribute(){return null;},checkValidity(){return true;}});return elements.get(id);}
 const controls=['retune','exportPi','bodeMode'].map(element);
 globalThis.document={getElementById:element,querySelectorAll:selector=>selector==='input,button,select'?controls:[],addEventListener:(type,handler)=>handlers[type]=handler};
 globalThis.window={addEventListener:(type,handler)=>windowHandlers[type]=handler};
 globalThis.location={search:'?ibr=GFM1'};
 globalThis.localStorage={getItem:()=>raw,setItem:(_,value)=>raw=value};
 async function settle(){for(let n=0;n<500;n++){await new Promise(r=>setTimeout(r,20));if(!element('retune').disabled&&!element('saveStatus').textContent.startsWith('校核候选'))return;}throw Error('GFM UI did not finish tuning');}
 await import('../ui/gfm-design.js');await settle();
 const pending=handlers.change({target:{...element('edit'),dataset:{electrical:'L'},valueAsNumber:160}});
 const remote=parseProject(raw);remote.name='Remote title';raw=serializeProject(remote);windowHandlers.storage({key:'gridcraft-v1'});
 await pending;await settle();
 const result=parseProject(raw),L=result.components.find(c=>c.id==='GFM1').parametersSI.filterInductanceH;
 assert.ok(Math.abs(L-160e-6)<1e-12);assert.equal(result.name,'Remote title');assert.equal(element('error').textContent,'');
});
