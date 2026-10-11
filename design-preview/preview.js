/* Isolated design prototype: static demonstration data, no API or app storage. */
const planner = document.body.dataset.style === 'planner';
const lessons = [
 {pair:1,time:'08:30',end:'09:50',title:'Основи архітектури комп’ютерних систем та мереж',type:'Лабораторна',kind:'lab',teacher:'Білий Дмитро Олександрович',group:'121І',room:'512 / к1',number:3},
 {pair:3,time:'11:30',end:'12:50',title:'Практикум з програмування та підтримки веб-застосувань',type:'Практична',kind:'practice',teacher:'Абросімов Євгеній Олександрович',group:'42У',room:'303 / к1',number:5},
 {pair:3,time:'11:30',end:'12:50',title:'Цифровий практикум',type:'Практична',kind:'practice',teacher:'Білий Дмитро Олександрович',group:'381І',room:'308 / к1',number:4},
 {pair:4,time:'13:10',end:'14:30',title:'Практикум з програмування та підтримки веб-застосувань',type:'Практична',kind:'practice',teacher:'Кожухар Жанна Вікторівна',group:'42У',room:'303 / к1',number:6},
 {pair:5,time:'14:40',end:'16:00',title:'Інформаційна безпека та захист інформації',type:'Лекція',kind:'lecture',teacher:'Абросімов Євгеній Олександрович',group:'32У',room:'512 / к1',number:4}
];
const names=['Понеділок','Вівторок','Середа','Четвер','П’ятниця','Субота'];
const short=['Пн','Вт','Ср','Чт','Пт','Сб'];
const counts=[4,5,0,5,4,1];
let day=1;
document.getElementById('app').innerHTML=`
 <div class="preview-bar"><span>ТЕСТ ДИЗАЙНУ · демонстраційні дані</span><a href="campus.html" ${!planner?'aria-current="page"':''}>01 Чистий кампус</a><a href="planner.html" ${planner?'aria-current="page"':''}>02 Паперовий планер</a></div>
 <div class="shell"><header class="topbar"><div class="brand"><span class="logo" aria-hidden="true">р</span>Розклад<span class="eyebrow">ІДГУ</span></div><div class="navigation" aria-label="Приклад навігації"><span>Мій розклад</span><span>Сесія</span></div><div class="top-actions"><button id="search-toggle" aria-expanded="false">Пошук</button><button id="theme" aria-label="Темна тема" aria-pressed="false">◐</button></div></header>
 <section class="heading"><div><div class="eyebrow">${planner?'Ваш навчальний тиждень':'Менше пошуку. Більше ясності.'}</div><h1>${planner?'Усе за розкладом.':'Мій розклад'}</h1><p>Три викладачі · 28 вересня — 3 жовтня 2026</p></div><span class="updated">Демонстраційний перегляд</span></section>
 <div class="workspace"><aside class="sidebar"><div class="side-title">Мої викладачі</div><div class="person">Абросімов Євгеній<small>Програмування · кібербезпека</small></div><div class="person">Білий Дмитро<small>Комп’ютерні системи</small></div><div class="person">Кожухар Жанна<small>Практикум · робототехніка</small></div><p class="sidebar-note">Натисніть на назву заняття, щоб переглянути попередні пари.</p><div class="side-title">${planner?'02 / Паперовий планер':'01 / Чистий кампус'}</div></aside>
 <main><div class="search" id="search-panel"><input id="query" type="search" aria-label="Пошук у демонстраційному розкладі" placeholder="Предмет, викладач або група…"></div><div class="controls"><span class="week-label">Вересень — жовтень 2026</span><div class="segment" aria-label="Деталізація"><button id="minimal" aria-pressed="true">Мінімум</button><button id="expanded" aria-pressed="false">Деталі</button></div></div><div class="days" aria-label="Дні тижня">${short.map((s,i)=>`<button class="day" data-day="${i}" aria-pressed="${i===day}"><span>${s}</span><strong>${i<3?28+i:i-2}</strong><small>${counts[i]?'занять: '+counts[i]:'вільний'}</small></button>`).join('')}</div><div class="date-line"><h2 id="date-title"></h2><span id="count"></span></div><div id="schedule" aria-live="polite"></div><footer class="footer"><span>Час занять · Europe/Kyiv</span><span>Макет · не підключений до API</span></footer></main></div></div>
 <dialog id="history" aria-labelledby="history-title"><div class="dialog-top"><span class="eyebrow">Історія занять · приклад</span><button id="close-history" aria-label="Закрити історію">✕</button></div><h2 id="history-title"></h2><p id="history-meta"></p><ol><li>22 вересня · 11:30<small>Аудиторія 303 / к1</small></li><li>15 вересня · 11:30<small>Аудиторія 303 / к1</small></li><li>8 вересня · 11:30<small>Аудиторія 303 / к1</small></li></ol><p class="demo-note">Ілюстрація вигляду історії. Дати не є реальними даними про ці заняття.</p></dialog>`;
