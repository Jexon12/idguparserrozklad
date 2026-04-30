# Schedule Viewer — Ultra Manual (Максимально розширена документація)

Версія: 2.0 (Ultra)  
Дата: 30.04.2026  
Середовище: Web + Vercel Serverless + Optional Redis/KV  
Репозиторій: `schedule-viewer`

---

## Зміст

1. Роль системи і цільові користувачі  
2. Повна карта сторінок і навігації  
3. Архітектура системи (frontend/backend/storage)  
4. Детальний опис кожного frontend-модуля  
5. Детальний опис API (маршрути, payload, помилки)  
6. Кешування, дедуплікація, rate-limit, черги  
7. Data model (розклад, сесії, звіти, аудит)  
8. Покрокові сценарії для кожної кнопки  
9. Конфлікти і валідація: правила, алгоритми, edge-cases  
10. Експорт (Excel/Calendar/Session output)  
11. Безпека і доступи  
12. Моніторинг, аудит, версійність  
13. Локальний запуск і середовища  
14. CI/CD, тести, quality gates  
15. Troubleshooting playbook (інциденти)  
16. Performance tuning  
17. UX-рекомендації для деканату  
18. Регламент оновлень даних  
19. Чеклісти “перед релізом” і “після деплою”  
20. Дорожня карта розвитку

---

## 1) Роль системи і цільові користувачі

Система покриває **оперативну роботу з розкладом та сесіями** для:
- деканату,
- кафедр,
- викладачів,
- студентів.

Основні задачі:
- швидко знайти розклад по групі/викладачу/аудиторії;
- аналізувати зміни і конфлікти;
- готувати сесію з DOCX або з розкладу;
- робити експортні матеріали (Excel/Calendar);
- вести контроль якості даних (пропуски, дублікати, неконсистентні ПІБ).

---

## 2) Повна карта сторінок і навігації

## 2.1 Основні сторінки
- `index.html` — desktop UI, головний центр керування.
- `index2.html` — mobile UI.
- `session.html` — перегляд сесії (таблиця, фільтри, експорт).
- `session-admin.html` — імпорт DOCX і адмін-операції над сесіями.
- `session-constructor.html` — ручний конструктор сесії + перевірки.
- `session-prep.html` — підготовчий збір “предмет-група-викладачі”.
- `smart.html` — smart-аналітика (рейтинг, heatmap, what-if).
- `builder.html` — тижневий білдер/оптимізатор.
- `course-live.html` — денний агрегатор по курсах/факультетах.

## 2.2 Навігаційна логіка
- Desktop/mobile перемикаються через `?desktop=1` / `?mobile=1`.
- На мобільних пристроях `index.html` може редиректити в `index2.html`.
- Швидкі кнопки ведуть у session/smart/builder/course-day.

---

## 3) Архітектура системи

## 3.1 Frontend
- Переважно статичні HTML + JS.
- Основний застосунок на Vue (`js/app.js`).
- Деякі сторінки — “vanilla-first” модулі (`session-*`, `course-live`, `builder`).

## 3.2 Backend
- `api/index.js` — serverless API gateway + admin routes + cache + queue.
- `api/job-queue.js` — внутрішня черга job’ів для тривалих операцій (звітів).
- `server.js` — локальний dev/standalone сервер.

## 3.3 Storage
- Основний пріоритет:
  1. Vercel KV (`KV_REST_API_URL/TOKEN`),
  2. Redis (`REDIS_URL`),
  3. fallback: `db.json`.
- Session fallback file: `data/session-2025-26.json`.

---

## 4) Детальний опис frontend модулів

## 4.1 `js/app.js` (головний orchestrator)
Відповідає за:
- стан інтерфейсу (активні сутності, фільтри, дати, режими);
- інтеграцію з API (`ScheduleApp.fetchApi`);
- обране (`favorites`), шаринг, snapshot;
- поточна/наступна пара;
- модулі report/occupancy/admin/notes;
- збереження налаштувань в `localStorage`.

Ключові групи стану:
- `entities` (вибрані групи/викладачі),
- `scheduleData`,
- `viewMode`,
- `deliveryModeFilter`,
- `occupancyResults`,
- `scheduleChangeLog`,
- `mobileWidgetData`.

