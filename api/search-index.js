'use strict';

const MAX_PREFIX_LENGTH = 6;

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLocaleLowerCase('uk-UA')
        .replace(/[\s()\-–—_/.,'’`]+/g, '');
}

function addPrefix(prefixes, value, itemIndex) {
    const normalized = normalizeSearchText(value);
    if (!normalized) return;
    const max = Math.min(MAX_PREFIX_LENGTH, normalized.length);
    for (let length = 1; length <= max; length++) {
        const prefix = normalized.slice(0, length);
        if (!prefixes.has(prefix)) prefixes.set(prefix, []);
        prefixes.get(prefix).push(itemIndex);
    }
}

function createSearchIndex(items, builtAt = Date.now()) {
    const normalizedItems = (Array.isArray(items) ? items : []).map((item) => {
        const label = String(item.label || item.value?.Value || '').trim();
        return {
            ...item,
            label,
            _searchKey: normalizeSearchText(label)
        };
    }).filter((item) => item.label && (item.type === 'group' || item.type === 'teacher'));

    const prefixes = new Map();
    normalizedItems.forEach((item, index) => {
        addPrefix(prefixes, item.label, index);
        String(item.label).split(/[\s()\-–—_/.,'’`]+/).forEach((token) => addPrefix(prefixes, token, index));
    });

    return { builtAt, items: normalizedItems, prefixes };
}

function searchIndex(index, query, options = {}) {
    if (!index || !Array.isArray(index.items)) return [];
    const searchKey = normalizeSearchText(query);
    if (!searchKey) return [];
    const type = options.type === 'group' || options.type === 'teacher' ? options.type : '';
    const limit = Math.max(1, Math.min(Number(options.limit) || 10, 25));
    const prefix = searchKey.slice(0, Math.min(MAX_PREFIX_LENGTH, searchKey.length));
    const candidateIndexes = index.prefixes?.get(prefix) || index.items.map((_, itemIndex) => itemIndex);
    const seen = new Set();

    return candidateIndexes
        .map((itemIndex) => index.items[itemIndex])
        .filter(Boolean)
        .filter((item) => !type || item.type === type)
        .filter((item) => item._searchKey.includes(searchKey))
        .sort((a, b) => {
            const aStarts = a._searchKey.startsWith(searchKey) ? 0 : 1;
            const bStarts = b._searchKey.startsWith(searchKey) ? 0 : 1;
            return aStarts - bStarts || a.label.localeCompare(b.label, 'uk-UA');
        })
        .filter((item) => {
            const key = `${item.type}|${item.facultyId || ''}|${item.chairId || ''}|${item.value?.Key || ''}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, limit)
        .map(({ _searchKey, ...item }) => item);
}

async function mapWithConcurrency(values, concurrency, mapper) {
    const input = Array.isArray(values) ? values : [];
    const results = new Array(input.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(Math.max(1, concurrency), input.length) }, async () => {
        while (cursor < input.length) {
            const index = cursor++;
            try {
                results[index] = await mapper(input[index], index);
            } catch (_) {
                results[index] = [];
            }
        }
    });
    await Promise.all(workers);
    return results;
}

async function buildSearchCatalog(fetchAction, options = {}) {
    const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 8, 12));
    const filters = await fetchAction('GetStudentScheduleFiltersData', {});
    const faculties = (filters?.faculties || []).filter((item) => String(item.Key) !== '0');
    const educationForms = (filters?.educForms || []).filter((item) => String(item.Key) !== '0');
    const courses = (filters?.courses || []).filter((item) => String(item.Key) !== '0');
    if (faculties.length === 0 || educationForms.length === 0 || courses.length === 0) {
        throw new Error('Upstream catalogue is incomplete');
    }
    const groupRequests = faculties.flatMap((faculty) => educationForms.flatMap((form) =>
        courses.map((course) => ({ faculty, form, course }))
    ));

    const groupBatches = await mapWithConcurrency(groupRequests, concurrency, async ({ faculty, form, course }) => {
        const data = await fetchAction('GetStudyGroups', {
            aFacultyID: faculty.Key,
            aEducationForm: form.Key,
            aCourse: course.Key
        });
        return (data?.studyGroups || []).map((group) => ({
            type: 'group',
            value: group,
            facultyId: faculty.Key,
            facultyName: faculty.Value,
            label: `${group.Value} (${faculty.Value})`
        }));
    });

    const chairBatches = await mapWithConcurrency(faculties, Math.min(concurrency, 6), async (faculty) => {
        const data = await fetchAction('GetEmployeeChairs', { aFacultyID: faculty.Key });
        return (data?.chairs || []).map((chair) => ({ faculty, chair }));
    });
    const chairRequests = chairBatches.flat();
    const teacherBatches = await mapWithConcurrency(chairRequests, concurrency, async ({ faculty, chair }) => {
        const data = await fetchAction('GetEmployees', {
            aFacultyID: faculty.Key,
            aChairID: chair.Key
        });
        return (Array.isArray(data) ? data : []).map((employee) => ({
            type: 'teacher',
            value: employee,
            facultyId: faculty.Key,
            facultyName: faculty.Value,
            chairId: chair.Key,
            chairName: chair.Value,
            label: `${employee.Value} (${chair.Value})`
        }));
    });

    const unique = new Map();
    [...groupBatches.flat(), ...teacherBatches.flat()].forEach((item) => {
        const key = `${item.type}|${item.facultyId || ''}|${item.chairId || ''}|${item.value?.Key || normalizeSearchText(item.label)}`;
        if (!unique.has(key)) unique.set(key, item);
    });
    if (unique.size === 0) throw new Error('Upstream catalogue returned no searchable items');
    return Array.from(unique.values());
}

module.exports = {
    normalizeSearchText,
    createSearchIndex,
    searchIndex,
    buildSearchCatalog
};
