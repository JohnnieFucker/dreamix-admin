const logger = require('dreamix-logger').getLogger('dreamix-admin', __filename);
const exec = require('child_process').exec;
const path = require('path');

const DEFAULT_INTERVAL = 5 * 60;// in second
const moduleId = 'monitorLog';

function getLogFileName(logfile, serverId) {
    return `${logfile}-${serverId}.log`;
}

// get the latest logs
function fetchLogs(root, msg, callback) {
    const number = msg.number;
    const logfile = msg.logfile;
    const serverId = msg.serverId;
    const filePath = path.join(root, getLogFileName(logfile, serverId));

    const endLogs = [];
    exec(`tail -n ${number} ${filePath}`, (error, output) => {
        const endOut = [];
        output = output.replace(/^\s+|\s+$/g, '').split(/\s+/);

        for (let i = 5; i < output.length; i += 6) {
            endOut.push(output[i]);
        }

        const endLength = endOut.length;
        for (let j = 0; j < endLength; j++) {
            const map = {};
            let json;
            try {
                json = JSON.parse(endOut[j]);
            } catch (e) {
                logger.error(`the log cannot parsed to json, ${e}`);
                continue;   // eslint-disable-line
            }
            map.time = json.time;
            map.route = json.route || json.service;
            map.serverId = serverId;
            map.timeUsed = json.timeUsed;
            map.params = endOut[j];
            endLogs.push(map);
        }

        callback({ logfile: logfile, dataArray: endLogs });
    });
}

/**
 * Initialize a new 'Module' with the given 'opts'
 *
 * @class Module
 * @constructor
 * @param {object} opts
 * @api public
 */
class Module {
    constructor(opts) {
        opts = opts || {};
        this.root = opts.path;
        this.interval = opts.interval || DEFAULT_INTERVAL;
        this.moduleId = moduleId;
    }
    /**
     * collect monitor data from monitor
     *
     * @param {Object} agent monitorAgent object
     * @param {Object} msg client message
     * @param {Function} cb callback function
     * @api public
     */
    monitorHandler(agent, msg, cb) {
        if (!msg.logfile) {
            cb(new Error('logfile should not be empty'));
            return;
        }

        const serverId = agent.id;
        fetchLogs(this.root, msg, (data) => {
            cb(null, { serverId: serverId, body: data });
        });
    }

    /**
     * Handle client request
     *
     * @param {Object} agent masterAgent object
     * @param {Object} msg client message
     * @param {Function} cb callback function
     * @api public
     */
    clientHandler(agent, msg, cb) {     // eslint-disable-line
        agent.request(msg.serverId, moduleId, msg, (err, res) => {
            if (err) {
                logger.error(`fail to run log for ${err.stack}`);
                return;
            }
            cb(null, res);
        });
    }
}


module.exports = opts => new Module(opts);
module.exports.moduleId = moduleId;
