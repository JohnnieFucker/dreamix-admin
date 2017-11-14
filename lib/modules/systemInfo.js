const monitor = require('dreamix-monitor');

const DEFAULT_INTERVAL = 5 * 60;// in second
const DEFAULT_DELAY = 10;// in second


class Module {
    constructor(opts) {
        opts = opts || {};
        this.type = opts.type || 'pull';
        this.interval = opts.interval || DEFAULT_INTERVAL;
        this.delay = opts.delay || DEFAULT_DELAY;
        this.moduleId = 'systemInfo';
    }
    monitorHandler(agent) {    // eslint-disable-line
        // collect data
        monitor.sysmonitor.getSysInfo((err, data) => {
            agent.notify(module.exports.moduleId, { serverId: agent.id, body: data });
        });
    }

    masterHandler(agent, msg) {   // eslint-disable-line
        if (!msg) {
            agent.notifyAll(module.exports.moduleId);
            return;
        }

        const body = msg.body;

        const oneData = {
            Time: body.iostat.date,
            hostname: body.hostname,
            serverId: msg.serverId,
            cpu_user: body.iostat.cpu.cpu_user,
            cpu_nice: body.iostat.cpu.cpu_nice,
            cpu_system: body.iostat.cpu.cpu_system,
            cpu_iowait: body.iostat.cpu.cpu_iowait,
            cpu_steal: body.iostat.cpu.cpu_steal,
            cpu_idle: body.iostat.cpu.cpu_idle,
            tps: body.iostat.disk.tps,
            kb_read: body.iostat.disk.kb_read,
            kb_wrtn: body.iostat.disk.kb_wrtn,
            kb_read_per: body.iostat.disk.kb_read_per,
            kb_wrtn_per: body.iostat.disk.kb_wrtn_per,
            totalmem: body.totalmem,
            freemem: body.freemem,
            'free/total': (body.freemem / body.totalmem),
            m_1: body.loadavg[0],
            m_5: body.loadavg[1],
            m_15: body.loadavg[2]
        };

        let data = agent.get(module.exports.moduleId);
        if (!data) {
            data = {};
            agent.set(module.exports.moduleId, data);
        }

        data[msg.serverId] = oneData;
    }

    clientHandler(agent, msg, cb) {      // eslint-disable-line
        cb(null, agent.get(module.exports.moduleId) || {});
    }
}


module.exports = opts => new Module(opts);
