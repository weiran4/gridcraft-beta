/** Balanced island with a fixed PCC magnitude and optional per-phase shunt R. */
export function solveIslandOperatingPoint(p,load={}) {
 for(const k of Object.keys(load))if(!['voltagePu','resistanceOhm'].includes(k))throw Error('Unsupported island load field: '+k);
 const V=load.voltagePu??1,Rload=load.resistanceOhm??null;
 if(!(V>0)||!Number.isFinite(V)||Rload!==null&&(!(Rload>0)||!Number.isFinite(Rload)))throw Error('Invalid island voltage/load');
 const Z=p.voltageLL**2/p.ratedVA,w=2*Math.PI*p.frequencyHz,rc=p.Rc/Z,Xc=1/(w*p.C*Z);
 const ic=[V*rc/(rc*rc+Xc*Xc),V*Xc/(rc*rc+Xc*Xc)],ig=[Rload===null?0:V*Z/Rload,0],il=ic.map((v,k)=>v+ig[k]);
 const vc=[V-rc*ic[0],-rc*ic[1]],u=[V+p.R/Z*il[0]-w*p.L/Z*il[1],p.R/Z*il[1]+w*p.L/Z*il[0]],P=V*ig[0];
 const losses=p.R/Z*(il[0]**2+il[1]**2)+rc*(ic[0]**2+ic[1]**2);
 return {Z,w,V,P,Q:0,ig,il,ic,vc,u,losses,bridgePower:P+losses,currentPu:Math.hypot(...il),gridCurrentPu:Math.hypot(...ig),modulation:2*Math.sqrt(2/3)*p.voltageLL*Math.hypot(...u)/p.dcVoltage,voltageLL:V*p.voltageLL,loadConductancePu:Rload===null?0:Z/Rload};
}
