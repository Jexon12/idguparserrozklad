# Schedule Viewer

Мобільно-орієнтований вебдодаток для перегляду розкладу університету, порівняння груп/викладачів, сканування зайнятості аудиторій та експорту.

## Основні можливості

### Розклад
- Перегляд розкладу для `груп` і `викладачів`.
- Декілька активних сутностей одночасно (порівняння).
- Відображення у режимах `картки` і `таблиця`.
- Підсвітка поточної пари + прогрес заняття.
- Швидка навігація по тижнях.
- Фільтр дисциплін/викладачів.
- Фільтр типу пари (лекція, практика, лабораторна тощо).
- Фільтр формату: `усі / тільки офлайн / тільки онлайн`.

### Обране і шеринґ
- Обране для груп/викладачів.
- Швидке перемикання між обраними.
- Шеринґ набору обраних через hash-посилання `#favset=...`.
- Імпорт обраного з посилання при відкритті сторінки.

### Сповіщення і автооновлення
- Browser notifications: нагадування за `15` і `5` хв до пари.
- Push-повідомлення про знайдені зміни після автооновлення.
- Дайджест скасованих/перенесених пар на сьогодні.
- Автооновлення розкладу з налаштовуваним інтервалом.

### Історія змін
- Лог змін розкладу: аудиторія/пара, хто і коли змінився.
- Модальне вікно перегляду історії.
- Очищення історії.

### Аналітика
- Статистика по розкладу:
  - загальна кількість пар,
  - розподіл за типами,
  - топ дисциплін,
  - кількість “вікон”.
- Додаткова аналітика:
  - середнє навантаження за день,
  - найзавантаженіший/найлегший день,
  - найчастіші пари.
- Блок виявлення конфліктів розкладу між активними сутностями.

### Аудиторії (occupancy)
- Скан зайнятості аудиторій за датою.
- Експорт зайнятості в Excel.
- Режим `вільні аудиторії зараз`.
- Скан виконується у Web Worker (UI не блокується).

### Нотатки і адмін-функції
- Локальні нотатки до пар.
- Централізовані посилання (курс/онлайн-пара) через адмінку.
- Глобальне налаштування часу пар для всіх користувачів (через API).
- Аліаси назв (кастомні short-name для дисциплін/викладачів).

### Експорт
- Excel (розклад/зайнятість).
- iCal (`.ics`).
- Додавання найближчої пари в Google Calendar.

### Mobile UI
- Окремий мобільний інтерфейс: `index2.html`.
- Автоперехід на мобільну версію для телефонів.
- Перемикачі режимів у нижній навігації.
- Картка “Сьогодні/Завтра” для швидкого огляду.

### Розклад сесії
- Окрема сторінка `session.html` з табличним переглядом сесії.
- Фільтри: `сесія`, `форма навчання (денна/заочна)`, `група`, `викладач`, `тип контролю`, `дисципліна`, `дата`.
- Дані зберігаються у `data/session-2025-26.json`.
- Є скрипт конвертації Word у JSON: `scripts/extract_session_docx.py`.
- `session-admin.html` дозволяє завантажувати декілька `.docx`, автоматично парсити їх у браузері та зберігати у `/api/session` (потрібен `ADMIN_PASSWORD`).
- Якщо завантажувати файли з тією ж назвою сесії, дані додаються до існуючої сесії (без перезапису).

## Продуктивність

- Серверний кеш для proxy-запитів (in-memory + Redis/KV за наявності).
- Дедуплікація одночасних proxy-запитів на сервері.
- Кеш і дедуплікація API-викликів на клієнті.
- Префіксний індекс для пошуку (швидше за повний фільтр на кожен символ).
- Lazy-loading рідкісних модулів (`report.js`, `occupancy.js`).
- Brotli/gzip для статики, ETag, Cache-Control.
- Service Worker з оновленим cache-version.

## Архітектура

### Frontend
- `index.html` — desktop/main UI.
- `index2.html` — mobile-first UI.
- `js/app.js` — головний Vue-додаток (оркестрація модулів).
- `js/api.js` — API client + кеш/дедуп.
- `js/search.js` — пошук і префіксний індекс.
- `js/occupancy.js` — UI-логіка сканування аудиторій.
- `js/workers/occupancy-worker.js` — worker для важкого сканування.
- `js/report.js` — генерація звіту (lazy).
- `js/admin.js`, `js/notes.js`, `js/utils.js` — додаткові модулі.

### Backend
- `api/index.js` — Vercel serverless API (proxy, кеші, report, admin routes).
- `api/job-queue.js` — проста черга задач для важких фонових обчислень (report).
- `server.js` — локальний HTTP-сервер для dev/standalone запуску.
- `vercel.json` — rewrites + cache headers.

## API (основні маршрути)

