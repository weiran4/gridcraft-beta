// Adapted from Branch Builder 661856b: snapshot/restore, undo/redo and copySelectedBranches/pasteCopiedBranches.
// New electrical metadata lives inside the same cloned component objects and is therefore part of history.
export class EditorState {
 constructor(project){this.project=structuredClone(project);this.selectedIds=[];this.selectedWireId=null;this.history=[];this.future=[];this.clipboard=null;this.pasteCount=0;}
 id(prefix='C'){const used=new Set([...this.project.components,...this.project.wires].map(c=>c.id));let n=1;while(used.has(prefix+n))n++;return prefix+n;}
 snapshot(){return JSON.stringify(this.project);}
 checkpoint(){const current=this.snapshot();if(this.history.at(-1)!==current){this.history.push(current);if(this.history.length>100)this.history.shift();}this.future=[];}
 restore(serialized){this.project=JSON.parse(serialized);this.selectedIds=this.selectedIds.filter(id=>this.project.components.some(c=>c.id===id));this.selectedWireId=null;}
 undo(){if(!this.history.length)return;this.future.push(this.snapshot());this.restore(this.history.pop());}
 redo(){if(!this.future.length)return;this.history.push(this.snapshot());this.restore(this.future.pop());}
 copy(){const ids=new Set(this.selectedIds);if(!ids.size)return;this.clipboard={components:structuredClone(this.project.components.filter(c=>ids.has(c.id))),wires:structuredClone(this.project.wires.filter(w=>ids.has(w.from.split('.')[0])&&ids.has(w.to.split('.')[0])))};this.pasteCount=0;}
 paste(){const clip=this.clipboard;if(!clip?.components.length)return;this.checkpoint();const offset=36*++this.pasteCount,map=new Map(),pasted=[];
  for(const source of clip.components){const c=structuredClone(source);c.id=this.id();map.set(source.id,c.id);c.name+=' copy';c.x+=offset;c.y+=offset;this.project.components.push(c);pasted.push(c);}
  for(const c of pasted)if(c.type==='bus')c.parametersSI.primaryIbrId=map.get(c.parametersSI.primaryIbrId)||'';
  const remap=t=>{const [id,port]=t.split('.');return map.get(id)+'.'+port;};
  for(const source of clip.wires){const w=structuredClone(source);w.id=this.id('W');w.from=remap(w.from);w.to=remap(w.to);if(w.mid)w.mid={x:w.mid.x+offset,y:w.mid.y+offset};this.project.wires.push(w);}
  this.selectedIds=pasted.map(c=>c.id);this.selectedWireId=null;
 }
 delete(){if(!this.selectedIds.length&&!this.selectedWireId)return;this.checkpoint();const ids=new Set(this.selectedIds);this.project.components=this.project.components.filter(c=>!ids.has(c.id));this.project.wires=this.project.wires.filter(w=>w.id!==this.selectedWireId&&!ids.has(w.from.split('.')[0])&&!ids.has(w.to.split('.')[0]));for(const c of this.project.components)if(c.type==='bus'&&ids.has(c.parametersSI.primaryIbrId))c.parametersSI.primaryIbrId='';this.selectedIds=[];this.selectedWireId=null;}
}
