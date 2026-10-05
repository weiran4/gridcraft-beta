import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './fixtures.js';
import {validateProject,parseProject,serializeProject} from '../project/model.js';
import {toSI,fromSI} from '../core/electrical/units.js';
import {buildGraph} from '../core/network/graph.js';
test('project roundtrip preserves layout and electrical data',()=>{const p=fixture();assert.deepEqual(parseProject(serializeProject(p)),p);});
test('invalid project and old format rejected',()=>{assert.throws(()=>parseProject('{"version":3,"branches":[]}'));const p=fixture();p.components[0].id='pcc';assert.ok(validateProject(p).length);});
test('dangling wire and cross domain rejected',()=>{const p=fixture();p.wires[0].to='missing.A';assert.ok(validateProject(p).length);p.wires[0].to='ibr.DC';assert.ok(validateProject(p).some(e=>e.includes('AC/DC')));});
test('explicit unit conversions',()=>{assert.equal(toSI(34.5,'kV'),34500);assert.equal(toSI(100,'MVA'),1e8);assert.equal(toSI(5,'mH'),.005);assert.ok(Math.abs(fromSI(.0001,'μF')-100)<1e-10);});
test('connected terminals share a net without merging RL ends',()=>{const g=buildGraph(fixture());assert.equal(g.net('pcc.AC'),g.net('ibr.AC'));assert.notEqual(g.net('e0.A'),g.net('e0.B'));});

test('malformed endpoint types and inherited properties rejected before import',()=>{for(const endpoint of [['source.AC'],'source.AC.extra','source.toString','source.__proto__',42,null]){const p=fixture();p.wires[0].from=endpoint;assert.ok(validateProject(p).length,JSON.stringify(endpoint));assert.throws(()=>parseProject(JSON.stringify(p)));}});
test('unknown inherited component types and null components return validation errors',()=>{for(const component of [null,{...fixture().components[0],type:'toString'},{...fixture().components[0],type:'__proto__'}]){const p=fixture();p.components[0]=component;assert.ok(validateProject(p).length);}});
test('saved view survives project file roundtrip',()=>{const p=fixture();p.editor={zoom:2.5,viewCenter:{x:423,y:712}};assert.deepEqual(parseProject(serializeProject(p)).editor,p.editor);});

test('angle UI conversion stores radians',()=>{assert.ok(Math.abs(toSI(180,'deg')-Math.PI)<1e-14);});
