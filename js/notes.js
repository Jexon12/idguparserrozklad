/**
 * Schedule Viewer — Notes Module
 * CRUD operations for lesson notes.
 */
window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
    SA.getNoteKey = (lesson, date, time) => {
        return `${lesson.entityId}_${date}_${time}`;
    };

    SA.openNote = (lesson, date, time, refs) => {
        const key = SA.getNoteKey(lesson, date, time);
        refs.currentNoteKey.value = key;
        refs.currentNoteTitle.value = `${lesson.discipline} (${date}, ${time})`;
        refs.noteText.value = refs.notesMap.value[key] || '';
        refs.showNoteModal.value = true;
    };

    SA.saveNote = (refs) => {
        if (!refs.noteText.value.trim()) {
            delete refs.notesMap.value[refs.currentNoteKey.value];
        } else {
            refs.notesMap.value[refs.currentNoteKey.value] = refs.noteText.value;
        }
        refs.saveState();
        refs.showNoteModal.value = false;
    };

    SA.hasNote = (lesson, date, time, refs) => {
        const key = SA.getNoteKey(lesson, date, time);
        return !!refs.notesMap.value[key];
    };

    SA.deleteNote = (key, refs) => {
        delete refs.notesMap.value[key];
        refs.saveState();
    };
})(window.ScheduleApp);
