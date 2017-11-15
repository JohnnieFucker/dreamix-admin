const logger = require('dreamix-logger').getLogger('dreamix-admin', 'MonitorAgent');
const MqttClient = require('../protocol/mqtt/mqttClient');
const EventEmitter = require('events');
const protocol = require('../util/protocol');

const ST_INITED = 1;
const ST_CONNECTED = 2;
const ST_REGISTERED = 3;
const ST_CLOSED = 4;
const STATUS_INTERVAL = 5 * 1000; // 60 seconds

/**
 * MonitorAgent Constructor
 *
 * @class MasterAgent
 * @constructor
 * @param {Object} opts construct parameter
 *                 opts.consoleService {Object} consoleService
 *                 opts.id             {String} server id
 *                 opts.type           {String} server type, 'master', 'connector', etc.
 *                 opts.info           {Object} more server info for current server, {id, serverType, host, port}
 * @api public
 */
class MonitorAgent extends EventEmitter {
    constructor(opts) {
        super();
        this.reqId = 1;
        this.opts = opts;
        this.id = opts.id;
        this.socket = null;
        this.callbacks = {};
        this.type = opts.type;
        this.info = opts.info;
        this.state = ST_INITED;
        this.consoleService = opts.consoleService;
    }
    /**
     * register and connect to master server
     *
     * @param {String} port
     * @param {String} host
     * @param {Function} cb callback function
     * @api public
     */
    connect(port, host, cb) {
        if (this.state > ST_INITED) {
            logger.error('monitor client has connected or closed.');
            return;
        }

        cb = cb || function () {};    // eslint-disable-line

        this.socket = new MqttClient(this.opts);
        this.socket.connect(host, port);

        // this.socket = sclient.connect(host + ':' + port, {
        //   'force new connection': true,
        //   'reconnect': true,
        //   'max reconnection attempts': 20
        // });
        const self = this;
        this.socket.on('register', (msg) => {
            if (msg && msg.code === protocol.PRO_OK) {
                self.state = ST_REGISTERED;
                cb();
            } else {
                self.emit('close');
                logger.error('server %j %j register master failed', self.id, self.type);
            }
        });

        this.socket.on('monitor', (msg) => {
            if (self.state !== ST_REGISTERED) {
                return;
            }

            msg = protocol.parse(msg);

            if (msg.command) {
                // a command from master
                self.consoleService.command(msg.command, msg.moduleId, msg.body, (err, res) => { // eslint-disable-line
                    // notify should not have a callback
                });
            } else {
                const respId = msg.respId;
                if (respId) {
                    // a response from monitor
                    const respCb = self.callbacks[respId];
                    if (!respCb) {
                        logger.warn(`unknown resp id:${respId}`);
                        return;
                    }
                    delete self.callbacks[respId];
                    respCb(msg.error, msg.body);
                    return;
                }

                // request from master
                self.consoleService.execute(msg.moduleId, 'monitorHandler', msg.body, (err, res) => {
                    if (protocol.isRequest(msg)) {
                        const resp = protocol.composeResponse(msg, err, res);
                        if (resp) {
                            self.doSend('monitor', resp);
                        }
                    } else {
                        // notify should not have a callback
                        logger.error('notify should not have a callback.');
                    }
                });
            }
        });

        this.socket.on('connect', () => {
            if (self.state > ST_INITED) {
                // ignore reconnect
                return;
            }
            self.state = ST_CONNECTED;
            const req = {
                id: self.id,
                type: 'monitor',
                serverType: self.type,
                pid: process.pid,
                info: self.info
            };
            const authServer = self.consoleService.authServer;
            const env = self.consoleService.env;
            authServer(req, env, (token) => {
                req.token = token;
                self.doSend('register', req);
            });
        });

        this.socket.on('error', (err) => {
            if (self.state < ST_CONNECTED) {
                // error occurs during connecting stage
                cb(err);
            } else {
                self.emit('error', err);
            }
        });

        this.socket.on('disconnect', () => {
            self.state = ST_CLOSED;
            self.emit('close');
        });

        this.socket.on('reconnect', () => {
            self.state = ST_CONNECTED;
            const req = {
                id: self.id,
                type: 'monitor',
                info: self.info,
                pid: process.pid,
                serverType: self.type
            };

            self.doSend('reconnect', req);
        });

        this.socket.on('reconnect_ok', (msg) => {
            if (msg && msg.code === protocol.PRO_OK) {
                self.state = ST_REGISTERED;
            }
        });
    }

    /**
     * close monitor agent
     *
     * @api public
     */
    close() {
        if (this.state >= ST_CLOSED) {
            return;
        }
        this.state = ST_CLOSED;
        this.socket.disconnect();
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
     * notify master server without callback
     *
     * @param {String} moduleId module id/name
     * @param {Object} msg message
     * @api public
     */
    notify(moduleId, msg) {
        if (this.state !== ST_REGISTERED) {
            logger.error(`agent can not notify now, state:${this.state}`);
            return;
        }
        this.doSend('monitor', protocol.composeRequest(null, moduleId, msg));
        // this.socket.emit('monitor', protocol.composeRequest(null, moduleId, msg));
    }

    request(moduleId, msg, cb) {
        if (this.state !== ST_REGISTERED) {
            logger.error(`agent can not request now, state:${this.state}`);
            return;
        }
        const reqId = this.reqId++;
        this.callbacks[reqId] = cb;
        this.doSend('monitor', protocol.composeRequest(reqId, moduleId, msg));
        // this.socket.emit('monitor', protocol.composeRequest(reqId, moduleId, msg));
    }

    doSend(topic, msg) {
        this.socket.send(topic, msg);
    }
}

module.exports = MonitorAgent;
