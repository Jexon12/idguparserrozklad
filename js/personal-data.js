(function (SA) {
    const fields = {
        favorites: 'schedule_favorites', aliases: 'schedule_aliases_v1',
        numbers: 'schedule_number_overrides', semesterStart: 'schedule_numbering_start'
    };
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const strings = value => object(value) && Object.entries(value).every(([key, text]) =>
        !['__proto__', 'constructor', 'prototype'].includes(key) && typeof text === 'string');
    const preferences = {
        darkMode: ['true', 'false'], schedule_mobile_view: ['minimal', 'expanded'],
        schedule_viewMode: ['cards', 'table'], schedule_user_role_v1: ['student', 'teacher']
    };
    SA.PersonalData = {
        export() {
            const state = JSON.parse(localStorage.getItem(SA.STORAGE_KEY) || '{}');
            const data = { notes: state.notesMap || {} };
            data.settings = {};
            Object.keys(preferences).forEach(key => {
                const value = localStorage.getItem(key);
                if (preferences[key].includes(value)) data.settings[key] = value;
            });
            for (const [field, key] of Object.entries(fields)) {
                const raw = localStorage.getItem(key);
                if (raw !== null) data[field] = field === 'semesterStart' ? raw : JSON.parse(raw);
            }
            return { format: 'schedule-personal-data', version: 1, createdAt: new Date().toISOString(), data };
        },
        validate(backup) {
            if (!backup || backup.format !== 'schedule-personal-data' || backup.version !== 1 || !object(backup.data)) throw new Error('Невідомий формат резервної копії');
            const data = backup.data;
            if (!strings(data.notes || {})) throw new Error('Некоректні нотатки');
            if (data.aliases && !strings(data.aliases)) throw new Error('Некоректні назви');
            if (data.numbers && (!object(data.numbers) || !Object.entries(data.numbers).every(([key, value]) => !['__proto__', 'constructor', 'prototype'].includes(key) && Number.isInteger(value) && value > 0 && value <= 999))) throw new Error('Некоректні номери');
            if (data.semesterStart && (!/^\d{4}-\d{2}-\d{2}$/.test(data.semesterStart) || !Number.isFinite(Date.parse(data.semesterStart)) || new Date(data.semesterStart).toISOString().slice(0, 10) !== data.semesterStart)) throw new Error('Некоректна дата');
            if (data.settings && (!object(data.settings) || !Object.entries(data.settings).every(([key, value]) => Object.prototype.hasOwnProperty.call(preferences, key) && preferences[key].includes(value)))) throw new Error('Некоректні налаштування');
            if (data.favorites && (!Array.isArray(data.favorites) || !data.favorites.every(item => object(item) && typeof item.id === 'string' && typeof item.name === 'string' && ['Група', 'Викладач'].includes(item.type)))) throw new Error('Некоректне обране');
            return data;
        },
        restore(backup) {
            const data = this.validate(backup);
            const state = JSON.parse(localStorage.getItem(SA.STORAGE_KEY) || '{}');
            const updates = new Map([[SA.STORAGE_KEY, JSON.stringify({ ...state, notesMap: { ...(state.notesMap || {}), ...(data.notes || {}) } })]]);
            Object.entries(data.settings || {}).forEach(([key, value]) => updates.set(key, value));
            for (const [field, key] of Object.entries(fields)) {
                if (!(field in data)) continue;
                let value = data[field];
                if (['aliases', 'numbers'].includes(field)) value = { ...JSON.parse(localStorage.getItem(key) || '{}'), ...value };
                if (field === 'favorites') {
                    const items = new Map(JSON.parse(localStorage.getItem(key) || '[]').concat(value).map(item => [JSON.stringify([item.type, item.id]), item]));
                    value = [...items.values()];
                }
                updates.set(key, field === 'semesterStart' ? value : JSON.stringify(value));
            }
            const previous = new Map([...updates.keys()].map(key => [key, localStorage.getItem(key)]));
            try { updates.forEach((value, key) => localStorage.setItem(key, value)); }
            catch (error) {
                previous.forEach((value, key) => { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); });
                throw error;
            }
        }
    };
})(window.ScheduleApp);
