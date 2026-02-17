/**
 * Schedule Viewer — Main App
 * Vue 3 application that orchestrates all modules.
 * Modules are loaded via window.ScheduleApp (SA) namespace.
 */
try {
    if (typeof Vue === 'undefined') {
        throw new Error("Vue library failed to load (CDN issue).");
    }

    const { createApp, ref, computed, onMounted, watch, onErrorCaptured } = Vue;
    const SA = window.ScheduleApp;

    createApp({
        setup() {
            // --- State ---
            const mode = ref('student');
            const loadingFilters = ref(false);
            const loadingSchedule = ref(false);
            const errorMessage = ref('');

            // Global Error Boundary
            onErrorCaptured((err, instance, info) => {
                console.error("Global Error Captured:", err, info);
                errorMessage.value = "Сталася помилка: " + (err.message || "Невідома помилка");
                return false; // Stop propagation
            });

            // Set global error handler for API module
            SA._onError = (msg) => { errorMessage.value = msg; };

            // Dictionaries
            const faculties = ref([]);
            const eduForms = ref([]);
            const courses = ref([]);
            const chairs = ref([]);
            const groups = ref([]);
            const employees = ref([]);
            const studyTypes = ref([
                { Key: '10', Value: 'Лекції' },
                { Key: '11', Value: 'Практичні' },
                { Key: '12', Value: 'Лабораторні' },
                { Key: '14', Value: 'Консультації' },
                { Key: '21', Value: 'Семінарські' },
                { Key: '23', Value: 'Індивідуальні заняття' }
            ]);

            // Selections
            const selectedFaculty = ref('');
            const selectedEduForm = ref('');
            const selectedCourse = ref('');
            const selectedGroup = ref('');
            const selectedChair = ref('');
            const selectedEmployee = ref('');
            const selectedStudyType = ref('');
            const selectedDisciplines = ref([]);

            // Date Range
            const today = new Date();
            const nextWeek = new Date(today);
            nextWeek.setDate(today.getDate() + 7);
            const dateStart = ref(today.toISOString().split('T')[0]);
            const dateEnd = ref(nextWeek.toISOString().split('T')[0]);

            // Active entities (multi-entity display)
            const activeEntities = ref([]);

            // Occupancy
            const occupancyDate = ref(today.toISOString().split('T')[0]);
            const occupancyResults = ref([]);
            const isScanning = ref(false);
            const stopScan = ref(false);
            const scanProgress = ref({ current: 0, total: 0, text: '' });
            const scanErrors = ref(0);
            const occupancySearch = ref('');

            // Search
            const searchQuery = ref('');
            const searchResults = ref([]);
            const isSearching = ref(false);
            const isCacheLoaded = ref(false);
            const cacheStatus = ref('');
            const allItemsCache = ref([]);

            // Notes
            const notesMap = ref({});
            const showNoteModal = ref(false);
            const noteText = ref('');
            const currentNoteKey = ref('');
            const currentNoteTitle = ref('');
            const showAllNotesModal = ref(false);

            // Custom Times
            const customTimes = ref(JSON.parse(JSON.stringify(SA.defaultTimes)));
            const showSettingsModal = ref(false);

            // Admin
            const adminMode = ref(false);
            const adminPassword = ref('');
            const globalLinks = ref({});
            const showAdminModal = ref(false);
            const adminTargetKey = ref('');
            const adminTargetTitle = ref('');
            const adminForm = ref({ courseUrl: '', onlineUrl: '' });

            // Free Time
            const showFreeTimeModal = ref(false);
            const commonFreeSlots = ref([]);

            // Report Download
            const showReportModal = ref(false);
            const reportForm = ref({ faculty: '', chair: '', teacher: '', monthStart: '', monthEnd: '' });
            const reportChairs = ref([]);
            const reportEmployees = ref([]);
            const isDownloadingReport = ref(false);

            const isReportFormValid = computed(() => {
                return reportForm.value.faculty && reportForm.value.chair && reportForm.value.teacher && reportForm.value.monthStart && reportForm.value.monthEnd;
            });

            // Auto-Refresh
            const autoRefreshEnabled = ref(localStorage.getItem('schedule_autoRefresh') === 'true');
            const autoRefreshInterval = ref(parseInt(localStorage.getItem('schedule_autoRefreshInterval') || '10'));
            const lastRefreshTime = ref(null);
            let autoRefreshTimer = null;

            // Local Notifications
            const notificationsEnabled = ref(localStorage.getItem('schedule_notifications') === 'true');
            const notifiedLessons = ref(new Set());

            const requestNotificationPermission = async () => {
                if (!("Notification" in window)) {
                    showToast("Ваш браузер не підтримує сповіщення");
                    return;
                }
                if (notificationsEnabled.value) {
                    // Toggle off
                    notificationsEnabled.value = false;
                    localStorage.setItem('schedule_notifications', 'false');
                    showToast("🔕 Сповіщення вимкнено");
                    return;
                }
                // Request permission
                const permission = await Notification.requestPermission();
                if (permission === "granted") {
                    notificationsEnabled.value = true;
                    localStorage.setItem('schedule_notifications', 'true');
                    showToast("🔔 Сповіщення увімкнено!");
                    new Notification("Розклад", { body: "Тестове сповіщення: все працює!" });
                } else {
                    notificationsEnabled.value = false;
                    localStorage.setItem('schedule_notifications', 'false');
                    showToast("🚫 Сповіщення заборонено браузером");
                }
            };

            // === NEW UI STATE ===
            const favorites = ref(JSON.parse(localStorage.getItem('schedule_favorites') || '[]'));
            const viewMode = ref(localStorage.getItem('schedule_viewMode') || 'cards');
            const datePreset = ref('');
            const sidebarOpen = ref(false);
            const toastMessage = ref('');
            const toastVisible = ref(false);
            const nextLessonInfo = ref(null);
            const currentLessonInfo = ref(null);
            let nextLessonTimer = null;

            // Dark Mode
            const isDark = ref(document.documentElement.classList.contains('dark'));
            const toggleDarkMode = () => {
                isDark.value = !isDark.value;
                if (isDark.value) {
                    document.documentElement.classList.add('dark');
                    localStorage.setItem('darkMode', 'true');
                } else {
                    document.documentElement.classList.remove('dark');
                    localStorage.setItem('darkMode', 'false');
                }
            };

            // --- Refs bundle for modules ---
            const scheduleRefs = { dateStart, dateEnd, selectedStudyType };

            const adminRefs = {
                adminMode, adminPassword, globalLinks, showAdminModal,
                adminTargetKey, adminTargetTitle, adminForm, customTimes
            };

            const noteRefs = {
                notesMap, showNoteModal, noteText, currentNoteKey, currentNoteTitle,
                saveState: () => saveState()
            };

            const searchRefs = {
                faculties, allItemsCache, isSearching, isCacheLoaded,
                cacheStatus, searchQuery, searchResults
            };

            const scanRefs = {
                isScanning, stopScan, occupancyResults, occupancyDate,
                scanProgress, scanErrors, errorMessage, faculties, courses, eduForms
            };

            // --- Computed ---
            const availableDisciplines = computed(() => {
                const set = new Set();
                activeEntities.value.forEach(entity => {
                    if (!entity.scheduleData) return;
                    entity.scheduleData.forEach(item => {
                        if (item.discipline) set.add(item.discipline);
                        if (item.teacher) {
                            const t = SA.stripHtml(item.teacher);
                            if (t) set.add(t);
                        }
                    });
                });
                return Array.from(set).sort();
            });

            const canAdd = computed(() => {
                if (mode.value === 'student') return !!selectedGroup.value;
                if (mode.value === 'teacher') return !!selectedEmployee.value;
                return false;
            });

            const groupedSchedule = computed(() => {
                if (activeEntities.value.length === 0) return [];

                const days = {};
                const merged = activeEntities.value.flatMap(entity =>
                    (entity.scheduleData || []).map(lesson => ({
                        ...lesson,
                        entityName: entity.name,
                        entityId: entity.id,
                        entityType: entity.type,
                    }))
                );

                merged.sort((a, b) => {
                    const da = a.full_date.split('.').reverse().join('-');
                    const db = b.full_date.split('.').reverse().join('-');
                    return da.localeCompare(db) || a.study_time.localeCompare(b.study_time);
                });

                merged.forEach(lesson => {
                    const lessonData = {
                        discipline: lesson.discipline,
                        teacher: SA.stripHtml(lesson.teacher || lesson.employee || ''),
                        cabinet: lesson.cabinet,
                        type: lesson.study_type || '',
                        group: lesson.contingent || lesson.study_group || lesson.groupName || '',
                        entityName: lesson.entityName,
                        entityId: lesson.entityId,
                        entityType: lesson.entityType,
                        timeStart: lesson.study_time_begin,
                        timeEnd: lesson.study_time_end,
                    };

                    // Filtering
                    if (selectedDisciplines.value.length > 0) {
                        const matchDiscipline = selectedDisciplines.value.includes(lesson.discipline);
                        let matchTeacher = false;
                        if (lesson.teacher || lesson.employee) {
                            const rawTeacher = lesson.teacher || lesson.employee || "";
                            const cleanTeacher = SA.stripHtml(rawTeacher);
                            if (selectedDisciplines.value.includes(rawTeacher) || selectedDisciplines.value.includes(cleanTeacher)) {
                                matchTeacher = true;
                            }
                        }
                        if (!matchDiscipline && !matchTeacher) return;
                    }

                    // Custom Times
                    const pairMatch = lesson.study_time.match(/(\d+).*?пара/i);
                    let finalStart = lesson.study_time_begin;
                    let finalEnd = lesson.study_time_end;
                    let displayTime = lesson.study_time;

                    if (pairMatch) {
                        const pairNum = parseInt(pairMatch[1]);
                        const ct = customTimes.value;
                        const customTime = ct[pairNum] || ct[String(pairNum)];
                        if (customTime) {
                            finalStart = customTime.start;
                            finalEnd = customTime.end;
                            displayTime = `${pairNum} пара (${finalStart}-${finalEnd})`;
                            lessonData.timeStart = finalStart;
                            lessonData.timeEnd = finalEnd;
                        }
                    }

                    if (!days[lesson.full_date]) {
                        const [d, m, y] = lesson.full_date.split('.');
                        const date = new Date(`${y}-${m}-${d}`);
                        const dayNames = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота'];
                        days[lesson.full_date] = {
                            date: lesson.full_date,
                            dayName: dayNames[date.getDay()],
                            slots: {}
                        };
                    }

                    if (!days[lesson.full_date].slots[displayTime]) {
                        days[lesson.full_date].slots[displayTime] = { time: displayTime, lessons: [] };
                    }
                    days[lesson.full_date].slots[displayTime].lessons.push(lessonData);
                });

                return Object.values(days).map(day => {
                    const sortedSlots = Object.values(day.slots).sort((a, b) => {
                        const na = parseInt(a.time) || 99;
                        const nb = parseInt(b.time) || 99;
                        return na - nb;
                    });
                    return { ...day, slots: sortedSlots };
                }).sort((a, b) => {
                    const [d1, m1, y1] = a.date.split('.');
                    const [d2, m2, y2] = b.date.split('.');
                    return new Date(`${y1}-${m1}-${d1}`) - new Date(`${y2}-${m2}-${d2}`);
                });
            });

            const scheduleStats = computed(() => {
                const stats = { totalPairs: 0, bySubject: {}, byType: {} };
                const daySet = new Set();
                const dayOfWeekCount = {};
                const dayNames = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота'];

                // Count free windows per day
                const lessonsByDate = {};
                const uniquePairs = new Set(); // Track unique slots (date + time + discipline)

                activeEntities.value.forEach(entity => {
                    if (!entity.scheduleData) return;
                    entity.scheduleData.forEach(item => {
                        // Unique identifier for a "pair" regardless of how many groups attend
                        // Key: date + time + discipline + type (to differentiate lecture vs practice if concurrent)
                        const uniqueKey = `${item.full_date}-${item.study_time}-${item.discipline}-${item.study_type}`;

                        // Only count metrics if this is a new unique pair
                        if (!uniquePairs.has(uniqueKey)) {
                            uniquePairs.add(uniqueKey);
                            stats.totalPairs++;

                            // By subject (only count once per pair)
                            const subj = item.discipline;
                            stats.bySubject[subj] = (stats.bySubject[subj] || 0) + 1;

                            // Day of week
                            const [d, m, y] = item.full_date.split('.');
                            const date = new Date(`${y}-${m}-${d}`);
                            const dow = dayNames[date.getDay()];
                            dayOfWeekCount[dow] = (dayOfWeekCount[dow] || 0) + 1;

                            daySet.add(item.full_date);

                            // By type 
                            const type = item.study_type || 'Інше';
                            stats.byType[type] = (stats.byType[type] || 0) + 1;

                            // Track time slots per date for free window calc
                            if (!lessonsByDate[item.full_date]) lessonsByDate[item.full_date] = [];
                            const pairMatch = item.study_time.match(/(\d+)/);
                            if (pairMatch) lessonsByDate[item.full_date].push(parseInt(pairMatch[1]));
                        }
                    });
                });

                // Top subjects
                const sortedSubjects = Object.entries(stats.bySubject)
                    .map(([name, count]) => ({ name, count, percent: 0 }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5);

                if (stats.totalPairs > 0) {
                    sortedSubjects.forEach(s => s.percent = Math.round((s.count / stats.totalPairs) * 100));
                }

                // Type distribution
                const typeDistribution = Object.entries(stats.byType)
                    .map(([name, count]) => ({ name, count, percent: stats.totalPairs > 0 ? Math.round((count / stats.totalPairs) * 100) : 0 }))
                    .sort((a, b) => b.count - a.count);

                // Busiest day of week
                const busiestDay = Object.entries(dayOfWeekCount)
                    .sort((a, b) => b[1] - a[1])[0];

                // Free windows (gaps between lessons in a day)
                let totalFreeWindows = 0;
                Object.values(lessonsByDate).forEach(pairs => {
                    const sorted = [...new Set(pairs)].sort((a, b) => a - b);
                    for (let i = 1; i < sorted.length; i++) {
                        if (sorted[i] - sorted[i - 1] > 1) totalFreeWindows++;
                    }
                });

                const totalDays = daySet.size;
                const avgPairsPerDay = totalDays > 0 ? (stats.totalPairs / totalDays).toFixed(1) : 0;
                const totalHours = (stats.totalPairs * 1.33).toFixed(1); // 80 min = 1.33 hours

                return {
                    totalPairs: stats.totalPairs,
                    topSubjects: sortedSubjects,
                    typeDistribution,
                    totalDays,
                    avgPairsPerDay,
                    busiestDay: busiestDay ? { name: busiestDay[0], count: busiestDay[1] } : null,
                    totalFreeWindows,
                    totalHours,
                    dayOfWeekCount
                };
            });

            const filteredOccupancyResults = computed(() => {
                if (!occupancySearch.value.trim()) return occupancyResults.value;
                const q = SA.normalize(occupancySearch.value.trim());
                return occupancyResults.value.filter(cab => SA.normalize(cab.name).includes(q));
            });

            const allNotesList = computed(() => {
                return Object.entries(notesMap.value).map(([key, text]) => ({ key, text }));
            });

            // --- Actions (delegated to modules) ---
            const fetchApi = SA.fetchApi;

            const onFacultyChange = async () => {
                loadingFilters.value = true;
                if (mode.value === 'student') {
                    await loadGroups();
                } else {
                    await loadChairs();
                }
                loadingFilters.value = false;
            };

            const loadGroups = async () => {
                if (!selectedFaculty.value) return;
                loadingFilters.value = true;
                const data = await fetchApi('GetStudyGroups', {
                    aFacultyID: selectedFaculty.value,
                    aEducationForm: selectedEduForm.value || "0",
                    aCourse: selectedCourse.value || "0"
                });
                groups.value = data?.studyGroups || [];
                loadingFilters.value = false;
            };

            const loadChairs = async () => {
                if (!selectedFaculty.value) return;
                loadingFilters.value = true;
                const data = await fetchApi('GetEmployeeChairs', { aFacultyID: selectedFaculty.value });
                chairs.value = data?.chairs || [];
                loadingFilters.value = false;
            };

            const loadEmployees = async () => {
                if (!selectedChair.value) return;
                loadingFilters.value = true;
                const data = await fetchApi('GetEmployees', {
                    aFacultyID: selectedFaculty.value,
                    aChairID: selectedChair.value
                });
                employees.value = Array.isArray(data) ? data : [];
                loadingFilters.value = false;
            };

            const addEntity = async () => {
                let id, name, type;

                if (mode.value === 'student') {
                    id = selectedGroup.value.Key;
                    name = selectedGroup.value.Value;
                    type = 'Група';
                } else {
                    id = selectedEmployee.value.Key;
                    name = selectedEmployee.value.Value;
                    type = 'Викладач';
                }

                const { action, payload } = SA.buildSchedulePayload({ id, type }, scheduleRefs);
                const existingIndex = activeEntities.value.findIndex(e => e.id === id && e.type === type);

                loadingSchedule.value = true;
                const data = await fetchApi(action, payload);
                loadingSchedule.value = false;
                if (!data) return;

                if (existingIndex !== -1) {
                    activeEntities.value[existingIndex].scheduleData = data;
                    errorMessage.value = "Розклад оновлено!";
                    setTimeout(() => errorMessage.value = '', 2000);
                    return;
                }

                activeEntities.value.push({ id, name, type, scheduleData: data });
            };

            const removeEntity = (index) => activeEntities.value.splice(index, 1);
            const clearAll = () => { activeEntities.value = []; };

            // Auto-Refresh Logic
            const refreshAllSchedules = async () => {
                if (activeEntities.value.length === 0) return;
                let changesDetected = 0;
                for (const entity of activeEntities.value) {
                    const { action, payload } = SA.buildSchedulePayload(entity, scheduleRefs);
                    const newData = await fetchApi(action, payload, { silent: true });
                    if (!newData) continue;
                    const oldFingerprint = JSON.stringify(entity.scheduleData?.map(l => l.discipline + l.study_time + l.full_date).sort());
                    const newFingerprint = JSON.stringify(newData.map(l => l.discipline + l.study_time + l.full_date).sort());
                    if (oldFingerprint !== newFingerprint) {
                        entity.scheduleData = newData;
                        changesDetected++;
                    }
                }
                lastRefreshTime.value = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
                if (changesDetected > 0) {
                    showToast(`🔄 Розклад оновлено! (${changesDetected} змін)`);
                }
            };

            const startAutoRefresh = () => {
                if (autoRefreshTimer) clearInterval(autoRefreshTimer);
                if (autoRefreshEnabled.value) {
                    autoRefreshTimer = setInterval(refreshAllSchedules, autoRefreshInterval.value * 60 * 1000);
                }
            };

            const toggleAutoRefresh = () => {
                autoRefreshEnabled.value = !autoRefreshEnabled.value;
                localStorage.setItem('schedule_autoRefresh', autoRefreshEnabled.value);
                startAutoRefresh();
                showToast(autoRefreshEnabled.value ? '🔄 Автооновлення увімкнено' : '⏸️ Автооновлення вимкнено');
            };

            const setAutoRefreshInterval = (minutes) => {
                autoRefreshInterval.value = minutes;
                localStorage.setItem('schedule_autoRefreshInterval', minutes);
                if (autoRefreshEnabled.value) startAutoRefresh();
            };

            // Start timer on mount if enabled
            startAutoRefresh();

            const exportExcel = () => {
                const rows = [["Дата", "День тижня", "Час", "Дисципліна", "Тип", "Викладач/Група", "Кабінет", "Джерело"]];
                groupedSchedule.value.forEach(dayData => {
                    dayData.slots.forEach(slot => {
                        slot.lessons.forEach(lesson => {
                            rows.push([
                                dayData.date, dayData.dayName, slot.time,
                                lesson.discipline, lesson.type, lesson.teacher || lesson.group,
                                lesson.cabinet, lesson.entityName
                            ]);
                        });
                    });
                });
                const ws = XLSX.utils.aoa_to_sheet(rows);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Розклад");
                XLSX.writeFile(wb, "rozklad.xlsx");
            };

            const toggleDiscipline = (disc) => {
                if (selectedDisciplines.value.includes(disc)) {
                    selectedDisciplines.value = selectedDisciplines.value.filter(d => d !== disc);
                } else {
                    selectedDisciplines.value.push(disc);
                }
            };

            // --- Time Highlighting ---
            const currentTime = ref(new Date());
            setInterval(() => { currentTime.value = new Date(); }, 60000);

            const isActiveLesson = (dateStr, start, end) => {
                if (!start || !end) return false;
                const now = currentTime.value;
                const [d, m, y] = dateStr.split('.').map(Number);
                if (now.getDate() !== d || (now.getMonth() + 1) !== m || now.getFullYear() !== y) return false;
                const [h1, m1] = start.split(':').map(Number);
                const [h2, m2] = end.split(':').map(Number);
                const nowMin = now.getHours() * 60 + now.getMinutes();
                return nowMin >= (h1 * 60 + m1) && nowMin < (h2 * 60 + m2);
            };

            const getLessonProgress = (dateStr, start, end) => {
                if (!isActiveLesson(dateStr, start, end)) return null;
                const now = currentTime.value;
                const [h1, m1] = start.split(':').map(Number);
                const [h2, m2] = end.split(':').map(Number);
                const nowMin = now.getHours() * 60 + now.getMinutes();
                const startMin = h1 * 60 + m1;
                const endMin = h2 * 60 + m2;
                const percent = Math.min(100, Math.max(0, ((nowMin - startMin) / (endMin - startMin)) * 100));
                return { percent: percent.toFixed(1), timeLeft: endMin - nowMin };
            };

            // --- Free Time Finder ---
            const findCommonFreeSlots = () => {
                if (activeEntities.value.length < 2) return;
                const allDates = new Set();
                activeEntities.value.forEach(e => {
                    if (e.scheduleData) e.scheduleData.forEach(d => allDates.add(d.full_date));
                });

                const sortedDates = Array.from(allDates).sort((a, b) => {
                    const [d1, m1, y1] = a.split('.');
                    const [d2, m2, y2] = b.split('.');
                    return new Date(`${y1}-${m1}-${d1}`) - new Date(`${y2}-${m2}-${d2}`);
                });

                const PAIRS = [1, 2, 3, 4, 5, 6, 7];
                const pairTimes = {};
                const busyMap = {};

                activeEntities.value.forEach(entity => {
                    if (!entity.scheduleData) return;
                    entity.scheduleData.forEach(lesson => {
                        if (!busyMap[lesson.full_date]) busyMap[lesson.full_date] = {};
                        const pairNum = parseInt(lesson.study_time.split(' ')[0]);
                        if (isNaN(pairNum)) return;
                        if (!busyMap[lesson.full_date][pairNum]) busyMap[lesson.full_date][pairNum] = new Set();
                        busyMap[lesson.full_date][pairNum].add(entity.id);
                        if (!pairTimes[pairNum]) {
                            const match = lesson.study_time.match(/\((.*?)\)/);
                            if (match) pairTimes[pairNum] = match[1];
                        }
                    });
                });

                const results = [];
                sortedDates.forEach(dateStr => {
                    const daySlots = [];
                    PAIRS.forEach(pair => {
                        const busyInSlot = busyMap[dateStr]?.[pair];
                        if (!busyInSlot || busyInSlot.size === 0) {
                            const [d, m, y] = dateStr.split('.');
                            const dayOfWeek = new Date(`${y}-${m}-${d}`).getDay();
                            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                                daySlots.push({ pair, time: pairTimes[pair] || '' });
                            }
                        }
                    });
                    if (daySlots.length > 0) results.push({ date: dateStr, slots: daySlots });
                });

                commonFreeSlots.value = results;
                showFreeTimeModal.value = true;
            };

            // --- Persistence ---
            const saveState = () => {
                try {
                    localStorage.setItem(SA.STORAGE_KEY, JSON.stringify({
                        mode: mode.value,
                        activeEntities: activeEntities.value,
                        selectedDisciplines: selectedDisciplines.value,
                        notesMap: notesMap.value,
                        customTimes: customTimes.value
                    }));
                } catch (e) { console.error('Save failed', e); }
            };

            const loadState = () => {
                const saved = localStorage.getItem(SA.STORAGE_KEY);
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        if (parsed.mode) mode.value = parsed.mode;
                        if (parsed.activeEntities) activeEntities.value = parsed.activeEntities;
                        if (parsed.selectedDisciplines) selectedDisciplines.value = parsed.selectedDisciplines;
                        if (parsed.notesMap) notesMap.value = parsed.notesMap;
                        if (parsed.customTimes) customTimes.value = parsed.customTimes;
                    } catch (e) { console.error('Load failed', e); }
                }
            };

            // --- URL State Sharing ---
            const updateUrlState = () => {
                const entities = activeEntities.value;
                if (entities.length === 0) {
                    history.replaceState(null, '', window.location.pathname);
                    return;
                }
                const encoded = entities.map(e =>
                    `${e.type}:${e.id}:${encodeURIComponent(e.name)}`
                ).join(',');
                history.replaceState(null, '', `#entities=${encoded}`);
            };

            const loadUrlState = async () => {
                const hash = window.location.hash;
                if (!hash || !hash.includes('entities=')) return false;

                const match = hash.match(/entities=(.+)/);
                if (!match) return false;

                const parts = match[1].split(',');
                const entities = [];

                for (const part of parts) {
                    const [type, id, encodedName] = part.split(':');
                    if (!type || !id) continue;
                    const name = decodeURIComponent(encodedName || '');

                    const { action, payload } = SA.buildSchedulePayload(
                        { id, type }, scheduleRefs
                    );
                    const data = await fetchApi(action, payload, { silent: true });
                    if (data) entities.push({ id, name, type, scheduleData: data });
                }

                if (entities.length > 0) {
                    activeEntities.value = entities;
                    return true;
                }
                return false;
            };

            watch([mode, activeEntities, selectedDisciplines], () => {
                saveState();
                updateUrlState();
            }, { deep: true });

            const resetCustomTimes = () => {
                customTimes.value = JSON.parse(JSON.stringify(SA.defaultTimes));
                saveState();
            };

            // --- Module-delegated functions ---
            const onSearchInput = SA.createSearchHandler(searchRefs);

            const selectSearchResult = async (item) => {
                searchQuery.value = '';
                searchResults.value = [];
                if (item.type === 'group') {
                    mode.value = 'student';
                    selectedFaculty.value = item.facultyId;
                    await loadGroups();
                    selectedGroup.value = item.value;
                } else {
                    mode.value = 'teacher';
                    selectedFaculty.value = item.facultyId;
                    await loadChairs();
                    selectedChair.value = item.chairId;
                    await loadEmployees();
                    selectedEmployee.value = item.value;
                }
                await addEntity();
            };

            const startOccupancyScan = () => SA.startOccupancyScan(scanRefs);
            const exportOccupancy = () => SA.exportOccupancy({ occupancyResults, occupancyDate });

            const openNote = (lesson, date, time) => SA.openNote(lesson, date, time, noteRefs);
            const saveNote = () => SA.saveNote(noteRefs);
            const hasNote = (lesson, date, time) => SA.hasNote(lesson, date, time, noteRefs);
            const deleteNote = (key) => SA.deleteNote(key, noteRefs);

            const toggleAdminLogin = () => SA.toggleAdminLogin(adminRefs);
            const openAdminModal = (lesson) => SA.openAdminModal(lesson, adminRefs);
            const saveAdminLinks = () => SA.saveAdminLinks(adminRefs);
            const saveGlobalTimes = () => SA.saveGlobalTimes(adminRefs);
            const getGlobalLink = (lesson, type) => SA.getGlobalLink(lesson, type, adminRefs);

            // Report Methods
            const openReportModal = () => {
                showReportModal.value = true;
                // Pre-fill months
                const now = new Date();
                const yyyy = now.getFullYear();
                const mm = String(now.getMonth() + 1).padStart(2, '0');
                const currentMonth = `${yyyy}-${mm}`;

                if (!reportForm.value.monthStart) reportForm.value.monthStart = currentMonth;
                if (!reportForm.value.monthEnd) reportForm.value.monthEnd = currentMonth;
            };

            const loadReportChairs = async () => {
                reportForm.value.chair = '';
                reportForm.value.teacher = '';
                reportChairs.value = [];
                if (!reportForm.value.faculty) return;

                console.log("[Report] Loading chairs for faculty:", reportForm.value.faculty);
                loadingFilters.value = true;
                const data = await fetchApi('GetEmployeeChairs', { aFacultyID: reportForm.value.faculty.Key });
                console.log("[Report] Chairs loaded:", data);
                reportChairs.value = data?.chairs || [];
                loadingFilters.value = false;
            };

            const loadReportEmployees = async () => {
                reportForm.value.teacher = '';
                reportEmployees.value = [];
                if (!reportForm.value.chair) return;

                console.log("[Report] Loading employees for chair:", reportForm.value.chair);
                loadingFilters.value = true;
                const data = await fetchApi('GetEmployees', {
                    aFacultyID: reportForm.value.faculty.Key,
                    aChairID: reportForm.value.chair.Key
                });
                console.log("[Report] Employees loaded:", data);
                reportEmployees.value = Array.isArray(data) ? data : [];
                loadingFilters.value = false;
            };

            const downloadReport = async () => {
                if (!isReportFormValid.value) return;
                isDownloadingReport.value = true;
                try {
                    const params = new URLSearchParams({
                        faculty: reportForm.value.faculty.Value,
                        department: reportForm.value.chair.Value,
                        teacherName: reportForm.value.teacher.Value,
                        teacherId: reportForm.value.teacher.Key,
                        monthStart: reportForm.value.monthStart,
                        monthEnd: reportForm.value.monthEnd
                    });

                    const response = await fetch(`${SA.API_PROXY}report/download?${params.toString()}`);

                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.error || 'Failed to download');
                    }

                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    // Filename usually set by Content-Disposition, but fallback here
                    a.download = `Report_${reportForm.value.teacher.Value}_${reportForm.value.monthStart}_${reportForm.value.monthEnd}.xlsx`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);

                    showToast("✅ Звіт успішно завантажено!");
                    showReportModal.value = false;
                } catch (e) {
                    errorMessage.value = "Помилка завантаження звіту: " + e.message;
                    setTimeout(() => errorMessage.value = '', 5000);
                } finally {
                    isDownloadingReport.value = false;
                }
            };




            // --- Watchers ---
            watch(mode, () => {
                selectedGroup.value = '';
                selectedEmployee.value = '';
                if (selectedFaculty.value) {
                    if (mode.value === 'student') loadGroups();
                    else loadChairs();
                }
            });

            watch(selectedStudyType, async () => {
                if (activeEntities.value.length === 0) return;
                const entities = [...activeEntities.value];
                activeEntities.value = [];
                loadingSchedule.value = true;

                const promises = entities.map(async (entity) => {
                    const { action, payload } = SA.buildSchedulePayload(entity, scheduleRefs);
                    const data = await fetchApi(action, payload);
                    return { ...entity, scheduleData: data };
                });

                activeEntities.value = await Promise.all(promises);
                loadingSchedule.value = false;
            });

            // --- Lifecycle ---
            onMounted(async () => {
                loadState();
                loadingFilters.value = true;

                const filtersData = await fetchApi('GetStudentScheduleFiltersData');
                if (filtersData) {
                    faculties.value = filtersData.faculties || [];
                    eduForms.value = filtersData.educForms || [];
                    courses.value = filtersData.courses || [];
                }

                loadingFilters.value = false;

                // URL state overrides localStorage (for shared links)
                if (window.location.hash.includes('entities=')) {
                    loadingSchedule.value = true;
                    await loadUrlState();
                    loadingSchedule.value = false;
                }

                SA.loadGlobalLinks(adminRefs);
                SA.loadGlobalTimes(adminRefs);

                // Auto refresh every 5 minutes
                setInterval(refreshAllSchedules, 5 * 60 * 1000);

                // Next lesson countdown timer handled by updateTimeBasedInfo

                // Keyboard shortcuts
                document.addEventListener('keydown', (e) => {
                    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
                    if (e.key === 'd' || e.key === 'в') { toggleDarkMode(); }
                    if (e.key === 't' || e.key === 'е') { viewMode.value = viewMode.value === 'cards' ? 'table' : 'cards'; localStorage.setItem('schedule_viewMode', viewMode.value); }
                    if (e.key === 'ArrowLeft') { shiftWeek(-1); }
                    if (e.key === 'ArrowRight') { shiftWeek(1); }
                });
            });

            // === NEW FUNCTIONS ===

            // Toast notification
            const showToast = (msg) => {
                toastMessage.value = msg;
                toastVisible.value = true;
                setTimeout(() => { toastVisible.value = false; }, 3000);
            };

            // Quick date range presets
            const setDateRange = (preset) => {
                datePreset.value = preset;
                const now = new Date();
                const day = now.getDay(); // 0=Sun, 1=Mon...
                const monday = new Date(now);
                monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
                monday.setHours(0, 0, 0, 0);

                if (preset === 'today') {
                    dateStart.value = now.toISOString().split('T')[0];
                    dateEnd.value = now.toISOString().split('T')[0];
                } else if (preset === 'thisWeek') {
                    const sun = new Date(monday); sun.setDate(monday.getDate() + 6);
                    dateStart.value = monday.toISOString().split('T')[0];
                    dateEnd.value = sun.toISOString().split('T')[0];
                } else if (preset === 'nextWeek') {
                    const nextMon = new Date(monday); nextMon.setDate(monday.getDate() + 7);
                    const nextSun = new Date(nextMon); nextSun.setDate(nextMon.getDate() + 6);
                    dateStart.value = nextMon.toISOString().split('T')[0];
                    dateEnd.value = nextSun.toISOString().split('T')[0];
                } else if (preset === 'twoWeeks') {
                    const twoSun = new Date(monday); twoSun.setDate(monday.getDate() + 13);
                    dateStart.value = monday.toISOString().split('T')[0];
                    dateEnd.value = twoSun.toISOString().split('T')[0];
                }
                if (activeEntities.value.length > 0) refreshAllSchedules();
            };

            // Week navigation  
            const shiftWeek = (direction) => {
                const shift = direction * 7;
                const newStart = new Date(dateStart.value);
                const newEnd = new Date(dateEnd.value);
                newStart.setDate(newStart.getDate() + shift);
                newEnd.setDate(newEnd.getDate() + shift);
                dateStart.value = newStart.toISOString().split('T')[0];
                dateEnd.value = newEnd.toISOString().split('T')[0];
                datePreset.value = '';
                if (activeEntities.value.length > 0) refreshAllSchedules();
            };

            // Favorites
            const saveFavorites = () => {
                localStorage.setItem('schedule_favorites', JSON.stringify(favorites.value));
            };

            const addToFavorites = () => {
                if (!canAdd.value) return;
                const isTeacher = mode.value === 'teacher';
                const selected = isTeacher ? selectedEmployee.value : selectedGroup.value;
                const id = selected?.Key || selected;
                const name = selected?.Value || String(id);
                const type = isTeacher ? 'Викладач' : 'Група';
                if (favorites.value.some(f => f.id == id && f.type === type)) {
                    showToast('Вже є в обраному!');
                    return;
                }
                favorites.value.push({ id, name, type });
                saveFavorites();
                showToast('⭐ Додано до обраного!');
            };

            const removeFavorite = (id) => {
                favorites.value = favorites.value.filter(f => f.id != id);
                saveFavorites();
            };

            const loadFromFavorite = async (fav) => {
                mode.value = fav.type === 'Група' ? 'student' : 'teacher';
                activeEntities.value = [];
                loadingSchedule.value = true;
                const entity = { id: fav.id, name: fav.name, type: fav.type };
                const { action, payload } = SA.buildSchedulePayload(entity, scheduleRefs);
                const data = await fetchApi(action, payload);
                activeEntities.value = [{ ...entity, scheduleData: data }];
                loadingSchedule.value = false;
            };

            // iCal Export
            const exportICal = () => {
                if (typeof SA.generateICal !== 'function') {
                    showToast('iCal export not available');
                    return;
                }
                const events = [];
                const gs = groupedSchedule.value;
                for (const dayData of gs) {
                    for (const slot of dayData.slots) {
                        for (const lesson of slot.lessons) {
                            events.push({
                                date: dayData.date,
                                start: slot.start,
                                end: slot.end,
                                discipline: lesson.discipline,
                                teacher: lesson.teacher,
                                cabinet: lesson.cabinet,
                                type: lesson.type
                            });
                        }
                    }
                }
                const icalData = SA.generateICal(events);
                const blob = new Blob([icalData], { type: 'text/calendar;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'schedule.ics';
                a.click();
                URL.revokeObjectURL(url);
                showToast('📆 iCal файл завантажено!');
            };

            // Share link
            const shareSchedule = () => {
                const url = window.location.href;
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(url);
                    showToast('🔗 Посилання скопійовано!');
                } else {
                    showToast('Не вдалося скопіювати');
                }
            };

            // Next lesson countdown
            // Time-based updates (Next & Current Lesson)
            const updateTimeBasedInfo = () => {
                const now = new Date();
                let nearest = null;
                let nearestDiff = Infinity;
                let current = null;
                const gs = groupedSchedule.value;

                if (!gs || gs.length === 0) {
                    nextLessonInfo.value = null;
                    currentLessonInfo.value = null;
                    return;
                }

                for (const dayData of gs) {
                    for (const slot of dayData.slots) {
                        if (!slot.start || !slot.end) continue;

                        const parts = dayData.date.split('.');
                        if (parts.length !== 3) continue;

                        // Create Date objects (assuming current year/month/day context matches schedule date)
                        const lessonStart = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T${slot.start}:00`);
                        const lessonEnd = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T${slot.end}:00`);

                        // Check Current Lesson
                        if (now >= lessonStart && now < lessonEnd) {
                            if (!current && slot.lessons.length > 0) {
                                const l = slot.lessons[0];
                                const totalDuration = lessonEnd - lessonStart;
                                const elapsed = now - lessonStart;
                                const percent = Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));
                                const timeLeft = Math.ceil((lessonEnd - now) / 60000);
                                const totalMins = Math.floor(totalDuration / 60000);

                                current = {
                                    discipline: l.discipline,
                                    teacher: l.teacher || l.group || '',
                                    cabinet: l.cabinet || '',
                                    type: l.type,
                                    time: slot.time,
                                    percent,
                                    timeLeft, // mins
                                    timeLeftStr: timeLeft > 60 ? `${Math.floor(timeLeft / 60)}г ${timeLeft % 60}хв` : `${timeLeft} хв`,
                                    totalMins
                                };
                            }
                        }

                        // Check Next Lesson
                        const diff = lessonStart - now;
                        if (diff > 0 && diff < nearestDiff) {
                            nearestDiff = diff;
                            if (slot.lessons.length > 0) {
                                const l = slot.lessons[0];
                                nearest = {
                                    discipline: l.discipline,
                                    teacher: l.teacher || '',
                                    cabinet: l.cabinet || '',
                                    time: slot.time
                                };
                            }
                        }

                        // Notification Logic (5 mins before)
                        const diffMins = Math.floor(diff / 60000);
                        if (notificationsEnabled.value && diffMins <= 5 && diffMins > 0) {
                            const l = slot.lessons[0];
                            const notifKey = `${dayData.date}-${slot.start}-${l.discipline}`;
                            if (!notifiedLessons.value.has(notifKey)) {
                                notifiedLessons.value.add(notifKey);
                                if (Notification.permission === "granted") {
                                    new Notification(`🔔 Скоро пара: ${l.discipline}`, {
                                        body: `Початок о ${slot.start} (через ${diffMins} хв). ${l.cabinet || ''}`,
                                        requireInteraction: false
                                    });
                                }
                            }
                        }
                    }
                }

                // Update state
                currentLessonInfo.value = current;

                if (nearest && nearestDiff < 24 * 60 * 60 * 1000) {
                    const mins = Math.floor(nearestDiff / 60000);
                    const hrs = Math.floor(mins / 60);
                    const m = mins % 60;
                    nearest.timeLeft = hrs > 0 ? `${hrs}г ${m}хв` : `${m} хв`;
                    nextLessonInfo.value = nearest;
                } else {
                    nextLessonInfo.value = null;
                }
            };

            // Start timer
            if (nextLessonTimer) clearInterval(nextLessonTimer);
            nextLessonTimer = setInterval(updateTimeBasedInfo, 60000); // Check every minute
            setTimeout(updateTimeBasedInfo, 1000); // Initial check

            // --- Return all template bindings ---
            return {
                mode, loadingFilters, loadingSchedule, errorMessage,
                isDark, toggleDarkMode,
                faculties, eduForms, courses, chairs, groups, employees,
                selectedFaculty, selectedEduForm, selectedCourse, selectedGroup,
                selectedChair, selectedEmployee, selectedDisciplines,
                studyTypes, selectedStudyType,
                dateStart, dateEnd, activeEntities,
                refreshAllSchedules, onSearchInput, searchQuery, searchResults,
                isSearching, isCacheLoaded, cacheStatus, selectSearchResult,
                availableDisciplines, canAdd, groupedSchedule, scheduleStats,
                onFacultyChange, loadGroups, loadChairs, loadEmployees,
                addEntity, removeEntity, clearAll, exportExcel,
                toggleDiscipline, getColorClass: SA.getColorClass,
                getLessonTypeClass: SA.getLessonTypeClass,
                getLessonTypeIcon: SA.getLessonTypeIcon,
                isActiveLesson, getLessonProgress,
                showFreeTimeModal, findCommonFreeSlots, commonFreeSlots,
                showNoteModal, noteText, currentNoteKey, currentNoteTitle,
                openNote, saveNote, hasNote, showAllNotesModal, allNotesList, deleteNote,
                showSettingsModal, defaultTimes: SA.defaultTimes, customTimes,
                resetCustomTimes, saveState, saveGlobalTimes,
                adminMode, toggleAdminLogin, globalLinks, showAdminModal,
                openAdminModal, adminTargetTitle, adminTargetKey, adminForm,
                saveAdminLinks, getGlobalLink,
                occupancyDate, isScanning, scanProgress, stopScan,
                occupancyResults, startOccupancyScan, exportOccupancy,
                occupancySearch, filteredOccupancyResults, scanErrors,
                // NEW features
                favorites, viewMode, datePreset, sidebarOpen,
                toastMessage, toastVisible, nextLessonInfo,
                setDateRange, shiftWeek,
                addToFavorites, removeFavorite, loadFromFavorite,
                exportICal, shareSchedule, showToast,
                // Auto-Refresh
                autoRefreshEnabled, autoRefreshInterval, lastRefreshTime,
                toggleAutoRefresh, setAutoRefreshInterval,
                // Time info
                nextLessonInfo, currentLessonInfo,
                // Notifications
                notificationsEnabled, requestNotificationPermission,

                // Methods
                openReportModal, loadReportChairs, loadReportEmployees, downloadReport,
                reportForm, reportChairs, reportEmployees, showReportModal, isReportFormValid, isDownloadingReport
            };
        }
    }).mount('#app');
} catch (e) {
    alert("CRITICAL ERROR: " + e.message + "\nCheck console for details.");
    console.error(e);
}
