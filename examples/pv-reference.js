import {emptyProject,createComponent} from '../project/model.js?v=transformer-rx3';
/** User reference: scale = 1; keep original grid R/L without current multiplication. */
export function pvReferenceDemo({ratedIbrVA}={}) {
 if(!Number.isFinite(ratedIbrVA)||ratedIbrVA<=0)throw Error('必须明确提供逆变器额定视在容量 VA。');
 const p=emptyProject();p.name='PV reference · 220 / 35 / 0.315 kV';p.frequencyHz=50;
 const add=(type,id,x,y,values,name)=>{const c=createComponent(type,id,x,y);Object.assign(c.parametersSI,values);c.name=name;p.components.push(c);};
 const wire=(from,to)=>p.wires.push({id:'W'+(p.wires.length+1),from,to,mid:null});
 add('source','S1',120,280,{ratedVoltageV:220000,frequencyHz:50},'Grid source');
 add('rl','RG',330,280,{resistanceOhm:2303.01,inductanceH:41.568},'Grid RL');
 add('bus','BUS220',520,280,{ratedVoltageV:220000,isPcc:true,primaryIbrId:'PV1'},'Analysis · 220 kV');
 add('transformer','T1',720,280,{primaryVoltageV:220000,secondaryVoltageV:35000,ratedApparentPowerVA:1e6},'T1');
 add('bus','BUS35',910,280,{ratedVoltageV:35000,isPcc:true,primaryIbrId:'PV1'},'35 kV bus');
 add('transformer','T2',1100,280,{primaryVoltageV:35000,secondaryVoltageV:315,ratedApparentPowerVA:1e6},'T2');
 add('bus','PCC1',1300,280,{ratedVoltageV:315,isPcc:true,primaryIbrId:'PV1'},'PCC · 315 V');
 add('gfl','PV1',1520,280,{ratedApparentPowerVA:ratedIbrVA,ratedActivePowerW:1e6,ratedReactivePowerVar:0,ratedAcVoltageV:315,activePowerW:1e6,reactivePowerVar:0,filterResistanceOhm:1e-6,filterInductanceH:63e-6},'PV1 · GFL');
 add('dc','DC1',1740,280,{voltageV:800,resistanceOhm:0},'DC · ideal');
 p.components.at(-1).rotation=180;
 add('rc','RC1',1300,530,{resistanceOhm:.051,capacitanceF:1500e-6},'Shunt RC');
 wire('S1.AC','RG.A');wire('RG.B','BUS220.AC');wire('BUS220.AC','T1.A');wire('T1.B','BUS35.AC');wire('BUS35.AC','T2.A');wire('T2.B','PCC1.AC');wire('PCC1.AC','PV1.AC');wire('PCC1.AC','RC1.AC');wire('PV1.DC','DC1.DC');
 p.extensions.reference={note:'三相平衡单机系统。电源串联电阻已计入 Grid RL；SCR 按所选母线的上游阻抗与逆变器额定容量计算，RC 与逆变器滤波阻抗不计入上游电网等效。',windingVoltageBasis:'T2 低压侧额定线电压为 0.315 kV。',gridInductanceBasis:'Grid RL 电感为 41.568 H。'};
 p.editor={zoom:.68,viewCenter:{x:835,y:420}};
 return p;
}
