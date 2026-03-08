
const SA = window.ScheduleApp;

const reportState = Vue.reactive({
    showReportModal: false,
    isDownloadingReport: false,
    reportProgress: { current: 0, total: 0, progress: '', done: false, error: null },
    reportForm: {
        faculty: '',
        chair: '',
        teacher: '',
        monthStart: '',
        monthEnd: ''
    },
    reportChairs: [],
    reportEmployees: [],
    reportError: ''
});

const reportComputed = {
    isReportFormValid: Vue.computed(() => {
        return reportState.reportForm.faculty &&
            reportState.reportForm.chair &&
            reportState.reportForm.teacher &&
            reportState.reportForm.monthStart &&
            reportState.reportForm.monthEnd;
    })
};

const reportMethods = {
    openReportModal() {
        reportState.showReportModal = true;
        // Pre-fill valid dates if needed
        const now = new Date();
        const currentMonth = now.toISOString().slice(0, 7);
        if (!reportState.reportForm.monthStart) reportState.reportForm.monthStart = currentMonth;
        if (!reportState.reportForm.monthEnd) reportState.reportForm.monthEnd = currentMonth;
    },

    async loadReportChairs() {
        if (!reportState.reportForm.faculty) return;
        reportState.reportChairs = [];
        reportState.reportForm.chair = '';
        reportState.reportEmployees = [];
        reportState.reportForm.teacher = '';

        try {
            // Use GetEmployeeChairs as it returns chairs relevant for employees
            const data = await SA.fetchApi('GetEmployeeChairs', {
                aFacultyID: reportState.reportForm.faculty.Key
            });
            reportState.reportChairs = (data && data.chairs) ? data.chairs : (Array.isArray(data) ? data : []);
        } catch (e) {
            console.error("Failed to load chairs for report:", e);
        }
    },

    async loadReportEmployees() {
        if (!reportState.reportForm.chair) return;
        reportState.reportEmployees = [];
        reportState.reportForm.teacher = '';

        try {
            const data = await SA.fetchApi('GetEmployees', {
                aFacultyID: reportState.reportForm.faculty.Key,
                aChairID: reportState.reportForm.chair.Key
            });
            reportState.reportEmployees = Array.isArray(data) ? data : [];
        } catch (e) {
            console.error("Failed to load employees for report:", e);
        }
    },

    async downloadReport() {
        if (!reportComputed.isReportFormValid.value) return;
        reportState.isDownloadingReport = true;
        reportState.reportProgress = { current: 0, total: 0, progress: '0/0 місяців', done: false, error: null };

        try {
            const apiBase = SA.API_PROXY.startsWith('/') ? (window.location.origin + SA.API_PROXY.replace(/\/$/, '')) : (window.location.origin + '/api');
            const startRes = await fetch(apiBase + '/report/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    facultyName: reportState.reportForm.faculty.Value,
                    departmentName: reportState.reportForm.chair.Value,
                    teacherName: reportState.reportForm.teacher.Value,
                    teacherId: reportState.reportForm.teacher.Key,
                    monthStart: reportState.reportForm.monthStart,
                    monthEnd: reportState.reportForm.monthEnd
                })
            });
            const { jobId } = await startRes.json();
            if (!jobId) throw new Error('Не вдалося розпочати генерацію');

            const statusUrl = apiBase + '/report/status?jobId=' + jobId;
            const poll = async () => {
                const r = await fetch(statusUrl);
                const s = await r.json();
                reportState.reportProgress = { current: s.current || 0, total: s.total || 0, progress: s.progress || '', done: !!s.done, error: s.error || null };
                if (s.error) {
                    reportState.isDownloadingReport = false;
                    reportState.reportError = s.error;
                    setTimeout(() => reportState.reportError = '', 5000);
                    return;
                }
                if (s.done && s.downloadUrl) {
                    const baseUrl = window.location.origin;
                    const downloadUrl = (s.downloadUrl.startsWith('/') ? baseUrl : baseUrl + '/') + s.downloadUrl;
                    window.location.href = downloadUrl;
                    reportState.isDownloadingReport = false;
                    reportState.showReportModal = false;
                    if (typeof showToast === 'function') showToast("⏳ Завантаження розпочато...");
                    return;
                }
                setTimeout(poll, 500);
            };
            poll();
        } catch (e) {
            reportState.reportError = "Помилка: " + e.message;
            reportState.isDownloadingReport = false;
            setTimeout(() => reportState.reportError = '', 5000);
        }
    }
};

// Export to be used in app.js
window.ReportModule = {
    state: reportState,
    computed: reportComputed,
    methods: reportMethods
};
