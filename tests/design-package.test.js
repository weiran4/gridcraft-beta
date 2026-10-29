import test from 'node:test';import assert from 'node:assert/strict';
import {pvGridExample} from '../examples/pv-grid-demo.js';import {resolveDesignSnapshot} from '../project/design-snapshot.js';
import {exportDesignPackage} from '../project/design-package.js';
test('export physical Q matches the evaluated Vac operating point',()=>{
 const s=resolveDesignSnapshot(pvGridExample,{pointPolicy:'mode-reference',vacRefPu:1}).snapshot;
 const p=exportDesignPackage(s,{gains:pvGridExample.extensions.gflPi.PV1.gains});
 assert.equal(p.physicalDesign.reactivePowerVar,p.analyticalAssessment.operatingPoint.point.Q*p.physicalDesign.ratedVA);
 assert.equal(p.requestedPhysicalInputs.reactivePowerVar,0);assert.equal(p.qualification,'not-fully-qualified');
});
test('export recalculates actual rounded gains and never trusts passed certificate',()=>{
 const s=resolveDesignSnapshot(pvGridExample,{}).snapshot,g=structuredClone(pvGridExample.extensions.gflPi.PV1.gains);g.d.ki=.00001;
 const pack=exportDesignPackage(s,{gains:g,significantDigits:3,decimalPlaces:3},{eligibility:'recommended'});
 assert.equal(pack.controllers.output.d.ki,0);assert.equal(pack.controllers.output.d.enabled,false);assert.equal(pack.controllers.output.d.ti,null);
 assert.notEqual(pack.analyticalAssessment.eligibility,'recommended');assert.deepEqual(JSON.parse(JSON.stringify(pack)),pack);
});
