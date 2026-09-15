/* Memo: no server, dependencies or credentials. Published data and drafts stay separate. */
'use strict';
const $ = id => document.getElementById(id);
const KEY = 'memo:work:v1:' + location.pathname.replace(/index\.html$/, '');
const labels = {new:'Новая',filled:'Заполнена',checked:'Проверена'};
let published = null, draft = null, teacher = false, rehearsal = false, single = false, order = [], page = 0;
let flipped = new Set(), editing = null, saved = true, storageBlocked = false, busy = false;
let lastStored = null;
function validate(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.cards)) throw Error('Ожидается файл Memo: version: 1 и массив cards.');
  const ids = new Set();
  const cards = data.cards.map((c,i) => {
    if (!c || typeof c.id !== 'string' || !c.id.trim() || ids.has(c.id) || typeof c.term !== 'string' || typeof c.definition !== 'string' || !Object.hasOwn(labels,c.status)) throw Error(`Некорректная карточка № ${i+1}: проверьте id, term, definition и status.`);
    if(c.term.length>300 || c.definition.length>20000) throw Error(`Карточка № ${i+1} слишком длинная.`);
    ids.add(c.id);
    return {id:c.id,term:c.term,definition:c.definition,status:c.status};
  });
  return {version:1,cards};
}
const copy = data => JSON.parse(JSON.stringify(data));
function notice(message,error=false){$('source').textContent=message;$('source').hidden=!message;$('source').classList.toggle('error',error);}
function saveMessage(message,error=false){for(const id of ['save','editor-save']){$(id).textContent=message;$(id).hidden=!message;$(id).classList.toggle('error',error);}}
function saveDraft(){
  saved=false;
  try {
    if(storageBlocked) throw Error('conflict');
    const current=localStorage.getItem(KEY);
    if(current!==lastStored){storageBlocked=true;throw Error('conflict');}
    const value=JSON.stringify(draft);
    localStorage.setItem(KEY,value);lastStored=value;saved=true;
    saveMessage('Сохранено · '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}));
  } catch {
    saveMessage(storageBlocked ? 'Рабочая копия изменена в другой вкладке или повреждена. Скачайте cards.json с текущими правками, затем перезагрузите страницу. Автосохранение остановлено.' : 'Браузер не сохранил изменения. Обязательно скачайте cards.json до закрытия страницы.',true);
  }
}
function readDraft(){
  try {lastStored=localStorage.getItem(KEY);if(lastStored!==null){draft=validate(JSON.parse(lastStored));saveMessage('');}}
  catch {storageBlocked=true;saveMessage('Не удалось прочитать локальную копию. Она не будет перезаписана. Используйте восстановление из файла; сохраняйте изменения экспортом.',true);}
}
async function fetchPublished(){
  if(location.protocol==='file:') throw Error('Откройте Memo по адресу GitHub Pages или через локальный веб-сервер (см. README). При открытии HTML двойным щелчком браузер не разрешает загрузку cards.json.');
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  try {
    const url=new URL('cards.json',location.href);url.searchParams.set('t',Date.now());
    const response=await fetch(url,{cache:'no-store',signal:controller.signal});
    if(!response.ok) throw Error('Не удалось загрузить cards.json (HTTP '+response.status+'). Проверьте наличие файла в корне сайта.');
    return validate(await response.json());
  } finally {clearTimeout(timer);}
}
function data(){return (teacher || rehearsal) ? (draft?.cards || []) : (published?.cards || []);}
function resetOrder(){order=data().map(c=>c.id);page=0;flipped.clear();render();}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function button(text,action){const b=element('button','',text);b.type='button';b.addEventListener('click',action);return b;}
function render(){
  const all=data(), byId=new Map(all.map(c=>[c.id,c]));
  order=order.filter(id=>byId.has(id));for(const c of all)if(!order.includes(c.id))order.push(c.id);
  const query=$('search').value.trim().toLocaleLowerCase('ru');
  const filtered=order.map(id=>byId.get(id)).filter(c=>c.term.toLocaleLowerCase('ru').includes(query));
  page=Math.max(0,Math.min(page,filtered.length-1));
  $('result').textContent=query ? `НАЙДЕНО: ${filtered.length} ИЗ ${all.length}` : `${all.length}`;
  $('cards').replaceChildren();$('cards').classList.toggle('single',single);
  $('empty').hidden=filtered.length>0;
  $('empty-text').textContent=query?'Ничего не найдено':'Нет карточек';
  for(const c of single?filtered.slice(page,page+1):filtered){
    const back=flipped.has(c.id), card=element('article','card'+(back?' back':''));
    const flip=button('',()=>{back?flipped.delete(c.id):flipped.add(c.id);render();document.getElementById('flip-'+c.id)?.focus({preventScroll:true});});
    flip.id='flip-'+c.id;flip.className='flip';flip.setAttribute('aria-pressed',String(back));
    flip.setAttribute('aria-label',(back?'Показать термин: ':'Показать определение: ')+(c.term||'Без названия'));
    const top=element('span','card-top');top.append(element('span','',back?'ОПРЕДЕЛЕНИЕ':'ПОНЯТИЕ'),element('span','badge '+c.status,labels[c.status]));
    flip.append(top,element('span','card-content',back?(c.definition||'—'):(c.term||'Новое понятие')));
    card.append(flip);
    if(teacher){const actions=element('div','card-actions');actions.append(button('Редактировать',()=>openEditor(c.id)),button('Удалить',()=>{if(confirm(`Удалить карточку «${c.term||'Без названия'}» из рабочей копии?`)){draft.cards=draft.cards.filter(x=>x.id!==c.id);saveDraft();render();}}));card.append(actions);}
    $('cards').append(card);
  }
  $('pager').hidden=!single||!filtered.length;$('position').textContent=`${page+1} / ${filtered.length}`;
  $('prev').disabled=page===0;$('next').disabled=page>=filtered.length-1;
  $('grid').setAttribute('aria-pressed',String(!single));$('single').setAttribute('aria-pressed',String(single));
}
function syncMode(){
  $('teacher').hidden=!teacher;
  $('mode').textContent=teacher?'Опубликованный набор':'Режим преподавателя';
  $('rehearse').hidden=!teacher&&!rehearsal;
  $('rehearse').textContent=rehearsal?'Опубликованный набор':'Повторять рабочую копию';
  notice(!teacher&&!rehearsal&&!published?'Набор недоступен': '',!teacher&&!rehearsal&&!published);
  $('search').value='';resetOrder();
}
function setMode(){
  teacher=!teacher;rehearsal=false;
  if(teacher&&!draft){draft=published?copy(published):{version:1,cards:[]};saveDraft();}
  syncMode();
}
$('rehearse').onclick=()=>{rehearsal=!rehearsal;teacher=false;syncMode();};
function openEditor(id){editing=id;const c=draft.cards.find(x=>x.id===id);$('term').value=c.term;$('definition').value=c.definition;$('status').value=c.status;$('editor-title').textContent=c.term?'Редактировать карточку':'Новая карточка';$('editor').showModal();$('term').focus();}
function updateEditor(){if(!teacher||!editing)return;const c=draft.cards.find(x=>x.id===editing);c.term=$('term').value;c.definition=$('definition').value;c.status=$('status').value;saveDraft();render();}
function download(){const blob=new Blob([JSON.stringify(draft,null,2)+'\n'],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download='cards.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);notice('cards.json скачивается');}
$('mode').onclick=setMode;
$('search').oninput=()=>{page=0;render();};
$('grid').onclick=()=>{single=false;render();};$('single').onclick=()=>{single=true;render();};
$('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};
$('shuffle').onclick=()=>{for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}page=0;flipped.clear();render();};
$('reset').onclick=()=>{flipped.clear();render();};
$('projector').onclick=()=>{const active=document.body.classList.toggle('projector');$('projector').setAttribute('aria-pressed',String(active));};
$('add').onclick=()=>{const id=crypto.randomUUID();draft.cards.push({id,term:'',definition:'',status:'new'});saveDraft();render();openEditor(id);};
for(const id of ['term','definition','status'])$(id).addEventListener('input',updateEditor);
$('form').onsubmit=e=>{e.preventDefault();$('editor').close();};$('close').onclick=()=>$('editor').close();
$('editor').addEventListener('close',()=>{editing=null;});
$('export').onclick=download;
$('published').onclick=async()=>{
  if(busy)return;
  if(!confirm('Заменить всю рабочую копию опубликованным cards.json? Сначала скачайте текущую копию, если хотите сохранить её.'))return;
  busy=true;$('published').disabled=true;
  try {const fresh=await fetchPublished();published=fresh;draft=copy(fresh);saveDraft();resetOrder();notice('Набор загружен');}
  catch(e){notice('Рабочая копия сохранена без изменений. '+e.message,true);}
  finally{busy=false;$('published').disabled=false;}
};
$('import').onclick=()=>$('file').click();
$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{const next=validate(JSON.parse(await file.text()));if(!confirm(`Заменить рабочую копию набором из файла (${next.cards.length} карточек)? Текущую копию можно предварительно скачать.`))return;draft=next;saveDraft();resetOrder();notice('Набор восстановлен');}catch(e){notice('Импорт отменён: '+e.message,true);}finally{$('file').value='';}};
window.addEventListener('beforeunload',e=>{if(!saved){e.preventDefault();e.returnValue='';}});
window.addEventListener('storage',e=>{if(e.key===KEY||e.key===null){storageBlocked=true;saveMessage('Рабочая копия изменилась в другой вкладке. Скачайте текущие правки и перезагрузите страницу. Автосохранение остановлено.',true);}});
async function init(){readDraft();$('mode').disabled=true;try{published=await fetchPublished();notice('');}catch(e){notice(e.name==='AbortError'?'Загрузка заняла слишком много времени. Проверьте соединение и обновите страницу.':e.message,true);}finally{$('mode').disabled=false;resetOrder();}}
init();
