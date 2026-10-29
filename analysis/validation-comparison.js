/** Never turn startup/limit/carrier observations into linear stability truth. */
export function compareCase(prediction,observation={}) {
 const reasons=[];
 if(observation.stage!=='equilibrium')reasons.push('Observation is not an equilibrium perturbation');
 if(observation.smallSignal!==true)reasons.push('Small-signal excitation not established');
 if(observation.saturated!==false)reasons.push('Unsaturated operation not established');
 if(observation.sameOperatingPoint!==true)reasons.push('Operating point equivalence not established');
 if(typeof prediction.stable!=='boolean'||typeof observation.stable!=='boolean')reasons.push('Stability label missing');
 return {comparable:reasons.length===0,reasons,agreement:reasons.length?null:prediction.stable===observation.stable};
}
