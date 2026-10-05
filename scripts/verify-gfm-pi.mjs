import {writeFile} from 'node:fs/promises';
import {demo} from '../examples/demo.js';
import {gfmContext,gfmDefaults} from '../project/gfm-settings.js';
import {autoTuneGfm,gfmResponse,gfmPolynomials} from '../analysis/gfm-pi.js';
const p={...gfmContext(demo('gfm480'),'GFM1'),...gfmDefaults()},auto=autoTuneGfm(p),cases=[];
for(const [name,input,gains] of [['default',p,auto.gains],['changed',{...p,C:p.C*1.3,Rc:.2,gridL:p.gridL*.8,feedforwardVoltage:.6,feedforwardCurrent:.4,filterVoltageMs:4,filterCurrentMs:.6},{...auto.gains,q:{kp:.08,ki:.8},Q:{kp:.5,ki:20}}]]){
 cases.push({name,input,gains,polynomials:gfmPolynomials(input,gains),responses:[.01,.1,1,5,20,100,500,3000].map(hz=>({hz,...gfmResponse(input,gains,hz)}))});
}
await writeFile(new URL('../docs/validation/gfm-model-data.json',import.meta.url),JSON.stringify({auto,cases},null,2)+'\n');
