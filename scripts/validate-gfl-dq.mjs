// Offline reference data. No Python dependency is shipped in the web application.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {readGflModelInput} from '../analysis/gfl-model-input.js';
import {gflDqModel} from '../analysis/gfl-dq-model.js';
import {analyzeGflDq} from '../analysis/gfl-dq-analysis.js';
import {frequencyMatrix} from '../analysis/port-response.js';
const project=JSON.parse(readFileSync('tests/fixtures/PV_Grid_Demo.json')),s=project.extensions.gflPi.PV1;
const p=readGflModelInput(project,'PV1',s).modelInput;
const cases=[];
for(const dMode of ['P','Vdc'])for(const qMode of ['Q','Vac'])for(const pllEnabled of [true,false]){
 const input={...p,dMode,qMode},options={enabled:true,pllEnabled,frequencyHz:20,damping:.707,pllFilterMs:0,dcModel:'auto',decouplingFrequency:'pll'};
 cases.push({name:`${dMode}-${qMode}-${pllEnabled?'pll':'fixed'}`,input,options,gains:s.gains});
}
for(const [name,changes,options]of [
 ['filteredPLL',{}, {pllFilterMs:.5,frequencyHz:35}],
 ['delayPade',{delaySamples:1.5},{frequencyHz:30}],
 ['zeroFilters',{filterCurrentMs:0,filterVoltageMs:0,filterPqMs:0,filterVdcMs:0},{decouplingFrequency:'nominal'}],
 ['changedWorkingPoint',{activePowerW:3e5,reactivePowerVar:1e5,gridXOhm:p.gridXOhm*.6},{frequencyHz:10}],
 ['strongPQ',{dMode:'P',qMode:'Q',activePowerW:2e5,gridXOhm:p.gridXOhm*.1,filterCurrentMs:.1,filterVoltageMs:.1}, {frequencyHz:20}],
 ['capacitorPQ',{dMode:'P',qMode:'Q',activePowerW:3e5},{dcModel:'capacitor'}]
])cases.push({name,input:{...p,...changes},options:{enabled:true,...options},gains:s.gains});
const items=cases.map(c=>{
 const m=gflDqModel(c.input,c.gains,c.options),r=analyzeGflDq(c.input,c.gains,c.options,{includeSeries:false});
 const freq=[.1,1,10,50,200].map(hz=>({hz,H:frequencyMatrix(m,hz)}));
 const dx=m.x0.map((x,i)=>1e-6*Math.cos(i+1));const perturbed=m.evaluate(m.x0.map((x,i)=>x+dx[i]));
 return {...c,model:r.model,alpha:r.alpha,poles:r.poles,residual:m.residual,frequencies:freq,perturbation:{dx,response:perturbed}};
});
mkdirSync('artifacts/gfl-advisor',{recursive:true});writeFileSync('artifacts/gfl-advisor/dq-model-validation-input.json',JSON.stringify(items));console.log('Exported '+items.length+' PLL/dq operating point and Jacobian cases.');
