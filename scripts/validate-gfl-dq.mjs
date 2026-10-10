// Offline evidence export. Python independently reconstructs equilibrium/RHS;
// exported matrices and operating points are comparison subjects, not truth.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {readGflModelInput} from '../analysis/gfl-model-input.js';
import {gflDqModel} from '../analysis/gfl-dq-model.js';
import {classifyDqPoles} from '../analysis/gfl-dq-analysis.js';
import {gflNumericalPolicy} from '../analysis/gfl-analysis-contract.js';
import {frequencyMatrix} from '../analysis/port-response.js';
const project=JSON.parse(readFileSync('tests/fixtures/PV_Grid_Demo.json')),s=project.extensions.gflPi.PV1;
const p=readGflModelInput(project,'PV1',s).modelInput;
const cases=[],options={enabled:true,pllEnabled:true,frequencyHz:20,damping:Math.SQRT1_2,pllFilterMs:0,dcModel:'auto',decouplingFrequency:'pll'};
function add(name,input={},opts={},gains=s.gains){cases.push({name,input:{...p,...input},options:{...options,...opts},gains:structuredClone(gains)});}
for(const dMode of ['P','Vdc'])for(const qMode of ['Q','Vac'])for(const pllEnabled of [true,false])add(`${dMode}-${qMode}-${pllEnabled?'pll':'fixed'}`,{dMode,qMode},{pllEnabled});
for(const [name,changes,opts]of [
 ['filteredPLL',{}, {pllFilterMs:.5,frequencyHz:35,damping:.9}],
 ['delayPade',{delaySamples:1.5},{frequencyHz:30}],
 ['zeroFilters',{filterCurrentMs:0,filterVoltageMs:0,filterPqMs:0,filterVdcMs:0},{decouplingFrequency:'nominal'}],
 ['changedWorkingPoint',{activePowerW:3e5,reactivePowerVar:1e5,gridXOhm:p.gridXOhm*.6},{frequencyHz:10,damping:.5}],
 ['strongPQ',{dMode:'P',qMode:'Q',activePowerW:2e5,gridXOhm:p.gridXOhm*.1,filterCurrentMs:.1,filterVoltageMs:.1},{dcModel:'rigid'}],
 ['weakGrid',{dMode:'P',qMode:'Vac',activePowerW:2e5,reactivePowerVar:-5e4,gridXOhm:p.gridXOhm*1.5},{frequencyHz:12,damping:1}],
 ['capacitorPQ',{dMode:'P',qMode:'Q',activePowerW:3e5},{dcModel:'capacitor'}],
 ['capacitorVac',{dMode:'P',qMode:'Vac',activePowerW:2e5,reactivePowerVar:4e4},{dcModel:'capacitor'}]
])add(name,changes,opts);
// Remove each relevant integrator independently in every outer mode pair,
// plus all together. Frozen experiments must not retain an outer integrator.
for(const dMode of ['P','Vdc'])for(const qMode of ['Q','Vac'])for(const zero of ['d','q','P','Q','all']){
 const gains=structuredClone(s.gains);for(const key of zero==='all'?['d','q','P','Q']:[zero])gains[key].ki=0;
 add(`${dMode}-${qMode}-Ki0-${zero}`,{dMode,qMode,activePowerW:2e5,reactivePowerVar:3e4,gridXOhm:p.gridXOhm*.1,filterCurrentMs:.1,filterVoltageMs:.1},{},gains);
}
const items=[];
for(const c of cases)for(const experimentId of ['outer-reference-closed','current-reference-frozen-outer']){
 const m=gflDqModel(c.input,c.gains,c.options,{experimentId}),{evaluate,...model}=m;
 const {alpha,poles,status}=classifyDqPoles(m.A);
 const frequencies=[.1,1,10,50,200].map(hz=>({hz,H:frequencyMatrix(m,hz)}));
 items.push({...c,name:c.name+'/'+experimentId,experimentId,model,alpha,poles,stabilityStatus:status,
  numericalPolicy:gflNumericalPolicy().model,residual:m.residual,frequencies,
  perturbation:{amplitude:1e-6,horizonSeconds:.002,dx:m.x0.map((x,i)=>1e-6*Math.cos(i+1)),referenceColumns:[0,1]}});
}
mkdirSync('artifacts/gfl-advisor',{recursive:true});writeFileSync('artifacts/gfl-advisor/dq-model-validation-input.json',JSON.stringify(items));
console.log('Exported '+items.length+' independent PLL/dq cases ('+cases.length+' configurations × two feedback experiments).');
