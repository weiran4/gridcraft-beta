export const transformerDefaults={baseFrequencyHz:50,shortCircuitResistancePu:0.001,shortCircuitReactancePu:0.1};
// Balanced positive-sequence equivalent, referred to the chosen winding.
// Zbase = V_LL^2 / S; R = Rpu * Zbase; X(f) = Xpu * Zbase * f / fbase.
export function transformerImpedance(p,frequency,primary=true){
 const v=primary?p.primaryVoltageV:p.secondaryVoltageV,zbase=v*v/p.ratedApparentPowerVA;
 return {re:(p.shortCircuitResistancePu??transformerDefaults.shortCircuitResistancePu)*zbase,im:(p.shortCircuitReactancePu??transformerDefaults.shortCircuitReactancePu)*zbase*frequency/(p.baseFrequencyHz??transformerDefaults.baseFrequencyHz)};
}
