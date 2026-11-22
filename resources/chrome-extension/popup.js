chrome.runtime.sendMessage({type:'status'}).then(r=>document.getElementById('status').textContent=r.connected?'Подключён к LeadHunter':r.error?r.error:r.paired?'Связь неактивна. Откройте LeadHunter.':'Расширение установлено, но ещё не подключено.').catch(()=>{});
document.getElementById('open').onclick=()=>chrome.tabs.create({url:'https://www.instagram.com/'});
