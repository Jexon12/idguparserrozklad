/** Shared pure analytics for normalized schedule rows. Browser + CommonJS. */
(function (root, factory) {
    let model = root?.ScheduleApp?.ScheduleModel;
    if (!model && typeof require === 'function') model = require('./schedule-model');
    const analytics = factory(model);
    if (typeof module === 'object' && module.exports) module.exports = analytics;
    if (root) {
        root.ScheduleApp = root.ScheduleApp || {};
        root.ScheduleApp.ScheduleAnalytics = analytics;
    }
})(typeof window !== 'undefined' ? window : globalThis, function (model) {
    const normalized = (rows) => Array.from(rows || []).map((row) => model.normalizeLesson(row));

    const heatmap = (rows) => {
        const map = new Map();
        normalized(rows).forEach((row) => {
            if (!row.date || !row.pair) return;
            const key = `${row.date}|${row.pair}`;
            map.set(key, (map.get(key) || 0) + 1);
        });
        return map;
    };

    const conflicts = (rows) => {
        const groups = new Map();
        normalized(rows).forEach((row, index) => {
            if (!row.date || !row.pair) return;
            [['group', row.group], ['teacher', row.teacher], ['room', row.room]].forEach(([type, value]) => {
                if (!value) return;
                const key = `${type}|${row.date}|${row.pair}|${value.toLowerCase()}`;
                if (!groups.has(key)) groups.set(key, { type, date: row.date, pair: row.pair, value, indices: [] });
                groups.get(key).indices.push(index);
            });
        });
        return Array.from(groups.values()).filter((item) => item.indices.length > 1);
    };

    const windows = (rows, entityField = 'group') => {
        const buckets = new Map();
        normalized(rows).forEach((row) => {
            const entity = row[entityField];
            if (!entity || !row.date || !row.pair) return;
            const key = `${entity}|${row.date}`;
            if (!buckets.has(key)) buckets.set(key, { entity, date: row.date, pairs: new Set() });
            buckets.get(key).pairs.add(row.pair);
        });
        return Array.from(buckets.values()).map((item) => {
            const pairs = Array.from(item.pairs).sort((a, b) => a - b);
            const missing = [];
            if (pairs.length > 1) {
                for (let pair = pairs[0] + 1; pair < pairs[pairs.length - 1]; pair += 1) {
                    if (!item.pairs.has(pair)) missing.push(pair);
                }
            }
            return { entity: item.entity, date: item.date, pairs, missing, count: missing.length };
        }).filter((item) => item.count > 0);
    };

    const comfortScore = (rows) => {
        const lessons = normalized(rows).filter((row) => row.date && row.pair);
        if (!lessons.length) return { score: 0, windows: 0, latePairs: 0, moves: 0, overload: 0 };
        const byDate = new Map();
        lessons.forEach((row) => {
            if (!byDate.has(row.date)) byDate.set(row.date, []);
            byDate.get(row.date).push(row);
        });
        let windowCount = 0;
        let latePairs = 0;
        let moves = 0;
        let overload = 0;
        byDate.forEach((dayRows) => {
            const pairs = Array.from(new Set(dayRows.map((row) => row.pair))).sort((a, b) => a - b);
            for (let index = 1; index < pairs.length; index += 1) {
                windowCount += Math.max(0, pairs[index] - pairs[index - 1] - 1);
            }
            latePairs += dayRows.filter((row) => row.pair >= 6).length;
            overload += Math.max(0, dayRows.length - 4);
            const sorted = dayRows.slice().sort((a, b) => a.pair - b.pair);
            for (let index = 1; index < sorted.length; index += 1) {
                if (sorted[index - 1].building && sorted[index].building && sorted[index - 1].building !== sorted[index].building) moves += 1;
            }
        });
        const penalty = windowCount * 8 + latePairs * 5 + moves * 3 + overload * 2;
        return { score: Math.max(0, Math.min(100, 100 - penalty)), windows: windowCount, latePairs, moves, overload };
    };

    const diff = (before, after) => {
        const beforeMap = new Map(normalized(before).map((row) => [model.stableLessonKey(row), row]));
        const afterMap = new Map(normalized(after).map((row) => [model.stableLessonKey(row), row]));
        return {
            added: Array.from(afterMap.entries()).filter(([key]) => !beforeMap.has(key)).map(([, row]) => row),
            removed: Array.from(beforeMap.entries()).filter(([key]) => !afterMap.has(key)).map(([, row]) => row)
        };
    };

    return { heatmap, conflicts, windows, comfortScore, diff };
});