## 4.2 `js/api.js`
Функція: `SA.fetchApi(action, params, options)`.

Що робить:
- будує URL `/api/<action>`;
- додає `aVuzID`, `aGiveStudyTimes`, cache-buster `_`;
- робить quote рядкових параметрів;
- парсить JSON або JSONP;
- робить in-flight dedupe;
- тримає in-memory cache 60 секунд.

Параметри:
- `action`: метод зовнішнього API (через proxy).
- `params`: query-параметри.
- `options.useCache`: вкл/викл локальний кеш.
- `options.silent`: придушити UI-помилку.

## 4.3 `js/search.js`
- побудова індексів пошуку;
- префіксний пошук по сутностях;
- зменшення latency інпут-пошуку.

## 4.4 `js/occupancy.js` + worker
- сканує зайнятість аудиторій;
- запускає фонову обробку;
- формує export XLSX.

## 4.5 `js/report.js`
- стартує job (`/api/report/start`);
- poll status (`/api/report/status`);
- download (`/api/report/download`).

## 4.6 `js/session-page.js`
- завантаження `GET /api/session`;
- побудова фільтрів;
- мультівибір викладачів;
- табличний рендер;
- експорт відфільтрованих рядків.

## 4.7 `js/session-admin.js`
- читання DOCX (browser-side);
- розбір таблиць;
- формування payload;
- завантаження в `/api/session` з паролем;
- операції над сесіями (архів/видалення/backup).

## 4.8 `js/session-constructor.js`
- manual editor rows;
- нормалізація предметів/ПІБ;
- авто-розкладка дат;
- конфлікт-engine (група/викладач/аудиторія);
- статистика якості;
- upload/Excel/Word export.

## 4.9 `js/session-prep.js`
- збір груп за факультет/форма/курс;
- завантаження розкладу по групах;
- агрегація предмет/група/викладачі;
- чекбокси + фільтри + copy/export.

## 4.10 `js/builder.js`
- збір тижневого срезу факультету;
- матриці по групах;
- виявлення дублювань/конфліктів;
- оптимізаційні кроки;
- Excel export.

## 4.11 `js/smart-day.js`
- score (0..100),
- heatmap,
- what-if,
- оцінка переходів між корпусами.

## 4.12 `js/course-live.js`
- ручне оновлення через кнопку;
- фільтри по факультетах/формах/курсах;
- compare date + only changes;
- room conflicts / teacher load / teacher windows;
- quality panel / journal / presets / export.

---

## 5) Детальний опис API

## 5.1 Загальні правила API
- базовий base: `/api/*`;
- CORS headers для required маршрутів;
- частина маршрутів вимагає `password`;
- rate-limit на чутливі POST.

## 5.2 Health і monitor
- `GET /api/health`  
  Відповідь: `{ status: "ok", ... }`.

- `GET /api/monitor`  
  Відповідь: queue/counters/events.

- `POST /api/monitor/log`  
  Приймає frontend telemetry/error payload.

## 5.3 Audit/versions
- `GET /api/audit?limit=...` — історія адмін дій.
- `GET /api/versions?scope=session|times|links` — історія версій.

## 5.4 Session routes
- `GET /api/session`  
  Повертає структуру з масивом `sessions`.

- `POST /api/session`  
  Очікує:
  - `password`,
  - `term`,
  - `studyForm`,
  - `items` (масив рядків сесії),
  - мета-інфо (`actor`, `source`, optional).

  Логіка:
  - якщо `term` вже існує — об’єднання/додавання;
  - збереження версії;
  - аудит.

## 5.5 Times/links
- `GET /api/times` / `POST /api/times`
- `GET /api/links` / `POST /api/links`

POST вимагає admin password.

## 5.6 Report routes
- `POST /api/report/start`  
  input: параметри звіту.  
  output: `jobId`.

- `GET /api/report/status?jobId=...`  
  output: `done/progress/error/downloadUrl`.

- `GET /api/report/download?jobId=...`  
  віддача Excel.

## 5.7 Occupancy cache routes
- `GET /api/occupancy?date=YYYY-MM-DD`
- `POST /api/occupancy` (admin/controlled flow)

