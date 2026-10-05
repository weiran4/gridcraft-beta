
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomaticAnalysis} from '../analysis/automatic.js';
import {pvReferenceDemo as actualPvReferenceDemo} from '../examples/pv-reference.js';
test('automatic analysis recomputes electrical changes but reuses results for unchanged data and layout',()=>{
 const p=pvReferenceDemo({ratedIbrVA:1e6}),auto=createAutomaticAnalysis();
 const first=auto.run(p,'BUS220');assert.equal(first.changed,true);
 assert.equal(auto.run(p,'BUS220').changed,false);
 p.components[0].x+=50;p.components[0].rotation=90;p.wires[0].mid={x:1,y:2};p.editor.zoom=2;
 assert.equal(auto.run(p,'BUS220').result,first.result);
 assert.equal(auto.run(p,'BUS220').revision,first.revision);
 p.components.find(c=>c.id==='RG').parametersSI.inductanceH*=2;
 const next=auto.run(p,'BUS220');assert.equal(next.changed,true);assert.ok(next.result.scr<first.result.scr);
 assert.equal(auto.run(p,'PCC1').changed,true);
 p.wires.shift();const broken=auto.run(p,'PCC1');
 assert.equal(broken.result.status,'error');assert.equal(broken.result.scr,undefined);
 assert.equal(auto.run(p,'PCC1').changed,false);
 assert.equal(auto.run(p,'').result,null);
});

function pvReferenceDemo(options){const p=actualPvReferenceDemo(options);for(const c of p.components)if(c.type==='transformer')Object.assign(c.parametersSI,{shortCircuitResistancePu:0,shortCircuitReactancePu:0});return p;}
