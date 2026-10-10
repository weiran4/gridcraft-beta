/** Serializable adapter for the existing averaged dq equations. No PLL or
 * topology is reimplemented here; legacy array order is the contract order. */
import {gflDqModel,dqModelVersion} from './gfl-dq-model.js';
import {validateGains} from './gfl-frequency.js';
import {GflAnalysisError,gflFingerprint,gflNumericalPolicy} from './gfl-analysis-contract.js';
import {resolveGflSnapshot} from '../project/gfl-analysis-settings.js';

const fail=(code,message)=>{throw new GflAnalysisError(code,message);};
const freeze=value=>{
 if(value&&typeof value==='object'){
  for(const child of Object.values(value))freeze(child);
  Object.freeze(value);
 }
 return value;
};
// Read only the shared Gains fields, then validate the exact detached values
// used by both the equations and identity. Decorations never cross this boundary.
function canonicalGains(gains){
 try{
  const candidate=Object.fromEntries(['d','q','P','Q'].map(loop=>[loop,{kp:gains?.[loop]?.kp,ki:gains?.[loop]?.ki}]));
  validateGains(candidate);return candidate;
 }catch(error){fail('invalidInput',error.message);}
}
const descriptor=(id,labelZh,unit,frame,meaning,baseSI=null,baseUnit=null,legacyName=null,applicable=true,enabledWhen=null)=>
 ({id,labelZh,unit,frame,meaning,baseSI,baseUnit,legacyName,applicable,enabledWhen});

function stateDescriptors(raw,bases){
 const {Vb,Ib,S,Vdc}=bases,d=descriptor,states={};
 for(const [axis,k]of [['d',0],['q',1]]){
  states['il'+k]=d('electrical.il.'+axis,'桥侧 '+axis+' 轴电流','pu','nominal-dq','逆变器向电网为正的桥侧电流分量',Ib,'A');
  states['ig'+k]=d('electrical.ig.'+axis,'网侧 '+axis+' 轴电流','pu','nominal-dq','PCC 向上游电网为正的网侧电流分量',Ib,'A');
  states['vc'+k]=d('electrical.vc.'+axis,'电容 '+axis+' 轴电压','pu','nominal-dq','串联 Rc–C 支路电容电压分量',Vb,'V');
  states['hi'+k]=d('measurement.current.'+axis,'测量 '+axis+' 轴电流','pu','controller-dq','桥侧电流测量低通滤波输出',Ib,'A',null,true,'filterCurrentMs > 0');
  states['hv'+k]=d('measurement.voltage.'+axis,'测量 '+axis+' 轴电压','pu','controller-dq','PCC 电压测量低通滤波输出',Vb,'V',null,true,'filterVoltageMs > 0');
  states['xi'+k]=d('controller.current.'+axis+'.integral',axis+' 轴电流 PI 积分输出','pu','controller-dq','电流 PI 电压输出增量；工作点偏置独立保留',Vb,'V',null,true,axis+'.ki > 0');
  states['outer'+k]=d('controller.outer.'+(k?'reactive':'active')+'.integral',(k?'无功侧':'有功侧')+'外环 PI 积分输出','pu','controller-dq','外环 PI 电流输出增量；外环极性在电流指令处施加',Ib,'A',null,true,(k?'Q':'P')+'.ki > 0');
  states['delay'+k]=d('actuator.pade.'+axis,axis+' 轴 Padé 电压命令状态','pu','nominal-dq','一阶 Padé 命令低通状态；实际施加电压为 2×状态−命令',Vb,'V',null,true,'delaySamples / fs > 0');
 }
 states.pf=d('measurement.power.p','测量有功功率','pu','scalar','PCC 送网有功功率滤波输出',S,'W',null,true,'dMode = P and filterPqMs > 0');
 states.qf=d('measurement.power.q','测量无功功率','pu','scalar','PCC 送网无功功率滤波输出',S,'var',null,true,'qMode = Q and filterPqMs > 0');
 states.dcVoltage=d('dc.voltage','DC 电压','pu','scalar','恒输入功率电容能量模型的 DC 电压',Vdc,'V',null,true,'dcModel = capacitor or (dcModel = auto and dMode = Vdc)');
 states.dcMeasured=d('measurement.dc.voltage','测量 DC 电压','pu','scalar','DC 电压测量低通滤波输出',Vdc,'V',null,true,'dynamic DC and dMode = Vdc and filterVdcMs > 0');
 states.pllAngle=d('sync.angle','PLL 相角','rad','relative-to-nominal','控制器参考系相对额定同步参考系的相角偏移',null,null,null,true,'syncMode = srf-pll');
 states.pllIntegral=d('sync.integral','PLL 积分频偏','rad/s','scalar','归一化 q 轴误差 PI 的积分输出频偏',null,null,null,true,'syncMode = srf-pll');
 states.pllMeasured=d('sync.error.filtered','PLL 滤波误差','1','controller-dq','PCC q 轴电压除以 PCC 幅值后的独立低通误差',null,null,null,true,'syncMode = srf-pll and sync.filterMs > 0');
 return raw.names.map(name=>{
  if(!Object.hasOwn(states,name))fail('numericalFailure','未映射的 dq 状态：'+name);
  return {...states[name],legacyName:name};
 });
}

