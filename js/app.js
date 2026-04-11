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
    // Backward-compatibility guard for stale cached app versions that still reference ReportModule eagerly.
    window.ReportModule = window.ReportModule || {
        state: {},
        methods: {},
        computed: { isReportFormValid: { value: false } }
    };
    const SA = window.ScheduleApp;

    const App = {
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
            const lessonTypeFilter = ref(''); // '', 'лекц', 'практ', 'лаб', 'семін', etc.
            const lessonTypeOptions = [
                { value: '', label: 'Всі типи' },
                { value: 'лекц', label: 'Лекції' },
                { value: 'практ', label: 'Практики' },
                { value: 'лаб', label: 'Лабораторні' },
                { value: 'семін', label: 'Семінари' },
                { value: 'консульт', label: 'Консультації' },
                { value: 'екзам', label: 'Екзамени' }
            ];
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
            const searchPrefixIndex = ref({});

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

            // Report Download (lazy-loaded module state host)
            const reportState = Vue.reactive({
                showReportModal: false,
                isDownloadingReport: false,
                reportProgress: { current: 0, total: 0, progress: '', done: false, error: null },
                reportForm: { faculty: '', chair: '', teacher: '', monthStart: '', monthEnd: '' },
                reportChairs: [],
                reportEmployees: [],
                reportError: ''
            });
            window.ScheduleAppReportState = reportState;

            const isReportFormValid = computed(() => {
                return reportState.reportForm.faculty &&
                    reportState.reportForm.chair &&
                    reportState.reportForm.teacher &&
                    reportState.reportForm.monthStart &&
                    reportState.reportForm.monthEnd;
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
            const safeParse = (key, fallback) => {
                try {
                    const val = localStorage.getItem(key);
                    return val ? JSON.parse(val) : fallback;
                } catch (e) {
                    console.error(`Failed to parse ${key}`, e);
                    return fallback;
                }
            };

            const favorites = ref(safeParse('schedule_favorites', []));
            const activeFavoriteKey = ref(localStorage.getItem('schedule_activeFavoriteKey') || '');
            const viewMode = ref(localStorage.getItem('schedule_viewMode') || 'cards');
            const deliveryModeFilter = ref(localStorage.getItem('schedule_delivery_mode') || '');
            const datePreset = ref('');
            const sidebarOpen = ref(false);
            const toastMessage = ref('');
            const toastVisible = ref(false);
            const nextLessonInfo = ref(null);
            const currentLessonInfo = ref(null);
            const scheduleChangeLog = ref(safeParse('schedule_change_log_v1', []));
            const showChangeHistoryModal = ref(false);
            const aliasesMap = ref(safeParse('schedule_aliases_v1', {}));
            const aliasSource = ref('');
            const aliasTarget = ref('');
            const aliasType = ref('all');
            const showFreeNowOnly = ref(false);
            const notifiedCancellationDigestKey = ref('');
            let nextLessonTimer = null;

            const saveAliases = () => {
                localStorage.setItem('schedule_aliases_v1', JSON.stringify(aliasesMap.value));
            };

            const aliasKey = (type, source) => `${type}::${SA.normalize(String(source || '').trim())}`;

            const resolveAlias = (value, preferredType = 'all') => {
                const input = String(value || '').trim();
                if (!input) return '';
                const exactType = aliasesMap.value[aliasKey(preferredType, input)];
                if (exactType) return exactType;
                const allType = aliasesMap.value[aliasKey('all', input)];
                return allType || input;
            };

            const getDisplayDiscipline = (lesson) => resolveAlias(lesson?.discipline || '', 'discipline');
            const getDisplayTeacher = (lesson) => resolveAlias(lesson?.teacher || '', 'teacher');

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
                cacheStatus, searchQuery, searchResults, searchPrefixIndex
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
                    lessonData.hasOnline = !!SA.getGlobalLink(lessonData, 'onlineUrl', adminRefs);
                    lessonData.isCancelled = /(скас|відмін|перенес|cancel)/i.test(String(lesson.discipline || ''));

                    // Lesson type filter
                    if (lessonTypeFilter.value) {
                        const t = (lesson.study_type || '').toLowerCase();
                        if (!t.includes(lessonTypeFilter.value.toLowerCase())) return;
                    }

                    // Delivery mode filter
                    if (deliveryModeFilter.value === 'online' && !lessonData.hasOnline) return;
                    if (deliveryModeFilter.value === 'offline' && lessonData.hasOnline) return;

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
                        days[lesson.full_date].slots[displayTime] = {
                            time: displayTime,
                            start: finalStart || lessonData.timeStart || '',
                            end: finalEnd || lessonData.timeEnd || '',
                            _seen: new Set(),
                            lessons: []
                        };
                    } else {
                        const slotRef = days[lesson.full_date].slots[displayTime];
                        if (!slotRef.start && (finalStart || lessonData.timeStart)) {
                            slotRef.start = finalStart || lessonData.timeStart || '';
                        }
                        if (!slotRef.end && (finalEnd || lessonData.timeEnd)) {
                            slotRef.end = finalEnd || lessonData.timeEnd || '';
                        }
                    }
                    const slotRef = days[lesson.full_date].slots[displayTime];
                    const lessonSig = [
                        lessonData.discipline || '',
                        lessonData.teacher || '',
                        lessonData.cabinet || '',
                        lessonData.type || '',
                        lessonData.group || '',
                        slotRef.time || '',
                        slotRef.start || '',
                        slotRef.end || '',
                        lessonData.entityId || '',
                        lessonData.entityType || ''
                    ].join('||');
                    if (!slotRef._seen.has(lessonSig)) {
                        slotRef._seen.add(lessonSig);
                        slotRef.lessons.push(lessonData);
                    }
                });

                return Object.values(days).map(day => {
                    const sortedSlots = Object.values(day.slots).sort((a, b) => {
                        const na = parseInt(a.time) || 99;
                        const nb = parseInt(b.time) || 99;
                        return na - nb;
                    }).map((slot) => ({
                        time: slot.time,
                        start: slot.start,
                        end: slot.end,
                        lessons: slot.lessons
                    }));
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

            const conflictSlots = computed(() => {
                if (activeEntities.value.length < 2) return [];
                const out = [];
                groupedSchedule.value.forEach((day) => {
                    day.slots.forEach((slot) => {
                        const uniqueEntities = new Set(slot.lessons.map((l) => `${l.entityType}:${l.entityId}`));
                        if (uniqueEntities.size < 2) return;
                        out.push({
                            date: day.date,
                            dayName: day.dayName,
                            time: slot.time,
                            items: slot.lessons.map((l) => ({
                                entityName: l.entityName,
                                discipline: getDisplayDiscipline(l),
                                teacher: getDisplayTeacher(l),
                                cabinet: l.cabinet || '—',
                                type: l.type || '—'
                            }))
                        });
                    });
                });
                return out;
            });

            const advancedAnalytics = computed(() => {
                const dayLoad = {};
                const pairUsage = {};
                groupedSchedule.value.forEach((day) => {
                    let dayPairs = 0;
                    day.slots.forEach((slot) => {
                        dayPairs += slot.lessons.length;
                        const pairNum = parseInt(String(slot.time || '').match(/(\d+)/)?.[1] || '0', 10);
                        if (pairNum) pairUsage[pairNum] = (pairUsage[pairNum] || 0) + slot.lessons.length;
                    });
                    dayLoad[`${day.dayName}, ${day.date}`] = dayPairs;
                });

                const sortedDays = Object.entries(dayLoad)
                    .map(([name, count]) => ({ name, count }))
                    .sort((a, b) => b.count - a.count);

                const busiest = sortedDays[0] || null;
                const lightest = sortedDays[sortedDays.length - 1] || null;
                const avg = sortedDays.length > 0
                    ? (sortedDays.reduce((sum, d) => sum + d.count, 0) / sortedDays.length).toFixed(1)
                    : '0.0';

                const topPairs = Object.entries(pairUsage)
                    .map(([pair, count]) => ({ pair, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3);

                return {
                    busiest,
                    lightest,
                    avgDaily: avg,
                    topPairs
                };
            });

            const currentPairNow = computed(() => {
                const now = new Date();
                const mins = now.getHours() * 60 + now.getMinutes();
                const source = customTimes.value || {};
                for (let i = 1; i <= 7; i++) {
                    const time = source[i] || source[String(i)];
                    if (!time || !time.start || !time.end) continue;
                    const [sh, sm] = time.start.split(':').map(Number);
                    const [eh, em] = time.end.split(':').map(Number);
                    const start = sh * 60 + sm;
                    const end = eh * 60 + em;
                    if (mins >= start && mins < end) return i;
                }
                return null;
            });

            const freeRoomsNow = computed(() => {
                if (!showFreeNowOnly.value || !currentPairNow.value) return [];
                return filteredOccupancyResults.value
                    .filter((cab) => !cab.slots?.[currentPairNow.value])
                    .slice(0, 200);
            });

            const mobileWidgetData = computed(() => {
                const now = new Date();
                const tomorrow = new Date(now);
                tomorrow.setDate(now.getDate() + 1);
                const toDmy = (dt) => {
                    const dd = String(dt.getDate()).padStart(2, '0');
                    const mm = String(dt.getMonth() + 1).padStart(2, '0');
                    const yy = dt.getFullYear();
                    return `${dd}.${mm}.${yy}`;
                };
                const normalizeDmy = (value) => {
                    const parts = String(value || '').split('.');
                    if (parts.length !== 3) return String(value || '');
                    const dd = String(parseInt(parts[0], 10)).padStart(2, '0');
                    const mm = String(parseInt(parts[1], 10)).padStart(2, '0');
                    const yy = String(parseInt(parts[2], 10));
                    return `${dd}.${mm}.${yy}`;
                };
                const todayStr = toDmy(now);
                const tomorrowStr = toDmy(tomorrow);

                let todayCount = 0;
                let tomorrowCount = 0;
                const seenToday = new Set();
                const seenTomorrow = new Set();
                activeEntities.value.forEach((entity) => {
                    (entity.scheduleData || []).forEach((lesson) => {
                        const dateNorm = normalizeDmy(lesson.full_date);
                        const sig = [
                            dateNorm,
                            lesson.study_time || '',
                            lesson.discipline || '',
                            SA.stripHtml(lesson.teacher || lesson.employee || ''),
                            lesson.cabinet || '',
                            entity.id || '',
                            entity.type || ''
                        ].join('||');
                        if (dateNorm === todayStr) seenToday.add(sig);
                        if (dateNorm === tomorrowStr) seenTomorrow.add(sig);
                    });
                });
                todayCount = seenToday.size;
                tomorrowCount = seenTomorrow.size;

                return {
                    todayCount,
                    tomorrowCount,
                    next: nextLessonInfo.value
                };
            });

            const aliasesList = computed(() => {
                return Object.entries(aliasesMap.value)
                    .map(([key, value]) => {
                        const [type, source] = key.split('::');
                        return { key, type, source, value };
                    })
                    .sort((a, b) => a.source.localeCompare(b.source, 'uk'));
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

            const saveChangeLog = () => {
                localStorage.setItem('schedule_change_log_v1', JSON.stringify(scheduleChangeLog.value));
            };

            const lessonStableKey = (lesson) => {
                const teacherOrGroup = SA.stripHtml(lesson.teacher || lesson.group || '');
                return [
                    lesson.full_date || '',
                    lesson.discipline || '',
                    lesson.type || '',
                    teacherOrGroup
                ].join('||');
            };

            const collectScheduleChanges = (oldData, newData, entity) => {
                const oldMap = new Map((oldData || []).map((l) => [lessonStableKey(l), l]));
                const changes = [];

                (newData || []).forEach((newLesson) => {
                    const key = lessonStableKey(newLesson);
                    const oldLesson = oldMap.get(key);
                    if (!oldLesson) return;

                    if ((oldLesson.study_time || '') !== (newLesson.study_time || '')) {
                        changes.push({
                            at: Date.now(),
                            entityName: entity.name,
                            entityType: entity.type,
                            discipline: newLesson.discipline || '—',
                            date: newLesson.full_date || '',
                            field: 'pair',
                            from: oldLesson.study_time || '—',
                            to: newLesson.study_time || '—'
                        });
                    }

                    if ((oldLesson.cabinet || '') !== (newLesson.cabinet || '')) {
                        changes.push({
                            at: Date.now(),
                            entityName: entity.name,
                            entityType: entity.type,
                            discipline: newLesson.discipline || '—',
                            date: newLesson.full_date || '',
                            field: 'cabinet',
                            from: oldLesson.cabinet || '—',
                            to: newLesson.cabinet || '—'
                        });
                    }
                });

                return changes;
            };

            const appendScheduleChanges = (changes) => {
                if (!changes || changes.length === 0) return;
                scheduleChangeLog.value = [...changes, ...scheduleChangeLog.value].slice(0, 300);
                saveChangeLog();
            };

            // Auto-Refresh Logic
            const refreshAllSchedules = async () => {
                if (activeEntities.value.length === 0) return;
                let changesDetected = 0;
                const changeEvents = [];
                for (const entity of activeEntities.value) {
                    const { action, payload } = SA.buildSchedulePayload(entity, scheduleRefs);
                    const newData = await fetchApi(action, payload, { silent: true });
                    if (!newData) continue;
                    const oldFingerprint = JSON.stringify(entity.scheduleData?.map(l => l.discipline + l.study_time + l.full_date).sort());
                    const newFingerprint = JSON.stringify(newData.map(l => l.discipline + l.study_time + l.full_date).sort());
                    if (oldFingerprint !== newFingerprint) {
                        changeEvents.push(...collectScheduleChanges(entity.scheduleData || [], newData, entity));
                        entity.scheduleData = newData;
                        changesDetected++;
                    }
                }
                appendScheduleChanges(changeEvents);
                lastRefreshTime.value = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
                if (changesDetected > 0) {
                    showToast(`Розклад оновлено (${changesDetected} змін)`);
                    if (notificationsEnabled.value && Notification.permission === "granted") {
                        new Notification("Розклад оновлено", {
                            body: `Виявлено ${changesDetected} змін(и) у розкладі.`
                        });
                    }
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

            const setDeliveryMode = (value) => {
                deliveryModeFilter.value = value;
                localStorage.setItem('schedule_delivery_mode', value);
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
            // #17: store interval ID so it can be cleaned up on unmount
            const _clockIntervalId = setInterval(() => { currentTime.value = new Date(); }, 60000);

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

            watch(activeEntities, () => {
                if ((activeEntities.value || []).length > 0) {
                    persistOfflineSnapshot();
                }
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

            const ensureReportModule = async () => {
                const hasRealModule = !!(
                    window.ReportModule &&
                    window.ReportModule.__real === true &&
                    window.ReportModule.methods &&
                    typeof window.ReportModule.methods.openReportModal === 'function' &&
                    typeof window.ReportModule.methods.loadReportChairs === 'function' &&
                    typeof window.ReportModule.methods.loadReportEmployees === 'function' &&
                    typeof window.ReportModule.methods.downloadReport === 'function'
                );
                if (hasRealModule) return window.ReportModule;
                await SA.loadScriptOnce('/js/report.js?v=20260411-1');
                return window.ReportModule;
            };

            const openReportModal = async () => {
                const mod = await ensureReportModule();
                return mod.methods.openReportModal();
            };
            const loadReportChairs = async () => {
                const mod = await ensureReportModule();
                return mod.methods.loadReportChairs();
            };
            const loadReportEmployees = async () => {
                const mod = await ensureReportModule();
                return mod.methods.loadReportEmployees();
            };
            const downloadReport = async () => {
                const mod = await ensureReportModule();
                return mod.methods.downloadReport();
            };

            const ensureOccupancyModule = async () => {
                if (typeof SA.startOccupancyScan === 'function' && typeof SA.exportOccupancy === 'function') return;
                await SA.loadScriptOnce('/js/occupancy.js');
            };

            const startOccupancyScan = async () => {
                await ensureOccupancyModule();
                if (typeof SA.startOccupancyScan !== 'function') {
                    showToast('Сканер аудиторій тимчасово недоступний');
                    return;
                }
                return SA.startOccupancyScan(scanRefs);
            };
            const exportOccupancy = async () => {
                await ensureOccupancyModule();
                if (typeof SA.exportOccupancy !== 'function') {
                    showToast('Експорт зайнятості тимчасово недоступний');
                    return;
                }
                return SA.exportOccupancy({ occupancyResults, occupancyDate });
            };

            const openNote = (lesson, date, time) => SA.openNote(lesson, date, time, noteRefs);
            const saveNote = () => SA.saveNote(noteRefs);
            const hasNote = (lesson, date, time) => SA.hasNote(lesson, date, time, noteRefs);
            const deleteNote = (key) => SA.deleteNote(key, noteRefs);

            const toggleAdminLogin = () => SA.toggleAdminLogin(adminRefs);
            const openAdminModal = (lesson) => SA.openAdminModal(lesson, adminRefs);
            const saveAdminLinks = () => SA.saveAdminLinks(adminRefs);
            const saveGlobalTimes = () => SA.saveGlobalTimes(adminRefs);
            const getGlobalLink = (lesson, type) => SA.getGlobalLink(lesson, type, adminRefs);






            // --- Watchers ---
            watch(mode, () => {
                selectedGroup.value = '';
                selectedEmployee.value = '';
                if (mode.value !== 'occupancy') showFreeNowOnly.value = false;
                if (selectedFaculty.value) {
                    if (mode.value === 'student') loadGroups();
                    else loadChairs();
                }
            });

            watch(viewMode, (value) => {
                localStorage.setItem('schedule_viewMode', value);
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
                await loadFavoritesFromHash();
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

                if (!navigator.onLine && activeEntities.value.length === 0) {
                    restoreOfflineSnapshot(true);
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

            const OFFLINE_SNAPSHOT_KEY = 'schedule_offline_snapshot_v1';
            const OFFLINE_SNAPSHOT_META_KEY = 'schedule_offline_snapshot_meta_v1';
            const offlineSnapshotAt = ref(localStorage.getItem(OFFLINE_SNAPSHOT_META_KEY) || '');

            const persistOfflineSnapshot = () => {
                try {
                    const snapshot = {
                        at: new Date().toISOString(),
                        mode: mode.value,
                        dateStart: dateStart.value,
                        dateEnd: dateEnd.value,
                        selectedDisciplines: selectedDisciplines.value,
                        entities: (activeEntities.value || []).slice(0, 12)
                    };
                    localStorage.setItem(OFFLINE_SNAPSHOT_KEY, JSON.stringify(snapshot));
                    localStorage.setItem(OFFLINE_SNAPSHOT_META_KEY, snapshot.at);
                    offlineSnapshotAt.value = snapshot.at;
                    return true;
                } catch (e) {
                    console.error('Offline snapshot save failed', e);
                    return false;
                }
            };

            const saveOfflineSnapshot = () => {
                const ok = persistOfflineSnapshot();
                if (ok) showToast('💾 Офлайн-знімок розкладу збережено');
            };

            const restoreOfflineSnapshot = (silent = false) => {
                try {
                    const raw = localStorage.getItem(OFFLINE_SNAPSHOT_KEY);
                    if (!raw) {
                        if (!silent) showToast('Офлайн-знімок ще не створено');
                        return false;
                    }
                    const parsed = JSON.parse(raw);
                    if (!parsed || !Array.isArray(parsed.entities) || parsed.entities.length === 0) {
                        if (!silent) showToast('Офлайн-знімок порожній');
                        return false;
                    }
                    mode.value = parsed.mode || mode.value;
                    dateStart.value = parsed.dateStart || dateStart.value;
                    dateEnd.value = parsed.dateEnd || dateEnd.value;
                    selectedDisciplines.value = Array.isArray(parsed.selectedDisciplines) ? parsed.selectedDisciplines : [];
                    activeEntities.value = parsed.entities;
                    datePreset.value = '';
                    if (!silent) showToast(`📦 Відновлено офлайн-знімок (${parsed.entities.length})`);
                    return true;
                } catch (e) {
                    console.error('Offline snapshot restore failed', e);
                    if (!silent) showToast('Не вдалося відновити офлайн-знімок');
                    return false;
                }
            };

            const setTomorrowRange = () => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const iso = tomorrow.toISOString().split('T')[0];
                dateStart.value = iso;
                dateEnd.value = iso;
                datePreset.value = 'tomorrow';
                if (activeEntities.value.length > 0) refreshAllSchedules();
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

            const buildFavoriteKey = (fav) => `${fav.type}:${fav.id}`;

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

            const removeFavorite = (id, type) => {
                favorites.value = favorites.value.filter(f => !(f.id == id && (!type || f.type === type)));
                if (activeFavoriteKey.value && !favorites.value.some((f) => buildFavoriteKey(f) === activeFavoriteKey.value)) {
                    activeFavoriteKey.value = '';
                    localStorage.removeItem('schedule_activeFavoriteKey');
                }
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
                activeFavoriteKey.value = buildFavoriteKey(fav);
                localStorage.setItem('schedule_activeFavoriteKey', activeFavoriteKey.value);
            };

            const quickSwitchFavorite = async (direction) => {
                if (favorites.value.length === 0) return;
                const currentIndex = favorites.value.findIndex((f) => buildFavoriteKey(f) === activeFavoriteKey.value);
                const safeCurrent = currentIndex >= 0 ? currentIndex : 0;
                const nextIndex = (safeCurrent + direction + favorites.value.length) % favorites.value.length;
                await loadFromFavorite(favorites.value[nextIndex]);
            };

            const loadAllFavorites = async () => {
                if (!favorites.value.length) {
                    showToast('Додайте обране для швидкого режиму');
                    return;
                }
                loadingSchedule.value = true;
                const entities = [];
                for (const fav of favorites.value) {
                    const entity = { id: fav.id, name: fav.name, type: fav.type };
                    const { action, payload } = SA.buildSchedulePayload(entity, scheduleRefs);
                    const data = await fetchApi(action, payload, { silent: true });
                    if (data) entities.push({ ...entity, scheduleData: data });
                }
                loadingSchedule.value = false;
                if (!entities.length) {
                    showToast('Не вдалося завантажити обране');
                    return;
                }
                activeEntities.value = entities;
                showToast(`⭐ Завантажено обране: ${entities.length}`);
            };

            const clearChangeHistory = () => {
                scheduleChangeLog.value = [];
                saveChangeLog();
                showToast('Історію змін очищено');
            };

            const addAlias = () => {
                const from = aliasSource.value.trim();
                const to = aliasTarget.value.trim();
                if (!from || !to) {
                    showToast('Заповніть обидва поля для аліасу');
                    return;
                }
                aliasesMap.value[aliasKey(aliasType.value, from)] = to;
                saveAliases();
                aliasSource.value = '';
                aliasTarget.value = '';
                showToast('Аліас додано');
            };

            const removeAlias = (key) => {
                delete aliasesMap.value[key];
                aliasesMap.value = { ...aliasesMap.value };
                saveAliases();
            };

            const clearLocalData = () => {
                const ok = window.confirm('Очистити локальні дані додатку на цьому пристрої?');
                if (!ok) return;
                const keys = [
                    SA.STORAGE_KEY,
                    'schedule_favorites',
                    'schedule_activeFavoriteKey',
                    'schedule_viewMode',
                    'schedule_delivery_mode',
                    'schedule_change_log_v1',
                    'schedule_aliases_v1',
                    'schedule_autoRefresh',
                    'schedule_autoRefreshInterval',
                    'schedule_notifications',
                    OFFLINE_SNAPSHOT_KEY,
                    OFFLINE_SNAPSHOT_META_KEY
                ];
                keys.forEach((k) => localStorage.removeItem(k));
                // Reset runtime state without page reload.
                mode.value = 'student';
                loadingFilters.value = false;
                loadingSchedule.value = false;
                errorMessage.value = '';

                selectedFaculty.value = '';
                selectedEduForm.value = '';
                selectedCourse.value = '';
                selectedGroup.value = '';
                selectedChair.value = '';
                selectedEmployee.value = '';
                selectedStudyType.value = '';
                selectedDisciplines.value = [];
                lessonTypeFilter.value = '';

                activeEntities.value = [];
                favorites.value = [];
                activeFavoriteKey.value = '';
                viewMode.value = 'cards';
                deliveryModeFilter.value = '';
                datePreset.value = '';
                sidebarOpen.value = false;

                searchQuery.value = '';
                searchResults.value = [];
                isSearching.value = false;

                notesMap.value = {};
                showNoteModal.value = false;
                showAllNotesModal.value = false;
                noteText.value = '';
                currentNoteKey.value = '';
                currentNoteTitle.value = '';

                customTimes.value = JSON.parse(JSON.stringify(SA.defaultTimes));
                showSettingsModal.value = false;

                adminMode.value = false;
                adminPassword.value = '';
                showAdminModal.value = false;

                showFreeTimeModal.value = false;
                commonFreeSlots.value = [];

                occupancyResults.value = [];
                occupancySearch.value = '';
                isScanning.value = false;
                stopScan.value = false;
                scanErrors.value = 0;
                showFreeNowOnly.value = false;

                scheduleChangeLog.value = [];
                showChangeHistoryModal.value = false;
                aliasesMap.value = {};
                aliasSource.value = '';
                aliasTarget.value = '';
                aliasType.value = 'all';

                autoRefreshEnabled.value = false;
                autoRefreshInterval.value = 10;
                lastRefreshTime.value = null;
                if (autoRefreshTimer) {
                    clearInterval(autoRefreshTimer);
                    autoRefreshTimer = null;
                }
                notificationsEnabled.value = false;
                notifiedLessons.value = new Set();
                offlineSnapshotAt.value = '';

                // Keep current theme visually stable and in sync.
                if (isDark.value) {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
                history.replaceState(null, '', window.location.pathname);
                showToast('Локальні дані очищено');
            };

            // Expose stable UI handlers for mobile HTML fallbacks.
            try {
                window.ScheduleAppUI = window.ScheduleAppUI || {};
                window.ScheduleAppUI.toggleTheme = () => toggleDarkMode();
                window.ScheduleAppUI.clearLocalData = () => clearLocalData();
            } catch (e) { }

            const openFreeRoomsNow = async () => {
                const todayIso = new Date().toISOString().split('T')[0];
                mode.value = 'occupancy';
                showFreeNowOnly.value = true;

                if (!currentPairNow.value) {
                    showToast('Зараз поза межами пар');
                    return;
                }

                if (occupancyDate.value !== todayIso) {
                    occupancyDate.value = todayIso;
                }

                if (!occupancyResults.value.length && !isScanning.value) {
                    await startOccupancyScan();
                }
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

            const shareFavoritesSet = async () => {
                if (!favorites.value.length) {
                    showToast('Додайте хоча б 1 елемент в обране');
                    return;
                }
                const raw = JSON.stringify(favorites.value.map((f) => ({ id: f.id, name: f.name, type: f.type })));
                const b64 = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                const url = `${window.location.origin}${window.location.pathname}#favset=${b64}`;
                try {
                    await navigator.clipboard.writeText(url);
                    showToast('🔗 Посилання на обране скопійовано');
                } catch (e) {
                    showToast('Не вдалося скопіювати посилання');
                }
            };

            const loadFavoritesFromHash = async () => {
                const match = window.location.hash.match(/favset=([^&]+)/);
                if (!match) return false;
                try {
                    const norm = match[1].replace(/-/g, '+').replace(/_/g, '/');
                    const padded = norm + '='.repeat((4 - (norm.length % 4)) % 4);
                    const decoded = decodeURIComponent(escape(atob(padded)));
                    const parsed = JSON.parse(decoded);
                    if (!Array.isArray(parsed) || parsed.length === 0) return false;
                    favorites.value = parsed
                        .filter((x) => x && x.id && x.name && (x.type === 'Група' || x.type === 'Викладач'))
                        .slice(0, 40);
                    saveFavorites();
                    activeFavoriteKey.value = '';
                    localStorage.removeItem('schedule_activeFavoriteKey');
                    showToast(`Імпортовано обране: ${favorites.value.length}`);
                    return true;
                } catch (e) {
                    console.error('Failed to parse favset hash', e);
                    return false;
                }
            };

            const openNextLessonInGoogleCalendar = () => {
                const next = nextLessonInfo.value;
                if (!next || !next.date || !next.start || !next.end) {
                    exportICal();
                    showToast('Найближчу пару не знайдено, експортовано iCal');
                    return;
                }
                const [d, m, y] = next.date.split('.').map(Number);
                const [sh, sm] = next.start.split(':').map(Number);
                const [eh, em] = next.end.split(':').map(Number);
                const start = new Date(y, m - 1, d, sh, sm, 0);
                const end = new Date(y, m - 1, d, eh, em, 0);
                const toGoogleDate = (dt) => dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

                const params = new URLSearchParams({
                    action: 'TEMPLATE',
                    text: next.discipline || 'Пара',
                    dates: `${toGoogleDate(start)}/${toGoogleDate(end)}`,
                    details: `Викладач: ${next.teacher || '—'}\nТип: ${next.type || '—'}`,
                    location: next.cabinet || ''
                });
                window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank');
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
                                    remainingPercent: Math.min(100, Math.max(0, 100 - percent)),
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
                                    time: slot.time,
                                    date: dayData.date,
                                    start: slot.start,
                                    end: slot.end,
                                    type: l.type || ''
                                };
                            }
                        }

                        // Notification Logic (15 and 5 mins before)
                        const diffMins = Math.floor(diff / 60000);
                        if (notificationsEnabled.value && diffMins > 0) {
                            const l = slot.lessons[0];
                            [15, 5].forEach((lead) => {
                                if (diffMins > lead) return;
                                const notifKey = `${dayData.date}-${slot.start}-${l.discipline}-${lead}`;
                                if (notifiedLessons.value.has(notifKey)) return;
                                notifiedLessons.value.add(notifKey);
                                if (Notification.permission === "granted") {
                                    new Notification(`🔔 Пара через ${lead} хв`, {
                                        body: `${l.discipline} о ${slot.start}. ${l.cabinet || ''}`,
                                        requireInteraction: false
                                    });
                                }
                            });
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

                const digestKey = new Date().toLocaleDateString('uk-UA');
                if (notifiedCancellationDigestKey.value !== digestKey) {
                    const d = new Date();
                    const todayDate = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
                    let cancelledCount = 0;
                    activeEntities.value.forEach((e) => {
                        (e.scheduleData || []).forEach((lesson) => {
                            if (lesson.full_date !== todayDate) return;
                            if (/(скас|відмін|перенес|cancel)/i.test(String(lesson.discipline || ''))) {
                                cancelledCount++;
                            }
                        });
                    });
                    if (cancelledCount > 0 && notificationsEnabled.value && Notification.permission === "granted") {
                        new Notification('⚠ Зміни на сьогодні', {
                            body: `Скасовані/перенесені пари: ${cancelledCount}`
                        });
                    }
                    notifiedCancellationDigestKey.value = digestKey;
                }
            };

            // Start timer: every second for smooth progress bar when lesson is active
            if (nextLessonTimer) clearInterval(nextLessonTimer);
            nextLessonTimer = setInterval(updateTimeBasedInfo, 1000);
            setTimeout(updateTimeBasedInfo, 300); // Initial check

            // #17: cleanup on unmount to prevent timer leaks during HMR / reinit
            const { onUnmounted } = Vue;
            onUnmounted(() => {
                clearInterval(_clockIntervalId);
                if (nextLessonTimer) clearInterval(nextLessonTimer);
                if (autoRefreshTimer) clearInterval(autoRefreshTimer);
            });

            // --- Return all template bindings ---
            return {
                mode, loadingFilters, loadingSchedule, errorMessage,
                isDark, toggleDarkMode,
                faculties, eduForms, courses, chairs, groups, employees,
                selectedFaculty, selectedEduForm, selectedCourse, selectedGroup,
                selectedChair, selectedEmployee, selectedDisciplines,
                studyTypes, selectedStudyType,
                lessonTypeFilter, lessonTypeOptions,
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
                favorites, activeFavoriteKey, viewMode, datePreset, sidebarOpen,
                deliveryModeFilter, setDeliveryMode,
                toastMessage, toastVisible, nextLessonInfo,
                setDateRange, setTomorrowRange, shiftWeek,
                addToFavorites, removeFavorite, loadFromFavorite, quickSwitchFavorite, loadAllFavorites,
                scheduleChangeLog, showChangeHistoryModal, clearChangeHistory,
                exportICal, shareSchedule, showToast,
                shareFavoritesSet, openNextLessonInGoogleCalendar,
                conflictSlots, advancedAnalytics,
                aliasesList, aliasSource, aliasTarget, aliasType, addAlias, removeAlias,
                getDisplayDiscipline, getDisplayTeacher,
                showFreeNowOnly, openFreeRoomsNow, currentPairNow, freeRoomsNow,
                mobileWidgetData,
                clearLocalData, saveOfflineSnapshot, restoreOfflineSnapshot, offlineSnapshotAt,
                // Auto-Refresh
                autoRefreshEnabled, autoRefreshInterval, lastRefreshTime,
                toggleAutoRefresh, setAutoRefreshInterval,
                // Time info
                nextLessonInfo, currentLessonInfo,
                // Notifications
                notificationsEnabled, requestNotificationPermission,

                // --- Report Module (lazy) ---
                ...Vue.toRefs(reportState),
                openReportModal, loadReportChairs, loadReportEmployees, downloadReport,
                isReportFormValid
            };
        }
    };
    const app = createApp(App);
    if (window.CurrentLessonBannerComponent) {
        app.component('CurrentLessonBanner', window.CurrentLessonBannerComponent);
    }
    app.mount('#app');
} catch (e) {
    alert("CRITICAL ERROR: " + e.message + "\nCheck console for details.");
    console.error(e);
}


