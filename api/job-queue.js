class JobQueue {
    constructor(opts = {}) {
        this.concurrency = Math.max(1, Number(opts.concurrency || 1));
        this.queue = [];
        this.activeCount = 0;
    }

    get pendingCount() {
        return this.queue.length;
    }

    enqueue(jobFn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ jobFn, resolve, reject });
            this._drain();
        });
    }

    _drain() {
        while (this.activeCount < this.concurrency && this.queue.length > 0) {
            const item = this.queue.shift();
            this.activeCount += 1;
            Promise.resolve()
                .then(() => item.jobFn())
                .then((result) => item.resolve(result))
                .catch((err) => item.reject(err))
                .finally(() => {
                    this.activeCount -= 1;
                    this._drain();
                });
        }
    }
}

module.exports = JobQueue;

