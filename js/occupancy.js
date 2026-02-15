/**
 * Schedule Viewer — Occupancy Scanner Module
 * Classroom occupancy scanning and export.
 */
window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
    /**
     * Run occupancy scan for a specific date.
     * @param {Object} refs - Vue refs needed for scanning
     */
    SA.startOccupancyScan = async (refs) => {
        if (refs.isScanning.value) return;
        refs.isScanning.value = true;
        refs.stopScan.value = false;
        refs.occupancyResults.value = [];
        refs.errorMessage.value = '';

        const dateVal = refs.occupancyDate.value.split('-').reverse().join('.');

        try {
            refs.scanProgress.value = { current: 0, total: 0, text: 'Отримання списку факультетів та параметрів...' };
            refs.scanErrors.value = 0;

            if (refs.faculties.value.length === 0 || refs.courses.value.length === 0 || refs.eduForms.value.length === 0) {
                const data = await SA.fetchApi('GetStudentScheduleFiltersData');
                if (data) {
                    refs.faculties.value = data.faculties || [];
                    refs.eduForms.value = data.educForms || [];
                    refs.courses.value = data.courses || [];
                } else {
                    throw new Error("Не вдалося завантажити параметри (факультети/курси)");
                }
            }

            // Collect all groups
            refs.scanProgress.value.text = 'Збір списку груп (це може зайняти час)...';
            let allGroups = [];

            const tasks = [];
            for (const fac of refs.faculties.value) {
                for (const form of refs.eduForms.value) {
                    for (const course of refs.courses.value) {
                        tasks.push({ fac, form, course });
                    }
                }
            }

            const TASK_CHUNK = 5;
            for (let i = 0; i < tasks.length; i += TASK_CHUNK) {
                if (refs.stopScan.value) break;
                const chunk = tasks.slice(i, i + TASK_CHUNK);

                const chunkPromises = chunk.map(async ({ fac, form, course }) => {
                    try {
                        const res = await SA.fetchApi('GetStudyGroups', {
                            aFacultyID: fac.Key,
                            aEducationForm: form.Key,
                            aCourse: course.Key
                        }, { silent: true });

                        if (res && res.studyGroups) {
                            return res.studyGroups.map(g => ({ ...g, _fac: fac.Value }));
                        }
                        return [];
                    } catch (e) { return []; }
                });

                const chunkRes = await Promise.all(chunkPromises);
                chunkRes.forEach(g => { if (g.length > 0) allGroups.push(...g); });

                if (i % 20 === 0) {
                    refs.scanProgress.value.text = `Збір груп: перевірено ${Math.min(i + TASK_CHUNK, tasks.length)} з ${tasks.length} комбінацій...`;
                }
                await new Promise(r => setTimeout(r, 50));
            }

            // Deduplicate
            const seenKeys = new Set();
            allGroups = allGroups.filter(g => {
                if (seenKeys.has(g.Key)) return false;
                seenKeys.add(g.Key);
                return true;
            });

            if (refs.stopScan.value) throw new Error("Сканування зупинено");
            if (allGroups.length === 0) throw new Error("Не вдалося знайти жодної групи.");

            refs.scanProgress.value = { current: 0, total: allGroups.length, text: 'Сканування розкладу...' };

            const cabinetMap = {};
            const CHUNK_SIZE = 8;

            for (let i = 0; i < allGroups.length; i += CHUNK_SIZE) {
                if (refs.stopScan.value) break;

                const chunk = allGroups.slice(i, i + CHUNK_SIZE);
                const promises = chunk.map(async group => {
                    const data = await SA.fetchApi('GetScheduleDataX', {
                        aStudyGroupID: group.Key,
                        aStartDate: dateVal,
                        aEndDate: dateVal,
                        aStudyTypeID: ""
                    }, { silent: true });

                    if (!data) refs.scanErrors.value++;
                    return { group, data };
                });

                const results = await Promise.all(promises);

                results.forEach(({ group, data }) => {
                    if (!data) return;
                    data.forEach(lesson => {
                        if (!lesson.cabinet) return;
                        const cabName = lesson.cabinet.trim();
                        if (!cabName) return;

                        const pairStr = lesson.study_time.split(' ')[0];
                        const pairNum = parseInt(pairStr);
                        if (isNaN(pairNum)) return;

                        if (!cabinetMap[cabName]) {
                            let building = '?';
                            const match = cabName.match(/^(\d+|[a-zA-Zа-яА-Я0-9]+)[-\s]/);
                            if (match) building = match[1];
                            cabinetMap[cabName] = { name: cabName, building, slots: {} };
                        }

                        if (!cabinetMap[cabName].slots[pairNum]) {
                            cabinetMap[cabName].slots[pairNum] = {
                                group: group.Value,
                                teacher: lesson.employee_short || lesson.employee,
                                discipline: lesson.discipline
                            };
                        } else {
                            const existing = cabinetMap[cabName].slots[pairNum];
                            if (!existing.group.includes(group.Value)) {
                                existing.group += ", " + group.Value;
                            }
                        }
                    });
                });

                refs.scanProgress.value.current = Math.min(i + CHUNK_SIZE, allGroups.length);
                refs.occupancyResults.value = Object.values(cabinetMap).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

                await new Promise(r => setTimeout(r, 150));
            }

            refs.occupancyResults.value = Object.values(cabinetMap).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        } catch (e) {
            console.error(e);
            refs.errorMessage.value = e.message;
        } finally {
            refs.isScanning.value = false;
        }
    };

    /**
     * Export occupancy results to Excel.
     * @param {Object} refs - { occupancyResults, occupancyDate }
     */
    SA.exportOccupancy = (refs) => {
        const rows = [["Аудиторія", "1 пара", "2 пара", "3 пара", "4 пара", "5 пара", "6 пара", "7 пара"]];

        refs.occupancyResults.value.forEach(cab => {
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
        XLSX.writeFile(wb, `occupancy_${refs.occupancyDate.value}.xlsx`);
    };
})(window.ScheduleApp);
