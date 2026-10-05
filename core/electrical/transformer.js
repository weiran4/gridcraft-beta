export const transformerDefaults={baseFrequencyHz:50,shortCircuitResistancePu:0.001,shortCircuitReactancePu:0.1};
// Balanced positive-sequence equivalent, referred to the chosen winding.
// RTDS reference: ss_scaled_trf3.c lines 275-300 (frequency/base/R/L definitions).
export function transformerImpedance(p,frequency,primary=true){
 const v=primary?p.primaryVoltageV:p.secondaryVoltageV,zbase=v*v/p.ratedApparentPowerVA;
 return {re:(p.shortCircuitResistancePu??transformerDefaults.shortCircuitResistancePu)*zbase,im:(p.shortCircuitReactancePu??transformerDefaults.shortCircuitReactancePu)*zbase*frequency/(p.baseFrequencyHz??transformerDefaults.baseFrequencyHz)};
}
