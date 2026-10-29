/** Explicit averaged controller contract. No simulator-specific presets. */
export function resolveControlImplementation(raw={}) {
 const defaults={capacitorDecouplingSignal:'capacitor',decouplingFrequencySource:'forming',gridCurrentFilterSeconds:0,actuatorGain:1,biasPolicy:'initialized-equilibrium'};
 for(const k of Object.keys(raw))if(!(k in defaults))throw Error('Unknown control structure field: '+k);
 const c={...defaults,...raw};
 if(!['capacitor','filtered-pcc'].includes(c.capacitorDecouplingSignal))throw Error('Unsupported capacitor decoupling signal');
 if(!['forming','nominal'].includes(c.decouplingFrequencySource))throw Error('Unsupported decoupling frequency');
 if(c.biasPolicy!=='initialized-equilibrium')throw Error('Only explicit initialized-equilibrium bias is supported');
 if(!Number.isFinite(c.gridCurrentFilterSeconds)||c.gridCurrentFilterSeconds<0)throw Error('Grid current filter must be nonnegative');
 if(!Number.isFinite(c.actuatorGain)||c.actuatorGain<=0)throw Error('Actuator gain must be positive');
 return Object.freeze(c);
}
