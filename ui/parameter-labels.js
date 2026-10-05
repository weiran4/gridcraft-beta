import {catalog} from '../components/catalog.js?v=transformer-rx3';
import {fromSI} from '../core/electrical/units.js?v=transformer-rx3';
import {rlImpedance,rcImpedance,magnitude,ratio} from '../core/electrical/impedance.js?v=transformer-rx3';
const names={baseFrequencyHz:'fb',shortCircuitResistancePu:'Rsc',shortCircuitReactancePu:'Xsc',ratedVoltageV:'VLL',frequencyHz:'f',phaseRad:'θ',resistanceOhm:'R',inductanceH:'L',ratedApparentPowerVA:'S',primaryVoltageV:'V1',secondaryVoltageV:'V2',capacitanceF:'C',ratedActivePowerW:'Prated',ratedReactivePowerVar:'Qrated',ratedAcVoltageV:'VLL',activePowerW:'P',reactivePowerVar:'Q',filterResistanceOhm:'Rf',filterInductanceH:'Lf',voltageV:'Vdc'};
export const formatParameter=n=>n==='Infinity'?'∞':n===null?'—':Number.isFinite(n)?String(Number(n.toPrecision(7))):'—';
export function parameterLines(c,frequency){
 const lines=catalog[c.type].fields.map(f=>`${names[f.key]||f.label} = ${formatParameter(fromSI(c.parametersSI[f.key],f.unit))} ${f.unit}`);
 const p=c.parametersSI;
 if(c.type==='rl'){const z=rlImpedance(p.resistanceOhm,p.inductanceH,frequency);lines.push(`X = ${formatParameter(z.im)} Ω`,`|Z| = ${formatParameter(magnitude(z))} Ω`,`X/R = ${formatParameter(ratio(z))}`);}
 if(c.type==='rc'){const z=rcImpedance(p.resistanceOhm,p.capacitanceF,frequency);lines.push(`Xc = ${formatParameter(-z.im)} Ω`,`|Z| = ${formatParameter(magnitude(z))} Ω`);}
 if(c.type==='transformer')lines.push(`a = ${formatParameter(p.primaryVoltageV/p.secondaryVoltageV)}`);
 return lines;
}
