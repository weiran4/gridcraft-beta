import test from 'node:test';
import assert from 'node:assert/strict';
const load=async()=>{let module;try{module=await import('../analysis/gfl-mainline-ranking.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}assert.equal(typeof module?.rankGflMainlineCandidates,'function','coupled ranking boundary is required');return module.rankGflMainlineCandidates;};
const candidate=(id,T,O,E=0,group='satisfied',patch={})=>({id,minMargin:id==='a'?60:120,speed:100-T,overshoot:100-O,mainlineEvaluation:{solveStatus:'completed',stability:{status:'stable'},responseQuality:'completed',model:{delayRepresentation:{approximate:false}},targetResult:{group},performance:{T,O,E},application:{eligible:group!=='unmet',reasons:[]}},...patch});
const ids=r=>r.ordered.map(c=>c.id);
const tracking={focus:'tracking',allowReduction:true};

test('tracking ranks T O E then code-point ID regardless of scalar margins or input order',async()=>{
 const rank=await load(),a=candidate('a',1,10,2),b=candidate('b',2,5,0);
 assert.deepEqual(ids(rank([b,a],tracking)),['a','b']);assert.deepEqual(ids(rank([a,b],tracking)),['a','b']);
 a.minMargin=179;b.minMargin=61;assert.deepEqual(ids(rank([b,a],tracking)),['a','b']);
 const duplicate=[candidate('a',1,1,1),candidate('A',1,1,1),candidate('low-E',1,1,0)];assert.deepEqual(ids(rank(duplicate,tracking)),['low-E','A','a']);
});
test('target groups precede performance and reduced candidates need current authorization',async()=>{
 const rank=await load(),a=candidate('exact',9,9),b=candidate('reduced',1,1,0,'reduced'),c=candidate('unmet',0,0,0,'unmet');
 const r=rank([c,b,a],tracking);assert.deepEqual(ids(r),['exact','reduced','unmet']);assert.deepEqual(Object.keys(r.fronts),['satisfied','reduced','unmet']);
 assert.deepEqual(ids(rank([a,b,c],{focus:'tracking',allowReduction:false})),['exact','unmet']);assert.equal(r.rankingPolicyId,'gfl-mainline-ranking-v1');
});
test('Pareto front uses only outer T and O, retaining identical performance',async()=>{
 const rank=await load(),a=candidate('a',1,5,2),b=candidate('b',2,2,0),dominated=candidate('dominated',2,6,0),duplicate=candidate('same',1,5,2);
 const r=rank([dominated,duplicate,b,a],tracking);assert.deepEqual(ids(r),['a','same','b']);assert.equal(r.diagnostics.dominated,1);assert.equal(r.fronts.satisfied.length,3);
});
test('balanced denominators include finite qualified group members before Pareto extraction',async()=>{
 const rank=await load(),a=candidate('a',1,4,0),b=candidate('b',3,1,0),dominated=candidate('dominated',100,5,0);
 const r=rank([b,a,dominated],{focus:'balanced'});assert.deepEqual(ids(r),['b','a']);assert.equal(r.diagnostics.groups.satisfied.maxT,100);assert.equal(r.diagnostics.groups.satisfied.maxO,5);
});
test('balanced zero denominators are finite and ties use E then ID',async()=>{
 const rank=await load(),r=rank([candidate('b',0,0,1),candidate('a',0,0,1),candidate('zero-error',0,0,0)],{focus:'balanced'});
 assert.deepEqual(ids(r),['zero-error','a','b']);assert.equal(r.diagnostics.groups.satisfied.maxT,0);
});
test('unverified null NaN negative and incomplete metrics remain diagnostics',async()=>{
 const rank=await load(),bad=[candidate('unverified',1,1,0,'satisfied',{mainlineEvaluation:{...candidate('',1,1).mainlineEvaluation,responseQuality:'windowExceeded'}}),candidate('null',null,1),candidate('nan',1,NaN),candidate('negative',-1,1),candidate('incomplete',1,1,0,'satisfied',{incompleteSearch:true})];
 const r=rank([...bad,candidate('valid',1,1)],tracking);assert.deepEqual(ids(r),['valid']);assert.equal(r.diagnostics.unverified,4);assert.equal(r.diagnostics.incomplete,1);
});
test('application-ineligible satisfied and delayed candidates cannot enter a qualified front',async()=>{
 const rank=await load(),a=candidate('a',1,1),b=candidate('b',1,1);a.mainlineEvaluation.application.eligible=false;b.mainlineEvaluation.model.delayRepresentation.approximate=true;
 assert.deepEqual(ids(rank([a,b],tracking)),[]);
});

test('R2 conclusive unstable and marginal poles are rejected rather than unverified',async()=>{
 const rank=await load(),unstable=candidate('unstable',1,1),marginal=candidate('marginal',1,1),unresolved=candidate('numerical',null,null);
 unstable.mainlineEvaluation.stability.status='unstable';marginal.mainlineEvaluation.stability.status='marginal';unresolved.mainlineEvaluation.solveStatus='numericalFailure';
 const r=rank([unstable,marginal,unresolved],tracking);assert.deepEqual(ids(r),[]);assert.equal(r.diagnostics.assessed,3);assert.equal(r.diagnostics.rejected,2);assert.equal(r.diagnostics.unverified,1);assert.equal(r.diagnostics.incomplete,0);
});
test('R2 complete evidence excluded by an incomplete search has its own diagnostic count',async()=>{
 const rank=await load(),c=candidate('partial',1,1,0,'satisfied',{incompleteSearch:true,diagnosticOnly:true});c.mainlineEvaluation.application.eligible=false;
 const r=rank([c],tracking);assert.deepEqual(ids(r),[]);assert.equal(r.diagnostics.incomplete,1);assert.equal(r.diagnostics.unverified,0);assert.equal(r.diagnostics.rejected,0);
});

test('equal candidates use Unicode code-point lexicographic ordering beyond the BMP, without locale collation',async()=>{
 const rank=await load(),expected=['A','a','a😀','é','\uE000','😀','😀a','😁'];
 for(const focus of ['tracking','balanced'])for(const order of [expected.slice().reverse(),[...expected.slice(3),...expected.slice(0,3)]])assert.deepEqual(ids(rank(order.map(id=>candidate(id,1,1,0)),{focus})),expected);
});
