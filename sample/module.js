const DEFAULT_INTERVAL = 5; // in second
const DEFAULT_DELAY = 1; // in second

const moduleId = 'test_module';


class Module {
    constructor(opts) {
        opts = opts || {};
        this.type = opts.type || 'pull';
        this.interval = opts.interval || DEFAULT_INTERVAL;
        this.delay = opts.delay || DEFAULT_DELAY;
        this.moduleId = moduleId;
    }
    monitorHandler(agent, msg, cb) {      // eslint-disable-line
        console.log('monitorHandler %j', msg);
        cb(null, 'ok');
    }

    masterHandler(agent, msg, cb) { // eslint-disable-line
        if (!msg) {
            // agent.notifyAll(module.exports.moduleId);
            const sendMsg = {
                id: Date.now()
            };
            agent.request('test-server-1', moduleId, sendMsg, (err, r) => {
                if (err) {
                    console.error(err);
                }

                if (r) {
                    console.log(r);
                }
            });
            return;
        }
        console.log('masterHandler %j', msg);
    }

    clientHandler(agent, msg, cb) {      // eslint-disable-line
        console.log('clientHandler %j', msg);
    }
}

module.exports = opts => new Module(opts);
module.exports.moduleId = moduleId;