function portDescriptors(input,raw,bases,experimentId){
 const {S,Vdc,VLL,Ib}=bases,d=descriptor;
 const active=input.dMode==='Vdc',reactive=input.qMode==='Vac',frozenOuter=experimentId==='current-reference-frozen-outer';
 const inputs=[
  frozenOuter?d('reference.current.d','桥侧 d 轴电流参考增量','pu','controller-dq','在冻结的外环电流指令输出处注入桥侧 d 轴参考增量；工作点偏置保留',Ib,'A'):active?d('reference.vdc','DC 电压参考增量','pu','scalar','DC 电压参考小扰动',Vdc,'V'):d('reference.p','PCC 有功参考增量','pu','scalar','PCC 送网有功功率参考小扰动',S,'W'),
  frozenOuter?d('reference.current.q','桥侧 q 轴电流参考增量','pu','controller-dq','在冻结的外环电流指令输出处注入桥侧 q 轴参考增量；工作点偏置保留',Ib,'A'):reactive?d('reference.vac','PCC 电压幅值参考增量','pu','scalar','PCC 幅值参考小扰动；SI 基准为线电压 RMS',VLL,'V'):d('reference.q','PCC 无功参考增量','pu','scalar','PCC 送网无功功率参考小扰动',S,'var'),
  d('disturbance.grid.angle','电网源相角扰动','rad','relative-to-nominal','上游电网电压源相角增量'),
  d('disturbance.grid.relativeAmplitude','电网源相对幅值扰动','1','scalar','上游电网源幅值的相对变化；0.01 表示源幅值增加 1%'),
  d('disturbance.dc.power','DC 输入功率扰动','pu','scalar','恒输入功率 DC 电容模型的输入功率增量',S,'W',null,raw.dcDynamic,'dynamic DC')
 ].map((port,i)=>({...port,legacyName:raw.inputNames[i]}));
 const outputs=[
  active?d('dc.voltage','DC 电压','pu','scalar','物理 DC 电容电压',Vdc,'V'):d('pcc.power.p','PCC 有功功率','pu','scalar','PCC 向上游电网送出有功功率',S,'W'),
  reactive?d('pcc.voltage.magnitude','PCC 电压幅值','pu','scalar','物理 PCC 电压幅值；SI 基准为线电压 RMS',VLL,'V'):d('pcc.power.q','PCC 无功功率','pu','scalar','PCC 向上游电网送出无功功率',S,'var'),
  d('current.bridge.d','桥侧 d 轴电流','pu','controller-dq','实际桥侧电流的控制器参考系 d 分量',Ib,'A'),
  d('current.bridge.q','桥侧 q 轴电流','pu','controller-dq','实际桥侧电流的控制器参考系 q 分量',Ib,'A'),
  d('sync.angle','PLL 相角','rad','relative-to-nominal','控制器同步相角增量；固定角模式下不适用',null,null,null,raw.pll.pllEnabled,'syncMode = srf-pll'),
  d('pcc.voltage.magnitude.diagnostic','PCC 电压幅值（兼容诊断）','pu','scalar','兼容输出顺序保留的物理 PCC 幅值诊断',VLL,'V')
 ].map((port,i)=>({...port,legacyName:raw.outputNames[i]}));
 return {inputs,outputs};
}

/** @param {import('./gfl-analysis-contract.js').ResolvedSnapshot} snapshot
 * @param {import('./gfl-analysis-contract.js').Gains} gains
 * @returns {import('./gfl-analysis-contract.js').ModelRecord}
 */
