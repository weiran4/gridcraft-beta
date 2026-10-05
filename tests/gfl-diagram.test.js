import test from 'node:test';
import assert from 'node:assert/strict';
import {controlDiagram} from '../ui/gfl-diagram.js';
const gains=Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:1,ki:50}]));
test('feedback and feedforward show editable low-pass transfer functions sharing their settings keys',()=>{
 const svg=controlDiagram(gains,gains,{dMode:'Vdc',qMode:'Vac',filterVdcMs:12,filterVoltageMs:8,filterCurrentMs:2});
 assert.equal((svg.match(/class="filter-block"/g)||[]).length,6);
 assert.equal((svg.match(/data-filter-setting="filterVoltageMs"/g)||[]).length,3);
 assert.equal((svg.match(/data-filter-setting="filterCurrentMs"/g)||[]).length,2);
 assert.match(svg,/data-filter-setting="filterVdcMs"[^>]*value="12"/);
 assert.equal((svg.match(/<mfrac>/g)||[]).length,6);
 assert.doesNotMatch(svg,/T=10 ms/);
});
test('P and Q share one editable time constant and zero is an explicit bypass',()=>{
 const svg=controlDiagram(gains,gains,{filterPqMs:0});
 assert.equal((svg.match(/data-filter-setting="filterPqMs"/g)||[]).length,2);
 assert.match(svg,/0 ms 为旁路/);
});
