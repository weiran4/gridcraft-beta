import test from 'node:test';import assert from 'node:assert/strict';
test('GFM panel distinguishes voltage targets, current/candidate state, and selected-mode poles',async()=>{
 const {gfmAdvisorMarkup}=await import('../ui/gfm-tuning-panel.js');const h=gfmAdvisorMarkup();
 for(const t of ['电流交越目标','电压交越目标','生成候选','应用所选候选','分析当前 PI','gfmCoupledCompare'])assert.ok(h.includes(t));
 assert.ok(!h.includes('Vdc 外环'));assert.ok(!h.includes('P/Vdc'));
});
