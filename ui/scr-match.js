import {matchScr} from '../analysis/scr-match.js?v=transformer-rx3';
import {escapeHtml as esc} from './symbols.js?v=transformer-rx3';
export function mountScrMatch(host,project,result,apply){
 if(!result||result.status==='error')return;
 const parts=result.contributions.filter(c=>c.type==='rl');
 host.innerHTML='<h3 class="field-group">目标 SCR · 匹配上游 RL</h3><div class="note">保持当前 PCC 等效 X/R 比值，其他元件不变。修改共用 RL 会联动其他 PCC；支持撤销。</div>';
 if(!parts.length||!result.powerBaseVA||!(result.magnitudeOhm>0)){host.innerHTML+='<p class="help-label">需要非零上游 RL 阻抗及明确的 IBR 容量基准。</p>';return;}
 host.innerHTML+='<label class="field"><span>调整的上游 RL</span><select id="matchRl">'+parts.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+' · '+esc(c.id)+'</option>').join('')+'</select></label><label class="field"><span>目标 SCR</span><input id="targetScr" type="number" min="0" step="any" value="'+Number(result.scr.toPrecision(12))+'"></label><div id="scrMatchPreview" aria-live="polite"></div><button id="applyScrMatch" class="primary calculate">应用目标 SCR</button>';
 const target=host.querySelector('#targetScr'),select=host.querySelector('#matchRl'),button=host.querySelector('#applyScrMatch'),preview=host.querySelector('#scrMatchPreview');
 const num=v=>Number(v.toPrecision(8)).toString();
 function update(){try{const proposal=matchScr(project,result.pccId,select.value,target.valueAsNumber),old=project.components.find(c=>c.id===select.value).parametersSI;
 preview.innerHTML='<div class="metric-row"><span>固定 PCC X/R</span><b>'+esc(result.xr==='Infinity'?'∞':num(result.xr))+'</b></div><div class="metric-row"><span>R / Ω</span><b>'+num(old.resistanceOhm)+' → '+num(proposal.resistanceOhm)+'</b></div><div class="metric-row"><span>L / mH</span><b>'+num(old.inductanceH*1000)+' → '+num(proposal.inductanceH*1000)+'</b></div><p class="help-label">复算 SCR = '+num(proposal.verifiedScr)+'；以上 R、L 为元件所在侧实际值。</p>';button.disabled=false;
 }catch(e){preview.innerHTML='<div class="note error">'+esc(e.message)+'</div>';button.disabled=true;}}
 target.oninput=update;select.onchange=update;button.onclick=()=>{try{const proposal=matchScr(project,result.pccId,select.value,target.valueAsNumber);apply(select.value,proposal);}catch(e){preview.innerHTML='<div class="note error">'+esc(e.message)+'</div>';}};update();
}
