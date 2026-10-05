
import {analyzeGridStrength} from './grid-strength.js?v=transformer-rx3';
export function analysisKey(project,pccId){
 return JSON.stringify({pccId,frequencyHz:project.frequencyHz,
 components:project.components.map(({id,type,name,parametersSI})=>({id,type,name,parametersSI})),
 wires:project.wires.map(({id,from,to})=>({id,from,to}))});
}
export function createAutomaticAnalysis(analyze=analyzeGridStrength){
 let previousKey=null,result=null,revision=0;
 return {run(project,pccId){
  const key=analysisKey(project,pccId),changed=key!==previousKey;
  if(changed){result=pccId?{...analyze(project,pccId),pccId}:null;previousKey=key;revision++;}
  return {result,changed,revision};
 }};
}
