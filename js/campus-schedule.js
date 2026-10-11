/* FUAID schedule presentation. Original rows remain available for notes and numbering. */
(function (root) {
    'use strict';
    const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('uk');
    const teacherInitials = name => {
        const parts = String(name || '').trim().split(/\s+/);
        return parts.length > 1 ? `${parts[1][0] || ''}${parts[0][0] || ''}`.toLocaleUpperCase('uk') : (parts[0] || '?').slice(0, 2).toLocaleUpperCase('uk');
    };
    const shortTeacher = name => {
        const parts = String(name || '').trim().split(/\s+/);
        return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : name || 'Викладача не вказано';
    };
    function kind(type) {
        const text = normalize(type);
        if (text.includes('лек')) return 'lecture';
        if (text.includes('лаб')) return 'lab';
        if (text.includes('конс')) return 'consult';
        if (text.includes('практ') || text.includes('семін')) return 'practice';
        return 'other';
    }
    function teacherColor(name) {
        let hash = 0;
        for (const c of normalize(name)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
        return ['#647c4a', '#7e6390', '#477d89', '#8b5c65', '#6965a1', '#947445'][hash % 6];
    }
    function aggregateDays(days, numberFor = () => null) {
        return days.map(day => ({ ...day, slots: day.slots.map(slot => {
            const rows = new Map();
            slot.lessons.forEach(lesson => {
                // Distinct lesson numbers, delivery links and statuses must not be collapsed.
                const key = JSON.stringify([day.date, slot.start, slot.end, slot.time, normalize(lesson.discipline), normalize(lesson.teacher), normalize(lesson.cabinet), normalize(lesson.type), numberFor(lesson), lesson.hasOnline, lesson.statusFlags]);
                let combined = rows.get(key);
                if (!combined) {
                    combined = { ...lesson, displayKey: key, groups: [], sourceLessons: [] };
                    rows.set(key, combined);
                }
                String(lesson.group || (lesson.entityType === 'Група' ? lesson.entityName : '') || '').split(/[,;]/).map(g => g.trim()).filter(Boolean).forEach(g => {
                    if (!combined.groups.includes(g)) combined.groups.push(g);
                });
                combined.sourceLessons.push(lesson);
                combined.group = combined.groups.join(', ');
            });
            return { ...slot, lessons: [...rows.values()] };
        }) }));
    }
    const minutes = time => {
        if (!/^\d{1,2}:\d{2}$/.test(String(time || ''))) return null;
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    };
    const physicalRoom = value => {
        const room = normalize(value);
        return !room || ['—', '-', 'не вказано'].includes(room) || /^(https?:\/\/|google meet|zoom|teams|онлайн|online|дистанц)/.test(room) ? '' : room;
    };
    function findConflicts(days) {
        const result = new Map();
        days.forEach(day => {
            const rows = day.slots.flatMap(slot => slot.lessons.filter(l => !l.isCancelled).map(lesson => ({ lesson, start: minutes(slot.start), end: minutes(slot.end) })));
            for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
                const a = rows[i], b = rows[j];
                if (a.start === null || b.start === null || a.end === null || b.end === null || a.start >= b.end || b.start >= a.end) continue;
                const reasons = [];
                if (normalize(a.lesson.teacher) && normalize(a.lesson.teacher) === normalize(b.lesson.teacher)) reasons.push('Викладач має два заняття одночасно');
                if (physicalRoom(a.lesson.cabinet) && physicalRoom(a.lesson.cabinet) === physicalRoom(b.lesson.cabinet)) reasons.push(`Збіг аудиторії ${a.lesson.cabinet}`);
                if (reasons.length) [a, b].forEach(row => result.set(row.lesson.displayKey, [...new Set([...(result.get(row.lesson.displayKey) || []), ...reasons])]));
            }
        });
        return result;
    }
    function rangeDays(start, end, days) {
        const result = [], date = new Date(`${start}T12:00:00`), last = new Date(`${end}T12:00:00`);
        if (!Number.isFinite(+date) || !Number.isFinite(+last)) return days;
        for (let i = 0; date <= last && i < 90; i++, date.setDate(date.getDate() + 1)) {
            const key = [date.getDate(), date.getMonth() + 1, date.getFullYear()].map((n, i) => i < 2 ? String(n).padStart(2, '0') : n).join('.');
            const existing = days.find(d => d.date === key);
            if ([0, 6].includes(date.getDay()) && !existing) continue;
            result.push(existing || { date: key, dayName: ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота'][date.getDay()], slots: [] });
        }
        return result;
    }
    const model = { kind, teacherInitials, shortTeacher, teacherColor, aggregateDays, findConflicts, rangeDays };
    if (typeof module !== 'undefined' && module.exports) module.exports = model;
    if (!root || !root.Vue) return;
    const SA = root.ScheduleApp = root.ScheduleApp || {};
    SA.CampusSchedule = model;
    const Icon = {
        props: ['name'],
        render() {
            const node = root.lucide?.icons[this.name];
            return node ? Vue.h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, node[2].map(([tag, attrs]) => Vue.h(tag, attrs))) : Vue.h('span');
        }
    };
    const Lesson = {
        components: { CampusIcon: Icon },
        props: ['lesson', 'slot', 'date', 'density', 'week', 'issues', 'active', 'progress', 'numberFor', 'noted', 'noteLesson', 'courseUrl', 'onlineUrl', 'admin'],
        emits: ['history', 'note', 'hide', 'number', 'admin'],
        data: () => ({ revealConflict: false }),
        methods: { shortTeacher, teacherInitials, teacherColor, kind, source() { return this.lesson.sourceLessons[0]; } },
        template: `<article class="lesson-card campus-lesson" :class="['kind-'+kind(lesson.type), { 'campus-min': density === 'minimal', 'campus-conflict': issues.length }]" :data-campus-key="lesson.displayKey">
          <div v-if="issues.length && (density === 'expanded' || revealConflict)" class="campus-warning"><campus-icon name="TriangleAlert"/><span>{{ issues.join(' · ') }}</span></div>
          <div v-if="active" class="campus-now"><b>Зараз</b><span>До кінця {{ progress?.timeLeft }} хв</span></div>
          <div class="campus-card-top">
            <span v-if="density === 'expanded'" class="lesson-type campus-type" :title="lesson.type">{{ week ? ({lecture:'Лек.',practice:'Практ.',lab:'Лаб.',consult:'Конс.',other:lesson.type})[kind(lesson.type)] : ({lecture:'Лекція',practice:'Практична',lab:'Лабораторна',consult:'Консультація',other:lesson.type || 'Заняття'})[kind(lesson.type)] }}</span>
            <span v-if="density === 'expanded' && !week" class="campus-number"><button type="button" @click="$emit('number',source())" :aria-label="'Змінити номер заняття: '+lesson.discipline">{{ numberFor(source()) ? '№'+numberFor(source()) : '№—' }}</button></span>
            <span v-if="!week || density === 'minimal'" class="campus-room" :class="{ 'campus-room-missing': !lesson.cabinet }"><campus-icon :name="lesson.cabinet ? 'MapPin' : 'CircleHelp'"/><span>{{ lesson.cabinet || 'Ауд. не вказано' }}</span></span>
            <span class="lesson-teacher campus-teacher" :title="lesson.teacher" :style="{'--teacher-color': teacherColor(lesson.teacher)}"><span class="campus-avatar">{{ teacherInitials(lesson.teacher) }}</span><span v-if="!week" class="campus-teacher-name">{{ shortTeacher(lesson.teacher) }}</span></span>
            <button v-if="issues.length" type="button" class="campus-warning-button" :aria-label="issues.join(' · ')" :aria-expanded="revealConflict" @click="revealConflict=!revealConflict"><campus-icon name="TriangleAlert"/></button>
            <details class="campus-menu"><summary aria-label="Дії із заняттям"><campus-icon name="Ellipsis"/></summary><div class="campus-menu-pop">
              <button type="button" @click="$emit('note',noteLesson)"><campus-icon name="StickyNote"/>{{ noted ? 'Редагувати нотатку' : 'Нотатка' }}</button>
              <button type="button" @click="$emit('hide',lesson.discipline)"><campus-icon name="EyeOff"/>Приховати предмет</button>
              <button type="button" @click="$emit('number',source())">Змінити номер</button>
              <a v-if="courseUrl" :href="courseUrl" target="_blank" rel="noopener noreferrer">Курс</a><a v-if="onlineUrl" :href="onlineUrl" target="_blank" rel="noopener noreferrer">Онлайн</a>
              <button v-if="admin" type="button" @click="$emit('admin',source())">Редагувати посилання</button>
            </div></details>
          </div>
          <div v-if="week && density === 'expanded'" class="campus-week-meta"><span class="campus-room" :class="{'campus-room-missing':!lesson.cabinet}">{{ lesson.cabinet || 'Ауд. не вказано' }}</span><span>№{{ numberFor(source()) || '—' }}</span></div>
          <div class="campus-card-body"><h4><button type="button" class="lesson-history-trigger" @click="$emit('history',source())" :aria-label="'Попередні заняття: '+lesson.discipline" :title="lesson.discipline">{{ lesson.discipline }}</button></h4><div class="campus-groups"><span v-for="group in lesson.groups" :key="group">{{ group }}</span></div></div>
          <schedule-status-badges v-if="lesson.statusFlags" :flags="lesson.statusFlags" compact/>
          <span v-if="noted" class="campus-note-mark"><campus-icon name="StickyNote"/>Є нотатка</span>
          <div v-if="active" class="campus-progress" aria-hidden="true"><div :style="{width:progress?.percent+'%'}"></div></div>
        </article>`
    };
    const Board = {
        components: { CampusLesson: Lesson, CampusIcon: Icon, ScheduleStatusBadges: root.ScheduleStatusBadgesComponent },
        props: ['days', 'conflictDays', 'density', 'view', 'dateStart', 'dateEnd', 'selectedDate', 'times', 'numberFor', 'isActive', 'getProgress', 'hasNote', 'getLink', 'admin', 'entities'],
        emits: ['history', 'note', 'hide', 'number', 'admin', 'select', 'type-filter', 'view'],
        computed: {
            combined() { return aggregateDays(this.days, this.numberFor); },
            calendar() { return rangeDays(this.dateStart, this.dateEnd, this.combined); },
            issues() { return findConflicts(aggregateDays(this.conflictDays || this.days, this.numberFor)); },
            chosenDate() { return this.calendar.some(d => d.date === this.selectedDate) ? this.selectedDate : this.combined[0]?.date || this.calendar[0]?.date; },
            chosen() { return this.calendar.find(d => d.date === this.chosenDate); },
            conflictLessons() { return this.combined.flatMap(d => d.slots.flatMap(s => s.lessons.map(l => ({ ...l, date: d.date })))).filter(l => this.issues.has(l.displayKey)); },
            gridRows() {
                const rows = new Map();
                Object.entries(this.times || {}).filter(([pair]) => +pair <= 6).forEach(([pair, time]) => rows.set(String(pair), { key: String(pair), time: pair+' пара', start: time.start, end: time.end }));
                this.combined.forEach(d => d.slots.forEach(s => { const key = String(parseInt(s.time) || s.time); rows.set(key, { ...s, key }); }));
                return [...rows.values()].sort((a, b) => (parseInt(a.key) || 99) - (parseInt(b.key) || 99));
            }
        },
        methods: {
            teacherColor, teacherInitials,
            dayShort(name) { return ({'Понеділок':'Пн','Вівторок':'Вт','Середа':'Ср','Четвер':'Чт',"П'ятниця":'Пт','П’ятниця':'Пт','Субота':'Сб','Неділя':'Нд'})[name] || name.slice(0,2); },
            teachers(day) { return [...new Set(day.slots.flatMap(s => s.lessons.map(l => l.teacher)).filter(Boolean))]; },
            countText(n) { return n+' '+(n===1?'пара':n>=2&&n<=4?'пари':'пар'); },
            slotKey(slot) { return String(parseInt(slot.time) || slot.time); },
            cell(day,row) { return day.slots.filter(s => this.slotKey(s) === row.key).flatMap(s => s.lessons); },
            hasConflict(day) { return day.slots.some(s => s.lessons.some(l => this.issues.has(l.displayKey))); },
            async jumpConflict() {
                const first = this.conflictLessons[0]; if (!first) return;
                this.$emit('select', first.date); await this.$nextTick();
                const card = [...this.$el.querySelectorAll('[data-campus-key]')].find(el => el.dataset.campusKey === first.displayKey);
                const button = card?.querySelector('.campus-warning-button');
                if (button?.getAttribute('aria-expanded') === 'false') button.click();
                card?.scrollIntoView({ block: 'center', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
                button?.focus({ preventScroll: true });
            },
            halves(day) {
                const before = day.slots.filter(s => (parseInt(s.time) || 0) <= 3), after = day.slots.filter(s => (parseInt(s.time) || 0) > 3);
                return before.length && after.length ? [{ label:'До обіду · 1–3 пари', slots:before },{ label:'Після обіду · 4–6 пари', slots:after }] : [{ label:'',slots:day.slots }];
            },
            source(lesson) { return lesson.sourceLessons[0]; },
            lessonProps(lesson, slot, date, week) { return { lesson, slot, date, week, density:this.density, issues:this.issues.get(lesson.displayKey)||[], active:!lesson.isCancelled && this.isActive(date,slot.start,slot.end), progress:this.getProgress(date,slot.start,slot.end), numberFor:this.numberFor, noted:lesson.sourceLessons.some(this.hasNote), noteLesson:lesson.sourceLessons.find(this.hasNote)||this.source(lesson), courseUrl:this.getLink(this.source(lesson),'courseUrl'), onlineUrl:this.getLink(this.source(lesson),'onlineUrl'), admin:this.admin }; }
        },
        template: `<section class="campus-board" aria-label="Розклад занять">
          <nav class="campus-days" aria-label="Швидкий перехід між днями"><button v-for="day in calendar" :key="day.date" type="button" :class="{'is-selected':chosenDate===day.date,'is-empty':!day.slots.length}" :aria-pressed="chosenDate===day.date" @click="$emit('select',day.date)"><span><span>{{ dayShort(day.dayName) }}</span><strong>{{ day.date.slice(0,2) }}</strong></span><span class="campus-day-info"><span>{{ day.slots.length ? countText(day.slots.length) : '—' }}<campus-icon v-if="hasConflict(day)" name="TriangleAlert" class="campus-day-alert"/></span><span class="campus-day-dots"><i v-for="teacher in teachers(day)" :key="teacher" :style="{background:teacherColor(teacher)}" :title="teacher"/></span></span></button></nav>
          <a v-if="conflictLessons.length" href="#campus-conflicts" class="campus-conflict-link" @click.prevent="jumpConflict"><campus-icon name="TriangleAlert"/>Конфліктні заняття: {{ conflictLessons.length }} · перейти до першого</a>
          <div class="campus-legend" role="group" aria-label="Фільтр типу заняття"><button v-for="k in [{key:'лекц',kind:'lecture',label:'Лекція'},{key:'практ',kind:'practice',label:'Практична'},{key:'лаб',kind:'lab',label:'Лабораторна'},{key:'консульт',kind:'consult',label:'Консультація'}]" :key="k.key" type="button" :class="'kind-'+k.kind" @click="$emit('type-filter',k.key)"><i/>{{k.label}}</button><button type="button" @click="$emit('type-filter','')">Усі типи</button></div>
          <div v-if="view!=='table' && chosen" class="schedule-day" :data-schedule-date="chosen.date"><header class="campus-day-heading"><h3>{{chosen.dayName}}, {{chosen.date}}</h3><span>{{countText(chosen.slots.length)}} · {{chosen.slots.reduce((n,s)=>n+s.lessons.length,0)}} занять</span></header>
            <div v-if="!chosen.slots.length" class="campus-empty">На цей день занять немає.</div>
            <div v-else class="campus-halves" :class="{'campus-two-halves':halves(chosen).length===2}"><section v-for="half in halves(chosen)" :key="half.label"><h4 v-if="half.label" class="campus-half-heading">{{half.label}}</h4><div v-for="slot in half.slots" :key="slot.time" class="schedule-slot campus-slot"><div class="schedule-slot-time campus-time"><strong>{{slot.start}}</strong><span>{{slot.end ? '— '+slot.end : ''}}</span><small class="schedule-pair-badge">{{slot.time.split('(')[0].trim()}}</small></div><div class="campus-lessons"><campus-lesson v-for="lesson in slot.lessons" :key="lesson.displayKey" v-bind="lessonProps(lesson,slot,chosen.date,false)" @history="$emit('history',$event)" @note="$emit('note',$event)" @hide="$emit('hide',$event)" @number="$emit('number',$event)" @admin="$emit('admin',$event)"/></div></div></section></div>
          </div>
          <div v-else-if="view==='table'" class="campus-week-wrap"><table class="campus-week-grid" :style="{'--days':calendar.length}" aria-label="Тижневий розклад: рядок — пара, колонка — день"><colgroup><col class="campus-time-col"><col v-for="day in calendar" :key="day.date"></colgroup><thead><tr><th scope="col">Пара</th><th v-for="day in calendar" :key="day.date" scope="col">{{dayShort(day.dayName)}} · {{day.date.slice(0,2)}}<small>{{countText(day.slots.length)}}</small></th></tr></thead><tbody><tr v-for="row in gridRows" :key="row.key"><th scope="row" class="campus-time"><strong>{{row.start}}</strong><span>— {{row.end}}</span><small>{{row.time.split('(')[0].trim()}}</small></th><td v-for="day in calendar" :key="day.date" :data-schedule-date="day.date"><div class="campus-lessons"><campus-lesson v-for="lesson in cell(day,row)" :key="lesson.displayKey" v-bind="lessonProps(lesson,row,day.date,true)" @history="$emit('history',$event)" @note="$emit('note',$event)" @hide="$emit('hide',$event)" @number="$emit('number',$event)" @admin="$emit('admin',$event)"/><span v-if="!cell(day,row).length" class="campus-week-empty">—</span></div></td></tr></tbody></table></div>
        </section>`
    };
    root.CampusIconComponent = Icon;
    root.CampusScheduleBoardComponent = Board;
})(typeof window !== 'undefined' ? window : null);
