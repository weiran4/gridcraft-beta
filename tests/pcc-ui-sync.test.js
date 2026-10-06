import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../examples/demo.js';
import {serializeProject} from '../project/model.js';
test('PCC page recovers when project arrives or is restored across tabs',async()=>{
 let raw=null;const elements=new Map(),handlers={};
 function element(id){if(!elements.has(id)){const e={id,value:id==='probe'?'50':'',textContent:'',innerHTML:'',options:[],querySelectorAll:()=>[],querySelector:()=>({getBoundingClientRect:()=>({left:0,width:950})}),setAttribute(){}};Object.defineProperty(e,'valueAsNumber',{get(){return Number(e.value);}});elements.set(id,e);}return elements.get(id);}
 globalThis.document={getElementById:element};globalThis.window={addEventListener:(type,fn)=>handlers[type]=fn};globalThis.location={search:'?pcc=PCC1'};globalThis.localStorage={getItem:()=>raw,setItem:(_,v)=>raw=v};
 await import('../ui/pcc-frequency.js');assert.match(element('error').textContent,/载入工程/);
 raw=serializeProject(demo('gfm480'));handlers.storage({key:'gridcraft-v1'});assert.equal(element('error').textContent,'');assert.match(element('syncState').textContent,/已计算/);
 const saved=raw;raw=null;handlers.storage({key:'gridcraft-v1'});assert.match(element('error').textContent,/不存在/);
 raw=saved;handlers.storage({key:'gridcraft-v1'});assert.equal(element('error').textContent,'');assert.match(element('syncState').textContent,/已计算/);
});