## 5.8 Proxy
- `GET /api/<action>`  
  Напр.:
  - `GetStudentScheduleFiltersData`
  - `GetStudyGroups`
  - `GetScheduleDataX`
  - `GetScheduleDataEmp`
  - `GetEmployees`
  - `GetChairItems`

---

## 6) Кеш, dedupe, rate-limit, queue

## 6.1 Backend cache
- `proxyCache` (`Map`) + optional KV/Redis.
- `CACHE_TTL.default = 5m`
- `CACHE_TTL.schedule = 3m`
- `MAX_CACHE_SIZE = 500`

## 6.2 In-flight dedupe
- `inFlightProxyRequests` гарантує, що паралельні однакові запити не дублюються.

## 6.3 Rate-limit
- admin: 20 req/min/IP
- proxy: 120 req/min/IP

## 6.4 Job queue
- reportQueue concurrency = 2
- job TTL і cleanup.

---

## 7) Data model (узагальнено)

## 7.1 Lesson model
- `group`
- `discipline`
- `teacher` / `teachers[]`
- `room`
- `type`
- `date`
- `pair`
- `start`, `end`, `label`

## 7.2 Session row model
- `term`
- `studyForm`
- `group`
- `discipline`
- `teachers[]`
- `controlType` (`залік`/`іспит`/`захист`)
- `date`
- `time` (для іспитів)
- `room`
- `notes` (optional)

## 7.3 Audit event
- `ts`
- `action`
- `scope`
- `ip`
- `userAgent`
- `meta`

## 7.4 Version snapshot
- `id`
- `ts`
- `hash`
- `size`
- `extra`

---

## 8) Повні сценарії по кнопках (операторська інструкція)

## 8.1 Головна `index.html`
- `+ Додати`:
  1. читає форму (group/teacher),
  2. валідує вибір,
  3. тягне розклад через API,
  4. додає в entities list,
  5. ререндер.

- `📊 Звіт`:
  1. формує payload,
  2. `POST /api/report/start`,
  3. poll status,
  4. download xlsx.

- `🗑 Очистити`:
  - очищає локальні ключі (`schedule_*`, snapshot, filters, etc),
  - перезавантажує UI.

## 8.2 `session-admin.html`
- `1) Розпарсити файли`:
  - читає DOCX,
  - витягує таблиці,
  - нормалізує рядки.

- `2) Завантажити в API`:
  - перевіряє пароль/term,
  - формує `POST /api/session`.

## 8.3 `session-constructor.html`
- `Автодати`:
  - розподіляє дати за діапазонами для заліків/іспитів.
- `Smart-підказки`:
  - аналізує конфлікти;
  - формує текстові рекомендації.
- `Експорт Excel`:
  - формує workbook зі строками.

## 8.4 `course-live.html`
- `Оновити зараз`:
  - бере поточні чекбокси,
  - тягне групи,
  - тягне пари на день,
  - ререндер + статистика.

- `Порівняти з датою`:
  - повторно fetch на compare-date,
  - diff added/removed,
  - панель змін.

- `Знайти вікна`:
  - обчислює **спільні** вікна по активних парах.

---

## 9) Конфлікти та валідація (детально)

## 9.1 Критичні конфлікти (must-fix)
- одна група: 2 іспити в один date+time;
- один викладач: 2 іспити в один date+time;
- одна аудиторія: 2 іспити в один date+time.

## 9.2 Попередження (should-fix)
- порожня дата;
- іспит без часу;
- порожня аудиторія;
- відсутній викладач;
- дублікати рядків;
- різні написання ПІБ.

## 9.3 Рекомендований порядок виправлень
1. Date/time conflicts.
2. Room conflicts.
3. Missing critical fields.
4. Duplicates and naming normalization.

---

## 10) Експорти

## 10.1 Excel
Є в:
- main/report,
- occupancy,
- session page,
- session constructor,
- builder,
- course-live.

## 10.2 Word-like output
`session-constructor` може формувати шаблонізований export для подальшого оформлення.

## 10.3 Calendar
- ICS/Google calendar додавання подій.

---

## 11) Безпека

