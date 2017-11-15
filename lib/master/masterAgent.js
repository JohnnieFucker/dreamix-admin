const logger = require('dreamix-logger').getLogger('dreamix-admin', 'MasterAgent');
const MqttServer = require('../protocol/mqtt/mqttServer');
const EventEmitter = require('events');
const MasterSocket = require('./masterSocket');
const protocol = require('../util/protocol');
const utils = require('../util/utils');

const ST_INITED = 1;
const ST_STARTED = 2;
const ST_CLOSED = 3;

/**
 * add monitor,client to connection -- idMap
 *
 * @param {Object} agent agent object
 * @param {String} id
 * @param {String} type serverType
 * @param {String} pid
 * @param {String} info 
 * @param {Object} socket socket-io object
 * @api private
 */
function addConnection(agent, id, type, pid, info, socket) {
    const record = {
        id: id,
        type: type,
        pid: pid,
        info: info,
        socket: socket
    };
    if (type === 'client') {
        agent.clients[id] = record;
    } else if (!agent.idMap[id]) {
        agent.idMap[id] = record;
        agent.typeMap[type] = agent.typeMap[type] || [];
        const list = agent.typeMap[type];
        list.push(record);
    } else {
        agent.slaveMap[id] = agent.slaveMap[id] || [];
        const slaves = agent.slaveMap[id];
        slaves.push(record);
    }
    return record;
}

/**
 * remove monitor,client connection -- idMap
 *
 * @param {Object} agent agent object
 * @param {String} id
 * @param {String} type serverType
 * @param {String} info 
 * @api private
 */
function removeConnection(agent, id, type, info) {
    if (type === 'client') {
        delete agent.clients[id];
    } else {
        // remove master node in idMap and typeMap
        const record = agent.idMap[id];
        if (!record) {
            return;
        }
        const _info = record.info; // info {host, port}
        if (utils.compareServer(_info, info)) {
            delete agent.idMap[id];
            const list = agent.typeMap[type];
            if (list) {
                for (let i = 0, l = list.length; i < l; i++) {
                    if (list[i].id === id) {
                        list.splice(i, 1);
                        break;
                    }
                }
                if (list.length === 0) {
                    delete agent.typeMap[type];
                }
            }
        } else {
            // remove slave node in slaveMap
            const slaves = agent.slaveMap[id];
            if (slaves) {
                for (let i = 0, l = slaves.length; i < l; i++) {
                    if (utils.compareServer(slaves[i].info, info)) {
                        slaves.splice(i, 1);
                        break;
                    }
                }
                if (slaves.length === 0) {
                    delete agent.slaveMap[id];
                }
            }
        }
    }
}


function doSend(socket, topic, msg) {
    socket.send(topic, msg);
}

/**
 * send msg to monitor
 *
 * @param {Object} socket socket-io object
 * @param {Number} reqId request id
 * @param {String} moduleId module id/name
 * @param {Object} msg message
 * @api private
 */
function sendToMonitor(socket, reqId, moduleId, msg) {
    doSend(socket, 'monitor', protocol.composeRequest(reqId, moduleId, msg));
}

/**
 * send msg to client
 *
 * @param {Object} socket socket-io object
 * @param {Number} reqId request id
 * @param {String} moduleId module id/name
 * @param {Object} msg message
 * @api private
 */
function sendToClient(socket, reqId, moduleId, msg) {
    doSend(socket, 'client', protocol.composeRequest(reqId, moduleId, msg));
}


/**
 * broadcast msg to monitor
 *
 * @param {Object} records registered modules
 * @param {String} moduleId module id/name
 * @param {Object} msg message
 * @api private
 */
function broadcastMonitors(records, moduleId, msg) {
    msg = protocol.composeRequest(null, moduleId, msg);

    if (records instanceof Array) {
        for (let i = 0, l = records.length; i < l; i++) {
            const socket = records[i].socket;
            doSend(socket, 'monitor', msg);
        }
    } else {
        for (const id in records) {
            if (records.hasOwnProperty(id)) {
                const socket = records[id].socket;
                doSend(socket, 'monitor', msg);
            }
        }
    }
}

function broadcastCommand(records, command, moduleId, msg) {
    msg = protocol.composeCommand(null, command, moduleId, msg);

    if (records instanceof Array) {
        for (let i = 0, l = records.length; i < l; i++) {
            const socket = records[i].socket;
            doSend(socket, 'monitor', msg);
        }
    } else {
        for (const id in records) {
            if (records.hasOwnProperty(id)) {
                const socket = records[id].socket;
                doSend(socket, 'monitor', msg);
            }
        }
    }
}

/**
 * MasterAgent Constructor
 *
 * @class MasterAgent
 * @constructor
 * @param {Object} opts construct parameter
 *                 opts.consoleService {Object} consoleService
 *                 opts.id             {String} server id
 *                 opts.type           {String} server type, 'master', 'connector', etc.
 *                 opts.socket         {Object} socket-io object
 *                 opts.reqId          {Number} reqId add by 1
 *                 opts.callbacks      {Object} callbacks
 *                 opts.state          {Number} MasterAgent state
 * @api public
 */
