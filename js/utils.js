/**
 * Schedule Viewer — Utility Helpers
 * Shared constants and pure utility functions.
 */
window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
    // --- Constants ---
    const isNode = window.location.port === '3000' || window.location.hostname.includes('vercel.app');
    SA.API_PROXY = isNode ? '/api/' : 'proxy.php?action=';
    SA.VUZ_ID = 11927;
    SA.STORAGE_KEY = 'schedule_app_v1';

    SA.defaultTimes = {
        1: { start: "08:30", end: "09:50" },
        2: { start: "10:00", end: "11:20" },
        3: { start: "12:00", end: "13:20" },
        4: { start: "13:30", end: "14:50" },
        5: { start: "15:00", end: "16:20" },
        6: { start: "16:30", end: "17:50" },
        7: { start: "18:00", end: "19:20" }
    };

    // --- Pure Functions ---
    SA.stripHtml = (str) => (str || '').replace(/<[^>]*>?/gm, '');

    SA.getColorClass = (id) => {
        const colors = [
            'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600',
            'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600',
            'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-600',
            'border-purple-400 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-600',
            'border-pink-400 bg-pink-50 dark:bg-pink-900/20 dark:border-pink-600',
            'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-600',
            'border-teal-400 bg-teal-50 dark:bg-teal-900/20 dark:border-teal-600',
            'border-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 dark:border-cyan-600',
            'border-orange-400 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-600',
            'border-lime-400 bg-lime-50 dark:bg-lime-900/20 dark:border-lime-600',
            'border-rose-400 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-600',
            'border-sky-400 bg-sky-50 dark:bg-sky-900/20 dark:border-sky-600'
        ];
        const num = String(id).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        return colors[num % colors.length];
    };

    /**
     * Get CSS class for lesson type badge.
     */
    SA.getLessonTypeClass = (typeStr) => {
        if (!typeStr) return 'lesson-type-default';
        const t = typeStr.toLowerCase();
        if (t.includes('лекц')) return 'lesson-type-lecture';
        if (t.includes('практ')) return 'lesson-type-practice';
        if (t.includes('лаб')) return 'lesson-type-lab';
        if (t.includes('семін')) return 'lesson-type-seminar';
        if (t.includes('консульт')) return 'lesson-type-consult';
        if (t.includes('індивід')) return 'lesson-type-individual';
        return 'lesson-type-default';
    };

    /**
     * Get emoji icon for lesson type.
     */
    SA.getLessonTypeIcon = (typeStr) => {
        if (!typeStr) return '📄';
        const t = typeStr.toLowerCase();
        if (t.includes('лекц')) return '📘';
        if (t.includes('практ')) return '📗';
        if (t.includes('лаб')) return '🔬';
        if (t.includes('семін')) return '💬';
        if (t.includes('консульт')) return '🤝';
        if (t.includes('індивід')) return '👤';
        return '📄';
    };

    /**
     * Generate iCal event string.
     */
    SA.generateICal = (groupedSchedule, entityName) => {
        let ical = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//ScheduleViewer//UA//UK\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';

        groupedSchedule.forEach(dayData => {
            const [d, m, y] = dayData.date.split('.');
            dayData.slots.forEach(slot => {
                slot.lessons.forEach(lesson => {
                    const startTime = (lesson.timeStart || '08:30').replace(':', '');
                    const endTime = (lesson.timeEnd || '09:50').replace(':', '');
                    const dateStr = `${y}${m}${d}`;
                    const uid = `${dateStr}-${startTime}-${lesson.discipline}@schedule`;

                    ical += 'BEGIN:VEVENT\r\n';
                    ical += `DTSTART:${dateStr}T${startTime}00\r\n`;
                    ical += `DTEND:${dateStr}T${endTime}00\r\n`;
                    ical += `SUMMARY:${lesson.discipline}\r\n`;
                    ical += `DESCRIPTION:${lesson.type || ''}\\n${lesson.teacher || ''}\r\n`;
                    ical += `LOCATION:${lesson.cabinet || ''}\r\n`;
                    ical += `UID:${uid}\r\n`;
                    ical += 'END:VEVENT\r\n';
                });
            });
        });

        ical += 'END:VCALENDAR\r\n';
        return ical;
    };

    /**
     * Build API payload for fetching schedule data.
     * @param {Object} entity - { id, type }
     * @param {Object} refs - { dateStart, dateEnd, selectedStudyType } (Vue refs)
     * @param {Object} options - { startDate, endDate } overrides
     */
    SA.buildSchedulePayload = (entity, refs, options = {}) => {
        const startDate = (options.startDate || refs.dateStart.value).split('-').reverse().join('.');
        const endDate = (options.endDate || refs.dateEnd.value).split('-').reverse().join('.');
        const typeIdParam = refs.selectedStudyType.value ? `"${refs.selectedStudyType.value}"` : "";

        if (entity.type === 'Група') {
            return {
                action: 'GetScheduleDataX',
                payload: { aStudyGroupID: entity.id, aStartDate: startDate, aEndDate: endDate, aStudyTypeID: typeIdParam }
            };
        } else {
            return {
                action: 'GetScheduleDataEmp',
                payload: { aEmployeeID: entity.id, aStartDate: startDate, aEndDate: endDate, aStudyTypeID: typeIdParam }
            };
        }
    };

    /**
     * Normalize text for occupancy search (Latin↔Cyrillic typo correction).
     */
    SA.normalize = (str) => {
        const map = {
            'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'є': 'ye',
            'ж': 'zh', 'з': 'z', 'и': 'y', 'і': 'i', 'ї': 'yi', 'й': 'y',
            'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
            'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh',
            'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ь': '', 'ю': 'yu', 'я': 'ya'
        };
        const typoMap = {
            'a': 'а', 'b': 'б', 'c': 'с', 'e': 'е', 'i': 'і', 'k': 'к',
            'o': 'о', 'p': 'р', 'x': 'х', 'y': 'у', 'h': 'н', 'm': 'м', 't': 'т'
        };

        let result = str.toLowerCase();
        for (const [lat, cyr] of Object.entries(typoMap)) {
            result = result.replace(new RegExp(lat, 'g'), cyr);
        }
        return result;
    };
})(window.ScheduleApp);
