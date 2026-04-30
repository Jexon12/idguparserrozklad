# Schedule Viewer — Розширений технічний посібник

Версія документа: 1.0  
Дата: 30.04.2026  
Проєкт: `schedule-viewer`

---

## 1. Призначення системи

`schedule-viewer` — це вебсистема для деканату/кафедр і студентів, яка покриває:
- перегляд поточного розкладу (групи, викладачі, аудиторії),
- аналіз/порівняння розкладу,
- підготовку і адміністрування сесії,
- експорт у Excel/Calendar,
- контроль якості даних і конфліктів.

Система складається з:
- **frontend** (статичні HTML + JS, частково Vue),
- **backend API** (`api/index.js` для Vercel/serverless),
- **локального fallback-сховища** (`db.json`) якщо зовнішні storage недоступні.

---

## 2. Карта сторінок та що вони роблять

## 2.1 `index.html` (Desktop)
Головний робочий екран:
- пошук і додавання сутностей (група/викладач),
- фільтри по типу/формату занять,
- поточна/наступна пара,
- модулі: звіти, зайнятість аудиторій, нотатки, обране, шеринґ.

Ключові кнопки:
- `+ Додати` — додає вибрану сутність у поточний перегляд.
- `Звіт` — запуск генерації звіту через backend job.
- `Скан` (аудиторії) — запуск скану зайнятості.
- `Share` — формує URL зі станом.
- `Calendar` — експорт у календар.
- `Очистити` — очищає локальні дані.

## 2.2 `index2.html` (Mobile)
Мобільна версія:
- спрощений інтерфейс,
- швидкі кнопки дій,
- компактні картки “Сьогодні/Завтра”,
- доступ до session/smart/builder/course-day.

## 2.3 `session.html`
Перегляд сесій у табличному форматі:
- фільтри (term/форма/група/викладач/тип/дата/дисципліна),
- експорт відфільтрованого набору в XLSX.

## 2.4 `session-admin.html`
Адмін-завантаження даних сесії:
- завантаження багатьох DOCX,
- браузерний парсинг,
- upload у `/api/session` з паролем,
- управління сесіями (оновити/архів/видалити/backup).

## 2.5 `session-constructor.html`
Ручний конструктор сесії:
- редагування предмет/група/викладач/тип контролю/дата/час/аудиторія,
- real-time перевірка конфліктів,
- smart-підказки,
- автодати,
- експорт, upload в API.

## 2.6 `session-prep.html`
Сторінка підготовки даних до сесії:
- автоматично збирає з розкладу таблицю `Предмет | Група | Викладачі`,
- фільтри + чекбокси груп/курсів/викладачів,
- копіювання та Excel.

## 2.7 `smart.html`
Аналітичний модуль:
- рейтинг зручності,
- теплокарта,
- what-if симулятор,
- live board для змін.

## 2.8 `builder.html`
Тижневий білдер/аналізатор:
- збір тижневого розкладу факультету,
- виявлення конфліктів/вікон/дублів,
- оптимізаційні сценарії,
- експорт.

## 2.9 `course-live.html`
Оперативний “день по курсам”:
- ручне оновлення **тільки по кнопці** `Оновити зараз`,
- matrix heatmap,
- конфлікти аудиторій,
- навантаження та вікна викладачів,
- порівняння двох дат,
- режим “тільки зміни”,
- пресети фільтрів,
- журнал дій.

---

## 3. Frontend архітектура по модулях

## 3.1 `js/app.js`
Головний оркестратор UI на Vue:
- стан фільтрів/обраного/сутностей/інтервалів дат,
- інтеграція з API-шаром,
- інтеграція з report/occupancy/search/admin/notes,
- локальне збереження стану (`localStorage`).

## 3.2 `js/api.js`
Клієнт доступу до `/api/*`:
- формує запити до proxy,
- auto-quoted параметри (`"value"`),
- розбір JSON та JSONP-обгортки,
- dedupe in-flight запитів на фронті,
- in-memory TTL-кеш (`CACHE_TTL_MS = 60s`).

## 3.3 `js/search.js`
Індексація/пошук:
- префіксний індекс для швидкого автопошуку,
- зменшує навантаження проти повного `array.filter` на кожний символ.

