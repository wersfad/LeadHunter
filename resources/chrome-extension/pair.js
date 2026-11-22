const button=document.getElementById('lh-pair'),status=document.getElementById('lh-status');
if(location.origin==='http://127.0.0.1:18793'&&button&&status)button.addEventListener('click',async event=>{
  if(!event.isTrusted)return;
  button.disabled=true;status.textContent='Подключаю…';
  try{
    const code=new URL(location.href).searchParams.get('code');
    const r=await chrome.runtime.sendMessage({type:'pair',code});
    status.textContent=r?.ok?'Chrome подключён. Можно закрыть эту вкладку и вернуться в LeadHunter. Для первой проверки выберите 1 компанию и только Instagram.':r?.error||'Не удалось подключить';
    if(r?.ok){history.replaceState(null,'','/connect');button.textContent='Подключено';}else button.disabled=false;
  }catch(e){status.textContent=e.message;button.disabled=false;}
});
