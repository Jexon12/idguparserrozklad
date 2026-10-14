const SA = window.ScheduleApp;

const reportState = window.ScheduleAppReportState || Vue.reactive({
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
window.ScheduleAppReportState = reportState;

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
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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
            const data = await SA.fetchApi('GetEmployeeChairs', {
                aFacultyID: reportState.reportForm.faculty.Key
            });
            reportState.reportChairs = (data && data.chairs) ? data.chairs : (Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Failed to load chairs for report:', e);
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
            console.error('Failed to load employees for report:', e);
        }
    },

    async downloadReport() {
        if (!reportComputed.isReportFormValid.value) return;
        reportState.isDownloadingReport = true;
        reportState.reportProgress = { current: 0, total: 0, progress: '0/0 місяців', done: false, error: null };

        try {
            const [sy, sm] = reportState.reportForm.monthStart.split('-').map(Number);
            const [ey, em] = reportState.reportForm.monthEnd.split('-').map(Number);
            const monthCount = (ey - sy) * 12 + em - sm + 1;
            if (!Number.isInteger(monthCount) || monthCount < 1 || monthCount > 24) {
                throw new Error('Діапазон звіту має містити від 1 до 24 місяців');
            }
            const apiBase = SA.API_PROXY.startsWith('/') ? (window.location.origin + SA.API_PROXY.replace(/\/$/, '')) : (window.location.origin + '/api');
            const params = new URLSearchParams({
                faculty: reportState.reportForm.faculty.Value,
                department: reportState.reportForm.chair.Value,
                teacherName: reportState.reportForm.teacher.Value,
                teacherId: reportState.reportForm.teacher.Key,
                monthStart: reportState.reportForm.monthStart,
                monthEnd: reportState.reportForm.monthEnd
            });
            // Generate and stream the file in one request. This works across
            // serverless instances; no in-memory job state is required.
            const response = await fetch(`${apiBase}/report/download?${params.toString()}`);
            if (!response.ok) {
                const raw = await response.text();
                let message = raw || `HTTP ${response.status}`;
                try { message = JSON.parse(raw).error || message; } catch (_) { }
                throw new Error(message);
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            const safeTeacher = String(reportState.reportForm.teacher.Value || 'Викладач').replace(/[\\/:*?"<>|]/g, '_');
            anchor.download = `Звіт_${safeTeacher}_${reportState.reportForm.monthStart}_${reportState.reportForm.monthEnd}.xlsx`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(objectUrl);
            reportState.reportProgress = { current: monthCount, total: monthCount, progress: 'Завантаження розпочато', done: true, error: null };
            reportState.isDownloadingReport = false;
            reportState.showReportModal = false;
        } catch (e) {
            reportState.reportError = 'Помилка: ' + e.message;
            reportState.isDownloadingReport = false;
            setTimeout(() => { reportState.reportError = ''; }, 5000);
        }
    }
};

window.ReportModule = {
    state: reportState,
    computed: reportComputed,
    methods: reportMethods,
    __real: true
};
