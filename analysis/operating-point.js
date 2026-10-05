// Balanced three-phase operating check at the specified AC terminal voltage.
export function operatingPoint(p){
 for(const k of ['activeW','reactiveVar','voltageLL','ratedVA','frequencyHz','L'])if(!Number.isFinite(p[k]))throw Error('运行 P/Q、交流电压、容量、频率及电感必须为有限数值。');
 if(p.voltageLL<=0||p.ratedVA<=0||p.frequencyHz<=0||p.L<0)throw Error('运行工况的电压、容量和频率须为正数，电感不能为负数。');
 const apparentVA=Math.hypot(p.activeW,p.reactiveVar),currentRms=apparentVA/(Math.sqrt(3)*p.voltageLL),phi=apparentVA===0?0:Math.atan2(p.reactiveVar,p.activeW);
 const phaseRms=p.voltageLL/Math.sqrt(3),x=2*Math.PI*p.frequencyHz*p.L;
 const converterRms=Math.hypot(phaseRms+x*p.reactiveVar/(3*phaseRms),x*p.activeW/(3*phaseRms));
 const modulation=p.dcVoltage>0?2*Math.sqrt(2)*converterRms/p.dcVoltage:null;
 if(![apparentVA,currentRms,converterRms].every(Number.isFinite)||(modulation!==null&&!Number.isFinite(modulation)))throw Error('运行工况超出计算范围。');
 return {apparentVA,currentRms,phi,angleDeg:phi*180/Math.PI,powerFactor:apparentVA===0?null:p.activeW/apparentVA,loadingPercent:100*apparentVA/p.ratedVA,overRated:apparentVA>p.ratedVA*(1+1e-12),converterRms,modulation};
}
export function inverterOperatingContext(project,c){const p=c.parametersSI;return {activeW:p.activePowerW,reactiveVar:p.reactivePowerVar,ratedVA:p.ratedApparentPowerVA,voltageLL:p.ratedAcVoltageV,frequencyHz:project.frequencyHz,L:p.filterInductanceH};}
