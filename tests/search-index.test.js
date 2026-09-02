const {
    normalizeSearchText,
    createSearchIndex,
    searchIndex,
    buildSearchCatalog
} = require('../api/search-index');

describe('server search index', () => {
    test('matches Ukrainian names and group codes regardless of separators', () => {
        const index = createSearchIndex([
            { type: 'group', value: { Key: 'g1', Value: 'КН-16-У' }, facultyId: 'f1', label: 'КН-16-У (ФУАІД)' },
            { type: 'teacher', value: { Key: 'e1', Value: 'Абросімов Євген' }, facultyId: 'f1', chairId: 'c1', label: 'Абросімов Євген (Математика)' }
        ]);

        expect(normalizeSearchText('КН 16/У')).toBe('кн16у');
        expect(searchIndex(index, '16у', { type: 'group' })[0].value.Key).toBe('g1');
        expect(searchIndex(index, 'євген', { type: 'teacher' })[0].value.Key).toBe('e1');
        expect(searchIndex(index, 'євген', { type: 'group' })).toEqual([]);
    });

    test('builds and deduplicates groups and teachers from the upstream catalogue', async () => {
        const fetchAction = jest.fn(async (action) => {
            if (action === 'GetStudentScheduleFiltersData') {
                return {
                    faculties: [{ Key: 'f1', Value: 'ФУАІД' }],
                    educForms: [{ Key: '1', Value: 'Денна' }],
                    courses: [{ Key: '1', Value: '1 курс' }]
                };
            }
            if (action === 'GetStudyGroups') {
                return { studyGroups: [{ Key: 'g1', Value: 'КН-16-У' }, { Key: 'g1', Value: 'КН-16-У' }] };
            }
            if (action === 'GetEmployeeChairs') return { chairs: [{ Key: 'c1', Value: 'Математика' }] };
            if (action === 'GetEmployees') return [{ Key: 'e1', Value: 'Абросімов Євген' }];
            return null;
        });

        const items = await buildSearchCatalog(fetchAction, { concurrency: 2 });

        expect(items.map((item) => item.type)).toEqual(['group', 'teacher']);
        expect(fetchAction).toHaveBeenCalledTimes(4);
    });
});
