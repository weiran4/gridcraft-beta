/** Rated sinusoidal capability, separate from stability and device peak limits. */
export function assessOperatingCapability(point,limits={}) {
 const check=(actual,limit)=>{
  if(limit!==undefined&&limit!==null&&(!Number.isFinite(limit)||limit<=0))throw Error('Capability limit must be positive or unknown');
  return {actual:Number.isFinite(actual)?actual:null,limit:limit??null,status:!Number.isFinite(actual)||limit==null?'unknown':actual<=limit*(1+1e-9)?'passed':'failed'};
 };
 const entries={bridgeCurrent:check(point.bridgeCurrentPu??point.currentPu,limits.bridgeCurrentPu),gridCurrent:check(point.gridCurrentPu,limits.gridCurrentPu),modulation:check(point.modulation,limits.modulation)};
 return {...entries,status:Object.values(entries).some(v=>v.status==='failed')?'failed':Object.values(entries).some(v=>v.status==='unknown')?'unknown':'passed'};
}
