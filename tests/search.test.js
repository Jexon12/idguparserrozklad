describe('universal schedule search', () => {
    let SA;

    beforeEach(() => {
        jest.resetModules();
        global.window = { ScheduleApp: {} };
        require('../js/search.js');
        SA = global.window.ScheduleApp;
    });

    afterEach(() => {
        delete global.window;
    });

    const ref = (value) => ({ value });

    test('matches group fragments regardless of separators and hides teachers in student mode', async () => {
        const refs = {
            mode: ref('student'),
            searchQuery: ref('16у'),
            searchResults: ref([]),
            allItemsCache: ref([
                { type: 'group', label: 'КН-16-У', _lower: 'кн-16-у' },
                { type: 'teacher', label: 'Викладач 16У', _lower: 'викладач 16у' }
            ]),
            isCacheLoaded: ref(true),
            isSearching: ref(false),
            searchPrefixIndex: ref({})
        };

        SA.createSearchHandler(refs)();
        await new Promise((resolve) => setTimeout(resolve, 260));

        expect(refs.searchResults.value.map((item) => item.label)).toEqual(['КН-16-У']);
    });

    test('repeats the pending query after the catalogue finishes loading', async () => {
        const refs = {
            mode: ref('student'),
            searchQuery: ref('16у'),
            searchResults: ref([]),
            allItemsCache: ref([]),
            isCacheLoaded: ref(false),
            isSearching: ref(false),
            searchPrefixIndex: ref({})
        };
        SA.buildUniversalCache = jest.fn(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            refs.allItemsCache.value = [{ type: 'group', label: 'КН-16-У', _lower: 'кн-16-у' }];
            refs.isCacheLoaded.value = true;
        });

        SA.createSearchHandler(refs)();
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(SA.buildUniversalCache).toHaveBeenCalledTimes(1);
        expect(refs.searchResults.value).toHaveLength(1);
    });

    test('builds the group catalogue from valid education form and course combinations', async () => {
        const refs = {
            faculties: ref([{ Key: 'faculty-1', Value: 'Факультет' }]),
            eduForms: ref([{ Key: '1', Value: 'Денна' }]),
            courses: ref([{ Key: '1', Value: '1 курс' }, { Key: '2', Value: '2 курс' }]),
            allItemsCache: ref([]),
            searchPrefixIndex: ref({}),
            groupCacheReady: ref(false),
            isCacheLoaded: ref(false),
            isSearching: ref(false),
            cacheStatus: ref('')
        };
        const groupCalls = [];
        SA.fetchApi = jest.fn(async (action, params) => {
            if (action === 'GetStudyGroups') {
                groupCalls.push(params);
                return { studyGroups: [{ Key: `group-${params.aCourse}`, Value: 'КН-16-У' }] };
            }
            if (action === 'GetEmployeeChairs') return { chairs: [] };
            return [];
        });

        await SA.buildUniversalCache(refs);

        expect(groupCalls).toHaveLength(2);
        expect(groupCalls.every((call) => call.aEducationForm !== '0' && call.aCourse !== '0')).toBe(true);
        expect(refs.groupCacheReady.value).toBe(true);
        expect(refs.allItemsCache.value).toHaveLength(1);
    });
});
