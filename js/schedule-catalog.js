/** Shared schedule dictionary loader. Requires utils.js and api.js. */
(function (root) {
    if (!root) return;
    root.ScheduleApp = root.ScheduleApp || {};
    const SA = root.ScheduleApp;
    const valueOf = (item) => String(item?.Key ?? item?.key ?? '');
    const labelOf = (item) => String(item?.Value ?? item?.value ?? '').trim();
    const uniqueItems = (items) => {
        const map = new Map();
        Array.from(items || []).forEach((item) => {
            const key = valueOf(item);
            if (key && !map.has(key)) map.set(key, { Key: key, Value: labelOf(item) });
        });
        return Array.from(map.values()).sort((a, b) => a.Value.localeCompare(b.Value, 'uk'));
    };
    const requireApi = () => {
        if (typeof SA.fetchApi !== 'function') throw new Error('api.js must be loaded before schedule-catalog.js');
        return SA.fetchApi;
    };
    SA.ScheduleCatalog = {
        uniqueItems,
        async loadStudentFilters() {
            const data = await requireApi()('GetStudentScheduleFiltersData');
            return {
                faculties: uniqueItems(data?.faculties),
                educForms: uniqueItems(data?.educForms),
                courses: uniqueItems(data?.courses)
            };
        },
        async loadGroups(facultyId, educationForm, courses) {
            const lists = await Promise.all(Array.from(courses || []).filter(Boolean).map(async (courseId) => {
                const data = await requireApi()('GetStudyGroups', {
                    aFacultyID: facultyId,
                    aEducationForm: educationForm,
                    aCourse: courseId
                });
                return data?.studyGroups || [];
            }));
            return uniqueItems(lists.flat());
        },
        async loadChairs(facultyId) {
            const data = await requireApi()('GetEmployeeChairs', { aFacultyID: facultyId });
            return uniqueItems(data?.chairs || data);
        },
        async loadEmployees(facultyId, chairId) {
            const data = await requireApi()('GetEmployees', { aFacultyID: facultyId, aChairID: chairId });
            return uniqueItems(data?.employees || data);
        }
    };
})(typeof window !== 'undefined' ? window : null);
