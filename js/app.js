// Auto-detect environment:
// - Port 3000 or Vercel -> Use Node Proxy (/api/)
// - Otherwise (PHP Hosting) -> Use PHP Proxy (proxy.php)
const isNode = window.location.port === '3000' || window.location.hostname.includes('vercel.app');
const API_PROXY = isNode ? '/api/' : 'proxy.php?action=';

const VUZ_ID = 11927; // Hardcoded ID from analysis

try {
    if (typeof Vue === 'undefined') {
        throw new Error("Vue library failed to load (CDN issue).");
    }
    const { createApp, ref, computed, onMounted, watch } = Vue;

    createApp({
        setup() {
            // State
            const mode = ref('student'); // 'student' or 'teacher'
            const loadingFilters = ref(false);
            const loadingSchedule = ref(false);
            const errorMessage = ref('');

            // Dictionaries
            const faculties = ref([]);
            const eduForms = ref([]);
            const courses = ref([]);
            const chairs = ref([]);
            const groups = ref([]); // List of groups for selected faculty
            const employees = ref([]); // List of teachers
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
            const selectedGroup = ref(''); // Object {Key, Value}
            const selectedChair = ref('');
            const selectedEmployee = ref(''); // Object {Key, Value}
            const selectedStudyType = ref('');

            // Filter within results
            const selectedDisciplines = ref([]);

            // Dates (Default to current week)
            const dateStart = ref(new Date().toISOString().split('T')[0]);
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);
            const dateEnd = ref(nextWeek.toISOString().split('T')[0]);

            // Active Data
            const activeEntities = ref([]); // Array of { id, name, type, scheduleData }

            // --- Occupancy State ---
            const occupancyDate = ref(new Date().toISOString().split('T')[0]);
            const isScanning = ref(false);
            const stopScan = ref(false);
            const scanProgress = ref({ current: 0, total: 0, text: '' });
            const occupancyResults = ref([]); // Array of { name, building, slots: { 1: ... } }
            const occupancySearch = ref('');

            const filteredOccupancyResults = computed(() => {
                let q = occupancySearch.value.toLowerCase().trim();
                if (!q) return occupancyResults.value;

                // Advanced Normalize: remove separators AND map Latin to Cyrillic
                const normalize = (str) => {
                    let out = str.toLowerCase().replace(/[^a-zа-я0-9іїєґ]/gi, '');
                    // Map Latin lookalikes to Cyrillic
                    const map = {
                        'a': 'а', 'b': 'ь', 'c': 'с', 'd': 'д', 'e': 'е', 'f': 'ф',
                        'g': 'г', 'h': 'н', 'i': 'і', 'j': 'й', 'k': 'к', 'l': 'л',
                        'm': 'м', 'n': 'н', 'o': 'о', 'p': 'р', 'q': 'я', 'r': 'р',
                        's': 'с', 't': 'т', 'u': 'у', 'v': 'в', 'w': 'в', 'x': 'х',
                        'y': 'у', 'z': 'з',
                        // Common specific:
                        '3': 'з', '0': 'о'
                    };
                    // We do a simple Replace for common letters that look IDENTICAL or are common typos
                    // Focus on: k->к, i->і, c->с, x->х, p->р, a->а, o->о, e->е
                    const typoMap = {
                        'k': 'к', 'c': 'с', 'x': 'х', 'p': 'р', 'a': 'а', 'o': 'о', 'e': 'е', 'i': 'і', 'y': 'у'
                    };

                    return out.split('').map(c => typoMap[c] || c).join('');
                };

                const qNorm = normalize(q);

                return occupancyResults.value.filter(c => {
                    return normalize(c.name).includes(qNorm);
                });
            });

            const scanErrors = ref(0);

            // --- Custom Times State ---
            const showSettingsModal = ref(false);
            const defaultTimes = {
                1: { start: '08:30', end: '09:50' },
                2: { start: '10:05', end: '11:25' },
                3: { start: '11:40', end: '13:00' },
                4: { start: '13:15', end: '14:35' },
                5: { start: '14:50', end: '16:10' },
                6: { start: '16:25', end: '17:45' },
                7: { start: '18:00', end: '19:20' },
                8: { start: '19:30', end: '20:50' }
            };
            const customTimes = ref(JSON.parse(JSON.stringify(defaultTimes)));

            const resetCustomTimes = () => {
                customTimes.value = JSON.parse(JSON.stringify(defaultTimes));
                saveState();
            };

            // --- Admin State ---
            const adminMode = ref(false);

            const showAdminModal = ref(false);
            const adminTargetTitle = ref('');
            const adminTargetKey = ref('');
            const adminForm = ref({ courseUrl: '', onlineUrl: '' });
            const adminPassword = ref('');
            const globalLinks = ref({});

            // --- API Helpers ---
            const fetchApi = async (action, params = {}, options = {}) => {
                // Append action to the path for the Node server to parse correctly
                const url = new URL(API_PROXY + action, window.location.origin);

                url.searchParams.append('aVuzID', VUZ_ID);

                // Filters needs GiveStudyTimes. 
                if (action === 'GetStudyGroups') {
                    url.searchParams.append('aGiveStudyTimes', 'false');
                } else if (!action.startsWith('GetScheduleData') && action !== 'GetEmployees') {
                    url.searchParams.append('aGiveStudyTimes', 'true');
                }

                // Force JSONP params to satisfy the server
                // The server seems to require these to function correctly (avoids 500/401)
                // We use a fixed callback name or random.
                const callbackName = 'jsonp' + Date.now();
                url.searchParams.append('callback', callbackName);
                url.searchParams.append('_', Date.now());

                const quoteIfNeeded = (val) => {
                    if (options.noQuote) return val;
                    // Avoid double quoting if already quoted
                    if (typeof val === 'string' && val.startsWith('"') && val.endsWith('"')) return val;
                    if (typeof val === 'string') return `"${val}"`;
                    return val;
                };

                for (const [key, value] of Object.entries(params)) {
                    if (value !== undefined && value !== null) {
                        url.searchParams.append(key, quoteIfNeeded(value));
                    }
                }

                try {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error('Network error: ' + res.status);

                    const text = await res.text();

                    // Parse JSONP or JSON
                    // expected: jsonp123({...}) or {...}
                    let json;
                    const jsonpMatch = text.match(/^\s*([a-zA-Z0-9_]+)\s*\((.*)\)\s*;?\s*$/s);
                    if (jsonpMatch) {
                        // It is JSONP
                        json = JSON.parse(jsonpMatch[2]);
                    } else {
                        // Try standard JSON
                        json = JSON.parse(text);
                    }

                    return json.d || json; // The API wraps result in 'd' usually
                } catch (e) {
                    if (!options.silent) {
                        console.error("API Error", e);
                        errorMessage.value = "Помилка завантаження даних";
                    } else {
                        console.warn("Silent API Fail:", action);
                    }
                    return null;
                }
            };

            // --- Computed ---
            // --- Computed ---
            const availableDisciplines = computed(() => {
                const set = new Set();
                activeEntities.value.forEach(entity => {
                    if (!entity.scheduleData) return;
                    entity.scheduleData.forEach(item => {
                        if (item.discipline) set.add(item.discipline);

                        // User requested NO groups in filter ("мне не нужен поиск по группам")
                        // const g = item.group || item.groupName || item.study_group;
                        // if (g) set.add(g);

                        if (item.teacher) {
                            let t = item.teacher;
                            if (t.includes('<')) {
                                const temp = document.createElement("div");
                                temp.innerHTML = t;
                                t = temp.textContent || "";
                            }
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
                // Merge all schedules from activeEntities
                const merged = [];

                activeEntities.value.forEach(entity => {
                    if (!entity.scheduleData) return;
                    entity.scheduleData.forEach(item => {
                        merged.push({
                            ...item,
                            entityName: entity.name,
                            entityId: entity.id, // For coloring
                            entityType: entity.type
                        });
                    });
                });

                // Group by Date -> Time
                const days = {};

                // Sorting helper
                const parseDate = (str) => { // dd.mm.yyyy
                    const [d, m, y] = str.split('.');
                    return new Date(`${y}-${m}-${d}`);
                };

                merged.sort((a, b) => parseDate(a.full_date) - parseDate(b.full_date));

                // Helper to find group name dynamically
                const getGroupName = (obj) => {
                    // 1. Try known keys
                    if (obj.group) return obj.group;
                    if (obj.groupName) return obj.groupName;
                    if (obj.study_group) return obj.study_group;
                    if (obj.stream) return obj.stream;

                    // 2. Check 'contingent' field (Found via Debug: "Група: 121УЗ")
                    if (obj.contingent) {
                        // Try to clean it "Група: 121УЗ" -> "121УЗ"
                        return obj.contingent.replace(/Група:\s*/i, '').trim();
                    }

                    // 3. Search for any key containing 'group' or 'stream'
                    for (const key in obj) {
                        const lower = key.toLowerCase();
                        if ((lower.includes('group') || lower.includes('stream')) && obj[key]) {
                            return obj[key];
                        }
                    }
                    return "";
                };

                merged.forEach(lesson => {
                    // Create Day if not exists
                    if (!days[lesson.full_date]) {
                        days[lesson.full_date] = {
                            date: lesson.full_date,
                            dayName: lesson.week_day,
                            slots: {}
                        };
                    }

                    // normalize data for display
                    const groupName = getGroupName(lesson);

                    const lessonData = {
                        discipline: lesson.discipline,
                        type: lesson.study_type,
                        cabinet: lesson.cabinet,
                        teacher: lesson.employee_short || lesson.employee, // For students seeing teacher
                        group: groupName,
                        entityName: lesson.entityName,
                        entityId: lesson.entityId,
                        timeStart: lesson.study_time_begin,
                        timeEnd: lesson.study_time_end
                    };

                    // Filtering logic
                    if (selectedDisciplines.value.length > 0) {
                        const matchDiscipline = selectedDisciplines.value.includes(lesson.discipline);

                        // Handle Teacher match
                        let matchTeacher = false;
                        if (lesson.teacher || lesson.employee) {
                            if (selectedDisciplines.value.includes(lesson.teacher) || selectedDisciplines.value.includes(lesson.employee)) {
                                matchTeacher = true; // Direct match
                            } else {
                                // Clean match
                                const raw = lesson.teacher || lesson.employee || "";
                                if (raw.includes('<')) {
                                    const temp = document.createElement("div");
                                    temp.innerHTML = raw;
                                    if (selectedDisciplines.value.includes(temp.textContent)) matchTeacher = true;
                                }
                            }
                        }

                        if (!matchDiscipline && !matchTeacher) {
                            return;
                        }
                    }

                    // --- Custom Times Logic ---
                    // Extract pair number "1 пара..." or just rely on API time
                    // However, we want to OVERRIDE the API time if user set custom times.
                    // Heuristic: Check if "N пара" exists in study_time (e.g. "1-ша пара")
                    const pairMatch = lesson.study_time.match(/(\d+).*?пара/i);
                    let finalStart = lesson.study_time_begin;
                    let finalEnd = lesson.study_time_end;
                    let displayTime = lesson.study_time;


                    if (pairMatch) {
                        const pairNum = parseInt(pairMatch[1]);
                        const ct = customTimes.value;
                        const customTime = ct[pairNum] || ct[String(pairNum)];
                        console.log(`Checking pair ${pairNum}:`, customTime);
                        if (customTime) {
                            finalStart = customTime.start;
                            finalEnd = customTime.end;
                            // Update display key to show new time
                            // Reconstruct "1 пара (08:30-09:50)"
                            displayTime = `${pairNum} пара (${finalStart}-${finalEnd})`;
                            console.log(`Applied custom time: ${displayTime}`);

                            // Update lesson data object too for correctness in other views
                            lessonData.timeStart = finalStart;
                            lessonData.timeEnd = finalEnd;
                        }
                    } else {
                        console.log('No pair match for:', lesson.study_time);
                    }

                    if (!days[lesson.full_date].slots[displayTime]) {
                        days[lesson.full_date].slots[displayTime] = {
                            time: displayTime,
                            start: finalStart,
                            end: finalEnd,
                            lessons: []
                        };
                    }
                    days[lesson.full_date].slots[displayTime].lessons.push(lessonData);
                });

                // Convert days object to array and SORT by Date
                return Object.values(days).sort((a, b) => parseDate(a.date) - parseDate(b.date)).map(day => {
                    // Convert slots object to array and SORT by Start Time
                    const sortedSlots = Object.values(day.slots).sort((a, b) => {
                        const [h1, m1] = a.start ? a.start.split(':') : [0, 0];
                        const [h2, m2] = b.start ? b.start.split(':') : [0, 0];
                        return (h1 * 60 + +m1) - (h2 * 60 + +m2);
                    });
                    return { ...day, slots: sortedSlots };
                });
            });

            // --- Methods ---

            const init = async () => {
                loadState();
                loadingFilters.value = true;
                // Initial load -> Get Faculties
                const data = await fetchApi('GetStudentScheduleFiltersData');
                if (data) {
                    faculties.value = data.faculties || [];
                    eduForms.value = data.educForms || [];
                    courses.value = data.courses || [];
                }
                loadingFilters.value = false;
            };

            const clearAll = () => {
                activeEntities.value = [];
                selectedDisciplines.value = [];
            };

            const onFacultyChange = () => {
                // Reset dependants
                groups.value = [];
                chairs.value = [];
                selectedGroup.value = '';
                selectedEmployee.value = '';
                selectedChair.value = '';

                if (!selectedFaculty.value) return;

                if (mode.value === 'student') loadGroups();
                else loadChairs();
            };

            const loadGroups = async () => {
                if (mode.value !== 'student' || !selectedFaculty.value) return;

                const data = await fetchApi('GetStudyGroups', {
                    aFacultyID: selectedFaculty.value,
                    aEducationForm: selectedEduForm.value || "",
                    aCourse: selectedCourse.value || ""
                });

                if (data && data.studyGroups) {
                    groups.value = data.studyGroups;
                }
            };

            const loadChairs = async () => {
                const data = await fetchApi('GetEmployeeChairs', {
                    aFacultyID: selectedFaculty.value
                });
                if (data) {
                    chairs.value = data.chairs || [];
                    // Some endpoints return employees right away if chair is null, but we usually pick chair first
                }
            };

            const loadEmployees = async () => {
                if (!selectedChair.value) return;
                const data = await fetchApi('GetEmployees', {
                    aFacultyID: selectedFaculty.value,
                    aChairID: selectedChair.value
                });
                if (data) {
                    employees.value = data || []; // Sometimes it's direct array or {d: ...}
                }
            };

            const addEntity = async () => {
                let id, name, type, payload, action;
                const startDate = dateStart.value.split('-').reverse().join('.'); // YYYY-MM-DD -> DD.MM.YYYY
                const endDate = dateEnd.value.split('-').reverse().join('.');

                if (mode.value === 'student') {
                    id = selectedGroup.value.Key;
                    name = selectedGroup.value.Value;
                    type = 'Група';
                    action = 'GetScheduleDataX'; // Student schedule
                    payload = {
                        aStudyGroupID: id,
                        aStartDate: startDate,
                        aEndDate: endDate,
                        aStudyTypeID: selectedStudyType.value ? `"${selectedStudyType.value}"` : "" // API expects quoted ID or empty
                    };
                } else {
                    id = selectedEmployee.value.Key;
                    name = selectedEmployee.value.Value;
                    type = 'Викладач';
                    action = 'GetScheduleDataEmp'; // Teacher schedule
                    payload = {
                        aEmployeeID: id,
                        aStartDate: startDate,
                        aEndDate: endDate,
                        aStudyTypeID: selectedStudyType.value ? `"${selectedStudyType.value}"` : "" // API expects quoted ID or empty
                    };
                }

                // Check if already exists
                const existingIndex = activeEntities.value.findIndex(e => e.id === id && e.type === type);

                loadingSchedule.value = true;
                const data = await fetchApi(action, payload);
                loadingSchedule.value = false;

                if (!data) return;

                if (existingIndex !== -1) {
                    // Update existing
                    activeEntities.value[existingIndex].scheduleData = data;
                    // Trigger reactivity if needed (array mutation usually fine in Vue 3 ref)
                    errorMessage.value = "Розклад оновлено!";
                    setTimeout(() => errorMessage.value = '', 2000);
                    return;
                }

                if (data) {
                    activeEntities.value.push({
                        id,
                        name,
                        type,
                        scheduleData: data
                    });
                }
            };

            const removeEntity = (index) => {
                activeEntities.value.splice(index, 1);
            };

            const exportExcel = () => {
                const rows = [];
                // Headers
                rows.push(["Дата", "День тижня", "Час", "Дисципліна", "Тип", "Викладач/Група", "Кабінет", "Джерело"]);

                groupedSchedule.value.forEach(dayData => {
                    dayData.slots.forEach(timeSlot => {
                        timeSlot.lessons.forEach(lesson => {
                            // Determine what to show in "Teacher/Group" column
                            let teacherOrGroup = lesson.teacher || "";
                            if (mode.value === 'teacher') {
                                teacherOrGroup = lesson.group || "";
                            }

                            rows.push([
                                dayData.date,
                                dayData.dayName,
                                timeSlot.time,
                                lesson.discipline,
                                lesson.type,
                                teacherOrGroup.replace(/<[^>]*>?/gm, ''), // Remove HTML
                                lesson.cabinet,
                                lesson.entityName
                            ]);
                        });
                    });
                });

                const ws = XLSX.utils.aoa_to_sheet(rows);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Розклад");
                XLSX.writeFile(wb, "rozklad.xlsx");
            };

            // --- Occupancy Logic ---
            const startOccupancyScan = async () => {
                if (isScanning.value) return;
                isScanning.value = true;
                stopScan.value = false;
                occupancyResults.value = [];
                errorMessage.value = '';

                const dateVal = occupancyDate.value.split('-').reverse().join('.'); // DD.MM.YYYY

                try {
                    // 1. Get Filters if not loaded
                    scanProgress.value = { current: 0, total: 0, text: 'Отримання списку факультетів та параметрів...' };
                    scanErrors.value = 0;

                    if (faculties.value.length === 0 || courses.value.length === 0 || eduForms.value.length === 0) {
                        const data = await fetchApi('GetStudentScheduleFiltersData');
                        if (data) {
                            faculties.value = data.faculties || [];
                            eduForms.value = data.educForms || [];
                            courses.value = data.courses || [];
                        } else {
                            throw new Error("Не вдалося завантажити параметри (факультети/курси)");
                        }
                    }

                    // 2. Get All Groups
                    // Iterate usage of parameters: aFacultyID, aEducationForm, aCourse
                    scanProgress.value.text = 'Збір списку груп (це може зайняти час)...';
                    let allGroups = [];

                    // Flatten the tasks to a list of combinations
                    const tasks = [];
                    for (const fac of faculties.value) {
                        // Some faculties might not have all courses, but we must try all combinations
                        // because the API provides global lists.
                        for (const form of eduForms.value) {
                            for (const course of courses.value) {
                                tasks.push({ fac, form, course });
                            }
                        }
                    }

                    // Process tasks in chunks
                    const TASK_CHUNK = 5; // Parallel requests
                    for (let i = 0; i < tasks.length; i += TASK_CHUNK) {
                        if (stopScan.value) break;
                        const chunk = tasks.slice(i, i + TASK_CHUNK);

                        const chunkPromises = chunk.map(async ({ fac, form, course }) => {
                            try {
                                // Parameters must be strings. fetchApi will quote them if they are strings.
                                // IDs are likely strings in JSON "1", "2".
                                const res = await fetchApi('GetStudyGroups', {
                                    aFacultyID: fac.Key,
                                    aEducationForm: form.Key,
                                    aCourse: course.Key
                                }, { silent: true });

                                if (res && res.studyGroups) {
                                    return res.studyGroups.map(g => ({ ...g, _fac: fac.Value })); // Attach faculty name for context if needed
                                }
                                return [];
                            } catch (e) {
                                return [];
                            }
                        });

                        const chunkRes = await Promise.all(chunkPromises);
                        chunkRes.forEach(g => {
                            if (g.length > 0) allGroups.push(...g);
                        });

                        // Update progress text occasionally
                        if (i % 20 === 0) {
                            scanProgress.value.text = `Збір груп: перевірено ${Math.min(i + TASK_CHUNK, tasks.length)} з ${tasks.length} комбінацій...`;
                        }

                        // Delay to prevent overwhelming server
                        await new Promise(r => setTimeout(r, 100)); // 100ms
                    }

                    // Deduplicate groups (just in case) based on Key
                    const uniqueGroups = [];
                    const seenKeys = new Set();
                    for (const g of allGroups) {
                        if (!seenKeys.has(g.Key)) {
                            seenKeys.add(g.Key);
                            uniqueGroups.push(g);
                        }
                    }
                    allGroups = uniqueGroups;

                    if (stopScan.value) throw new Error("Сканування зупинено");
                    if (allGroups.length === 0) throw new Error("Не вдалося знайти жодної групи. Спробуйте змінити фільтри або сервер недоступний.");

                    scanProgress.value = { current: 0, total: allGroups.length, text: 'Сканування розкладу...' };

                    // 3. Scan Process
                    // Map: CabinetName -> { slots: { pairNumber: Data } }
                    const cabinetMap = {};

                    // Chunking to avoid rate limits / browser hang
                    const CHUNK_SIZE = 5;
                    for (let i = 0; i < allGroups.length; i += CHUNK_SIZE) {
                        if (stopScan.value) break;

                        const chunk = allGroups.slice(i, i + CHUNK_SIZE);
                        const promises = chunk.map(async group => {
                            const data = await fetchApi('GetScheduleDataX', {
                                aStudyGroupID: group.Key,
                                aStartDate: dateVal,
                                aEndDate: dateVal,
                                aStudyTypeID: ""
                            }, { silent: true });

                            if (!data) scanErrors.value++;
                            return { group, data };
                        });

                        const results = await Promise.all(promises);

                        results.forEach(({ group, data }) => {
                            if (!data) return;

                            data.forEach(lesson => {
                                if (!lesson.cabinet) return;
                                const cabName = lesson.cabinet.trim();
                                if (!cabName) return;

                                // Parse pair number "1 пара..." -> 1
                                const pairStr = lesson.study_time.split(' ')[0];
                                const pairNum = parseInt(pairStr);
                                if (isNaN(pairNum)) return;

                                if (!cabinetMap[cabName]) {
                                    // Heuristic for building: "1-203" -> 1, "k2-304" -> 2
                                    let building = '?';
                                    const match = cabName.match(/^(\d+|[a-zA-Zа-яА-Я0-9]+)[-\s]/);
                                    if (match) building = match[1];

                                    cabinetMap[cabName] = {
                                        name: cabName,
                                        building: building,
                                        slots: {}
                                    };
                                }

                                // Make sure we don't overwrite if multiple groups share (lecture)
                                // For now, just taking the first one found or appending
                                if (!cabinetMap[cabName].slots[pairNum]) {
                                    cabinetMap[cabName].slots[pairNum] = {
                                        group: group.Value,
                                        teacher: lesson.employee_short || lesson.employee,
                                        discipline: lesson.discipline
                                    };
                                } else {
                                    // If already occupied, maybe append group name?
                                    const existing = cabinetMap[cabName].slots[pairNum];
                                    if (!existing.group.includes(group.Value)) {
                                        existing.group += ", " + group.Value;
                                    }
                                }
                            });
                        });

                        // Update UI
                        scanProgress.value.current = Math.min(i + CHUNK_SIZE, allGroups.length);
                        occupancyResults.value = Object.values(cabinetMap).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

                        // Gentle delay to avoid DoS detection
                        await new Promise(r => setTimeout(r, 300));
                    }

                    // Convert map to array and sort
                    occupancyResults.value = Object.values(cabinetMap).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

                } catch (e) {
                    console.error(e);
                    errorMessage.value = e.message;
                } finally {
                    isScanning.value = false;
                }
            };

            const exportOccupancy = () => {
                const rows = [];
                // Header
                rows.push(["Аудиторія", "1 пара", "2 пара", "3 пара", "4 пара", "5 пара", "6 пара", "7 пара"]);

                occupancyResults.value.forEach(cab => {
                    const row = [cab.name];
                    for (let i = 1; i <= 7; i++) {
                        if (cab.slots[i]) {
                            row.push(`${cab.slots[i].group} (${cab.slots[i].teacher})`);
                        } else {
                            row.push("");
                        }
                    }
                    rows.push(row);
                });

                const ws = XLSX.utils.aoa_to_sheet(rows);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Зайнятість");
                XLSX.writeFile(wb, `occupancy_${occupancyDate.value}.xlsx`);
            };

            // --- Statistics ---
            const scheduleStats = computed(() => {
                const stats = {
                    totalPairs: 0,
                    bySubject: {},
                    byType: {}
                };

                activeEntities.value.forEach(entity => {
                    if (!entity.scheduleData) return;
                    entity.scheduleData.forEach(item => {
                        stats.totalPairs++;

                        // By Subject
                        const subj = item.discipline;
                        stats.bySubject[subj] = (stats.bySubject[subj] || 0) + 1;

                        // By Type
                        const type = item.study_type || 'Інше';
                        stats.byType[type] = (stats.byType[type] || 0) + 1;
                    });
                });

                // Sort Subject by count
                const sortedSubjects = Object.entries(stats.bySubject)
                    .map(([name, count]) => ({ name, count, percent: 0 }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5);

                if (stats.totalPairs > 0) {
                    sortedSubjects.forEach(s => s.percent = Math.round((s.count / stats.totalPairs) * 100));
                }

                return {
                    totalPairs: stats.totalPairs,
                    topSubjects: sortedSubjects
                };
            });

            // --- Persistence ---
            const STORAGE_KEY = 'schedule_app_v1';

            const saveState = () => {
                const state = {
                    mode: mode.value,
                    activeEntities: activeEntities.value,
                    selectedDisciplines: selectedDisciplines.value,
                    notesMap: notesMap.value,
                    customTimes: customTimes.value
                };

                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                } catch (e) {
                    console.error('Save failed', e);
                }
            };

            const loadState = () => {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        if (parsed.mode) mode.value = parsed.mode;
                        if (parsed.activeEntities) activeEntities.value = parsed.activeEntities;
                        if (parsed.selectedDisciplines) selectedDisciplines.value = parsed.selectedDisciplines;
                        if (parsed.notesMap) notesMap.value = parsed.notesMap;
                        if (parsed.customTimes) customTimes.value = parsed.customTimes;
                    } catch (e) {
                        console.error('Load failed', e);
                    }
                }
            };

            // Watch for changes to auto-save
            watch([mode, activeEntities, selectedDisciplines], () => {
                saveState();
            }, { deep: true });

            const toggleDiscipline = (disc) => {
                if (selectedDisciplines.value.includes(disc)) {
                    selectedDisciplines.value = selectedDisciplines.value.filter(d => d !== disc);
                } else {
                    selectedDisciplines.value.push(disc);
                }
            };

            // Color generator for different entities
            const getColorClass = (id) => {
                const colors = [
                    'border-red-400 bg-red-50',
                    'border-green-400 bg-green-50',
                    'border-yellow-400 bg-yellow-50',
                    'border-purple-400 bg-purple-50',
                    'border-pink-400 bg-pink-50',
                    'border-indigo-400 bg-indigo-50'
                ];
                // Simple hash
                const num = String(id).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
                return colors[num % colors.length];
            };

            // Watchers
            watch(mode, () => {
                // Clear deeper selections when switching mode, but keep faculty
                selectedGroup.value = '';
                selectedEmployee.value = '';
                if (selectedFaculty.value) {
                    if (mode.value === 'student') loadGroups();
                    else loadChairs();
                }
            });



            // Watch for Study Type changes -> Reload all active entities
            watch(selectedStudyType, async () => {
                if (activeEntities.value.length === 0) return;

                // We need to re-fetch data for all active entities with the new filter
                const entities = [...activeEntities.value];
                activeEntities.value = []; // Clear current list to force re-render/re-fetch logic

                // Re-add them one by one (this reuses the addEntity logic which now reads the new filter)
                // This is a bit hacky but ensures consistency with minimal code duplication
                // Better approach: Iterate and update data in place.

                loadingSchedule.value = true;

                const promises = entities.map(async (entity) => {
                    let action, payload;
                    const startDate = dateStart.value.split('-').reverse().join('.');
                    const endDate = dateEnd.value.split('-').reverse().join('.');
                    const typeIdParam = selectedStudyType.value ? `"${selectedStudyType.value}"` : "";

                    if (entity.type === 'Група') {
                        action = 'GetScheduleDataX';
                        payload = {
                            aStudyGroupID: entity.id,
                            aStartDate: startDate,
                            aEndDate: endDate,
                            aStudyTypeID: typeIdParam
                        };
                    } else {
                        action = 'GetScheduleDataEmp';
                        payload = {
                            aEmployeeID: entity.id,
                            aStartDate: startDate,
                            aEndDate: endDate,
                            aStudyTypeID: typeIdParam
                        };
                    }

                    const data = await fetchApi(action, payload);
                    return { ...entity, scheduleData: data };
                });

                const updatedEntities = await Promise.all(promises);
                activeEntities.value = updatedEntities;
                loadingSchedule.value = false;
            });

            // --- Smart Search ---
            const searchQuery = ref('');
            const searchResults = ref([]);
            const allItemsCache = ref([]); // { type, value, id, facultyId, label, ... }
            const isCacheLoaded = ref(false);
            const isSearching = ref(false);
            const cacheStatus = ref('');

            const buildUniversalCache = async () => {
                if (isCacheLoaded.value) return;
                isSearching.value = true;

                if (faculties.value.length === 0) await init();

                // 1. Fetch Groups (Batch)
                cacheStatus.value = "Індексація груп...";

                // Chunk faculties to avoid 500 errors
                const FAC_CHUNK = 3;
                for (let i = 0; i < faculties.value.length; i += FAC_CHUNK) {
                    const chunk = faculties.value.slice(i, i + FAC_CHUNK);
                    const chunkPromises = chunk.map(async (fac) => {
                        try {
                            const data = await fetchApi('GetStudyGroups', { aFacultyID: fac.Key }, { silent: true });
                            if (data && data.studyGroups) {
                                return data.studyGroups.map(g => ({
                                    type: 'group',
                                    value: g,
                                    facultyId: fac.Key,
                                    facultyName: fac.Value,
                                    label: `${g.Value} (${fac.Value})`
                                }));
                            }
                        } catch (e) { return []; }
                        return [];
                    });

                    const chunkRes = await Promise.all(chunkPromises);
                    chunkRes.forEach(arr => {
                        allItemsCache.value.push(...arr);
                    });

                    // Delay between chunks
                    await new Promise(r => setTimeout(r, 200));
                }


                // 2. Fetch Teachers (Slower)
                cacheStatus.value = "Індексація викладачів...";

                for (const fac of faculties.value) {
                    try {
                        const chairData = await fetchApi('GetEmployeeChairs', { aFacultyID: fac.Key }, { silent: true });
                        if (chairData && chairData.chairs) {
                            const empPromises = chairData.chairs.map(async (chair) => {
                                try {
                                    const empData = await fetchApi('GetEmployees', {
                                        aFacultyID: fac.Key,
                                        aChairID: chair.Key
                                    }, { silent: true });
                                    if (empData) {
                                        const list = Array.isArray(empData) ? empData : [];
                                        return list.map(e => ({
                                            type: 'teacher',
                                            value: e,
                                            facultyId: fac.Key,
                                            chairId: chair.Key,
                                            label: `${e.Value} (${chair.Value})`
                                        }));
                                    }
                                } catch (e) { return []; }
                                return [];
                            });

                            const empArrays = await Promise.all(empPromises);
                            const emps = empArrays.flat();
                            allItemsCache.value = [...allItemsCache.value, ...emps];
                        }
                    } catch (e) { console.error(e); }
                    await new Promise(r => setTimeout(r, 200)); // Rate limit
                }

                isCacheLoaded.value = true;
                isSearching.value = false;
                cacheStatus.value = "";
            };

            const onSearchInput = async () => {
                if (!isCacheLoaded.value && !isSearching.value && searchQuery.value.length > 0) {
                    buildUniversalCache();
                }

                const q = searchQuery.value.toLowerCase().trim();
                if (!q) {
                    searchResults.value = [];
                    return;
                }

                searchResults.value = allItemsCache.value
                    .filter(item => item.label.toLowerCase().includes(q))
                    .sort((a, b) => {
                        // Prioritize startsWith
                        const aStarts = a.label.toLowerCase().startsWith(q);
                        const bStarts = b.label.toLowerCase().startsWith(q);
                        if (aStarts && !bStarts) return -1;
                        if (!aStarts && bStarts) return 1;
                        return 0;
                    })
                    .slice(0, 10);
            };

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

            // --- Time Highlighting ---
            const currentTime = ref(new Date());

            setInterval(() => {
                currentTime.value = new Date();
            }, 60000); // Every minute

            const isActiveLesson = (dateStr, start, end) => {
                if (!start || !end) return false;

                const now = currentTime.value;

                // Check Date
                // dateStr is dd.mm.yyyy
                const [d, m, y] = dateStr.split('.').map(Number);
                if (now.getDate() !== d || (now.getMonth() + 1) !== m || now.getFullYear() !== y) {
                    return false;
                }

                // Check Time
                // start/end is "HH:mm"
                const [h1, m1] = start.split(':').map(Number);
                const [h2, m2] = end.split(':').map(Number);

                const nowMin = now.getHours() * 60 + now.getMinutes();
                const startMin = h1 * 60 + m1;
                const endMin = h2 * 60 + m2;

                return nowMin >= startMin && nowMin < endMin;
            };

            const getLessonProgress = (dateStr, start, end) => {
                if (!isActiveLesson(dateStr, start, end)) return null;

                const now = currentTime.value;
                const [h1, m1] = start.split(':').map(Number);
                const [h2, m2] = end.split(':').map(Number);

                const nowMin = now.getHours() * 60 + now.getMinutes();
                const startMin = h1 * 60 + m1;
                const endMin = h2 * 60 + m2;

                const total = endMin - startMin;
                const current = nowMin - startMin;
                const percent = Math.min(100, Math.max(0, (current / total) * 100));

                return {
                    percent: percent.toFixed(1),
                    timeLeft: endMin - nowMin
                };
            };

            // --- Free Time Finder ---
            const showFreeTimeModal = ref(false);
            const commonFreeSlots = ref([]);

            const findCommonFreeSlots = () => {
                if (activeEntities.value.length < 2) return;

                // 1. Collect all dates involved
                const allDates = new Set();
                activeEntities.value.forEach(e => {
                    if (e.scheduleData) {
                        e.scheduleData.forEach(d => allDates.add(d.full_date));
                    }
                });

                const sortedDates = Array.from(allDates).sort((a, b) => {
                    const [d1, m1, y1] = a.split('.');
                    const [d2, m2, y2] = b.split('.');
                    return new Date(`${y1}-${m1}-${d1}`) - new Date(`${y2}-${m2}-${d2}`);
                });

                const results = [];

                // Standard pairs 1-7 (approximate times needed? No, just slots)
                const PAIRS = [1, 2, 3, 4, 5, 6, 7];

                // Maps for pair times (approximate, based on first found)
                const pairTimes = {};

                // Pre-fill busy map: Date -> Pair -> Set(EntityId)
                const busyMap = {};

                activeEntities.value.forEach(entity => {
                    if (!entity.scheduleData) return;
                    entity.scheduleData.forEach(lesson => {
                        if (!busyMap[lesson.full_date]) busyMap[lesson.full_date] = {};

                        // Extract pair number
                        const pairNum = parseInt(lesson.study_time.split(' ')[0]);
                        if (isNaN(pairNum)) return;

                        if (!busyMap[lesson.full_date][pairNum]) busyMap[lesson.full_date][pairNum] = new Set();
                        busyMap[lesson.full_date][pairNum].add(entity.id);

                        // Store time string for display if not exists
                        if (!pairTimes[pairNum]) {
                            // Extract time range "(08:30-09:50)"
                            const match = lesson.study_time.match(/\((.*?)\)/);
                            if (match) pairTimes[pairNum] = match[1];
                        }
                    });
                });

                sortedDates.forEach(dateStr => {
                    const daySlots = [];
                    PAIRS.forEach(pair => {
                        // Check if ANY entity is busy at this slot
                        // Wait, "Common Free Time" means everyone is free.
                        // So if busyMap has NO entries for this entity?
                        // Logic: For this date and pair, check if EVERY active entity is free.

                        // But maybe some entities don't have lessons on this date at all (e.g. only Tue/Thu group).
                        // If I select Group A (Mon/Wed) and Group B (Tue/Thu).
                        // On Monday: Group A is busy. Group B is free. Common free? No, A is busy.
                        // On Tuesday: Group A is free. Group B is busy. Common free? No, B is busy.
                        // On Friday: Both free. Common free? Yes.

                        // So, we need to know if an entity is busy.
                        let isAnyBusy = false;

                        const busyInSlot = busyMap[dateStr]?.[pair];
                        if (busyInSlot && busyInSlot.size > 0) {
                            isAnyBusy = true;
                        }

                        if (!isAnyBusy) {
                            // Potentially free. But is it a working day?
                            // If it's Sunday, likely no one has lessons. 
                            // Let's check date day of week?
                            const [d, m, y] = dateStr.split('.');
                            const dayOfWeek = new Date(`${y}-${m}-${d}`).getDay();
                            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclude weekends from "Free Windows" unless requested?
                                // Also, usually we care about breaks *between* classes or common free days.
                                daySlots.push({
                                    pair,
                                    time: pairTimes[pair] || ''
                                });
                            }
                        }
                    });

                    if (daySlots.length > 0) {
                        results.push({
                            date: dateStr,
                            slots: daySlots
                        });
                    }
                });

                commonFreeSlots.value = results;
                showFreeTimeModal.value = true;
            };

            // --- Notes System ---
            const notesMap = ref({}); // Key: entityId_date_time -> text
            const showNoteModal = ref(false);
            const noteText = ref('');
            const currentNoteKey = ref('');
            const currentNoteTitle = ref('');

            const showAllNotesModal = ref(false);

            // Helper to generate key
            const getNoteKey = (lesson, date, time) => {
                // Unique check: Entity + Date + Time
                // Lesson has entityId.
                // Time is "1 пара (08:30...)"
                // Simplify time to just pair number if possible, but strict string matching is safer.
                return `${lesson.entityId}_${date}_${time}`;
            };

            const openNote = (lesson, date, time) => {
                const key = getNoteKey(lesson, date, time);
                currentNoteKey.value = key;
                currentNoteTitle.value = `${lesson.discipline} (${date}, ${time})`;
                noteText.value = notesMap.value[key] || '';
                showNoteModal.value = true;
            };

            const saveNote = () => {
                if (!noteText.value.trim()) {
                    delete notesMap.value[currentNoteKey.value];
                } else {
                    notesMap.value[currentNoteKey.value] = noteText.value;
                }
                saveState(); // Persist
                showNoteModal.value = false;
            };

            const hasNote = (lesson, date, time) => {
                const key = getNoteKey(lesson, date, time);
                return !!notesMap.value[key];
            };

            const allNotesList = computed(() => {
                return Object.entries(notesMap.value).map(([key, text]) => {
                    // key: entityId_date_time
                    // We can try to extract info from key if needed, or just show raw text
                    return { key, text };
                });
            });

            const deleteNote = (key) => {
                delete notesMap.value[key];
                saveState();
            };



            // Load links on start
            const loadGlobalLinks = async () => {
                try {
                    const res = await fetch('/api/links');
                    if (res.ok) {
                        globalLinks.value = await res.json();
                    }
                } catch (e) {
                    console.error("Failed to load global links", e);
                }
            };

            const toggleAdminLogin = async () => {
                if (adminMode.value) {
                    adminMode.value = false;
                    adminPassword.value = '';
                    return;
                }
                const pwd = prompt("Введіть пароль адміністратора:");
                if (pwd === "admin123") {
                    adminMode.value = true;
                    adminPassword.value = pwd;
                    alert("Режим адміна активовано! Тепер ви бачите олівці для редагування.");
                } else {
                    alert("Невірний пароль");
                }
            };

            // Generate a stable key for the SUBJECT/LESSON type
            // We want: Group + Discipline + Type
            // Or: Teacher + Discipline + Type?
            // Let's rely on what we have in the lesson object.
            // Lesson: { group: "...", discipline: "...", type: "...", teacher: "..." }
            // We want to apply this link for ALL occurrences of this subject for this group.
            const getGlobalKey = (lesson) => {
                // Try to make it as specific as possible but reusable across weeks
                // Key: "Discipline_Group_Type"
                // Sanitize
                const safe = (s) => (s || '').replace(/[^a-zA-Zа-яА-Я0-9]/g, '');
                return `${safe(lesson.discipline)}_${safe(lesson.group)}_${safe(lesson.type)}`;
            };

            const openAdminModal = (lesson) => {
                const key = getGlobalKey(lesson);
                adminTargetKey.value = key;
                adminTargetTitle.value = `${lesson.discipline} (${lesson.group})`;

                const existing = globalLinks.value[key] || {};
                adminForm.value = {
                    courseUrl: existing.courseUrl || '',
                    onlineUrl: existing.onlineUrl || ''
                };
                showAdminModal.value = true;
            };

            const saveAdminLinks = async () => {
                const key = adminTargetKey.value;
                const val = { ...adminForm.value };

                // Optimistic update
                if (!globalLinks.value[key]) globalLinks.value[key] = {};
                globalLinks.value[key] = val;

                // Send to server
                try {
                    // We need the password. I stored it in adminPassword ref.
                    const res = await fetch('/api/links', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            password: adminPassword.value,
                            key: key,
                            value: val
                        })
                    });
                    let data;
                    try {
                        data = await res.json();
                    } catch (err) {
                        alert(`Помилка: Статус ${res.status}. Відповідь не є JSON.`);
                        return;
                    }

                    if (!res.ok) {
                        alert(`Помилка збереження (${res.status}): ${data.error || JSON.stringify(data)}`);
                    } else {
                        alert("Збережено успішно!");
                    }
                } catch (e) {
                    alert("Помилка мережі");
                }
                showAdminModal.value = false;
            };

            // --- ALL USERS: Load Global Times ---
            const loadGlobalTimes = async () => {
                try {
                    const res = await fetch('/api/times');
                    if (res.ok) {
                        const times = await res.json();
                        // Only override if not set locally? 
                        // Strategy: Global > Local. If global exists, use it.
                        // But user might have local edits. 
                        // Let's merge? OR just overwrite customTimes.
                        // Simple: Overwrite. If user wants their own, they edit again.
                        if (times && Object.keys(times).length > 0) {
                            customTimes.value = times;
                        }
                    }
                } catch (e) {
                    console.error("Failed to load global times", e);
                }
            };

            // --- ADMIN: Save Global Times ---
            const saveGlobalTimes = async () => {
                if (!adminMode.value) return;

                try {
                    const res = await fetch('/api/times', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            password: adminPassword.value,
                            times: customTimes.value
                        })
                    });

                    if (res.ok) {
                        alert("Час збережено глобально для всіх користувачів!");
                    } else {
                        const data = await res.json();
                        console.error("Global Save Error:", data);
                        alert("Помилка збереження: " + (data.error || "Невідома помилка"));
                    }
                } catch (e) {
                    alert("Помилка мережі при збереженні часу");
                }
            };

            const getGlobalLink = (lesson, type) => {
                const key = getGlobalKey(lesson);
                if (globalLinks.value[key]) {
                    return globalLinks.value[key][type];
                }
                return null;
            };

            // --- Auto Refresh Logic ---
            const refreshAllSchedules = async () => {
                if (activeEntities.value.length === 0) return;

                loadingSchedule.value = true;
                const startDate = dateStart.value.split('-').reverse().join('.');
                const endDate = dateEnd.value.split('-').reverse().join('.');

                // Use Promise.all to fetch in parallel
                await Promise.all(activeEntities.value.map(async (entity) => {
                    let action, payload;
                    // Reconstruct payload based on entity type and ID
                    if (entity.type === 'Група') {
                        action = 'GetScheduleDataX';
                        payload = {
                            aStudyGroupID: entity.id,
                            aStartDate: startDate,
                            aEndDate: endDate,
                            aStudyTypeID: selectedStudyType.value ? `"${selectedStudyType.value}"` : ""
                        };
                    } else if (entity.type === 'Викладач') {
                        action = 'GetScheduleDataEmp';
                        payload = {
                            aEmployeeID: entity.id,
                            aStartDate: startDate,
                            aEndDate: endDate,
                            aStudyTypeID: selectedStudyType.value ? `"${selectedStudyType.value}"` : ""
                        };
                    }

                    if (action) {
                        try {
                            const data = await fetchApi(action, payload, { silent: true });
                            if (data) {
                                entity.scheduleData = data;
                            }
                        } catch (e) {
                            console.error("Auto-refresh failed for", entity.name, e);
                        }
                    }
                }));

                loadingSchedule.value = false;
            };

            // Watch for date changes with debounce
            let refreshTimeout;
            watch([dateStart, dateEnd], () => {
                clearTimeout(refreshTimeout);
                refreshTimeout = setTimeout(() => {
                    refreshAllSchedules();
                }, 800); // 800ms delay to allow typing
            });

            onMounted(async () => {
                await init();
                loadGlobalLinks();
                await loadGlobalTimes();
                // ...
                // Start building search index in background immediately
                // DISABLED: Causes server overload (500 errors). Only build when user types.
                // setTimeout(() => {
                //    buildUniversalCache();
                // }, 500);
            });

            return {
                mode,
                loadingFilters,
                loadingSchedule,
                errorMessage,
                faculties,
                eduForms,
                courses,
                chairs,
                groups,
                employees,

                selectedFaculty,
                selectedEduForm,
                selectedCourse,
                selectedGroup,
                selectedChair,
                selectedEmployee,
                selectedDisciplines,
                studyTypes,
                selectedStudyType,

                dateStart,
                dateEnd,
                dateStart,
                dateEnd,
                activeEntities,
                refreshAllSchedules,
                onSearchInput,
                searchQuery,
                searchResults,
                isSearching,
                isCacheLoaded,
                cacheStatus,
                selectSearchResult,

                availableDisciplines,
                canAdd,
                groupedSchedule,
                scheduleStats,

                onFacultyChange,
                loadGroups,
                loadChairs,
                loadEmployees,
                addEntity,
                removeEntity,
                clearAll,
                exportExcel,
                toggleDiscipline,
                getColorClass,
                isActiveLesson,
                getLessonProgress,

                // Free Time
                showFreeTimeModal,
                findCommonFreeSlots,
                commonFreeSlots,

                // Notes
                showNoteModal,
                noteText,
                currentNoteKey,
                currentNoteTitle,
                openNote,
                saveNote,
                hasNote,
                showAllNotesModal,
                allNotesList,
                deleteNote,

                // Custom Times
                showSettingsModal,
                defaultTimes,
                customTimes,
                resetCustomTimes,
                saveState,
                saveGlobalTimes,

                // Admin Global Links
                adminMode,
                toggleAdminLogin,
                globalLinks,
                showAdminModal,
                openAdminModal,
                adminTargetTitle,
                adminTargetKey,
                adminForm,
                saveAdminLinks,
                getGlobalLink,

                // Occupancy
                occupancyDate,
                isScanning,
                scanProgress,
                stopScan,
                occupancyResults,
                startOccupancyScan,
                exportOccupancy,
                occupancySearch,
                filteredOccupancyResults,
                scanErrors
            };
        }
    }).mount('#app');
} catch (e) {
    alert("CRITICAL ERROR: " + e.message + "\nCheck console for details.");
    console.error(e);
}
