const logger = require('dreamix-logger').getLogger('dreamix-admin', __filename);
const vm = require('vm');
const fs = require('fs');
const util = require('util');
const path = require('path');
const os = require('os');

const moduleId = 'scripts';

/**
 * List server id and scripts file name
 */
function list(scriptModule, agent, msg, cb) {
    const servers = [];
    const scripts = [];
    const idMap = agent.idMap;

    for (const sid in idMap) {
        if (idMap.hasOwnProperty(sid)) {
            servers.push(sid);
        }
    }

    fs.readdir(scriptModule.root, (err, filenames) => {
        if (err) {
            filenames = [];
        }
        for (let i = 0, l = filenames.length; i < l; i++) {
            scripts.push(filenames[i]);
        }

        cb(null, {
            servers: servers,
            scripts: scripts
        });
    });
}

/**
 * Get the content of the script file
 */
function get(scriptModule, agent, msg, cb) {
    const filename = msg.filename;
    if (!filename) {
        cb('empty filename');
        return;
    }

    fs.readFile(path.join(scriptModule.root, filename), 'utf-8', (err, data) => {
        if (err) {
            logger.error(`fail to read script file:${filename}, ${err.stack}`);
            cb(`fail to read script with name:${filename}`);
        }

        cb(null, data);
    });
}

/**
 * Save a script file that posted from admin console
 */
function save(scriptModule, agent, msg, cb) {
    const filepath = path.join(scriptModule.root, msg.filename);

    fs.writeFile(filepath, msg.body, (err) => {
        if (err) {
            logger.error(`fail to write script file:${msg.filename}, ${err.stack}`);
            cb(`fail to write script file:${msg.filename}`);
            return;
        }

        cb();
    });
}

/**
 * Run the script on the specified server
 */
function run(scriptModule, agent, msg, cb) {
    agent.request(msg.serverId, moduleId, msg, (err, res) => {
        if (err) {
            logger.error(`fail to run script for ${err.stack}`);
            return;
        }
        cb(null, res);
    });
}

class Module {
    constructor(opts) {
        this.app = opts.app;
        this.root = opts.path;
        this.commands = {
            list: list,
            get: get,
            save: save,
            run: run
        };
        this.moduleId = moduleId;
    }
    monitorHandler(agent, msg, cb) {
        const context = {
            app: this.app,
            require: require,
            os: os,
            fs: fs,
            process: process,
            util: util
        };
        try {
            vm.runInNewContext(msg.script, context);

            const result = context.result;
            if (!result) {
                cb(null, 'script result should be assigned to result value to script module context');
            } else {
                cb(null, result);
            }
        } catch (e) {
            cb(null, e.toString());
        }

        // cb(null, vm.runInContext(msg.script, context));
    }
    clientHandler(agent, msg, cb) {
        const fun = this.commands[msg.command];
        if (!fun || typeof fun !== 'function') {
            cb(`unknown command:${msg.command}`);
            return;
        }

        fun(this, agent, msg, cb);
    }
}

module.exports = opts => new Module(opts);
module.exports.moduleId = moduleId;
