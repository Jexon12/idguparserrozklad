(function () {
  const byId = (id) => document.getElementById(id);
  const state = { health: null, monitor: null, versions: null, audit: null, loadedAt: null };

  async function getJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  }

  function renderAudit(items) {
    const list = byId('staffAuditLog');
    list.replaceChildren();
    if (!items.length) {
      const item = document.createElement('li');
      item.textContent = 'Останніх адміністративних дій немає.';
      list.appendChild(item);
      return;
    }
    items.forEach((event) => {
      const item = document.createElement('li');
      item.className = 'rounded-lg bg-gray-50 p-2 dark:bg-gray-700';
      const at = event.at ? new Date(event.at).toLocaleString('uk-UA') : '—';
      item.textContent = `${at} · ${event.action || event.type || 'дія'} · ${event.scope || event.term || ''}`;
      list.appendChild(item);
    });
  }

  async function loadStatus() {
    const button = byId('refreshStaffStatus');
    button.disabled = true;
    button.textContent = 'Оновлення…';
    try {
      const results = await Promise.allSettled([
        getJson('/api/health'), getJson('/api/monitor'), getJson('/api/versions?scope=session'), getJson('/api/audit?limit=20')
      ]);
      state.health = results[0].status === 'fulfilled' ? results[0].value : { error: results[0].reason?.message };
      state.monitor = results[1].status === 'fulfilled' ? results[1].value : { error: results[1].reason?.message };
      state.versions = results[2].status === 'fulfilled' ? results[2].value : { error: results[2].reason?.message };
      state.audit = results[3].status === 'fulfilled' ? results[3].value : { error: results[3].reason?.message, items: [] };
      state.loadedAt = new Date().toISOString();
      byId('staffHealth').textContent = state.health.error ? `Помилка: ${state.health.error}` : 'Працює';
      byId('staffMonitor').textContent = state.monitor.error ? `Недоступний: ${state.monitor.error}` : `${state.monitor.status || 'ok'} · подій: ${state.monitor.lastEventsCount || 0}`;
      byId('staffVersions').textContent = state.versions.error ? `Недоступні: ${state.versions.error}` : String(state.versions.count || 0);
      renderAudit(Array.isArray(state.audit.items) ? state.audit.items : []);
    } finally {
      button.disabled = false;
      button.textContent = 'Оновити';
    }
  }

  function downloadDiagnostics() {
    const navigation = performance.getEntriesByType?.('navigation')?.[0];
    let clientErrors = [];
    let apiMetrics = null;
    let appPerformance = null;
    try { clientErrors = JSON.parse(localStorage.getItem('schedule_client_errors_v1') || '[]'); } catch (_) { /* ignore */ }
    try { apiMetrics = JSON.parse(localStorage.getItem('schedule_api_metrics_v1') || 'null'); } catch (_) { /* ignore */ }
    try { appPerformance = JSON.parse(localStorage.getItem('schedule_performance_v1') || 'null'); } catch (_) { /* ignore */ }
    const report = {
      generatedAt: new Date().toISOString(),
      online: navigator.onLine,
      page: location.pathname,
      userAgent: navigator.userAgent,
      performance: navigation ? {
        domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
        loadMs: Math.round(navigation.loadEventEnd),
        requests: performance.getEntriesByType?.('resource')?.length || 0
      } : null,
      services: state,
      apiMetrics,
      appPerformance,
      clientErrors: clientErrors.slice(0, 100)
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `schedule-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  byId('refreshStaffStatus')?.addEventListener('click', loadStatus);
  byId('downloadDiagnostics')?.addEventListener('click', downloadDiagnostics);
  loadStatus().catch((error) => {
    byId('staffHealth').textContent = `Помилка: ${error.message}`;
  });
})();
