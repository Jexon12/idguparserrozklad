(function (global) {
    const dictionaries = {
        uk: {},
        ru: {},
        en: {
            "Build optimized schedule": "Build optimized schedule",
            "Export optimized to Excel": "Export optimized to Excel"
        }
    };

    const state = {
        lang: localStorage.getItem('app_lang') || (navigator.language || 'uk').slice(0, 2)
    };

    function normalizeLang(lang) {
        const key = String(lang || 'uk').toLowerCase().slice(0, 2);
        if (!dictionaries[key]) return 'uk';
        return key;
    }

    function setLang(lang) {
        state.lang = normalizeLang(lang);
        localStorage.setItem('app_lang', state.lang);
        applyI18n();
    }

    function t(key, fallback) {
        const lang = normalizeLang(state.lang);
        const dict = dictionaries[lang] || {};
        return dict[key] || fallback || key;
    }

    function applyI18n(root) {
        const host = root || document;
        const nodes = host.querySelectorAll('[data-i18n]');
        nodes.forEach((el) => {
            const key = el.getAttribute('data-i18n');
            if (!key) return;
            el.textContent = t(key, el.textContent);
        });
    }

    global.ScheduleI18n = {
        t,
        setLang,
        getLang: () => normalizeLang(state.lang),
        applyI18n,
        dictionaries
    };
})(window);

