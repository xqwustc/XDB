"use strict";
(() => {
  const frame=document.querySelector('#refinement-frame');
  const workspace=document.querySelector('#refinement-workspace');
  const main=document.querySelector('#main-content');
  const emptyProgress=()=>({page:0,refined:false,located:false,saved:false});
  let active=false,ready=false,pending=null,generation=0;
  let progress=emptyProgress();
  const send=message=>frame.contentWindow.postMessage({channel:'topic3-host',generation,...message},'*');
  const upstreamReady=()=>state.unlocked>=6&&!!window.getConfirmedExpertRecord?.();
  const allowed=page=>upstreamReady()&&(page===0||page===1&&progress.refined||page===2&&progress.located||page===3&&progress.saved);
  function topicLabel(topic){document.querySelector('.project-label').innerHTML=`课题${['一','二','三'][topic]} <span>/</span> ${['精准诊断','专家交互','精炼更新'][topic]}`;}
  function navigation(){
    document.querySelectorAll('[data-refinement]').forEach(b=>{
      const i=+b.dataset.refinement;
      b.disabled=!allowed(i);
      b.classList.toggle('active',active&&i===progress.page);
      b.classList.toggle('complete',upstreamReady()&&[progress.refined,progress.located,progress.saved,progress.saved][i]);
      if(active&&i===progress.page)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');
    });
    document.querySelector('#collection-refine-button').disabled=!upstreamReady();
    if(active){document.querySelectorAll('.step[data-step]').forEach(b=>{b.classList.remove('active');b.removeAttribute('aria-current');b.classList.toggle('complete',+b.dataset.step<=state.unlocked);});}
  }
  function open(page=0,importExample=false){
    if(!allowed(page))return;
    document.querySelector('#expert-dialog')?.close();
    active=true;main.hidden=true;workspace.hidden=false;document.body.classList.add('refinement-active');topicLabel(2);
    progress.page=page;navigation();
    const request={action:'navigate',page,importExample,record:importExample?window.getConfirmedExpertRecord?.():null};
    if(ready){send({action:'visibility',active:true});send(request);}else pending=request;
    document.querySelector(`[data-refinement="${page}"]`).scrollIntoView({block:'nearest'});
    window.scrollTo(0,0);
  }
  function showOriginal(){
    active=false;workspace.hidden=true;main.hidden=false;document.body.classList.remove('refinement-active');
    if(ready)send({action:'visibility',active:false});
    updateNavigation();navigation();topicLabel(state.step<4?0:1);
    document.querySelector('#stage-index').textContent=`STEP ${String(state.step+1).padStart(2,'0')} / 11`;
    document.querySelector('.main-footer>span').textContent=state.step<4?'课题一 · 领域感知的大模型自适应测评':'课题二 · 模型自主提问与专家知识采集';
  }
  function resetDownstream(){
    generation++;progress=emptyProgress();pending=null;
    if(ready)send({action:'reset'});
    if(active)showOriginal();else navigation();
  }
  document.querySelectorAll('[data-refinement]').forEach(b=>b.addEventListener('click',()=>open(+b.dataset.refinement)));
  document.querySelector('#collection-refine-button').addEventListener('click',()=>open(0,true));
  document.querySelectorAll('.step[data-step]').forEach(b=>b.addEventListener('click',()=>{if(!b.disabled){showOriginal();document.querySelector('#stage-title').focus({preventScroll:true});window.scrollTo(0,0);}}));
  document.addEventListener('demo-view-change',()=>{if(!active)showOriginal();else navigation();});
  document.addEventListener('expert-knowledge-invalidated',e=>{
    state.unlocked=Math.min(state.unlocked,e.detail?.fromStep??5);
    updateNavigation();resetDownstream();
  });
  window.addEventListener('message',e=>{
    if(e.source!==frame.contentWindow||e.data?.channel!=='topic3-frame')return;
    if(e.data.action==='ready'){
      ready=true;send({action:'reset'});send({action:'visibility',active});
      if(pending){send(pending);pending=null;}
      return;
    }
    // Ignore reports sent before a reset or new expert-knowledge revision.
    if(e.data.action==='state'&&e.data.generation===generation){progress=e.data.state;navigation();}
  });
  function reset(){resetDownstream();showOriginal();}
  ['reset-button','replay-button','start-button'].forEach(id=>document.getElementById(id).addEventListener('click',reset));
  showOriginal();
})();