export function buildGflReferenceModel(snapshot,gains,{experimentId='outer-reference-closed'}={}){
 if(!snapshot||snapshot.modelId!=='gfl-dq-reference-v1'||snapshot.modelVersion!==1||snapshot.equationVersion!==dqModelVersion)
  fail('unsupported','未支持的 GFL 联立模型或方程版本。');
 const analysis=snapshot.analysis;
 if(!analysis||analysis.modelId!==snapshot.modelId||analysis.modelVersion!==1||analysis.schemaVersion!==1)
  fail('unsupported','未支持的 GFL 分析设置版本。');
 if(!snapshot.parameterSources||typeof snapshot.parameterSources!=='object'||Array.isArray(snapshot.parameterSources))
  fail('invalidInput','模型参数来源须为字符串记录。');
 // Reuse the Task 1 resolver at this data boundary. Inconsistent derived facts
 // cannot label the equations, and display/target decorations never enter identity.
 const resolved=resolveGflSnapshot(snapshot.input,analysis,snapshot.parameterSources),input=resolved.input;
 for(const key of ['nominalFrequencyHz','controlStepSeconds','pwmPeriodSeconds'])
  if(snapshot[key]!==resolved[key])fail('invalidInput','模型快照派生参数不一致：'+key);
 if(!['outer-reference-closed','current-reference-frozen-outer'].includes(experimentId))fail('unsupported','未支持的 dq 实验实现：'+experimentId);
 gains=canonicalGains(gains);
 const raw=gflDqModel(input,gains,{pllEnabled:analysis.syncMode==='srf-pll',frequencyHz:analysis.sync.fnHz,damping:analysis.sync.damping,
  pllFilterMs:analysis.sync.filterMs,dcModel:analysis.dcModel,decouplingFrequency:analysis.sync.decouplingFrequency},{experimentId});
 const policy=gflNumericalPolicy().model,bases={Vb:Math.sqrt(2/3)*input.voltageLL,Ib:Math.sqrt(2)*input.ratedVA/(Math.sqrt(3)*input.voltageLL),S:input.ratedVA,Vdc:input.dcVoltage,VLL:input.voltageLL,Zb:raw.op.Z};
 for(const [name,value]of Object.entries(bases))if(!Number.isFinite(value)||value<=0)
  fail('numericalFailure',name+' 转换基准超出正的可表示数值范围。');
 const states=stateDescriptors(raw,bases),{inputs,outputs}=portDescriptors(input,raw,bases,experimentId);
 // Select physical snapshot fields explicitly: rebuilding from a record's
 // configuration does not recursively import prior gains/policy/evidence.
 const configurationSnapshot=structuredClone({...resolved,gains,policy});
 const operatingPoint={op:raw.op,x0:raw.x0,u0:Array(inputs.length).fill(0),y0:raw.y0,bases,branch:'high-voltage'};
 const numericalVersion=policy.id,realizationId=experimentId+'-v1';
 // The physical/controller identity is shared across experiment connections.
 // Restore only the omitted zero operating biases for identity, never their
 // dynamics. Re-linearizing the closed connection would make unused outer
 // gains contaminate the frozen experiment's numerical validity. In the
 // authoritative state order these biases precede PLL/actuator states.
 let physicalOperatingPoint=operatingPoint;
 if(experimentId==='current-reference-frozen-outer'){
  const x0=[...raw.x0],outerBiases=['P','Q'].filter(loop=>gains[loop].ki>0).map(()=>0);
  const afterCurrent=raw.names.findIndex(name=>name==='pllAngle'||name==='delay0');
  x0.splice(afterCurrent<0?x0.length:afterCurrent,0,...outerBiases);
  physicalOperatingPoint={...operatingPoint,x0};
 }
 const modelFingerprint=gflFingerprint('model',{configurationSnapshot,operatingPoint:physicalOperatingPoint,numericalVersion,realizationId:'outer-reference-closed-v1'});
 const dx=raw.evaluate(raw.x0,operatingPoint.u0).dx,derivativeUnit=unit=>unit==='rad/s'?'rad/s²':unit==='1'?'1/s':unit+'/s';
 return freeze({modelId:snapshot.modelId,modelVersion:snapshot.modelVersion,equationVersion:raw.version,numericalVersion,modelFingerprint,
  configurationSnapshot,operatingPoint,states,inputs,outputs,A:raw.A,B:raw.B,C:raw.C,D:raw.D,
  quality:{residual:raw.residual,jacobianError:raw.jacobianError,
   operatingPoint:{scale:'max(abs(dx))',unit:'mixed-state-derivatives',threshold:policy.operatingPointResidualMax,
    derivatives:states.map((state,i)=>({stateId:state.id,value:dx[i],unit:derivativeUnit(state.unit)}))},
   jacobian:{...policy.jacobian,actualNormalizedDifference:raw.jacobianError},poleRealPartTolerance:policy.poleRealPartTolerance},
  delayRepresentation:{kind:raw.delayModel,seconds:raw.delaySeconds,approximate:raw.delayModel!=='none',order:raw.delayModel==='none'?0:1,
   controlStepSeconds:raw.controlStepSeconds,pwmPeriodSeconds:snapshot.pwmPeriodSeconds,actualHardwareDelayVerified:false},
  coverage:{balancedOnly:true,singleLclBranch:true,operatingPoint:'high-voltage PCC P/Q solution',
   sourceVoltage:'nominal 1 pu unless explicitly supplied',syncMode:analysis.syncMode,decouplingFrequency:analysis.sync.decouplingFrequency,
   dcDynamic:raw.dcDynamic,dcAssumption:raw.dcAssumption,discreteController:false,switchingWaveforms:false,
   currentLimits:false,modulationLimits:false,ieeeCertifiedModel:false},parameterSources:structuredClone(resolved.parameterSources),realizationId});
}