function render(){
 const date=day<3?`${28+day} вересня`:`${day-2} жовтня`;
 document.getElementById('date-title').textContent=`${names[day]}, ${date}`;
 const q=document.getElementById('query').value.toLocaleLowerCase('uk');
 const rows=lessons.slice(0,counts[day]).filter(l=>`${l.title} ${l.teacher} ${l.group}`.toLocaleLowerCase('uk').includes(q));
 document.getElementById('count').textContent=`Занять: ${rows.length}`;
 document.getElementById('schedule').innerHTML=rows.length?rows.map(l=>`<article class="slot"><div class="time">${l.time}<small>${l.end}</small><div class="pair">${l.pair} пара</div></div><div class="lesson"><div class="lesson-header"><span class="badge ${l.kind}">${l.type} №${l.number}</span><span class="group">Група ${l.group}</span></div><button class="subject" data-lesson="${lessons.indexOf(l)}" aria-haspopup="dialog">${l.title}</button><div class="metadata"><span>${l.teacher}</span><span class="room">Ауд. ${l.room}</span></div><div class="extra"><span>Очне заняття · 80 хвилин</span><span>Історія — натисніть на предмет ↗</span></div></div></article>`).join(''):'<p class="empty">Занять немає. Можна видихнути.</p>';
}
document.querySelectorAll('[data-day]').forEach(b=>b.addEventListener('click',()=>{day=Number(b.dataset.day);document.querySelectorAll('[data-day]').forEach(d=>d.setAttribute('aria-pressed',String(d===b)));render();}));
for(const id of ['minimal','expanded'])document.getElementById(id).addEventListener('click',()=>{document.body.classList.toggle('expanded',id==='expanded');for(const mode of ['minimal','expanded'])document.getElementById(mode).setAttribute('aria-pressed',String(mode===id));});
document.getElementById('theme').addEventListener('click',e=>{const dark=document.body.classList.toggle('dark');e.currentTarget.setAttribute('aria-pressed',String(dark));e.currentTarget.setAttribute('aria-label',dark?'Світла тема':'Темна тема');});
document.getElementById('search-toggle').addEventListener('click',e=>{const open=document.getElementById('search-panel').classList.toggle('open');e.currentTarget.setAttribute('aria-expanded',String(open));if(open)document.getElementById('query').focus();});
document.getElementById('query').addEventListener('input',render);
document.getElementById('schedule').addEventListener('click',e=>{const b=e.target.closest('[data-lesson]');if(!b)return;const l=lessons[Number(b.dataset.lesson)];document.getElementById('history-title').textContent=l.title;document.getElementById('history-meta').textContent=`${l.type} · ${l.teacher}`;document.getElementById('history').showModal();});
document.getElementById('close-history').addEventListener('click',()=>document.getElementById('history').close());
render();
