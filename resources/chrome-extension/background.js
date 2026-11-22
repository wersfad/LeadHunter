const BASE='http://127.0.0.1:18793';
let pumping=false,repump=false,lastError='',lastContact=0;
function wakePump(){if(pumping)repump=true;else pump();}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,body,key){
  key=key||(await chrome.storage.local.get('key')).key;if(!key)throw new Error('Сначала подключите расширение через кнопку в LeadHunter.');
  const res=await fetch(BASE+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,'x-leadhunter-extension':chrome.runtime.id,'x-leadhunter-version':chrome.runtime.getManifest().version,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',signal:AbortSignal.timeout(24000)});
  if(!res.ok){lastContact=0;throw new Error(res.status===426?'Обновите расширение до 2.3.11, перезагрузите его и подключите заново.':res.status===401?'Подключение сброшено. Снова подключите расширение из LeadHunter.':res.status===403?'Подключение отклонено. Обновите расширение до 2.3.11 и подключите заново.':'LeadHunter ответил ошибкой '+res.status);}lastContact=Date.now();return res.json();
}
async function cancelled(job){try{return(await api('/state?id='+encodeURIComponent(job.id))).cancelled;}catch{return true;}}
async function content(tabId,cmd,job){return chrome.tabs.sendMessage(tabId,{cmd,job});}
async function runJob(job){
  if(job.kind!=='instagram'||job.action!=='send'||!/^[a-f0-9]{32}$/.test(job.id)||!/^[A-Za-z0-9._]{1,30}$/.test(job.username)||typeof job.text!=='string'||!job.text.trim()||job.text.length>15000)return{ok:false,error:'Некорректное задание',needsUser:true};
  let tab,clicked=false;
  try {
    if(await cancelled(job))return{ok:false,error:'Остановлено'};
    const tabs=await chrome.tabs.query({url:'https://www.instagram.com/*'});
    // Dedicated tab prevents replacing the user's current Instagram conversation.
    const saved=(await chrome.storage.local.get('workTab')).workTab;
    tab=tabs.find(t=>t.id===saved);
    const url='https://www.instagram.com/'+encodeURIComponent(job.username)+'/';
    if(tab)tab=await chrome.tabs.update(tab.id,{url,active:true});else{tab=await chrome.tabs.create({url,active:true});await chrome.storage.local.set({workTab:tab.id});}
    let prepared,lastStep='',lastTransportError='';
    const progress=async stage=>{if(stage && stage!==lastStep){lastStep=stage;await api('/progress',{id:job.id,stage,diagnostics:prepared?.diagnostics});}};
    await progress('Загружаю профиль Instagram');
    for(let i=0;i<60;i++){
      if(await cancelled(job))return{ok:false,error:'Остановлено',notSent:true,code:'stopped'};
      try{
        prepared=await content(tab.id,'prepare',job);
        await progress(prepared?.step);
        if(prepared?.ok||prepared?.blocked||prepared?.skip)break;
      }catch(e){lastTransportError=e.message;}
      await sleep(1000);
    }
    if(prepared?.skip)return{ok:false,notSent:true,skip:true,code:prepared.code,error:prepared.error,diagnostics:prepared.diagnostics};
    if(!prepared?.ok)return{ok:false,notSent:true,retryable:true,channelBlocked:!!prepared?.channelBlocked,code:prepared?.code||'chat_not_ready',error:prepared?.error||'Instagram: расширение не получило ответ от страницы. Обновите расширение и вкладку. '+lastTransportError,diagnostics:prepared?.diagnostics};
    if(await cancelled(job))return{ok:false,error:'Остановлено',notSent:true,code:'stopped'};
    await progress('Нажимаю отправку Instagram');
    // Lost click replies are uncertain. Known pre-click rejection is not a send.
    await api('/phase',{id:job.id,phase:'clicking'});clicked=true;
    let sent;
    for(let i=0;i<12;i++){
      sent=await content(tab.id,'click',job);
      if(sent?.ok || !sent?.wait)break;
      if(await cancelled(job))return{ok:false,error:'Остановлено',uncertain:true};
      await sleep(500);
    }
    if(!sent?.ok)return{ok:false,notSent:sent?.notSent===true,skip:sent?.skip===true,code:sent?.code||'send_not_clicked',error:sent?.error||'Кнопка отправки не подтверждена',uncertain:sent?.notSent!==true,retryable:sent?.notSent===true};
    await progress('Проверяю появление исходящего сообщения');
    for(let i=0;i<20;i++){
      try{if((await content(tab.id,'confirm',job))?.confirmed)return{ok:true,confirmed:true};}catch{}
      await sleep(750);
    }
    return{ok:false,uncertain:true,error:'Instagram: нажатие выполнено, результат не подтверждён. Контакт не будет повторён; очередь продолжится.'};
  }catch(e){return{ok:false,error:e.message,uncertain:clicked,notSent:!clicked,retryable:!clicked,code:clicked?'delivery_uncertain':'chrome_transport'};}
}
async function pump(){
  if(pumping)return;pumping=true;
  try{
    const key=(await chrome.storage.local.get('key')).key;if(!key)return;
    const job=await api('/job',null,key);lastError='';
    if(!job.id)return;
    const result=await runJob(job);await api('/result',{id:job.id,result},key);repump=true;
  }catch(e){lastError=e.message;lastContact=0;}finally{pumping=false;if(repump){repump=false;queueMicrotask(pump);}}
}
chrome.alarms.create('leadhunter-poll',{periodInMinutes:0.5});
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='leadhunter-poll')pump();});
chrome.runtime.onStartup.addListener(()=>pump());
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(m.type==='pair' && /^http:\/\/127\.0\.0\.1:18793\/connect(?:[?#]|$)/.test(sender.url||'')){
    (async()=>{try{
      if(!/^[a-f0-9]{48}$/.test(m.code))throw new Error('Неверная ссылка подключения');
      const res=await fetch(BASE+'/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:m.code,protocol:2,version:chrome.runtime.getManifest().version}),credentials:'omit'});
      const value=await res.json();if(!res.ok||!/^[a-f0-9]{64}$/.test(value.key||''))throw new Error(value.error||'Подключение не удалось');
      await chrome.storage.local.set({key:value.key});await api('/ping',null,value.key);lastContact=Date.now();lastError='';reply({ok:true});wakePump();
    }catch(e){reply({ok:false,error:e.message});}})();return true;
  }
  if(m.type==='status' && sender.id===chrome.runtime.id){(async()=>{const paired=!!(await chrome.storage.local.get('key')).key;if(paired){try{await api('/ping');lastError='';}catch(e){lastError=e.message;lastContact=0;}}reply({paired,connected:paired&&Date.now()-lastContact<65000,error:lastError});pump();})();return true;}
  if(m.type==='ready' && /^https:\/\/www\.instagram\.com\//.test(sender.url||'')){pump();reply({ok:true});}
});
pump();
