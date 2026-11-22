// Instagram content adapter. Operates only in a verified conversation, not inbox/sidebar/search.
(()=>{
 const canon=s=>String(s??'').normalize('NFC').replace(/[\u200b\u2060]/g,'').replace(/\s+/gu,' ').trim();
 const visible=e=>!!e&&e.isConnected&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'&&!e.closest('[hidden],[aria-hidden=true]');
 const label=e=>canon(e.innerText||e.getAttribute('aria-label')||e.querySelector('svg[aria-label]')?.getAttribute('aria-label'));
 const controls=root=>[...root.querySelectorAll('button,[role=button],a')].filter(visible);
 const enabled=e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true';
 const userPath=(href,user)=>{try{const u=new URL(href,location.origin);return u.origin===location.origin&&u.pathname.toLowerCase().replace(/\/+$/,'')==='/'+user.toLowerCase();}catch{return false;}};
 const isHistory=e=>!!e.closest('[role=row],[data-testid=message_container_outgoing],[data-message-id],.message-out,[role=log]');
 let navigation=null,state=null,insertion=null;
 function rows(root){return[...root.querySelectorAll('[role=row]')].filter(e=>visible(e)&&label(e)&&!controls(e).some(c=>/^(view profile|see profile|посмотреть профиль|смотреть профиль)$/i.test(label(c))));}
 function outgoing(root){
  const candidates=[...root.querySelectorAll('[aria-label],[data-testid=message_container_outgoing],.message-out,[data-message-author=self]')].filter(e=>{
   if(!visible(e))return false;
   return e.matches('[data-testid=message_container_outgoing],.message-out,[data-message-author=self]')||/^(?:you sent|вы отправили|sent by you|отправлено вами)(?:$|:|\s)/i.test(e.getAttribute('aria-label')||'');
  });
  return candidates.filter(e=>!candidates.some(other=>other!==e&&e.contains(other)));
 }
 function history(root){return outgoing(root).length>0||rows(root).some(e=>e.querySelector('[role=gridcell] [dir=auto],[role=gridcell][dir=auto],[data-message-id]'));}
 const chatDialogs=()=>[...document.querySelectorAll('[role=dialog]')].filter(d=>visible(d)&&[...d.querySelectorAll('[contenteditable=true][role=textbox],textarea[placeholder]')].some(visible));
 const skip=()=>({skip:true,notSent:true,code:'already_messaged',error:'В чате уже есть сообщения. Повтор не отправляю; подбираю замену.'});
 function popupView(user){
  const editors=[...document.querySelectorAll('[contenteditable=true][role=textbox],textarea[placeholder]')].filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&!e.closest('nav,aside,[role=navigation]')&&!/search|поиск|comment|комментар|caption|подпись/i.test((e.getAttribute('aria-label')||'')+' '+(e.getAttribute('placeholder')||'')));
  const matches=[];
  for(const editor of editors){
   for(let root=editor.parentElement;root&&root!==document.body;root=root.parentElement){
    const rect=root.getBoundingClientRect();if(rect.width>720||rect.height>1000)break;
    if(rect.width<180||rect.height<200)continue;
    if([...root.querySelectorAll('[contenteditable=true][role=textbox],textarea[placeholder]')].filter(visible).length!==1)continue;
    const viewButtons=controls(root).filter(e=>/^(view profile|see profile|смотреть профиль|посмотреть профиль)$/i.test(label(e)));
    for(const button of viewButtons){
     // Platform profile preview: avatar + exact username·Instagram line + View profile.
     // Ordinary bubbles, outgoing messages and sidebar previews cannot prove identity.
     for(let card=button.parentElement;card&&card!==root;card=card.parentElement){
      if(card.contains(editor)||card.closest('[aria-label^="You sent"],[aria-label^="Вы отправили"],[data-message-author=self],.message-out'))break;
      if(!card.querySelector('img'))continue;
      const proof=[...card.querySelectorAll('span,div,a')].find(e=>visible(e)&&e.getBoundingClientRect().height<60&&canon(e.innerText).toLowerCase().replace(/\s*[·•]\s*/g,' · ')===user.toLowerCase()+' · instagram');
      if(!proof)continue;
      const er=editor.getBoundingClientRect(),pr=proof.getBoundingClientRect();
      if(pr.bottom>er.top||pr.left<rect.left||pr.right>rect.right)continue;
      const heading=[...root.querySelectorAll('header,[role=heading],h1,h2,h3,[role=button],button')].find(e=>visible(e)&&e!==button&&!e.contains(editor)&&e.getBoundingClientRect().top<rect.top+80&&e.getBoundingClientRect().bottom<pr.top);
      if(!heading)continue;
      if(!matches.some(m=>m.editor===editor))matches.push({editor,root,proof,url:location.href,popup:true});break;
     }
    }
    if(matches.some(m=>m.editor===editor))break;
   }
  }
  return matches.length===1?matches[0]:null;
 }
 function view(user){
  const popup=popupView(user);if(popup)return popup;
  const path=location.pathname;
  const modal=navigation?.clickedProfile&&chatDialogs().length===1?chatDialogs()[0]:null;
  if(!/^\/direct\/t\/[^/]+\/?$/i.test(path) && !modal)return{wait:true,code:'chat_not_ready',step:'Открываю личную переписку',error:'Ожидаю личную переписку Instagram, а не список чатов.'};
  const candidates=[...(modal?modal:document).querySelectorAll(modal?'[contenteditable=true][role=textbox],textarea[placeholder]':'main [contenteditable=true][role=textbox],[role=main] [contenteditable=true][role=textbox],main textarea[placeholder],[role=main] textarea[placeholder]')].filter(e=>visible(e)&&e.getAttribute('aria-readonly')!=='true'&&e.getAttribute('aria-disabled')!=='true'&&!e.disabled&&!e.closest('nav,aside,[role=navigation]')&&!/search|поиск/i.test((e.getAttribute('aria-label')||'')+' '+(e.getAttribute('placeholder')||'')));
  const editors=candidates.filter(e=>!candidates.some(o=>o!==e&&e.contains(o)));
  if(editors.length!==1)return{wait:true,code:editors.length?'editor_ambiguous':'editor_missing',step:'Ожидаю поле сообщения',error:editors.length?'Несколько полей сообщения Instagram; текст не вставлен.':'Поле сообщения Instagram пока не найдено.'};
  const editor=editors[0],er=editor.getBoundingClientRect();
  // Find the smallest conversation pane containing this composer AND a profile
  // link/heading above it. Reject sidebar links and links inside message bubbles.
  for(let root=editor.parentElement;root&&root!==document.body;root=root.parentElement){
   const rr=root.getBoundingClientRect();
   const heads=[...root.querySelectorAll('header a[href],header,[role=heading],h1,h2,h3,a[href]')].filter(e=>{
    if(!visible(e)||e.contains(editor)||isHistory(e)||e.closest('nav,aside,[role=navigation]'))return false;
    const rect=e.getBoundingClientRect();
    return rect.bottom<=er.top&&rect.top>=rr.top-2&&rect.top<rr.top+150&&rect.right>er.left&&rect.left<er.right;
   });
   const proof=heads.find(e=>e.matches('a[href]')?userPath(e.getAttribute('href'),user):label(e).replace(/^@/,'').toLowerCase()===user.toLowerCase());
   if(proof)return{editor,root,proof,url:location.href};
   if(root.matches('main,[role=main],[role=dialog]'))break;
  }
  return{editorCandidate:editor,wait:true,code:'recipient_unverified',step:'Проверяю username получателя',error:'В шапке личного чата не найден точный username или ссылка на профиль получателя. Текст не вставлен.'};
 }
 function prepare(job){
  const user=job.username.toLowerCase(),text=job.text;
  if(!navigation||navigation.job!==job.id){navigation={job:job.id,clickedProfile:false};state=null;}
  const gates=[...document.querySelectorAll('[role=alert],[role=dialog],form')].filter(e=>visible(e)&&!e.querySelector('[contenteditable=true][role=textbox],textarea[placeholder]')).map(label).join('\n');
  if([...document.querySelectorAll('input[type=password],input[autocomplete=one-time-code]')].some(visible)||/challenge|accounts\/login|accounts\/suspended/.test(location.pathname)||/too many|try again later|временно огранич|попробуйте позже|подтвердите.*не робот|verify.*human/i.test(gates))return{blocked:true,notSent:true,code:'service_auth_or_limit',channelBlocked:true,error:'Instagram требует вход, проверку или ограничил действия. Канал отключён на этот запуск; остальные продолжают работу.'};
  if(location.pathname.toLowerCase()==='/'+user+'/' && !(navigation.clickedProfile&&chatDialogs().length===1) && !popupView(user)){
   if(navigation.clickedProfile)return{wait:true,code:'chat_not_ready',step:'Ожидаю переход в переписку',error:'Кнопка «Написать» нажата; ожидаю переход в личную переписку.'};
   const roots=[...document.querySelectorAll('main,[role=main]')].filter(visible);
   const buttons=[...new Set(roots.flatMap(controls))].filter(e=>enabled(e)&&/^(?:message|send message|написать|отправить сообщение)$/i.test(label(e)));
   if(buttons.length!==1)return{wait:true,code:'profile_message_missing',step:'Ищу кнопку «Написать» в профиле',error:'Не найдена единственная доступная кнопка «Написать» в профиле Instagram.'};
   navigation.clickedProfile=true;buttons[0].click();return{wait:true,step:'Открываю переписку из профиля'};
  }
  if(navigation.details && !navigation.verified && navigation.details.url===location.href && navigation.details.header.isConnected && label(navigation.details.header)===navigation.details.label){
   const detail=[...document.querySelectorAll('[role=dialog]')].filter(visible).find(d=>[...d.querySelectorAll('a[href]')].some(a=>visible(a)&&userPath(a.getAttribute('href'),user)));
   if(detail){
    const users=[...new Set([...detail.querySelectorAll('a[href]')].filter(visible).map(a=>{try{const p=new URL(a.href).pathname;return /^\/[a-z0-9._]+\/$/i.test(p)?p.toLowerCase():null}catch{return null}}).filter(Boolean))];
    if(users.length>1)return{skip:true,notSent:true,code:'already_messaged',error:'В информации о чате несколько участников; групповая переписка пропущена.'};
    navigation.verified={...navigation.details};
    const close=controls(detail).find(e=>/^(close|закрыть)$/i.test(label(e))||/^(close|закрыть)$/i.test(e.getAttribute('aria-label')||''));
    if(close)close.click();
    return{wait:true,step:'Получатель проверен по точной ссылке профиля'};
   }
  }
  let v=view(user);
  if(!v.editor && v.editorCandidate){
   const editor=v.editorCandidate,er=editor.getBoundingClientRect();
   let root=editor.closest('main,[role=main],[role=dialog]');
   const snapshot=navigation.verified;
   if(snapshot && snapshot.url===location.href && snapshot.header.isConnected && label(snapshot.header)===snapshot.label && snapshot.editor===editor && snapshot.root.isConnected){
    v={editor,root:snapshot.root,proof:snapshot.header,url:location.href};
   }else if(root){
    // Some layouts show only a display name. Open THAT pane's details, require
    // an exact profile link there, then bind the proof to this thread + header.
    if(!navigation.details){
     const rr=root.getBoundingClientRect();
     const heads=[...root.querySelectorAll('header,[role=heading],h1,h2,h3')].filter(e=>{const r=e.getBoundingClientRect();return visible(e)&&!isHistory(e)&&!e.closest('nav,aside,[role=navigation]')&&r.top<rr.top+150&&r.bottom<=er.top&&r.right>er.left&&r.left<er.right;});
     const button=controls(root).find(e=>{const r=e.getBoundingClientRect();return /^(conversation information|chat details|conversation details|информация о чате|информация о переписке|сведения о чате)$/i.test(e.getAttribute('aria-label')||label(e))&&r.top<rr.top+150&&r.right>er.left&&r.left<er.right;}) || heads.map(e=>e.closest('button,[role=button]')).find(e=>e&&visible(e));
     const header=heads.find(e=>button?.contains(e))||heads[0];
     if(button&&header){navigation.details={url:location.href,header,label:label(header),editor,root};button.click();return{wait:true,step:'Открываю сведения чата для проверки username'};}
    }
   }
  }
  if(!v.editor)return v;
  // A previous conversation is skipped before touching the editor. Incoming-only
  // threads are also conservatively excluded if direction cannot be established.
  if(history(v.root))return skip();
  if([...v.root.querySelectorAll('[role=progressbar],[aria-busy=true]')].some(visible))return{wait:true,code:'chat_not_ready',step:'Ожидаю загрузку истории',error:'История чата ещё загружается.'};
  if(navigation.stableEditor!==v.editor || navigation.stableUrl!==v.url){navigation.stableEditor=v.editor;navigation.stableUrl=v.url;navigation.stableAt=Date.now();return{wait:true,step:'Проверяю историю перед вставкой текста'};}
  if(Date.now()-navigation.stableAt<1500)return{wait:true,step:'Проверяю историю перед вставкой текста'};
  const editor=v.editor,before=canon(editor.value??editor.innerText);
  if(before&&before!==canon(text))return{blocked:true,notSent:true,code:'foreign_draft',error:'Другой черновик Instagram сохранён без изменений; контакт отложен.'};
  if(!before && insertion?.job===job.id)return{blocked:true,notSent:true,code:'editor_insert_failed',error:'Ввод уже выполнен один раз. Повторная вставка исключена.'};
  if(!before){
   insertion={job:job.id,editor};
   editor.focus();
   if(editor.tagName==='TEXTAREA'){
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,text);editor.dispatchEvent(new Event('input',{bubbles:true}));
   }else{
    const sel=window.getSelection(),range=document.createRange();range.selectNodeContents(editor);range.collapse(false);sel.removeAllRanges();sel.addRange(range);
    document.execCommand('insertText',false,text);
   }
  }
  if(canon(editor.value??editor.innerText)!==canon(text))return{wait:true,code:'editor_insert_failed',step:'Проверяю вставку текста',error:'Instagram не подтвердил вставку текста.'};
  state={job:job.id,user,text,editor,root:v.root,proof:v.proof,proofText:label(v.proof),proofHref:v.proof.getAttribute('href'),url:v.url,preparedAt:Date.now(),existing:new Set(outgoing(v.root)),clicked:false};
  return{ok:true,step:'Текст вставлен; проверяю кнопку отправки'};
 }
 function click(job){
  const s=state;
  if(!s||s.job!==job.id||s.text!==job.text||Date.now()-s.preparedAt>12000||!s.editor.isConnected||!s.proof.isConnected||location.href!==s.url||label(s.proof)!==s.proofText||s.proof.getAttribute('href')!==s.proofHref)return{ok:false,notSent:true,code:'recipient_changed',error:'Активный чат изменился; отправка отменена.'};
  if(s.clicked)return{ok:true,alreadyClicked:true};
  if(history(s.root))return skip();
  if(canon(s.editor.value??s.editor.innerText)!==canon(s.text))return{ok:false,notSent:true,code:'draft_changed',error:'Текст изменился; отправка отменена.'};
  const er=s.editor.getBoundingClientRect();
  const candidates=controls(s.root).filter(e=>enabled(e)&&/^(send|отправить)$/i.test(label(e))&&!isHistory(e)&&Math.abs(e.getBoundingClientRect().top-er.top)<110);
  if(candidates.length!==1)return{ok:false,notSent:true,wait:candidates.length===0,code:candidates.length?'send_button_ambiguous':'send_button_loading',error:'Не найдена единственная доступная кнопка отправки Instagram.'};
  s.clicked=true;candidates[0].click();return{ok:true};
 }
 function confirm(job){
  const s=state;if(!s?.clicked||s.job!==job.id||location.href!==s.url||!s.root.isConnected||!s.proof.isConnected||label(s.proof)!==s.proofText||s.proof.getAttribute('href')!==s.proofHref)return{confirmed:false};
  if(canon(s.editor.value??s.editor.innerText))return{confirmed:false};
  const fresh=outgoing(s.root).filter(e=>!s.existing.has(e)&&canon(e.innerText).includes(canon(job.text))&&!/sending|отправляется|not sent|не отправлено|failed/i.test(e.getAttribute('aria-label')||'')&&!e.querySelector('[aria-label="Sending" i],[aria-label="Отправляется" i],[data-status=pending],[data-status=failed]'));
  return{confirmed:fresh.length>0};
 }
 function diagnose(j,result){
  const node=e=>({tag:e.tagName,classes:[...e.classList].filter(c=>c.length<65&&!/\d{6}/.test(c)).slice(0,12),role:e.getAttribute('role'),editable:e.getAttribute('contenteditable'),visible:visible(e)});
  const editors=[...document.querySelectorAll('[contenteditable],textarea')];
  return{kind:'instagram',at:new Date().toISOString(),page:location.pathname.startsWith('/direct/')?'direct':location.pathname.toLowerCase()==='/'+j.username.toLowerCase()+'/'?'target_profile':'other',stage:result.code||result.step||'',editorCount:editors.length,editors:editors.slice(0,12).map(e=>({...node(e),ancestors:[e.parentElement,e.parentElement?.parentElement,e.parentElement?.parentElement,e.parentElement?.parentElement?.parentElement].filter(Boolean).map(node)})),dialogCount:chatDialogs().length,popupRecognized:!!popupView(j.username),viewProfileButtons:controls(document).filter(e=>/^(view profile|see profile|смотреть профиль|посмотреть профиль)$/i.test(label(e))).length};
 }
 chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||m.job?.kind!=='instagram')return;
  const j=m.job;
  if(!/^[a-f0-9]{32}$/.test(j.id)||!/^[a-z0-9._]{1,30}$/i.test(j.username)||typeof j.text!=='string'||!j.text.trim()||j.text.length>15000){reply({ok:false,notSent:true,error:'Некорректное задание'});return;}
  try{if(m.cmd==='prepare'){const result=prepare(j);reply({...result,diagnostics:diagnose(j,result)});}else if(m.cmd==='click')reply(click(j));else if(m.cmd==='confirm')reply(confirm(j));else if(m.cmd==='diagnose')reply(diagnose(j,{}));}catch(e){reply({ok:false,notSent:m.cmd==='prepare',uncertain:m.cmd==='click',error:e.message});}
 });
 chrome.runtime.sendMessage({type:'ready'}).catch(()=>{});
})();
