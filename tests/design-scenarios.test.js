import test from 'node:test';import assert from 'node:assert/strict';
import {pvGridExample} from '../examples/pv-grid-demo.js';import {resolveDesignSnapshot} from '../project/design-snapshot.js';
import {buildDesignScenarios,assessDesignScenarios} from '../analysis/design-scenarios.js';
const s=resolveDesignSnapshot(pvGridExample,{}).snapshot;
const g={d:{kp:1.25,ki:50},q:{kp:1.25,ki:50},P:{kp:5,ki:100},Q:{kp:2,ki:100}};
test('Vac mode rejects an independent scenario for its solved Q',()=>{
 const v=resolveDesignSnapshot(pvGridExample,{pointPolicy:'mode-reference',vacRefPu:1}).snapshot;
 assert.throws(()=>buildDesignScenarios(v,{reactivePowerVar:[1234567]}),/求解量/);
});
test('each explicit scenario resolves a fresh equilibrium and preserves failures',()=>{
 const scenarios=buildDesignScenarios(s,{gridVoltagePu:[.1,1.05]});assert.equal(scenarios.length,3);
 const c=assessDesignScenarios(s,g,scenarios);assert.equal(c.results.length,3);assert.equal(c.results[1].assessment.eligibility,'infeasible');assert.equal(c.continuousRangeProven,false);
 assert.notEqual(c.results[0].assessment.operatingPoint.point.V,c.results[2].assessment.operatingPoint.point.V);
});
