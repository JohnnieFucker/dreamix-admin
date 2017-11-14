const monitor = require('dreamix-monitor');

const DEFAULT_INTERVAL = 5 * 60;// in second
const DEFAULT_DELAY = 10;// in second

class Module {
    constructor(opts) {
        opts = opts || {};
        this.type = opts.type || 'pull';
        this.interval = opts.interval || DEFAULT_INTERVAL;
        this.delay = opts.delay || DEFAULT_DELAY;
        this.moduleId = 'nodeInfo';
    }
    monitorHandler(agent) {
        const serverId = agent.id;
        const pid = process.pid;
        const params = {
            serverId: serverId,
            pid: pid
        };
        const self = this;
        monitor.psmonitor.getPsInfo(params, (err, data) => {
            agent.notify(self.moduleId, { serverId: agent.id, body: data });
        });
    }

    masterHandler(agent, msg) {
        if (!msg) {
            agent.notifyAll(this.moduleId);
            return;
        }

        const body = msg.body;
        let data = agent.get(this.moduleId);
        if (!data) {
            data = {};
            agent.set(this.moduleId, data);
        }

        data[msg.serverId] = body;
    }

    clientHandler(agent, msg, cb) {
        cb(null, agent.get(this.moduleId) || {});
    }
}

module.exports = opts => new Module(opts);
