// Offline independent cross-check data; not included in dist.
import {mkdirSync,writeFileSync} from 'node:fs';
import {demo} from '../examples/demo.js';
import {gfmContext,gfmDefaults,gfmSettings} from '../project/gfm-settings.js';
import {autoTuneGfm,gfmResponse} from '../analysis/gfm-pi.js';
import {gfmDynamicModel,analyzeGfmMode} from '../analysis/gfm-dynamics.js';
import {gfmLinearModels,searchGfmCandidates} from '../analysis/gfm-tuning-advisor.js';
import {linearStepMetrics} from '../analysis/gfl-step-metrics.js';
const p={...gfmContext(demo('gfm480'),'GFM1'),...gfmDefaults(),considerScr:true},modes=gfmSettings(demo('gfm480'),'GFM1').modes;
const items=[],coupled=[];
for(const [name,changes] of [['grid',{feedforwardCurrent:.75}],['full-current-feedforward',{feedforwardCurrent:1}],['no-current-feedforward',{feedforwardCurrent:0}],['local',{considerScr:false}]]){
 const input={...p,...changes},g=autoTuneGfm(input).gains,models=gfmLinearModels(input,g);
 for(const [loop,model]of Object.entries(models))items.push({name,loop,model,result:linearStepMetrics(model)});
}
const search=searchGfmCandidates(p,{},null,'droop',modes.droop,{maxMilliseconds:120000});if(!search.candidates.some(c=>c.requirementsMet))throw Error('No completed GFM candidate for independent verification.');
for(const c of search.candidates.filter(c=>c.requirementsMet)){
 for(const [loop,model]of Object.entries(gfmLinearModels(p,c.gains)))items.push({name:c.id,loop,model,result:linearStepMetrics(model)});
 for(const mode of ['droop','vsg','sync']){const model=gfmDynamicModel(p,c.gains,mode,modes[mode]),e=analyzeGfmMode(p,c.gains,mode,modes[mode]);coupled.push({name:c.id,mode,A:model.A,alpha:e.alpha,stable:e.stable});}
}
mkdirSync('artifacts/gfl-advisor',{recursive:true});writeFileSync('artifacts/gfl-advisor/gfm-numeric-input.json',JSON.stringify({items,coupled}));writeFileSync('artifacts/gfl-advisor/gfm-search-result.json',JSON.stringify(search,null,2));console.log(`GFM: ${items.length} scalar steps + ${coupled.length} coupled eigenvalue checks.`);
