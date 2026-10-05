export function fixture(stages=[['rl', {resistanceOhm:0.6,inductanceH:0.8/(120*Math.PI)}]], sourceV=10000, pccV=10000) {
 const components=[{id:'source',type:'source',name:'Grid',x:100,y:200,parametersSI:{ratedVoltageV:sourceV,frequencyHz:60,phaseRad:0}}];
 const wires=[]; let previous='source.AC';
 stages.forEach(([type,parametersSI],i)=>{const id='e'+i;components.push({id,type,name:id,x:250+i*150,y:200,parametersSI});wires.push({id:'w'+i,from:previous,to:id+'.A'});previous=id+'.B';});
 components.push({id:'pcc',type:'bus',name:'PCC',x:750,y:200,parametersSI:{ratedVoltageV:pccV,isPcc:true,primaryIbrId:'ibr'}});
 components.push({id:'ibr',type:'gfl',name:'GFL',x:950,y:200,parametersSI:{ratedApparentPowerVA:1e8,ratedActivePowerW:1e8,ratedReactivePowerVar:0,ratedAcVoltageV:pccV,activePowerW:5e7,reactivePowerVar:0,filterResistanceOhm:0.01,filterInductanceH:0.001}});
 wires.push({id:'wp',from:previous,to:'pcc.AC'},{id:'wi',from:'pcc.AC',to:'ibr.AC'});
 return {format:'grid-strength',schemaVersion:1,name:'Test',frequencyHz:60,components,wires,editor:{zoom:1,viewCenter:{x:600,y:350}},extensions:{}};
}
export const tr=(v1,v2)=>({baseFrequencyHz:50,shortCircuitResistancePu:0,shortCircuitReactancePu:0,ratedApparentPowerVA:1e8,primaryVoltageV:v1,secondaryVoltageV:v2});
export const rl=(r,x)=>({resistanceOhm:r,inductanceH:x/(120*Math.PI)});
