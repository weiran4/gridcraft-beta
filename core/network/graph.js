import {catalog,isIbr} from '../../components/catalog.js?v=transformer-rx3';
// Adapted from Branch Builder index.html netGroups(), source commit 661856b.
// Keep union-find connectivity; terminal keys now provide stable identity instead of N1/N2 numbering.
export function buildGraph(project){
 const parent=new Map(),all=[];
 project.components.forEach(c=>Object.keys(catalog[c.type].ports).forEach(side=>all.push(`${c.id}.${side}`)));
 function add(x){if(!parent.has(x))parent.set(x,x);}
 function find(x){add(x);let root=x;while(parent.get(root)!==root)root=parent.get(root);while(parent.get(x)!==x){const next=parent.get(x);parent.set(x,root);x=next;}return root;}
 function union(a,b){const ra=find(a),rb=find(b);if(ra!==rb)parent.set(rb,ra);}
 all.forEach(add);project.wires.forEach(w=>union(w.from,w.to));
 const groups=new Map();all.forEach(key=>{const root=find(key);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(key);});
 const adjacency=new Map([...groups.keys()].map(k=>[k,[]]));
 const edges=project.components.filter(c=>['rl','transformer'].includes(c.type)).map(c=>({id:c.id,component:c,a:find(c.id+'.A'),b:find(c.id+'.B')}));
 edges.forEach(e=>{adjacency.get(e.a).push({edge:e,next:e.b});adjacency.get(e.b).push({edge:e,next:e.a});});
 return {net:find,groups,edges,adjacency};
}

// Capacity references may cross transformer ratios, but not series grid impedances.
export function referenceIbrCandidates(project,busId,graph=buildGraph(project)){
 const start=graph.net(busId+'.AC'),seen=new Set([start]),queue=[start];
 for(let i=0;i<queue.length;i++)for(const {edge,next} of graph.adjacency.get(queue[i])||[]){
  if(edge.component.type!=='transformer'||seen.has(next))continue;
  seen.add(next);queue.push(next);
 }
 return project.components.filter(c=>isIbr(c)&&seen.has(graph.net(c.id+'.AC')));
}
