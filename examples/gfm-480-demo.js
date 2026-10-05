import {gfmDefaults} from '../project/gfm-settings.js?v=gfm-pi1';
import {emptyProject,createComponent} from '../project/model.js?v=transformer-rx3';
export const gfm480Inputs={ratedIbrVA:1e6,transformer1VA:1e6,transformer2VA:1e6,activePowerW:1e6,reactivePowerVar:0};
export function gfm480Demo({ratedIbrVA,transformer1VA,transformer2VA,activePowerW,reactivePowerVar}={}){
 for(const value of [ratedIbrVA,transformer1VA,transformer2VA])if(!Number.isFinite(value)||value<=0)throw Error('请明确提供 GFM 与两台变压器的额定视在容量。');
 for(const value of [activePowerW,reactivePowerVar])if(!Number.isFinite(value))throw Error('请明确提供运行 P/Q。');
 const p=emptyProject();p.name='BESS_GFM_demo';p.frequencyHz=50;
 const add=(type,id,x,y,values,name)=>{const c=createComponent(type,id,x,y);Object.assign(c.parametersSI,values);c.name=name;p.components.push(c);return c;};
 const wire=(from,to)=>p.wires.push({id:'W'+(p.wires.length+1),from,to,mid:null});
 add('source','S1',120,280,{ratedVoltageV:220000,frequencyHz:50,phaseRad:0},'Grid source');
 add('rl','RG',330,280,{resistanceOhm:2303.0001,inductanceH:41.568},'Grid RL');
 add('bus','BUS220',520,280,{ratedVoltageV:220000,isPcc:true,primaryIbrId:'GFM1'},'Analysis · 220 kV');
 const tr={shortCircuitResistancePu:.001,shortCircuitReactancePu:.1,baseFrequencyHz:50};
 add('transformer','T1',720,280,{...tr,primaryVoltageV:220000,secondaryVoltageV:35000,ratedApparentPowerVA:transformer1VA},'T1');
 add('bus','BUS35',910,280,{ratedVoltageV:35000,isPcc:true,primaryIbrId:'GFM1'},'35 kV bus');
 add('transformer','T2',1100,280,{...tr,primaryVoltageV:35000,secondaryVoltageV:480,ratedApparentPowerVA:transformer2VA},'T2');
 add('bus','PCC1',1300,280,{ratedVoltageV:480,isPcc:true,primaryIbrId:'GFM1'},'PCC · 480 V');
 add('gfm','GFM1',1520,280,{ratedApparentPowerVA:ratedIbrVA,ratedActivePowerW:1e6,ratedReactivePowerVar:0,ratedAcVoltageV:480,activePowerW,reactivePowerVar,filterResistanceOhm:1e-5,filterInductanceH:146.3e-6},'BESS1 · GFM');
 add('dc','DC1',1740,280,{voltageV:800,resistanceOhm:0},'DC · ideal').rotation=180;
 add('rc','RC1',1300,530,{resistanceOhm:.118,capacitanceF:646e-6},'Shunt RC');
 wire('S1.AC','RG.A');wire('RG.B','BUS220.AC');wire('BUS220.AC','T1.A');wire('T1.B','BUS35.AC');wire('BUS35.AC','T2.A');wire('T2.B','PCC1.AC');wire('PCC1.AC','GFM1.AC');wire('PCC1.AC','RC1.AC');wire('GFM1.DC','DC1.DC');
 p.editor={zoom:.6382978723404256,viewCenter:{x:930,y:430}};
 p.extensions.gfmSetup={GFM1:{controlStepSeconds:50e-6,configurationStatus:'inner-pi-ready'}};
 p.extensions.gfmPi={GFM1:{...gfmDefaults(),mode:'droop',manual:false}};
 p.extensions.exampleNotes={topology:'单台 GFM，220/35/0.48 kV；RC 为每相并联串联支路。',rating:'S 基准 1 MVA，额定 P=1 MW、Q=0。',dc:'DC 暂用理想 800 V 电源；母线电容未配置；GFM 内环采用固定 DC 条件，成网参数使用可编辑初值。'};
 return p;
}
