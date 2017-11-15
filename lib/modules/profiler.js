const utils = require('../util/utils');
const fs = require('fs');
const ProfileProxy = require('../util/profileProxy');
const path = require('path');

const moduleId = 'profiler';

let profiler = null;
try {
    profiler = require('v8-profiler');  // eslint-disable-line
} catch (e) {} // eslint-disable-line
if (!profiler) {
    module.exports.moduleError = 1;
}

function list(agent, msg, cb) {
    const servers = [];
    const idMap = agent.idMap;

    for (const sid in idMap) {
        if (idMap.hasOwnProperty(sid)) {
            servers.push(sid);
        }
    }
    cb(null, servers);
}

class Module {
    constructor(opts) {
        if (opts && opts.isMaster) {
            this.proxy = new ProfileProxy();
        }
        this.moduleId = moduleId;
    }
    monitorHandler(agent, msg) {
        const type = msg.type;
        const action = msg.action;
        const uid = msg.uid;
        let result = null;
        const self = this;
        if (type === 'CPU') {
            if (action === 'start') {
                profiler.startProfiling();
            } else {
                result = profiler.stopProfiling();
                const res = {};
                res.head = result.getTopDownRoot();
                res.bottomUpHead = result.getBottomUpRoot();
                res.msg = msg;
                agent.notify(self.moduleId, { clientId: msg.clientId, type: type, body: res });
            }
        } else {
            const snapshot = profiler.takeSnapshot();
            const appBase = path.dirname(require.main.filename);
            const name = `${appBase}/logs/${utils.format(new Date())}.log`;
            const log = fs.createWriteStream(name, { flags: 'a' });
            let data;
            snapshot.serialize({
                onData: (chunk) => {
                    chunk = `${chunk}`;
                    data = {
                        method: 'Profiler.addHeapSnapshotChunk',
                        params: {
                            uid: uid,
                            chunk: chunk
                        }
                    };
                    log.write(chunk);
                    agent.notify(self.moduleId, { clientId: msg.clientId, type: type, body: data });
                },
                onEnd: () => {
                    agent.notify(self.moduleId, { clientId: msg.clientId, type: type, body: { params: { uid: uid } } });
                    profiler.deleteAllSnapshots();
                }
            });
        }
    }
    masterHandler(agent, msg) {
        if (msg.type === 'CPU') {
            this.proxy.stopCallBack(msg.body, msg.clientId, agent);
        } else {
            this.proxy.takeSnapCallBack(msg.body);
        }
    }
    clientHandler(agent, msg, cb) {
        if (msg.action === 'list') {
            list(agent, msg, cb);
            return;
        }

        if (typeof msg === 'string') {
            msg = JSON.parse(msg);
        }
        const id = msg.id;
        const command = msg.method.split('.');
        const method = command[1];
        const params = msg.params;
        const clientId = msg.clientId;

        if (!this.proxy[method] || typeof this.proxy[method] !== 'function') {
            return;
        }

        this.proxy[method](id, params, clientId, agent);
    }
}

module.exports = (opts) => {
    if (!profiler) {
        return { moduleId: moduleId };
    }
    return new Module(opts);
};
module.exports.moduleId = moduleId;

