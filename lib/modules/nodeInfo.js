const monitor = require('dreamix-monitor');

const DEFAULT_INTERVAL = 5 * 60;// in second
const DEFAULT_DELAY = 10;// in second
const moduleId = 'nodeInfo';

class Module {
    constructor(opts) {
        opts = opts || {};
        this.type = opts.type || 'pull';
        this.interval = opts.interval || DEFAULT_INTERVAL;
        this.delay = opts.delay || DEFAULT_DELAY;
        this.moduleId = moduleId;
    }
    monitorHandler(agent) {    // eslint-disable-line
        const serverId = agent.id;
        const pid = process.pid;
        const params = {
            serverId: serverId,
            pid: pid
        };
        monitor.psmonitor.getPsInfo(params, (err, data) => {
            agent.notify(moduleId, { serverId: agent.id, body: data });
        });
    }

    masterHandler(agent, msg) {// eslint-disable-line
        if (!msg) {
            agent.notifyAll(moduleId);
            return;
        }

        const body = msg.body;
        let data = agent.get(moduleId);
        if (!data) {
            data = {};
            agent.set(moduleId, data);
        }

        data[msg.serverId] = body;
    }

    clientHandler(agent, msg, cb) {  // eslint-disable-line
        cb(null, agent.get(moduleId) || {});
    }
}

module.exports = opts => new Module(opts);
module.exports.moduleId = moduleId;
