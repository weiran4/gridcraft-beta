// Offline data generation; no online Python dependency.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {readGflModelInput} from '../analysis/gfl-model-input.js';
import {gflLinearModels} from '../analysis/gfl-linear-model.js';
import {linearStepMetrics} from '../analysis/gfl-step-metrics.js';
import {searchGflCandidates} from '../analysis/gfl-tuning-search.js';
const project=JSON.parse(readFileSync('tests/fixtures/PV_Grid_Demo.json')),s=project.extensions.gflPi.PV1,p=readGflModelInput(project,'PV1',s).modelInput;
const reference=JSON.parse(readFileSync('tests/fixtures/gfl-advisor-reference.json')),items=[];
const search=searchGflCandidates(p,{},s.gains,{maxMilliseconds:120000});
if(search.searchStatus!=='feasibleFound'||!search.candidates.length)throw Error('Independent check requires completed search candidates.');
for(const [name,gains]of Object.entries({baseline:s.gains,probe:reference.probe.gains,...Object.fromEntries(search.candidates.map(c=>[c.id,c.gains]))})){
 const models=gflLinearModels(p,gains);for(const [loop,model]of Object.entries(models))items.push({name,loop,model,result:linearStepMetrics(model)});
}
mkdirSync('artifacts/gfl-advisor',{recursive:true});writeFileSync('artifacts/gfl-advisor/numeric-input.json',JSON.stringify(items));writeFileSync('artifacts/gfl-advisor/search-result.json',JSON.stringify(search,null,2));
console.log(`Exported ${items.length} independent comparison models.`);