## 11.1 Пароль адміна
- Не зберігати в клієнті.
- Передавати тільки через захищений HTTPS.
- Production: обов’язково strong password.

## 11.2 Обмеження доступу
- admin POST routes перевіряють пароль.
- rate-limit захищає від brute-force/abuse.

## 11.3 Логи і приватність
- audit/monitor payload sanitize (`password -> ***`).

---

## 12) Моніторинг і версійність

## 12.1 Monitor
- технічні події, помилки клієнта, стан черги.

## 12.2 Audit
- хто/коли/що змінив в admin-операціях.

## 12.3 Versions
- історія змін data scopes (`session/times/links`) з hash.

---

## 13) Локальний запуск

```bash
npm install
npm run build:css
npm start
```

Dev стилі:
```bash
npm run watch:css
```

Тести:
```bash
npm test -- --runInBand
npm test -- --runInBand --detectOpenHandles
```

Кодування:
```bash
npm run lint:encoding
```

---

## 14) CI/CD

Рекомендований pipeline:
1. Install deps.
2. Lint encoding.
3. Run tests.
4. Optional smoke.
5. Deploy.

Deployment checks:
- `GET /api/health`
- відкриття критичних сторінок
- ручний smoke ключових кнопок.

---

## 15) Troubleshooting playbook

## 15.1 “Сторінка порожня”
- `Ctrl+F5`
- перевірити 404 статичних ресурсів (js/css)
- перевірити помилки у консолі.

## 15.2 “POST /api/session 401/403”
- перевірити `ADMIN_PASSWORD` в env;
- перевірити правильність введеного пароля;
- перевірити `Vercel Authentication`/access policies.

## 15.3 “Не оновлюється course-live”
- змінили фільтри -> натиснути `Оновити зараз` (авто disabled by design).

## 15.4 “Конфлікти дивні”
- перевірити дату/час,
- перевірити нормалізацію ПІБ,
- перевірити дублі рядків.

---

## 16) Performance tuning

1. Увімкнути Redis/KV (production).
2. Збільшити granularity cache для популярних запитів.
3. Використовувати worker для heavy scan.
4. Batch DOM updates для великих таблиць.
5. Обмеження первинного рендера + lazy load chunks.

---

## 17) UX для деканату (рекомендовано)

1. Окремий “операторський режим” з великими кнопками.
2. Єдиний центр “Конфлікти” (група/викладач/аудиторія).
3. Короткі інструкції inline біля критичних кнопок.
4. Колірні маркери severity (critical/warning/info).

---

## 18) Регламент оновлення даних сесії

1. Завантаження файлів у `session-admin`.
2. Перевірка в `session-constructor`.
3. Виправлення конфліктів.
4. Freeze version (tag/hash).
5. Публікація на `session.html`.

---

## 19) Чекліст перед релізом

- [ ] `npm test -- --runInBand` green
- [ ] `npm run lint:encoding` green
- [ ] Критичні сторінки відкриваються без console errors
- [ ] Session upload працює з правильним паролем
- [ ] Course-live не автозавантажує, тільки кнопка
- [ ] Експорт Excel працює на main/session/builder/course-live
- [ ] Темна/світла тема працює
- [ ] Кнопка “Очистити” працює без перезаходу

---

## 20) Дорожня карта (пріоритет)

P0:
1. Уніфікація схем payload.
2. Розширений conflict-engine (hard rules + solver hints).
3. Реєстр сесій з ролями.

P1:
1. PDF-генерація на сервері для офіційних форм.
2. RBAC (viewer/editor/admin).
3. SLA-дашборд і алерти.

P2:
1. BI-експорт і історичні тренди.
2. ML-підказки розкладу.
3. Multi-campus route optimization.

---

## Додаток A: Ключові змінні середовища

- `ADMIN_PASSWORD`
- `VUZ_ID`
- `REDIS_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `NODE_ENV`

---

## Додаток B: Файли документації

- `USER_GUIDE.md`
- `USER_GUIDE_PDF.html`
- `TECHNICAL_MANUAL_FULL.md`
- `TECHNICAL_MANUAL_FULL_PDF.html`
- `TECHNICAL_MANUAL_ULTRA.md` (цей документ)

