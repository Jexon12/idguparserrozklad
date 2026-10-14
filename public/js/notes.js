/**
 * Schedule Viewer — Notes Module
 * CRUD operations for lesson notes.
 */
window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
    SA.getNoteKey = (lesson, date, time) => {
        const normalize = value => String(value || '').trim().toLocaleLowerCase('uk-UA');
        return 'note:v2:' + JSON.stringify([
            lesson.entityType || '', lesson.entityId, date,
            String(time || '').match(/\d+/)?.[0] || time,
            normalize(lesson.discipline), normalize(lesson.type || lesson.study_type),
            normalize(lesson.group || lesson.contingent || lesson.study_group || lesson.groupName)
        ]);
    };
    const legacyKey = (lesson, date, time) => `${lesson.entityId}_${date}_${time}`;
    const noteValue = (lesson, date, time, refs) => {
        const key = SA.getNoteKey(lesson, date, time);
        return Object.prototype.hasOwnProperty.call(refs.notesMap.value, key)
            ? refs.notesMap.value[key] : refs.notesMap.value[legacyKey(lesson, date, time)];
    };

    SA.openNote = (lesson, date, time, refs) => {
        const key = SA.getNoteKey(lesson, date, time);
        refs.currentNoteKey.value = key;
        refs.currentNoteTitle.value = `${lesson.discipline} (${date}, ${time})`;
        refs.noteText.value = noteValue(lesson, date, time, refs) || '';
        refs.showNoteModal.value = true;
    };

    SA.saveNote = (refs) => {
        if (!refs.noteText.value.trim()) {
            // Empty override prevents a legacy note from reappearing after deletion.
            refs.notesMap.value[refs.currentNoteKey.value] = '';
        } else {
            refs.notesMap.value[refs.currentNoteKey.value] = refs.noteText.value;
        }
        refs.saveState();
        refs.showNoteModal.value = false;
    };

    SA.hasNote = (lesson, date, time, refs) => {
        return !!noteValue(lesson, date, time, refs);
    };

    SA.deleteNote = (key, refs) => {
        if (key.startsWith('note:v2:')) refs.notesMap.value[key] = '';
        else delete refs.notesMap.value[key];
        refs.saveState();
    };
})(window.ScheduleApp);