- `GET /api/health` — healthcheck.
- `GET /api/monitor` — стан черги/останні monitor-події.
- `POST /api/monitor/log` — прийом frontend-помилок/метрик.
- `GET /api/audit?limit=...` — журнал admin-дій.
- `GET /api/versions?scope=session|times|links` — метадані версій змін.
- `POST /api/cache/invalidate` — ручна інвалідація кешу (`scope: proxy|all`, admin).
- `GET /api/times` — отримати глобальні часи пар.
- `POST /api/times` — зберегти глобальні часи (admin).
- `GET /api/links` — отримати глобальні посилання.
- `POST /api/links` — зберегти посилання (admin).
- `GET /api/search?q=...` — серверний пошук (кешований).
- `GET /api/session` — отримати актуальні дані сесії.
- `POST /api/session` — зберегти нові дані сесії (admin).
- `POST /api/report/start` — старт генерації Excel-звіту.
- `GET /api/report/status?jobId=...` — статус генерації.
- `GET /api/report/download?jobId=...` — завантажити файл звіту.
- `GET /api/occupancy?date=YYYY-MM-DD` — читання кешу зайнятості.
- `POST /api/occupancy` — запис кешу зайнятості.
- `GET /api/<action>` — proxy до зовнішнього API (з кешем і rate-limit).

## Змінні середовища

Рекомендовані змінні:

- `ADMIN_PASSWORD` — пароль адміна (обов'язково для production).
- `VUZ_ID` — ID закладу (за замовчуванням `11927`).
- `REDIS_URL` — Redis для серверного кешу (optional).
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` — Vercel KV (optional).
- `NODE_ENV` — `production`/`development`.

## Локальний запуск

```bash
npm install
npm run build:css
npm start
```

За замовчуванням локально піднімається `http://localhost:3001`.

Розробка стилів Tailwind:

```bash
npm run watch:css
```

Тести:

```bash
npm test -- --runInBand --forceExit
```

Smoke-тести (pages + health):

```bash
npm run test:smoke
```

Перевірка кодування (mojibake):

```bash
npm run lint:encoding
```

## Деплой (Vercel)

1. Пуш у GitHub.
2. Імпорт репозиторію у Vercel.
3. Додати env vars (`ADMIN_PASSWORD` мінімум).
4. Деплой.

## Mobile/Desktop routing

- За замовчуванням на мобільних `index.html` перенаправляє на `index2.html`.
- Примусовий desktop: `?desktop=1`.
- Примусовий mobile: `?mobile=1`.

## PWA / кешування

- `sw.js` використовується для кешування статики.
- При великих змінах фронтенду піднімайте версію cache key у `sw.js`.
- У випадку “старого” UI: `Unregister Service Worker` + hard reload.

## Відомі моменти

- Tailwind зібраний локально через CLI в `css/tailwind.generated.css`. Після зміни класів у HTML/JS запускайте `npm run build:css` (або `npm run watch:css` під час розробки).
- Частина тестового виводу містить debug-логи API (це очікувано для поточної конфігурації).

## Runbook (оператор)

### Швидка перевірка після деплою
1. `GET /api/health` має повертати `status: ok`.
2. `GET /api/monitor` — перевірити, що `reportQueue.active/queued` в адекватних межах.
3. Відкрити `index.html`, `index2.html`, `builder.html`, `session.html`, `smart.html`.
4. Зробити hard reload (`Ctrl+F5`) при підозрі на старий JS/SW кеш.

### Якщо admin-збереження не працює
1. Перевірити `ADMIN_PASSWORD` в env.
2. Подивитись `GET /api/audit?limit=50` на події `admin_auth_failed`.
3. Для production перевірити доступність `REDIS_URL` або Vercel KV.

### Якщо звіти “зависли”
1. Перевірити `GET /api/monitor` — `reportQueue.queued`.
2. Перевірити `GET /api/report/status?jobId=...`.
3. Перезапустити деплой, якщо є накопичені помилки мережі зовнішнього API.

### Відстеження змін даних
- `GET /api/versions?scope=times`
- `GET /api/versions?scope=links`
- `GET /api/versions?scope=session`


## Корисні файли

- [index.html](C:\Users\0009\.gemini\antigravity\scratch\schedule-viewer\index.html)
- [index2.html](C:\Users\0009\.gemini\antigravity\scratch\schedule-viewer\index2.html)
- [js/app.js](C:\Users\0009\.gemini\antigravity\scratch\schedule-viewer\js\app.js)
- [api/index.js](C:\Users\0009\.gemini\antigravity\scratch\schedule-viewer\api\index.js)
- [server.js](C:\Users\0009\.gemini\antigravity\scratch\schedule-viewer\server.js)
- [vercel.json](C:\Users\0009\.gemini\antigravity\scratch\schedule-viewer\vercel.json)
