const field=(key,label,unit,value,min=0,strict=false,group='参数')=>({key,label,unit,value,min,strict,group});
const rating=[field('ratedApparentPowerVA','额定视在功率 S','MVA',100,0,true,'额定值'),field('ratedActivePowerW','额定有功功率 P','MW',100,0,false,'额定值'),field('ratedReactivePowerVar','额定无功功率 Q','Mvar',0,0,false,'额定值'),field('ratedAcVoltageV','额定交流电压','kV',34.5,0,true,'额定值'),field('activePowerW','运行有功 P','MW',50,-Infinity,false,'运行点'),field('reactivePowerVar','运行无功 Q','Mvar',0,-Infinity,false,'运行点'),field('filterResistanceOhm','滤波电阻 Rf','Ω',.01,0,false,'逆变器侧滤波'),field('filterInductanceH','滤波电感 Lf','mH',1,0,false,'逆变器侧滤波')];
export const catalog={
 source:{label:'AC 电压源',en:'Ideal AC Source',short:'AC',ports:{AC:'ac'},fields:[field('ratedVoltageV','线电压 RMS','kV',115,0,true),field('frequencyHz','频率','Hz',60,0,true),field('phaseRad','相角','deg',0,-Infinity)]},
 rl:{label:'串联 RL',en:'Series RL',short:'RL',ports:{A:'ac',B:'ac'},fields:[field('resistanceOhm','电阻 R','Ω',.12),field('inductanceH','电感 L','mH',3.18309886184)]},
 transformer:{label:'变压器',en:'Transformer · R/X',short:'TR',ports:{A:'ac',B:'ac'},fields:[field('ratedApparentPowerVA','额定容量','MVA',1,0,true),field('primaryVoltageV','一次侧电压 A','kV',220,0,true),field('secondaryVoltageV','二次侧电压 B','kV',35,0,true),field('baseFrequencyHz','基准频率','Hz',50,0,true),field('shortCircuitResistancePu','短路电阻 R','pu',.001),field('shortCircuitReactancePu','短路电抗 X','pu',.1)]},
 rc:{label:'RC 滤波器',en:'Shunt Series RC',short:'RC',ports:{AC:'ac'},fields:[field('resistanceOhm','阻尼电阻 R','Ω',1),field('capacitanceF','电容 C','μF',100,0,true)]},
 gfl:{label:'GFL 逆变器',en:'Grid Following',short:'GFL',ports:{AC:'ac',DC:'dc'},fields:rating},
 gfm:{label:'GFM 逆变器',en:'Grid Forming',short:'GFM',ports:{AC:'ac',DC:'dc'},fields:rating},
 dc:{label:'DC 电源 + R',en:'DC Source + R',short:'DC',ports:{DC:'dc'},fields:[field('voltageV','直流电压','V',1500,0,true),field('resistanceOhm','串联电阻 Rdc','Ω',.01)]},
 bus:{label:'母线 / PCC',en:'Bus / PCC',short:'BUS',ports:{AC:'ac'},fields:[field('ratedVoltageV','额定线电压','kV',34.5,0,true)]}
};
export const isIbr=c=>c.type==='gfl'||c.type==='gfm';
export function portDomain(project,key){
 if(typeof key!=='string'||!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(key))return undefined;
 const [id,port]=key.split('.'),c=project.components.find(c=>c?.id===id);
 if(!c||!Object.hasOwn(catalog,c.type))return undefined;
 const ports=catalog[c.type].ports;return Object.hasOwn(ports,port)?ports[port]:undefined;
}
