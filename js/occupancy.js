/**
 * Schedule Viewer - Occupancy Scanner Module
 * Uses a Web Worker to keep UI responsive during heavy scans.
 */
window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
    let scanWorker = null;
    let stopWatcher = null;

    function toPlainClone(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (e) {
            if (Array.isArray(value)) return value.map((x) => toPlainClone(x));
            if (value && typeof value === 'object') {
                const out = {};
                Object.keys(value).forEach((k) => { out[k] = toPlainClone(value[k]); });
                return out;
            }
            return value;
        }
    }

    function cleanupWorker() {
        if (stopWatcher) {
            clearInterval(stopWatcher);
            stopWatcher = null;
        }
        if (scanWorker) {
            scanWorker.terminate();
            scanWorker = null;
        }
    }

    SA.startOccupancyScan = async (refs) => {
        if (refs.isScanning.value) return;

        refs.isScanning.value = true;
        refs.stopScan.value = false;
        refs.occupancyResults.value = [];
        refs.errorMessage.value = '';
        refs.scanErrors.value = 0;
        refs.scanProgress.value = { current: 0, total: 0, text: 'Підготовка сканування...' };

        if (!window.Worker) {
            refs.errorMessage.value = 'Web Worker не підтримується у цьому браузері';
            refs.isScanning.value = false;
            return;
        }

        cleanupWorker();

        try {
            scanWorker = new Worker('/js/workers/occupancy-worker.js');
        } catch (e) {
            refs.errorMessage.value = 'Не вдалося запустити worker для сканування';
            refs.isScanning.value = false;
            cleanupWorker();
            return;
        }

        scanWorker.onmessage = (event) => {
            const msg = event.data || {};

            if (msg.type === 'progress') {
                refs.scanProgress.value = {
                    current: msg.current || 0,
                    total: msg.total || 0,
                    text: msg.text || ''
                };
                refs.scanErrors.value = msg.errors || 0;
                return;
            }

            if (msg.type === 'partial') {
                refs.occupancyResults.value = Array.isArray(msg.results) ? msg.results : [];
                return;
            }

            if (msg.type === 'done') {
                refs.occupancyResults.value = Array.isArray(msg.results) ? msg.results : [];
                refs.scanErrors.value = msg.errors || 0;
                refs.isScanning.value = false;
                cleanupWorker();
                return;
            }

            if (msg.type === 'stopped') {
                refs.errorMessage.value = 'Сканування зупинено';
                refs.isScanning.value = false;
                cleanupWorker();
                return;
            }

            if (msg.type === 'error') {
                refs.errorMessage.value = msg.message || 'Помилка сканування';
                refs.isScanning.value = false;
                cleanupWorker();
            }
        };

        scanWorker.onerror = () => {
            refs.errorMessage.value = 'Помилка worker під час сканування';
            refs.isScanning.value = false;
            cleanupWorker();
        };

        stopWatcher = setInterval(() => {
            if (refs.stopScan.value && scanWorker) {
                scanWorker.postMessage({ type: 'stop' });
                clearInterval(stopWatcher);
                stopWatcher = null;
            }
        }, 120);

        scanWorker.postMessage({
            type: 'start',
            payload: {
                occupancyDate: String(refs.occupancyDate.value || ''),
                faculties: toPlainClone(refs.faculties.value || []),
                courses: toPlainClone(refs.courses.value || []),
                eduForms: toPlainClone(refs.eduForms.value || [])
            }
        });
    };

    SA.exportOccupancy = (refs) => {
        const rows = [['Аудиторія', '1 пара', '2 пара', '3 пара', '4 пара', '5 пара', '6 пара', '7 пара']];

        refs.occupancyResults.value.forEach((cab) => {
            const row = [cab.name];
            for (let i = 1; i <= 7; i++) {
                if (cab.slots[i]) {
                    row.push(`${cab.slots[i].group} (${cab.slots[i].teacher})`);
                } else {
                    row.push('');
                }
            }
            rows.push(row);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Зайнятість');
        XLSX.writeFile(wb, `occupancy_${refs.occupancyDate.value}.xlsx`);
    };
})(window.ScheduleApp);