## 3.4 `js/occupancy.js` + `js/workers/occupancy-worker.js`
Скан зайнятості аудиторій:
- обчислення винесено у worker (щоб не блокувати UI),
- експорт результатів у XLSX.

## 3.5 `js/report.js`
Робота зі звітом:
- запуск job через backend,
- опитування статусу,
- завантаження результату.

## 3.6 `js/session-*.js`
- `session-page.js` — фільтри/таблиця/експорт session.
- `session-admin.js` — upload/керування session наборами.
- `session-constructor.js` — редактор/конфлікти/валідація/експорт.
- `session-prep.js` — формування таблиці для сесії з розкладу.

## 3.7 `js/course-live.js`
Оперативний екран по курсам:
- чекбокси факультет/форма/курс,
- ручний reload,
- heatmap + quality + conflict panels,
- compare mode + presets + export.

---

## 4. Backend API (`api/index.js`) — детально

## 4.1 Загальна роль
Єдиний серверний вхід:
- proxy до зовнішнього API розкладу,
- адмін-ендпоінти (times/links/session),
- генерація звітів через чергу,
- кешування, аудит, версії, monitor.

## 4.2 Конфіг і security
- `ADMIN_PASSWORD`:
  - production: має бути встановлений і >= 8 символів,
  - dev fallback: `admin123`.
- `VUZ_ID` (default `11927`).
- `RATE_LIMITS`:
  - `adminPost`: 20/хв на IP,
  - `proxy`: 120/хв на IP.

У відповіді додаються заголовки:
- `X-RateLimit-Limit`,
- `X-RateLimit-Remaining`,
- `X-RateLimit-Reset`,
- при ліміті: `429` + `Retry-After`.

## 4.3 Кешування proxy
- In-memory cache: `proxyCache` (`Map`).
- Optional external cache:
  - Vercel KV (`KV_REST_API_URL`, `KV_REST_API_TOKEN`),
  - Redis (`REDIS_URL`).
- TTL:
  - `default`: 5 хв,
  - `schedule`: 3 хв.
- Dedupe одночасних запитів:
  - `inFlightProxyRequests` + `getOrCreateInFlightProxy`.
- Нормалізація cache key:
  - `normalizeProxyCacheKey` прибирає `callback` і `_`.

## 4.4 Черга звітів
- `JobQueue` (`api/job-queue.js`), concurrency = 2.
- `reportJobs` Map + TTL.
- endpoints:
  - `POST /api/report/start`
  - `GET /api/report/status?jobId=...`
  - `GET /api/report/download?jobId=...`

## 4.5 Аудит і версійність
- `appendAuditEvent`:
  - пише `action`, `scope`, `ip`, `userAgent`, `meta`.
- `saveVersion`:
  - зберігає hash/size/timestamp для scope.
- `appendMonitorEvent`:
  - журнал технічних подій.

Storage keys:
- `audit_log`
- `versions:<scope>`
- `monitor:events`

## 4.6 Session data
- `GET /api/session` — отримати сесії.
- `POST /api/session` — зберегти/оновити (admin).
- fallback file: `data/session-2025-26.json`.

## 4.7 Times/Links
- `GET /api/times` / `POST /api/times`
- `GET /api/links` / `POST /api/links`

## 4.8 Monitor, Audit, Versions, Health
- `GET /api/monitor`
- `POST /api/monitor/log`
- `GET /api/audit`
- `GET /api/versions`
- `GET /api/health`

## 4.9 Proxy маршрут
- `GET /api/<action>` (наприклад `GetScheduleDataX`, `GetStudyGroups`, `GetEmployees`, інші).
- API може відповідати JSONP-обгорткою — backend/фронт це парсить.

---

## 5. Дані: що беруть функції і що повертають

## 5.1 Типовий життєвий цикл “розклад на день”
1. Завантаження фільтрів: `GetStudentScheduleFiltersData`.
2. По вибраним факультет/форма/курс:
   - `GetStudyGroups` для отримання груп.
3. По кожній групі:
   - `GetScheduleDataX` на дату/діапазон.
4. Нормалізація:
   - `discipline`, `teacher`, `room`,
   - `pair/start/end/label`.
5. Рендер і аналітика.

