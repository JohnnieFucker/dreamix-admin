const MqttClient = require('../protocol/mqtt/mqttClient');
const protocol = require('../util/protocol');
const utils = require('../util/utils');

class Client {
    constructor(opt) {
        this.id = '';
        this.reqId = 1;
        this.callbacks = {};
        this.listeners = {};
        this.state = Client.ST_INITED;
        this.socket = null;
        opt = opt || {};
        this.username = opt.username || '';
        this.password = opt.password || '';
        this.md5 = opt.md5 || false;
    }
    connect(id, host, port, cb) {
        this.id = id;
        const self = this;

        console.log(`try to connect ${host}:${port}`);
        this.socket = new MqttClient({
            id: id
        });

        this.socket.connect(host, port);

        // this.socket = io.connect('http://' + host + ':' + port, {
        //  'force new connection': true,
        //  'reconnect': false
        // });

        this.socket.on('connect', () => {
            self.state = Client.ST_CONNECTED;
            if (self.md5) {
                self.password = utils.md5(self.password);
            }
            self.doSend('register', {
                type: 'client',
                id: id,
                username: self.username,
                password: self.password,
                md5: self.md5
            });
        });

        this.socket.on('register', (res) => {
            if (res.code !== protocol.PRO_OK) {
                cb(res.msg);
                return;
            }

            self.state = Client.ST_REGISTERED;
            cb();
        });

        this.socket.on('client', (msg) => {
            msg = protocol.parse(msg);
            if (msg.respId) {
                // response for request
                const _cb = self.callbacks[msg.respId];
                delete self.callbacks[msg.respId];
                if (_cb && typeof _cb === 'function') {
                    _cb(msg.error, msg.body);
                }
            } else if (msg.moduleId) {
                // notify
                self.emit(msg.moduleId, msg);
            }
        });

        this.socket.on('error', (err) => {
            if (self.state < Client.ST_CONNECTED) {
                cb(err);
            }

            self.emit('error', err);
        });

        this.socket.on('disconnect', () => {
            this.state = Client.ST_CLOSED;
            self.emit('close');
        });
    }

    request(moduleId, msg, cb) {
        const id = this.reqId++;
        // something dirty: attach current client id into msg
        msg = msg || {};
        msg.clientId = this.id;
        msg.username = this.username;
        const req = protocol.composeRequest(id, moduleId, msg);
        this.callbacks[id] = cb;
        this.doSend('client', req);
        // this.socket.emit('client', req);
    }

    notify(moduleId, msg) {
        // something dirty: attach current client id into msg
        msg = msg || {};
        msg.clientId = this.id;
        msg.username = this.username;
        const req = protocol.composeRequest(null, moduleId, msg);
        this.doSend('client', req);
        // this.socket.emit('client', req);
    }

    command(command, moduleId, msg, cb) {
        const id = this.reqId++;
        msg = msg || {};
        msg.clientId = this.id;
        msg.username = this.username;
        const commandReq = protocol.composeCommand(id, command, moduleId, msg);
        this.callbacks[id] = cb;
        this.doSend('client', commandReq);
        // this.socket.emit('client', commandReq);
    }

    doSend(topic, msg) {
        this.socket.send(topic, msg);
    }

    on(event, listener) {
        this.listeners[event] = this.listeners[event] || [];
        this.listeners[event].push(listener);
    }

    emit(event, ...args) {
        const listeners = this.listeners[event];
        if (!listeners || !listeners.length) {
            return;
        }

        let listener;
        for (let i = 0, l = listeners.length; i < l; i++) {
            listener = listeners[i];
            if (typeof listener === 'function') {
                listener(...args);
            }
        }
    }
}

Client.ST_INITED = 1;
Client.ST_CONNECTED = 2;
Client.ST_REGISTERED = 3;
Client.ST_CLOSED = 4;

module.exports = Client;
