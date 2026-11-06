"use strict";
(() => {
 if(window.parent===window||new URLSearchParams(location.search).get('embedded')!=='1')return;
 document.documentElement.classList.add('embedded');
 window.topic3WorkspaceActive=false;
 let generation=0;
 const originalSource=clone(source);
 const send=message=>parent.postMessage({channel:'topic3-frame',generation,...message},'*');
 const publish=()=>{document.querySelector('#stage-index').textContent=`STEP ${String(state.page+8).padStart(2,'0')} / 11`;send({action:'state',state:{page:state.page,refined:state.refined,located:state.loc.fact.done&&state.loc.procedure.done,saved:state.saved}});};
 const originalRender=render;
 render=function(){originalRender();publish();};
 window.addEventListener('message',e=>{
  if(e.source!==parent||e.data?.channel!=='topic3-host')return;
  const m=e.data;
  if(m.action==='reset'){generation=m.generation;Object.keys(source).forEach(k=>delete source[k]);Object.assign(source,clone(originalSource));document.querySelector('#reset').click();return;}
  if(m.generation!==generation)return;
  if(m.action==='visibility'){window.topic3WorkspaceActive=!!m.active;if(state.job)state.job.last=performance.now();return;}
  if(m.action==='navigate'&&Number.isInteger(m.page)&&m.page>=0&&m.page<=3){
   if(!validPage(m.page))return;
   closeModal();navigate(m.page);
   if(m.importExample&&!state.loaded){
    // This fixed demo refines the supplied catalyst example, not arbitrary expert edits.
    // Preserve current confirmation metadata only when its knowledge matches the fixture.
    const r=m.record;
    if(r&&r.status==='confirmed'&&['knowledge','boundary','verification','supplement'].every(k=>r[k]===source[k]))Object.assign(source,clone(r));
    document.querySelector('[data-action="load"]')?.click();
   }
  }
 });
 publish();send({action:'ready'});
})();
