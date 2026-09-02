(function (root) {
    root.AppModalShellComponent = {
        props: {
            open: { type: Boolean, default: false },
            title: { type: String, required: true },
            maxWidth: { type: String, default: 'max-w-lg' },
            headerClass: { type: String, default: 'bg-gray-50 dark:bg-gray-700' }
        },
        emits: ['close'],
        template: `
            <div v-if="open" class="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50 p-4"
                role="dialog" aria-modal="true" :aria-label="title" @click.self="$emit('close')">
                <div :class="['flex max-h-[80vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800', maxWidth]">
                    <header :class="['flex items-center justify-between gap-3 border-b p-4 dark:border-gray-700', headerClass]">
                        <h3 class="font-bold text-lg text-gray-900 dark:text-gray-100">{{ title }}</h3>
                        <button type="button" class="rounded px-2 text-2xl text-gray-500 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            aria-label="Закрити" @click="$emit('close')">×</button>
                    </header>
                    <div class="overflow-y-auto p-4"><slot></slot></div>
                    <footer v-if="$slots.footer" class="border-t p-4 dark:border-gray-700"><slot name="footer"></slot></footer>
                </div>
            </div>`
    };
})(window);
