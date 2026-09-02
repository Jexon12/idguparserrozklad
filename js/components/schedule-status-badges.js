(function (root) {
    root.ScheduleStatusBadgesComponent = {
        props: { flags: { type: Object, default: () => ({}) }, compact: { type: Boolean, default: false } },
        template: `
            <div v-if="flags.cancelled || flags.moved || flags.online" class="flex flex-wrap gap-1" aria-label="Статус заняття">
                <span v-if="flags.cancelled" :class="['rounded-full bg-red-100 font-bold text-red-700 dark:bg-red-900/40 dark:text-red-200', compact ? 'px-2 py-0.5 text-[10px]' : 'px-2 py-1 text-[10px] uppercase tracking-wide']">Скасовано</span>
                <span v-if="flags.moved" :class="['rounded-full bg-amber-100 font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-200', compact ? 'px-2 py-0.5 text-[10px]' : 'px-2 py-1 text-[10px] uppercase tracking-wide']">Перенесено</span>
                <span v-if="flags.online" :class="['rounded-full bg-purple-100 font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-200', compact ? 'px-2 py-0.5 text-[10px]' : 'px-2 py-1 text-[10px] uppercase tracking-wide']">Онлайн</span>
            </div>`
    };
})(window);
