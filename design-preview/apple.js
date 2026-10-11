// Presentation-only extension; the other two prototypes stay unchanged.
document.querySelector('.preview-bar').innerHTML = '<span>GLASS · V4 · демодані</span><a href="campus.html">Кампус</a><a href="planner.html">Планер</a><a href="apple.html" aria-current="page">03 Glass</a>';
document.querySelector('.heading .eyebrow').textContent = 'ВАШ ЧАС. ВАШ РИТМ.';
document.querySelector('.heading h1').innerHTML = 'Навчальний день.<br><span>Усе на своїх місцях.</span>';
document.querySelector('.sidebar .side-title:last-child').textContent = '03 / Glass';
document.querySelector('.logo').textContent = 'р';
document.querySelector('.updated').textContent = 'Демо · вересень 2026';
document.querySelector('.sidebar-note').textContent = 'Предмет відкриває історію. Усе важливе залишається на картці.';

// A calendar-first composition rather than the campus card layout.
document.querySelector('.heading').remove();
const sidebar = document.querySelector('.sidebar');
const calendar = document.createElement('section');
calendar.className = 'calendar-panel';
calendar.setAttribute('aria-label', 'Обраний день');
calendar.innerHTML = '<div class="calendar-month">ВЕРЕСЕНЬ 2026</div><div class="calendar-number">29</div><div class="calendar-weekday">Вівторок</div><div class="calendar-caption">Ваш навчальний тиждень</div>';
sidebar.prepend(calendar);
const main = document.querySelector('main');
const title = document.createElement('div');
title.className = 'agenda-heading';
title.innerHTML = '<div><span class="eyebrow">ОСОБИСТИЙ ПРОСТІР</span><h1>Розклад</h1></div><span class="agenda-subtitle">28 вересня — 3 жовтня</span>';
main.prepend(title);
// Mobile-only menu retains access to density settings without a permanent row.
const densityMenu = document.createElement('button');
densityMenu.id = 'density-menu';
densityMenu.textContent = '•••';
densityMenu.setAttribute('aria-label', 'Параметри вигляду');
densityMenu.setAttribute('aria-expanded', 'false');
document.querySelector('.controls').id = 'view-controls';
densityMenu.setAttribute('aria-controls', 'view-controls');
document.querySelector('.top-actions').append(densityMenu);
densityMenu.addEventListener('click', () => {
  const open = document.body.classList.toggle('view-controls-open');
  densityMenu.setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('[data-day]').forEach(button => button.addEventListener('click', () => {
  const index = Number(button.dataset.day);
  calendar.querySelector('.calendar-number').textContent = index < 3 ? 28 + index : index - 2;
  calendar.querySelector('.calendar-month').textContent = index < 3 ? 'ВЕРЕСЕНЬ 2026' : 'ЖОВТЕНЬ 2026';
  calendar.querySelector('.calendar-weekday').textContent = ['Понеділок','Вівторок','Середа','Четвер','П’ятниця','Субота'][index];
}));
