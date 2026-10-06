// Make module loading failures visible instead of leaving an empty workbench.
const entry=document.querySelector('script[data-entry]')?.dataset.entry;
const notice=document.createElement('div');notice.setAttribute('role','status');notice.style.cssText='position:fixed;bottom:16px;left:16px;z-index:10000;max-width:560px;padding:14px 18px;background:#fff;border:1px solid #cbdbe0;box-shadow:0 3px 18px #13283822;color:#294d60;font:14px sans-serif';notice.textContent='正在加载计算模块…';
const timer=setTimeout(()=>document.body.append(notice),800);
try{if(!entry)throw Error('缺少页面模块地址');await import(new URL(entry,document.baseURI).href);clearTimeout(timer);notice.remove();}catch(error){clearTimeout(timer);notice.setAttribute('role','alert');notice.textContent='页面模块加载失败，请检查网络后重试。'+error.message+' ';const retry=document.createElement('button');retry.textContent='重新加载';retry.onclick=()=>location.reload();notice.append(retry);document.body.append(notice);console.error(error);}
