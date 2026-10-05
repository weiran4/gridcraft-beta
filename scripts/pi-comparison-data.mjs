import fs from 'node:fs';
import {demo} from '../examples/demo.js';
import {outerContext} from '../analysis/gfl-outer.js';
import {autoTuneGfl,closedLoopPolynomials} from '../analysis/gfl-autotune.js';
import {frequencySweep,crossings} from '../analysis/gfl-frequency.js';
const project=demo(),settings=project.extensions.gflPi.PV1,c=project.components.find(c=>c.id==='PV1').parametersSI;
const input={ratedVA:c.ratedApparentPowerVA,voltageLL:c.ratedAcVoltageV,frequencyHz:project.frequencyHz,R:c.filterResistanceOhm,L:c.filterInductanceH,dcVoltage:800,...settings,...outerContext(project,'PV1'),dcCapacitanceF:settings.customCapUf*1e-6};
delete input.gains;delete input.gainBank;
const cases={simulation:{d:{kp:1.5,ki:50},q:{kp:1,ki:50},P:{kp:5,ki:100},Q:{kp:2,ki:100}},automatic:autoTuneGfl(input).gains};
const results=Object.fromEntries(Object.entries(cases).map(([name,gains])=>{
 const sweep=frequencySweep(input,gains,'open',10001);
 return [name,{gains,polynomials:closedLoopPolynomials(input,gains),crossings:Object.fromEntries(Object.entries(sweep.series).map(([k,pts])=>[k,crossings(pts)]))}];
}));
fs.mkdirSync('docs/validation',{recursive:true});fs.writeFileSync('docs/validation/pi-comparison-data.json',JSON.stringify({input,results},null,2));
console.log('Wrote common-input PI comparison data.');
