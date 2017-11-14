const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const utils = {};

/**
 * Check and invoke callback
 */
utils.invokeCallback = (cb, ...args) => {
    if (!!cb && typeof cb === 'function') {
        cb(...args);
    }
};

/*
 * Date format
 */
utils.format = (date, format) => {
    format = format || 'MM-dd-hhmm';
    const o = {
        'M+': date.getMonth() + 1, // month
        'd+': date.getDate(), // day
        'h+': date.getHours(), // hour
        'm+': date.getMinutes(), // minute
        's+': date.getSeconds(), // second
        'q+': Math.floor((date.getMonth() + 3) / 3), // quarter
        S: date.getMilliseconds() // millisecond
    };

    if (/(y+)/.test(format)) {
        format = format.replace(RegExp.$1, (`${date.getFullYear()}`).substr(4 - RegExp.$1.length));
    }
    for (const k in o) {
        if (new RegExp(`(${k})`).test(format)) {
            format = format.replace(RegExp.$1,
                RegExp.$1.length === 1 ? o[k] :
                    (`00${o[k]}`).substr((`${o[k]}`).length));
        }
    }

    return format;
};

utils.compareServer = (server1, server2) => (server1.host === server2.host) &&
        (server1.port === server2.port);

/**
 * Get the count of elements of object
 */
utils.size = (obj, type) => {
    let count = 0;
    for (const i in obj) {
        if (obj.hasOwnProperty(i) && typeof obj[i] !== 'function') {
            if (!type) {
                count++;
            } else if (type && type === obj[i].type) {
                count++;
            }
        }
    }
    return count;
};

utils.md5 = (str) => {
    const md5sum = crypto.createHash('md5');
    md5sum.update(str, 'utf-8');
    str = md5sum.digest('hex');
    return str;
};

utils.defaultAuthUser = (msg, env, cb) => {
    let adminUser = null;
    const appBase = path.dirname(require.main.filename);
    const adminUserPath = path.join(appBase, '/config/adminUser.json');
    const presentPath = path.join(appBase, 'config', env, 'adminUser.json');
    if (fs.existsSync(adminUserPath)) {
        adminUser = require(adminUserPath);    // eslint-disable-line
    } else if (fs.existsSync(presentPath)) {
        adminUser = require(presentPath);  // eslint-disable-line
    } else {
        cb(null);
        return;
    }
    const username = msg.username;
    const password = msg.password;
    const md5 = msg.md5;

    const len = adminUser.length;
    if (md5) {
        for (let i = 0; i < len; i++) {
            const user = adminUser[i];
            let p = '';
            if (user.username === username) {
                p = utils.md5(user.password);
                if (password === p) {
                    cb(user);
                    return;
                }
            }
        }
    } else {
        for (let i = 0; i < len; i++) {
            const user = adminUser[i];
            if (user.username === username && user.password === password) {
                cb(user);
                return;
            }
        }
    }
    cb(null);
};

utils.defaultAuthServerMaster = (msg, env, cb) => {
    const type = msg.serverType;
    const token = msg.token;
    if (type === 'master') {
        cb('ok');
        return;
    }

    let servers = null;
    const appBase = path.dirname(require.main.filename);
    const serverPath = path.join(appBase, '/config/adminServer.json');
    const presentPath = path.join(appBase, 'config', env, 'adminServer.json');
    if (fs.existsSync(serverPath)) {
        servers = require(serverPath);  // eslint-disable-line
    } else if (fs.existsSync(presentPath)) {
        servers = require(presentPath); // eslint-disable-line
    } else {
        cb('ok');
        return;
    }

    const len = servers.length;
    for (let i = 0; i < len; i++) {
        const server = servers[i];
        if (server.type === type && server.token === token) {
            cb('ok');
            return;
        }
    }
    cb('bad');
};

utils.defaultAuthServerMonitor = (msg, env, cb) => {
    const type = msg.serverType;

    let servers = null;
    const appBase = path.dirname(require.main.filename);
    const serverPath = path.join(appBase, '/config/adminServer.json');
    const presentPath = path.join(appBase, 'config', env, 'adminServer.json');
    if (fs.existsSync(serverPath)) {
        servers = require(serverPath);  // eslint-disable-line
    } else if (fs.existsSync(presentPath)) {
        servers = require(presentPath); // eslint-disable-line
    } else {
        cb('ok');
        return;
    }

    const len = servers.length;
    for (let i = 0; i < len; i++) {
        const server = servers[i];
        if (server.type === type) {
            cb(server.token);
            return;
        }
    }
    cb(null);
};

module.exports = utils;
