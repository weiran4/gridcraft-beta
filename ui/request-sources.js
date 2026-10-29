import {mountInputSources} from './input-sources.js';
import {validateTuningRequest} from '../analysis/gfl-model-input.js';
// Keep presentation provenance outside the numerical tuning request/fingerprint.
export function mountRequestSources(host,attribute,model,onChange){
 const flat=(obj,prefix='request.')=>Object.fromEntries(Object.entries(obj??{}).flatMap(([k,v])=>v&&typeof v==='object'?Object.entries(flat(v,prefix+k+'.')):[[prefix+k,v]]));
 const sources=mountInputSources(host,{selector:`input[${attribute}]`,key:el=>'request.'+el.getAttribute(attribute),
  stored:{...flat(model.requestStored),_inputSources:model.inputSources??{}},
  suggestions:flat({...validateTuningRequest({}).request,fi:500,fp:50}),onChange:onChange??(()=>{})});
 for(const [key,record] of Object.entries(sources.read()))onChange?.(key,record);
 return sources;
}
