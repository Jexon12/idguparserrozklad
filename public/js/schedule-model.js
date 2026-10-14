/** Shared normalized model for schedule records. Browser + CommonJS. */
(function (root, factory) {
    const model = factory();
    if (typeof module === 'object' && module.exports) module.exports = model;
    if (root) {
        root.ScheduleApp = root.ScheduleApp || {};
        root.ScheduleApp.ScheduleModel = model;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const cleanText = (value) => String(value ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[\u0000-\u001f\u200e\u200f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const normalizeDiscipline = (value) => cleanText(value)
        .replace(/^[\d.\-)(]+\s*/g, '')
        .replace(/[;:,]+$/g, '')
        .trim();

    const splitTeachers = (value) => Array.from(new Set(cleanText(value)
        .replace(/([\p{Lu}]\.\s*[\p{Lu}]\.)(?=\s*\p{Lu}\p{Ll})/gu, '$1; ')
        .replace(/\s*(,|\/|\|)\s*/g, '; ')
        .replace(/\s+та\s+/giu, '; ')
        .split(';')
        .map(cleanText)
        .filter(Boolean)));

    const normalizeTeacherName = (value) => cleanText(value)
        .replace(/\s*([.,])\s*/g, '$1 ')
        .replace(/\s+/g, ' ')
        .trim();

    const toLocalIsoDate = (value = new Date()) => {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    const isoToDmy = (value) => {
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
    };

    const dmyToIso = (value) => {
        const match = cleanText(value).match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
        if (!match) return '';
        const day = Number(match[1]);
        const month = Number(match[2]);
        const year = Number(match[3]);
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };

    const parsePairNumber = (lesson) => {
        const direct = Number(lesson?.pair ?? lesson?.pairNumber ?? lesson?.number);
        if (Number.isInteger(direct) && direct > 0 && direct <= 20) return direct;
        const label = cleanText(lesson?.study_time || lesson?.studyTime || lesson?.time || lesson?.label);
        const match = label.match(/(?:^|\D)(\d{1,2})(?:\D|$)/);
        const parsed = match ? Number(match[1]) : 0;
        return parsed > 0 && parsed <= 20 ? parsed : 0;
    };

    const buildingKey = (room) => {
        const normalized = cleanText(room).toLowerCase();
        const explicit = normalized.match(/(?:корпус|корп\.?|к\.)\s*([\p{L}\d-]+)/u);
        if (explicit) return explicit[1];
        const prefix = normalized.match(/^([\p{L}]+)/u);
        return prefix ? prefix[1] : '';
    };

    const normalizeLesson = (raw = {}, context = {}) => {
        const pair = parsePairNumber(raw);
        const configuredTime = context.times?.[pair] || {};
        const dateDmy = cleanText(raw.full_date || raw.date || raw.lessonDate);
        const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(dateDmy) ? dateDmy : dmyToIso(dateDmy);
        const teacher = normalizeTeacherName(raw.employee || raw.teacher || raw.teacherName);
        const room = cleanText(raw.cabinet || raw.room || raw.auditorium);
        const group = cleanText(raw.contingent || raw.group || raw.groupName || context.group);
        const discipline = normalizeDiscipline(raw.discipline || raw.subject);
        return {
            date: dateIso,
            dateDmy: dateIso ? isoToDmy(dateIso) : dateDmy,
            pair,
            start: cleanText(raw.study_time_begin || raw.timeStart || raw.start || configuredTime.start),
            end: cleanText(raw.study_time_end || raw.timeEnd || raw.end || configuredTime.end),
            discipline,
            teacher,
            teachers: splitTeachers(teacher),
            group,
            room,
            building: buildingKey(room),
            type: cleanText(raw.study_type || raw.type),
            online: Boolean(raw.online || /online|онлайн/iu.test(`${room} ${raw.study_type || ''}`)),
            source: cleanText(context.source || raw.source)
        };
    };

    const stableLessonKey = (lesson) => {
        const row = normalizeLesson(lesson);
        return [row.date, row.pair, row.discipline, row.group, row.teacher, row.room]
            .map((value) => cleanText(value).toLowerCase())
            .join('|');
    };

    const getLessonStatusFlags = (lesson = {}) => {
        const statusText = cleanText([
            lesson.status,
            lesson.state,
            lesson.note,
            lesson.comment,
            lesson.description,
            lesson.discipline,
            lesson.study_type,
            lesson.type,
            lesson.cabinet,
            lesson.room
        ].filter(Boolean).join(' '));
        return {
            cancelled: /скас|відмін|анульован|cancel/iu.test(statusText),
            moved: /перенес|переміщ|заміна|reschedul/iu.test(statusText),
            online: Boolean(lesson.online || lesson.onlineUrl || lesson.meetingUrl ||
                /онлайн|online|дистанц|zoom|google\s*meet|microsoft\s*teams/iu.test(statusText))
        };
    };

    const lessonStatusLabel = (lesson) => {
        const flags = getLessonStatusFlags(lesson);
        const labels = [];
        if (flags.cancelled) labels.push('Скасовано');
        if (flags.moved) labels.push('Перенесено');
        if (flags.online) labels.push('Онлайн');
        return labels.join(', ') || 'Без змін';
    };

    const comparisonKey = (lesson, includeDate = true) => {
        const row = normalizeLesson(lesson);
        return [
            includeDate ? row.date : '',
            row.discipline,
            row.teacher,
            row.group,
            row.type
        ].map((value) => cleanText(value).toLowerCase()).join('|');
    };

    const lessonTimeLabel = (lesson) => {
        const row = normalizeLesson(lesson);
        const explicit = cleanText(lesson?.study_time || lesson?.studyTime || lesson?.time);
        const interval = [row.start, row.end].filter(Boolean).join('–');
        return [explicit, interval].filter(Boolean).join(' · ') || (row.pair ? `${row.pair} пара` : '—');
    };

    const compareMatchedLessons = (oldLesson, newLesson) => {
        const oldRow = normalizeLesson(oldLesson);
        const newRow = normalizeLesson(newLesson);
        const base = {
            discipline: newRow.discipline || oldRow.discipline || '—',
            date: newRow.dateDmy || oldRow.dateDmy || '',
            oldLesson,
            newLesson
        };
        const changes = [];
        if (oldRow.date !== newRow.date) {
            changes.push({ ...base, field: 'date', from: oldRow.dateDmy || '—', to: newRow.dateDmy || '—' });
        }
        const oldTime = lessonTimeLabel(oldLesson);
        const newTime = lessonTimeLabel(newLesson);
        if (oldTime !== newTime) {
            changes.push({ ...base, field: 'pair', from: oldTime, to: newTime });
        }
        if (oldRow.room !== newRow.room) {
            changes.push({ ...base, field: 'cabinet', from: oldRow.room || '—', to: newRow.room || '—' });
        }
        const oldStatus = lessonStatusLabel(oldLesson);
        const newStatus = lessonStatusLabel(newLesson);
        if (oldStatus !== newStatus) {
            changes.push({ ...base, field: 'status', from: oldStatus, to: newStatus });
        }
        return changes;
    };

    const compareScheduleVersions = (oldLessons = [], newLessons = []) => {
        const oldPool = (oldLessons || []).map((lesson, index) => ({ lesson, index, matched: false }));
        const newPool = (newLessons || []).map((lesson, index) => ({ lesson, index, matched: false }));
        const changes = [];

        const matchPass = (includeDate) => {
            newPool.forEach((newItem) => {
                if (newItem.matched) return;
                const key = comparisonKey(newItem.lesson, includeDate);
                const oldItem = oldPool.find((candidate) => !candidate.matched && comparisonKey(candidate.lesson, includeDate) === key);
                if (!oldItem) return;
                oldItem.matched = true;
                newItem.matched = true;
                changes.push(...compareMatchedLessons(oldItem.lesson, newItem.lesson));
            });
        };

        matchPass(true);
        matchPass(false);

        oldPool.filter((item) => !item.matched).forEach(({ lesson }) => {
            const row = normalizeLesson(lesson);
            changes.push({
                field: 'removed', from: lessonStatusLabel(lesson), to: 'Видалено',
                discipline: row.discipline || '—', date: row.dateDmy || '', oldLesson: lesson
            });
        });
        newPool.filter((item) => !item.matched).forEach(({ lesson }) => {
            const row = normalizeLesson(lesson);
            changes.push({
                field: 'added', from: 'Не було', to: lessonStatusLabel(lesson),
                discipline: row.discipline || '—', date: row.dateDmy || '', newLesson: lesson
            });
        });

        return changes;
    };

    return {
        cleanText,
        normalizeDiscipline,
        splitTeachers,
        normalizeTeacherName,
        toLocalIsoDate,
        isoToDmy,
        dmyToIso,
        parsePairNumber,
        buildingKey,
        normalizeLesson,
        stableLessonKey,
        getLessonStatusFlags,
        lessonStatusLabel,
        compareScheduleVersions
    };
});
