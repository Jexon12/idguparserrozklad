/**
 * Schedule Viewer - Search Module
 * Universal search cache building and indexed search input handling.
 */
window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
    const MAX_PREFIX = 4;
    let cacheBuildPromise = null;

    function normalizeSearchText(value) {
        return String(value || '')
            .normalize('NFKC')
            .toLocaleLowerCase('uk-UA')
            .replace(/[\s()\-–—_/.,'’`]+/g, '');
    }

    SA.normalizeSearchText = normalizeSearchText;

    function addPrefixes(index, token, item) {
        if (!token) return;
        const normalized = String(token).toLowerCase();
        const maxLen = Math.min(MAX_PREFIX, normalized.length);
        for (let i = 1; i <= maxLen; i++) {
            const key = normalized.slice(0, i);
            if (!index[key]) index[key] = [];
            index[key].push(item);
        }
    }

    function buildPrefixIndex(items) {
        const index = {};
        items.forEach((item) => {
            const lower = item._lower || '';
            addPrefixes(index, lower, item);
            lower.split(/[\s()\-_/.,]+/).forEach((token) => addPrefixes(index, token, item));
            addPrefixes(index, item._searchKey || normalizeSearchText(lower), item);
        });
        return index;
    }

    function getCandidatesByPrefix(index, query, fallback) {
        const q = (query || '').toLowerCase();
        if (!q) return [];
        const maxLen = Math.min(MAX_PREFIX, q.length);

        for (let i = maxLen; i >= 1; i--) {
            const key = q.slice(0, i);
            if (index[key] && index[key].length > 0) return Array.from(new Set(index[key]));
        }

        return fallback;
    }

    /**
     * Build universal search cache (groups + teachers from all faculties).
     * @param {Object} refs - Vue refs { faculties, allItemsCache, isSearching, isCacheLoaded, cacheStatus, searchPrefixIndex }
     */
    SA.buildUniversalCache = (refs) => {
        if (refs.isCacheLoaded.value) return Promise.resolve();
        if (cacheBuildPromise) return cacheBuildPromise;

        cacheBuildPromise = (async () => {

        refs.isSearching.value = true;
        refs.allItemsCache.value = [];
        refs.searchPrefixIndex.value = {};
        if (refs.groupCacheReady) refs.groupCacheReady.value = false;
        refs.cacheStatus.value = 'Індексація груп...';

        const facs = refs.faculties.value;
        if (facs.length === 0) {
            const data = await SA.fetchApi('GetStudentScheduleFiltersData');
            if (data) {
                refs.faculties.value = data.faculties || [];
                if (refs.eduForms) refs.eduForms.value = data.educForms || [];
                if (refs.courses) refs.courses.value = data.courses || [];
            }
        }

        // 1. Fetch Groups
        const CHUNK = 8;
        const facList = refs.faculties.value;
        const educationForms = (refs.eduForms?.value || []).filter((item) => String(item.Key) !== '0');
        const courseList = (refs.courses?.value || []).filter((item) => String(item.Key) !== '0');
        const groupRequests = facList.flatMap((fac) => educationForms.flatMap((form) =>
            courseList.map((course) => ({ fac, form, course }))
        ));
        const seenGroups = new Set();

        for (let i = 0; i < groupRequests.length; i += CHUNK) {
            const chunk = groupRequests.slice(i, i + CHUNK);
            const chunkPromises = chunk.map(async ({ fac, form, course }) => {
                try {
                    const res = await SA.fetchApi('GetStudyGroups', {
                        aFacultyID: fac.Key,
                        aEducationForm: form.Key,
                        aCourse: course.Key
                    }, { silent: true });

                    if (res && res.studyGroups) {
                        return res.studyGroups.map((g) => {
                            const label = `${g.Value} (${fac.Value})`;
                            return {
                                type: 'group',
                                value: g,
                                facultyId: fac.Key,
                                facultyName: fac.Value,
                                label,
                                _lower: label.toLocaleLowerCase('uk-UA'),
                                _searchKey: normalizeSearchText(label)
                            };
                        });
                    }
                } catch (e) {
                    return [];
                }
                return [];
            });

            const chunkRes = await Promise.all(chunkPromises);
            chunkRes.forEach((arr) => {
                arr.forEach((item) => {
                    const key = `${item.facultyId}|${normalizeSearchText(item.value?.Value || item.label)}`;
                    if (seenGroups.has(key)) return;
                    seenGroups.add(key);
                    refs.allItemsCache.value.push(item);
                });
            });

            await new Promise((r) => setTimeout(r, 40));
        }

        refs.searchPrefixIndex.value = buildPrefixIndex(refs.allItemsCache.value);
        if (refs.groupCacheReady) refs.groupCacheReady.value = true;

        // 2. Fetch Teachers
        refs.cacheStatus.value = 'Індексація викладачів...';
        for (const fac of facList) {
            try {
                const chairData = await SA.fetchApi('GetEmployeeChairs', { aFacultyID: fac.Key }, { silent: true });
                if (chairData && chairData.chairs) {
                    const empPromises = chairData.chairs.map(async (chair) => {
                        try {
                            const empData = await SA.fetchApi('GetEmployees', {
                                aFacultyID: fac.Key,
                                aChairID: chair.Key
                            }, { silent: true });
                            if (empData) {
                                const list = Array.isArray(empData) ? empData : [];
                                return list.map((e) => {
                                    const label = `${e.Value} (${chair.Value})`;
                                    return {
                                        type: 'teacher',
                                        value: e,
                                        facultyId: fac.Key,
                                        chairId: chair.Key,
                                        label,
                                        _lower: label.toLocaleLowerCase('uk-UA'),
                                        _searchKey: normalizeSearchText(label)
                                    };
                                });
                            }
                        } catch (e) {
                            return [];
                        }
                        return [];
                    });

                    const empArrays = await Promise.all(empPromises);
                    refs.allItemsCache.value = [...refs.allItemsCache.value, ...empArrays.flat()];
                }
            } catch (e) {
                console.error(e);
            }
            await new Promise((r) => setTimeout(r, 120));
        }

            refs.searchPrefixIndex.value = buildPrefixIndex(refs.allItemsCache.value);
            refs.isCacheLoaded.value = true;
        })().finally(() => {
            refs.isSearching.value = false;
            refs.cacheStatus.value = '';
            cacheBuildPromise = null;
        });

        return cacheBuildPromise;
    };

    /**
     * Create a debounced search input handler.
     * @param {Object} refs - Vue refs { searchQuery, searchResults, allItemsCache, isCacheLoaded, isSearching, searchPrefixIndex }
     * @returns {Function} The onSearchInput handler
     */
    SA.createSearchHandler = (refs) => {
        let timer;
        return () => {
            clearTimeout(timer);
            timer = setTimeout(async () => {
                const originalQuery = refs.searchQuery.value;
                const q = originalQuery.toLocaleLowerCase('uk-UA').trim();
                if (!q) {
                    refs.searchResults.value = [];
                    return;
                }

                const searchKey = normalizeSearchText(q);
                const expectedType = refs.mode?.value === 'student'
                    ? 'group'
                    : (refs.mode?.value === 'teacher' ? 'teacher' : null);

                if (!refs.isCacheLoaded.value) {
                    const buildPromise = SA.buildUniversalCache(refs);
                    if (expectedType === 'group' && refs.groupCacheReady) {
                        while (refs.isSearching.value && !refs.groupCacheReady.value) {
                            await new Promise((resolve) => setTimeout(resolve, 80));
                        }
                    } else {
                        await buildPromise;
                    }
                }
                if (originalQuery !== refs.searchQuery.value) return;

                const candidates = getCandidatesByPrefix(
                    refs.searchPrefixIndex.value || {},
                    searchKey || q,
                    refs.allItemsCache.value
                );

                refs.searchResults.value = candidates
                    .filter((item) => !expectedType || item.type === expectedType)
                    .filter((item) => item._lower.includes(q) || (item._searchKey || normalizeSearchText(item._lower)).includes(searchKey))
                    .sort((a, b) => {
                        const aStarts = (a._searchKey || normalizeSearchText(a._lower)).startsWith(searchKey);
                        const bStarts = (b._searchKey || normalizeSearchText(b._lower)).startsWith(searchKey);
                        if (aStarts && !bStarts) return -1;
                        if (!aStarts && bStarts) return 1;
                        return 0;
                    })
                    .slice(0, 10);
            }, 220);
        };
    };
})(window.ScheduleApp);

