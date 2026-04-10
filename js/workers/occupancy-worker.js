/* eslint-disable no-restricted-globals */
const API_PROXY = '/api/';
const VUZ_ID = 11927;
let shouldStop = false;

function post(type, payload = {}) {
    self.postMessage({ type, ...payload });
}

function buildUrl(action, params = {}) {
    const url = new URL(API_PROXY + action, self.location.origin);
    url.searchParams.append('aVuzID', VUZ_ID);

    if (action === 'GetStudyGroups') {
        url.searchParams.append('aGiveStudyTimes', 'false');
    } else if (!action.startsWith('GetScheduleData') && action !== 'GetEmployees') {
        url.searchParams.append('aGiveStudyTimes', 'true');
    }

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') {
            url.searchParams.append(key, '');
        } else if (typeof value === 'string' && !value.startsWith('"')) {
            url.searchParams.append(key, `"${value}"`);
        } else {
            url.searchParams.append(key, value);
        }
    }

    return url;
}

async function fetchApi(action, params = {}) {
    const url = buildUrl(action, params);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
        const res = await fetch(url, { signal: controller.signal });
        const text = await res.text();
        const jsonpMatch = text.match(/^[a-zA-Z0-9_]+\(([\s\S]*)\);?\s*$/);
        const json = jsonpMatch ? JSON.parse(jsonpMatch[1]) : JSON.parse(text);
        return json.d || json;
    } finally {
        clearTimeout(timeoutId);
    }
}

function normalizeCabinet(cabName) {
    const match = cabName.match(/^(\d+|[a-zA-Zа-яА-Я0-9]+)[-\s]/);
    return match ? match[1] : '?';
}

function sendPartial(cabinetMap) {
    const rows = Object.values(cabinetMap).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    post('partial', { results: rows });
}

async function runScan(payload) {
    shouldStop = false;
    const dateVal = String(payload.occupancyDate || '').split('-').reverse().join('.');
    if (!dateVal || dateVal.length < 8) throw new Error('Невірна дата для сканування');

    post('progress', { current: 0, total: 0, text: 'Отримання параметрів...', errors: 0 });

    let faculties = Array.isArray(payload.faculties) ? payload.faculties : [];
    let courses = Array.isArray(payload.courses) ? payload.courses : [];
    let eduForms = Array.isArray(payload.eduForms) ? payload.eduForms : [];

    if (faculties.length === 0 || courses.length === 0 || eduForms.length === 0) {
        const data = await fetchApi('GetStudentScheduleFiltersData');
        faculties = data?.faculties || [];
        courses = data?.courses || [];
        eduForms = data?.educForms || [];
    }

    if (faculties.length === 0 || courses.length === 0 || eduForms.length === 0) {
        throw new Error('Не вдалося завантажити фільтри для сканування');
    }

    const tasks = [];
    for (const fac of faculties) {
        for (const form of eduForms) {
            for (const course of courses) {
                tasks.push({ fac, form, course });
            }
        }
    }

    post('progress', { current: 0, total: tasks.length, text: 'Збір груп...', errors: 0 });

    let allGroups = [];
    const TASK_CHUNK = 5;
    for (let i = 0; i < tasks.length; i += TASK_CHUNK) {
        if (shouldStop) return post('stopped');
        const chunk = tasks.slice(i, i + TASK_CHUNK);

        const chunkPromises = chunk.map(async ({ fac, form, course }) => {
            try {
                const res = await fetchApi('GetStudyGroups', {
                    aFacultyID: fac.Key,
                    aEducationForm: form.Key,
                    aCourse: course.Key
                });
                return (res?.studyGroups || []).map((g) => ({ ...g, _fac: fac.Value }));
            } catch (e) {
                return [];
            }
        });

        const chunkRes = await Promise.all(chunkPromises);
        chunkRes.forEach((arr) => {
            if (arr.length > 0) allGroups.push(...arr);
        });

        post('progress', {
            current: Math.min(i + TASK_CHUNK, tasks.length),
            total: tasks.length,
            text: `Збір груп: ${Math.min(i + TASK_CHUNK, tasks.length)}/${tasks.length}`,
            errors: 0
        });
    }

    const seenKeys = new Set();
    allGroups = allGroups.filter((g) => {
        if (seenKeys.has(g.Key)) return false;
        seenKeys.add(g.Key);
        return true;
    });

    if (allGroups.length === 0) throw new Error('Не знайдено жодної групи');

    const cabinetMap = {};
    let scanErrors = 0;
    const CHUNK_SIZE = 8;

    post('progress', { current: 0, total: allGroups.length, text: 'Сканування розкладу...', errors: 0 });

    for (let i = 0; i < allGroups.length; i += CHUNK_SIZE) {
        if (shouldStop) return post('stopped');

        const chunk = allGroups.slice(i, i + CHUNK_SIZE);
        const results = await Promise.all(chunk.map(async (group) => {
            try {
                const data = await fetchApi('GetScheduleDataX', {
                    aStudyGroupID: group.Key,
                    aStartDate: dateVal,
                    aEndDate: dateVal,
                    aStudyTypeID: ''
                });
                return { group, data: Array.isArray(data) ? data : [] };
            } catch (e) {
                scanErrors++;
                return { group, data: [] };
            }
        }));

        results.forEach(({ group, data }) => {
            data.forEach((lesson) => {
                if (!lesson.cabinet) return;
                const cabName = String(lesson.cabinet).trim();
                if (!cabName) return;

                const pairStr = String(lesson.study_time || '').split(' ')[0];
                const pairNum = parseInt(pairStr, 10);
                if (Number.isNaN(pairNum)) return;

                if (!cabinetMap[cabName]) {
                    cabinetMap[cabName] = {
                        name: cabName,
                        building: normalizeCabinet(cabName),
                        slots: {}
                    };
                }

                if (!cabinetMap[cabName].slots[pairNum]) {
                    cabinetMap[cabName].slots[pairNum] = {
                        group: group.Value,
                        teacher: lesson.employee_short || lesson.employee || '',
                        discipline: lesson.discipline || ''
                    };
                } else {
                    const existing = cabinetMap[cabName].slots[pairNum];
                    if (!existing.group.includes(group.Value)) {
                        existing.group += ', ' + group.Value;
                    }
                }
            });
        });

        const current = Math.min(i + CHUNK_SIZE, allGroups.length);
        post('progress', {
            current,
            total: allGroups.length,
            text: `Сканування: ${current}/${allGroups.length}`,
            errors: scanErrors
        });

        if (i === 0 || i % (CHUNK_SIZE * 5) === 0 || current >= allGroups.length) {
            sendPartial(cabinetMap);
        }
    }

    const finalResults = Object.values(cabinetMap).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    post('done', { results: finalResults, errors: scanErrors });
}

self.onmessage = async (event) => {
    const { type, payload } = event.data || {};
    if (type === 'stop') {
        shouldStop = true;
        return;
    }

    if (type === 'start') {
        try {
            await runScan(payload || {});
        } catch (err) {
            post('error', { message: err.message || 'Помилка сканування' });
        }
    }
};

