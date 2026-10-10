import {readFileSync} from 'node:fs';
import {readGflModelInput} from '../../analysis/gfl-model-input.js';
import {readGflAnalysisSettings,resolveGflSnapshot} from '../../project/gfl-analysis-settings.js';

/** Clone the unchanged demo project and apply the existing strong-PQ analysis
 * fixture facts. Selecting mainline occurs only in the cloned analysis settings.
 */
export function mainlineFixture({input:inputPatch={},gains:gainPatch={},settings:settingsPatch={}}={}){
 const project=JSON.parse(readFileSync(new URL('./PV_Grid_Demo.json',import.meta.url))),ibrId='PV1',stored=project.extensions.gflPi[ibrId];
 const read=readGflModelInput(project,ibrId,stored),component=project.components.find(c=>c.id===ibrId);
 const changes={dMode:'P',qMode:'Q',activePowerW:2e5,gridXOhm:read.modelInput.gridXOhm*.1,filterCurrentMs:.1,filterVoltageMs:.1};
 const input={...read.modelInput,...changes,switchingFrequencyHz:component.extensions?.filterDesign?.fs??null,...structuredClone(inputPatch)};
 const sourceMap={...read.sourceMap,...Object.fromEntries(Object.keys(changes).map(k=>[k,'test-fixture'])),
  switchingFrequencyHz:'component.extensions.filterDesign.fs',...Object.fromEntries(Object.keys(inputPatch).map(k=>[k,'test-fixture']))};
 const base=structuredClone(readGflAnalysisSettings(project,ibrId));
 const settings={...base,modelId:'gfl-dq-reference-v1',...structuredClone(settingsPatch),
  sync:{...base.sync,...structuredClone(settingsPatch.sync??{})},sources:{...base.sources,...structuredClone(settingsPatch.sources??{})}};
 for(const key of ['syncMode','dcModel'])if(Object.hasOwn(settingsPatch,key)&&!Object.hasOwn(settingsPatch.sources??{},key))settings.sources[key]='test-fixture';
 for(const key of Object.keys(settingsPatch.sync??{}))if(!Object.hasOwn(settingsPatch.sources??{},'sync.'+key))settings.sources['sync.'+key]='test-fixture';
 const gains=Object.fromEntries(['d','q','P','Q'].map(k=>[k,{...stored.gains[k],...structuredClone(gainPatch[k]??{})}]));
 return {project,ibrId,input,gains,sourceMap,settings,snapshot:resolveGflSnapshot(input,settings,sourceMap)};
}
