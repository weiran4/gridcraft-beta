import {buildGraph} from '../core/network/graph.js?v=transformer-rx3';
import {analyzeGridStrength} from '../analysis/grid-strength.js?v=transformer-rx3';
export const gfmModes={droop:'Droop',vsg:'VSG',sync:'Synchronverter'};
export function gfmDefaults(){return {fs:20000,delaySamples:0,fi:500,fv:50,pm:60,filterPqMs:10,filterVdcMs:10,filterVoltageMs:10,filterCurrentMs:1,feedforwardCurrent:.75,feedforwardVoltage:1};}
export function gfmSettings(project,id){
 const saved=project.extensions?.gfmPi?.[id]||{};
 const common={...gfmDefaults()};for(const k of Object.keys(common))if(saved[k]!==undefined)common[k]=saved[k];
 if(saved.fs===undefined&&project.extensions?.gfmSetup?.[id]?.controlStepSeconds>0)common.fs=1/project.extensions.gfmSetup[id].controlStepSeconds;
 const modes={droop:{mp:1,nq:5},vsg:{h:1,d:100,nq:5,kv:10},sync:{h:1,d:100,nq:5,ke:10}};
 for(const k of Object.keys(modes))for(const f of Object.keys(modes[k]))if(saved.modes?.[k]?.[f]!==undefined)modes[k][f]=saved.modes[k][f];
 return {...common,mode:Object.hasOwn(gfmModes,saved.mode)?saved.mode:'droop',modes,gains:saved.gains?structuredClone(saved.gains):null,manual:saved.manual===true};
}
export function gfmContext(project,id){
 const ibr=project.components.find(c=>c.id===id&&c.type==='gfm');if(!ibr)throw Error('指定 GFM 不存在，请从电路中的 GFM 元件打开。');
 const graph=buildGraph(project),net=graph.net(id+'.AC');
 const rc=project.components.filter(c=>c.type==='rc'&&graph.net(c.id+'.AC')===net);
 if(rc.length!==1)throw Error('GFM 电压环需要同一交流节点恰好一个 RC 支路；请补齐或合并 RC。');
 const dc=project.components.filter(c=>c.type==='dc'&&graph.net(c.id+'.DC')===graph.net(id+'.DC'));
 if(dc.length!==1)throw Error('GFM 需要连接一个明确的 DC 电源。');
 const bus=project.components.find(c=>c.type==='bus'&&graph.net(c.id+'.AC')===net);if(!bus)throw Error('GFM 交流端需要同节点 PCC 母线。');
 // The scalar model is restricted to one converter and one shunt capacitor.
 if(project.components.filter(c=>['gfl','gfm'].includes(c.type)).length!==1||project.components.filter(c=>c.type==='rc').length!==1)throw Error('此版 GFM 整定仅支持单逆变器、单 RC 支路；多机或多电容网络需耦合模型。');
 const copy=structuredClone(project),b=copy.components.find(c=>c.id===bus.id);b.parametersSI.isPcc=true;b.parametersSI.primaryIbrId=id;
 const grid=analyzeGridStrength(copy,bus.id);if(grid.status==='error')throw Error(grid.errors.join('；'));
 const p=ibr.parametersSI,r=rc[0].parametersSI;
 return {ratedVA:p.ratedApparentPowerVA,voltageLL:p.ratedAcVoltageV,frequencyHz:project.frequencyHz,R:p.filterResistanceOhm,L:p.filterInductanceH,C:r.capacitanceF,Rc:r.resistanceOhm,gridR:grid.zTheveninOhm.re,gridL:grid.zTheveninOhm.im/(2*Math.PI*project.frequencyHz),dcVoltage:dc[0].parametersSI.voltageV,dcResistance:dc[0].parametersSI.resistanceOhm,activePowerW:p.activePowerW,reactivePowerVar:p.reactivePowerVar,rcId:rc[0].id,dcId:dc[0].id,pccName:bus.name,scr:grid.scr};
}
export function setGfmField(project,id,key,value){
 if(!Number.isFinite(value))throw Error('请输入有限数值。');
 const ctx=gfmContext(project,id),c=project.components.find(c=>c.id===id),rc=project.components.find(c=>c.id===ctx.rcId),dc=project.components.find(c=>c.id===ctx.dcId);
 const mapping={ratedVA:[c,'ratedApparentPowerVA'],voltageLL:[c,'ratedAcVoltageV'],R:[c,'filterResistanceOhm'],L:[c,'filterInductanceH'],C:[rc,'capacitanceF'],Rc:[rc,'resistanceOhm'],dcVoltage:[dc,'voltageV'],activePowerW:[c,'activePowerW'],reactivePowerVar:[c,'reactivePowerVar']};
 if(!mapping[key])throw Error('未知电气参数。');if(!['activePowerW','reactivePowerVar'].includes(key)&&(value<0||(!['R','Rc'].includes(key)&&value===0)))throw Error('电气参数超出允许范围。');
 const [component,param]=mapping[key];component.parametersSI[param]=value;
}