class MasterAgent extends EventEmitter {
    constructor(consoleService, opts) {
        super();
        this.reqId = 1;
        this.idMap = {};
        this.msgMap = {};
        this.typeMap = {};
        this.clients = {};
        this.sockets = {};
        this.slaveMap = {};
        this.server = null;
        this.callbacks = {};
        this.state = ST_INITED;
        this.whitelist = opts.whitelist;
        this.consoleService = consoleService;
    }

    /**
     * master listen to a port and handle register and request
     *
     * @param {String} port
     * @param {Function} cb
     * @api public
     */
    listen(port, cb) {
        if (this.state > ST_INITED) {
            logger.error('master agent has started or closed.');
            return;
        }

        this.state = ST_STARTED;
        this.server = new MqttServer();
        this.server.listen(port);
        // this.server = sio.listen(port);
        // this.server.set('log level', 0);

        cb = cb || function () {}; // eslint-disable-line

        const self = this;
        this.server.on('error', (err) => {
            self.emit('error', err);
            cb(err);
        });

        this.server.once('listening', () => {
            setImmediate(() => {
                cb();
            });
        });

        this.server.on('connection', (socket) => {
            // var id, type, info, registered, username;
            const masterSocket = new MasterSocket();
            masterSocket.agent = self;
            masterSocket.socket = socket;

            self.sockets[socket.id] = socket;

            socket.on('register', (msg) => {
                // register a new connection
                masterSocket.onRegister(msg);
            }); // end of on 'register'

            // message from monitor
            socket.on('monitor', (msg) => {
                masterSocket.onMonitor(msg);
            }); // end of on 'monitor'

            // message from client
            socket.on('client', (msg) => {
                masterSocket.onClient(msg);
            }); // end of on 'client'

            socket.on('reconnect', (msg) => {
                masterSocket.onReconnect(msg);
            });

            socket.on('disconnect', () => {
                masterSocket.onDisconnect();
            });

            socket.on('close', () => {
                masterSocket.onDisconnect();
            });

            socket.on('error', (err) => {
                masterSocket.onError(err);
            });
        }); // end of on 'connection'
    } // end of listen

    /**
     * close master agent
     *
     * @api public
     */
    close() {
        if (this.state > ST_STARTED) {
            return;
        }
        this.state = ST_CLOSED;
        this.server.close();
    }

    /**
     * set module
     *
     * @param {String} moduleId module id/name
     * @param {Object} value module object
     * @api public
     */
    set(moduleId, value) {
        this.consoleService.set(moduleId, value);
    }

    /**
     * get module
     *
     * @param {String} moduleId module id/name
     * @api public
     */
    get(moduleId) {
        return this.consoleService.get(moduleId);
    }

    /**
     * getClientById
     *
     * @param {String} clientId
     * @api public
     */
    getClientById(clientId) {
        return this.clients[clientId];
    }

    /**
     * request monitor{master node} data from monitor
     *
     * @param {String} serverId
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @param {Function} cb function
     * @api public
     */
    request(serverId, moduleId, msg, cb) {
        if (this.state > ST_STARTED) {
            return false;
        }

        cb = cb || function () {}; // eslint-disable-line

        const curId = this.reqId++;
        this.callbacks[curId] = cb;

        if (!this.msgMap[serverId]) {
            this.msgMap[serverId] = {};
        }

        this.msgMap[serverId][curId] = {
            moduleId: moduleId,
            msg: msg
        };

        const record = this.idMap[serverId];
        if (!record) {
            cb(new Error(`unknown server id:${serverId}`));
            return false;
        }

        sendToMonitor(record.socket, curId, moduleId, msg);

        return true;
    }

    /**
     * request server data from monitor by serverInfo{host:port}
     *
     * @param {String} serverId
     * @param {Object} serverInfo
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @param {Function} cb function
     * @api public
     */
    requestServer(serverId, serverInfo, moduleId, msg, cb) {
        if (this.state > ST_STARTED) {
            return false;
        }

        const record = this.idMap[serverId];
        if (!record) {
            utils.invokeCallback(cb, new Error(`unknown server id:${serverId}`));
            return false;
        }

        const curId = this.reqId++;
        this.callbacks[curId] = cb;

        if (utils.compareServer(record, serverInfo)) {
            sendToMonitor(record.socket, curId, moduleId, msg);
        } else {
            const slaves = this.slaveMap[serverId];
            for (let i = 0, l = slaves.length; i < l; i++) {
                if (utils.compareServer(slaves[i], serverInfo)) {
                    sendToMonitor(slaves[i].socket, curId, moduleId, msg);
                    break;
                }
            }
        }

        return true;
    }

    /**
     * notify a monitor{master node} by id without callback
     *
     * @param {String} serverId
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @api public
     */
    notifyById(serverId, moduleId, msg) {
        if (this.state > ST_STARTED) {
            return false;
        }

        const record = this.idMap[serverId];
        if (!record) {
            logger.error(`fail to notifyById for unknown server id:${serverId}`);
            return false;
        }

        sendToMonitor(record.socket, null, moduleId, msg);

        return true;
    }

