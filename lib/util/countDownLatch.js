const exp = {};

/**
 * Count down to zero and invoke cb finally.
 */
class CountDownLatch {
    constructor(count, cb) {
        this.count = count;
        this.cb = cb;
    }

    /**
     * Call when a task finish to count down.
     *
     * @api public
     */
    done() {
        if (this.count <= 0) {
            throw new Error('illegal state.');
        }

        this.count--;
        if (this.count === 0) {
            this.cb();
        }
    }
}

/**
 * create a count down latch
 *
 * @api public
 */
exp.createCountDownLatch = (count, cb) => {
    if (!count || count <= 0) {
        throw new Error('count should be positive.');
    }
    if (typeof cb !== 'function') {
        throw new Error('cb should be a function.');
    }

    return new CountDownLatch(count, cb);
};

module.exports = exp;
