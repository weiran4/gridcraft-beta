import {writeFileSync} from 'node:fs';
import {demo} from '../examples/demo.js';
import {gfmContext,gfmSettings} from '../project/gfm-settings.js';
import {autoTuneGfm} from '../analysis/gfm-pi.js';
import {gfmDynamicModel,analyzeGfmMode,tuneGfmCoupled} from '../analysis/gfm-dynamics.js';
const project=demo('gfm480'),s=gfmSettings(project,'GFM1'),p={...gfmContext(project,'GFM1'),...s},seed=autoTuneGfm(p).gains,rows=[];
for(const mode of ['droop','vsg','sync']){
 const tuned=await tuneGfmCoupled(p,seed,mode,s.modes[mode]);
 for(const [name,input,g] of [['baseline',p,seed],['tuned',p,tuned.gains],['delay-bypass',{...p,delaySamples:1.5,filterPqMs:0,filterVoltageMs:0,filterCurrentMs:0},tuned.gains],['changed-pq',{...p,activePowerW:.8e6,reactivePowerVar:.1e6},tuned.gains]]){
  const model=gfmDynamicModel(input,g,mode,s.modes[mode]),result=analyzeGfmMode(input,g,mode,s.modes[mode]);
  rows.push({mode,name,A:model.A,poles:result.poles,alpha:result.alpha,residual:model.residual,gains:g,op:result.op});
 }
}
writeFileSync(process.argv[2]||'gfm-coupled-check.json',JSON.stringify(rows));
console.log(rows.filter(r=>r.name==='tuned').map(r=>({mode:r.mode,alpha:r.alpha,gains:r.gains})));