    /**
     * notify a monitor by server{host:port} without callback
     *
     * @param {String} serverId
     * @param {Object} serverInfo{host:port}
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @api public
     */
    notifyByServer(serverId, serverInfo, moduleId, msg) {
        if (this.state > ST_STARTED) {
            return false;
        }

        const record = this.idMap[serverId];
        if (!record) {
            logger.error(`fail to notifyByServer for unknown server id:${serverId}`);
            return false;
        }

        if (utils.compareServer(record, serverInfo)) {
            sendToMonitor(record.socket, null, moduleId, msg);
        } else {
            const slaves = this.slaveMap[serverId];
            for (let i = 0, l = slaves.length; i < l; i++) {
                if (utils.compareServer(slaves[i], serverInfo)) {
                    sendToMonitor(slaves[i].socket, null, moduleId, msg);
                    break;
                }
            }
        }
        return true;
    }

    /**
     * notify slaves by id without callback
     *
     * @param {String} serverId
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @api public
     */
    notifySlavesById(serverId, moduleId, msg) {
        if (this.state > ST_STARTED) {
            return false;
        }

        const slaves = this.slaveMap[serverId];
        if (!slaves || slaves.length === 0) {
            logger.error(`fail to notifySlavesById for unknown server id:${serverId}`);
            return false;
        }

        broadcastMonitors(slaves, moduleId, msg);
        return true;
    }

    /**
     * notify monitors by type without callback
     *
     * @param {String} type serverType
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @api public
     */
    notifyByType(type, moduleId, msg) {
        if (this.state > ST_STARTED) {
            return false;
        }

        const list = this.typeMap[type];
        if (!list || list.length === 0) {
            logger.error(`fail to notifyByType for unknown server type:${type}`);
            return false;
        }
        broadcastMonitors(list, moduleId, msg);
        return true;
    }

    /**
     * notify all the monitors without callback
     *
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @api public
     */
    notifyAll(moduleId, msg) {
        if (this.state > ST_STARTED) {
            return false;
        }
        broadcastMonitors(this.idMap, moduleId, msg);
        return true;
    }

    /**
     * notify a client by id without callback
     *
     * @param {String} clientId
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @api public
     */
    notifyClient(clientId, moduleId, msg) {
        if (this.state > ST_STARTED) {
            return false;
        }

        const record = this.clients[clientId];
        if (!record) {
            logger.error(`fail to notifyClient for unknown client id:${clientId}`);
            return false;
        }
        sendToClient(record.socket, null, moduleId, msg);
        return true;
    }

    notifyCommand(command, moduleId, msg) {
        if (this.state > ST_STARTED) {
            return false;
        }
        broadcastCommand(this.idMap, command, moduleId, msg);
        return true;
    }
    doAuthUser(msg, socket, cb) {
        if (!msg.id) {
            // client should has a client id
            return cb(new Error('client should has a client id'));
        }

        const self = this;
        const username = msg.username;
        if (!username) {
            // client should auth with username
            doSend(socket, 'register', {
                code: protocol.PRO_FAIL,
                msg: 'client should auth with username'
            });
            return cb(new Error('client should auth with username'));
        }

        const authUser = self.consoleService.authUser;
        const env = self.consoleService.env;
        authUser(msg, env, (user) => {
            if (!user) {
                // client should auth with username
                doSend(socket, 'register', {
                    code: protocol.PRO_FAIL,
                    msg: 'client auth failed with username or password error'
                });
                return cb(new Error('client auth failed with username or password error'));
            }

            if (self.clients[msg.id]) {
                doSend(socket, 'register', {
                    code: protocol.PRO_FAIL,
                    msg: `id has been registered. id:${msg.id}`
                });
                return cb(new Error(`id has been registered. id:${msg.id}`));
            }

            logger.info(`client user : ${username} login to master`);
            addConnection(self, msg.id, msg.type, null, user, socket);
            doSend(socket, 'register', {
                code: protocol.PRO_OK,
                msg: 'ok'
            });

            return cb();
        });
        return true;
    }

    doAuthServer(msg, socket, cb) {
        const self = this;
        const authServer = self.consoleService.authServer;
        const env = self.consoleService.env;
        authServer(msg, env, (status) => {
            if (status !== 'ok') {
                doSend(socket, 'register', {
                    code: protocol.PRO_FAIL,
                    msg: 'server auth failed'
                });
                cb(new Error('server auth failed'));
                return;
            }

            const record = addConnection(self, msg.id, msg.serverType, msg.pid, msg.info, socket);

            doSend(socket, 'register', {
                code: protocol.PRO_OK,
                msg: 'ok'
            });
            msg.info = msg.info || {};
            msg.info.pid = msg.pid;
            self.emit('register', msg.info);
            cb(null);
        });
    }

    doSend(...args) {    // eslint-disable-line
        doSend(...args);
    }

    sendToMonitor(...args) {  // eslint-disable-line
        sendToMonitor(...args);
    }

    addConnection(...args) {  // eslint-disable-line
        addConnection(...args);
    }

    removeConnection(...args) { // eslint-disable-line
        removeConnection(...args);
    }
}


module.exports = MasterAgent;