## 5.2 Нормалізація
Зазвичай виконується:
- `clean()` — чистка HTML/пробілів.
- нормалізація назв дисциплін (видалення технічних префіксів).
- split/merge викладачів по роздільниках (`;`, `,`, `/`, `та`).

## 5.3 Виявлення конфліктів (session constructor)
Базові правила:
- у групи не може бути 2 іспити в один день/час;
- у викладача не може бути 2 іспити в один день/час;
- одна аудиторія не може мати 2 іспити одночасно.

---

## 6. Кнопки і дії “куди натискати”

## 6.1 Якщо треба завантажити нові дані сесії з DOCX
`session-admin.html`:
1. Введіть пароль.
2. Вкажіть назву сесії + форму.
3. Додайте файли.
4. `Розпарсити`.
5. `Завантажити в API`.

## 6.2 Якщо треба вручну поправити сесію
`session-constructor.html`:
1. Завантажте набір з API.
2. Відредагуйте рядки.
3. Перевірте блок конфліктів.
4. Збережіть у API або експортуйте в Excel.

## 6.3 Якщо треба “оперативний зріз по курсам”
`course-live.html`:
1. Виберіть дату/фільтри.
2. Натисніть `Оновити зараз`.
3. За потреби:
   - `Знайти вікна`,
   - `Порівняти з датою`,
   - `Експорт поточного`.

---

## 7. Експорти

## 7.1 Excel
- На головній: експорт звітів.
- Session pages: експорт відфільтрованих таблиць.
- Builder: експорт матриць/оптимізованого розкладу.
- Course Day: експорт поточного filtered state.

## 7.2 Calendar
- iCal/Google Calendar доступні з main UI.

---

## 8. Змінні середовища

Обов'язкові для production:
- `ADMIN_PASSWORD`

Рекомендовані:
- `VUZ_ID`
- `REDIS_URL` або `KV_REST_API_URL` + `KV_REST_API_TOKEN`
- `NODE_ENV=production`

---

## 9. Тестування

## 9.1 Наявні тести
- `tests/api.test.js`
- `tests/ui-links-buttons.test.js`
- `tests/smoke-pages.test.js`

## 9.2 Команди
```bash
npm test -- --runInBand
npm test -- --runInBand --detectOpenHandles
npm run test:smoke
```

## 9.3 Перевірка кодування (UTF-8)
```bash
npm run lint:encoding
```

---

## 10. Runbook (експлуатація)

## 10.1 Після деплою
1. Перевірити `GET /api/health`.
2. Відкрити: `index.html`, `index2.html`, `session.html`, `session-admin.html`, `session-constructor.html`, `course-live.html`.
3. Зробити `Ctrl+F5` (кеш браузера).

## 10.2 Якщо POST admin дає 401/403
1. Перевірити `ADMIN_PASSWORD` у Vercel env.
2. Перевірити фактичний пароль, що вводиться у формі.
3. Перевірити, чи не блокує rate-limit.

## 10.3 Якщо “дані не оновились”
1. Перевірити дату/фільтри.
2. Для `course-live`: натиснути `Оновити зараз` (автооновлення вимкнено).
3. Очистити кеш і перезавантажити.

## 10.4 Якщо “пустий список/немає груп”
1. Перевірити факультет + форму + курс.
2. Перевірити API-доступність.
3. Подивитись monitor/audit маршрути.

---

## 11. Обмеження поточної версії

- Частина зовнішніх API-відповідей нестабільна/JSONP-формат, тому є захисний парсинг.
- Якість даних залежить від джерела (різні написання ПІБ, кімнат, типів).
- Для великих обсягів потрібні Redis/KV для стабільного кешу.

---

## 12. Рекомендовані покращення (технічний backlog)

1. Винести схеми payload у типізований шар (JSDoc/TS).
2. Додати контрактні API-тести на всі admin routes.
3. Уніфікувати нормалізацію ПІБ у shared utility.
4. Додати “explain conflict” об'єкт у response сonstructor.
5. Додати server-side session registry endpoint з пагінацією.
6. Ввести export-профілі (деканат, кафедра, студентський).

---

## 13. Пов’язані файли документації

- Базова інструкція: `USER_GUIDE.md`
- Швидка PDF-версія: `USER_GUIDE_PDF.html`
- Поточний файл (розширений): `TECHNICAL_MANUAL_FULL.md`

