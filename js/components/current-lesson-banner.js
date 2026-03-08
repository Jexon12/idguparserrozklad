/**
 * Current Lesson Banner — shows active lesson and time left.
 */
window.CurrentLessonBannerComponent = {
    name: 'CurrentLessonBanner',
    props: { currentLessonInfo: { type: Object, default: null } },
    template: `
        <div v-if="currentLessonInfo"
            class="sticky top-0 z-[60] bg-green-600 text-white shadow-md px-4 py-3 flex items-center justify-between animate-slide-down">
            <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                <div class="flex flex-col leading-tight min-w-0">
                    <span class="text-[10px] font-bold opacity-80 uppercase tracking-wider">Зараз іде</span>
                    <span class="font-bold truncate text-sm">{{ currentLessonInfo.discipline }}</span>
                    <span class="text-[10px] opacity-90 truncate">{{ currentLessonInfo.type }} · {{ currentLessonInfo.cabinet }}</span>
                </div>
            </div>
            <div class="flex flex-col items-end min-w-[100px] ml-4 shrink-0">
                <span class="text-[10px] font-bold opacity-80 uppercase tracking-wider">До кінця пари</span>
                <span class="font-bold font-mono text-xl leading-none">{{ currentLessonInfo.timeLeftStr }}</span>
                <div class="w-full bg-green-800/60 rounded-full h-2 mt-2 overflow-hidden" title="Час до кінця пари">
                    <div class="bg-white h-full rounded-full transition-all duration-1000 ease-linear"
                        :style="{ width: (currentLessonInfo.remainingPercent || 0) + '%' }"></div>
                </div>
            </div>
        </div>
    `
};
