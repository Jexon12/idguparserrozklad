/**
 * Schedule Viewer — Search Module
 * Universal search cache building and search input handling.
 */
window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
    /**
     * Build universal search cache (groups + teachers from all faculties).
     * @param {Object} refs - Vue refs { faculties, allItemsCache, isSearching, isCacheLoaded, cacheStatus }
     */
    SA.buildUniversalCache = async (refs) => {
        if (refs.isSearching.value || refs.isCacheLoaded.value) return;
        refs.isSearching.value = true;
        refs.allItemsCache.value = [];
        refs.cacheStatus.value = "Індексація груп...";

        const facs = refs.faculties.value;
        if (facs.length === 0) {
            const data = await SA.fetchApi('GetStudentScheduleFiltersData');
            if (data) {
                refs.faculties.value = data.faculties || [];
            }
        }

        // 1. Fetch Groups
        const CHUNK = 6;
        const facList = refs.faculties.value;
        for (let i = 0; i < facList.length; i += CHUNK) {
            const chunk = facList.slice(i, i + CHUNK);
            const chunkPromises = chunk.map(async (fac) => {
                try {
                    const res = await SA.fetchApi('GetStudyGroups', {
                        aFacultyID: fac.Key,
                        aEducationForm: "0",
                        aCourse: "0"
                    }, { silent: true });

                    if (res && res.studyGroups) {
                        return res.studyGroups.map(g => {
                            const label = `${g.Value} (${fac.Value})`;
                            return {
                                type: 'group',
                                value: g,
                                facultyId: fac.Key,
                                facultyName: fac.Value,
                                label,
                                _lower: label.toLowerCase()
                            };
                        });
                    }
                } catch (e) { return []; }
                return [];
            });

            const chunkRes = await Promise.all(chunkPromises);
            chunkRes.forEach(arr => {
                refs.allItemsCache.value.push(...arr);
            });

            await new Promise(r => setTimeout(r, 50));
        }

        // 2. Fetch Teachers
        refs.cacheStatus.value = "Індексація викладачів...";
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
                                return list.map(e => {
                                    const label = `${e.Value} (${chair.Value})`;
                                    return {
                                        type: 'teacher',
                                        value: e,
                                        facultyId: fac.Key,
                                        chairId: chair.Key,
                                        label,
                                        _lower: label.toLowerCase()
                                    };
                                });
                            }
                        } catch (e) { return []; }
                        return [];
                    });

                    const empArrays = await Promise.all(empPromises);
                    refs.allItemsCache.value = [...refs.allItemsCache.value, ...empArrays.flat()];
                }
            } catch (e) { console.error(e); }
            await new Promise(r => setTimeout(r, 200));
        }

        refs.isCacheLoaded.value = true;
        refs.isSearching.value = false;
        refs.cacheStatus.value = "";
    };

    /**
     * Create a debounced search input handler.
     * @param {Object} refs - Vue refs { searchQuery, searchResults, allItemsCache, isCacheLoaded, isSearching }
     * @returns {Function} The onSearchInput handler
     */
    SA.createSearchHandler = (refs) => {
        let timer;
        return () => {
            if (!refs.isCacheLoaded.value && !refs.isSearching.value && refs.searchQuery.value.length > 0) {
                SA.buildUniversalCache(refs);
            }

            clearTimeout(timer);
            timer = setTimeout(() => {
                const q = refs.searchQuery.value.toLowerCase().trim();
                if (!q) {
                    refs.searchResults.value = [];
                    return;
                }

                refs.searchResults.value = refs.allItemsCache.value
                    .filter(item => item._lower.includes(q))
                    .sort((a, b) => {
                        const aStarts = a._lower.startsWith(q);
                        const bStarts = b._lower.startsWith(q);
                        if (aStarts && !bStarts) return -1;
                        if (!aStarts && bStarts) return 1;
                        return 0;
                    })
                    .slice(0, 10);
            }, 300);
        };
    };
})(window.ScheduleApp);
