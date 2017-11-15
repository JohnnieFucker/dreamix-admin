const MonitorConsole = require('../lib/consoleService');
const TestModule = require('./module');

const port = 3300;
// var host = '192.168.131.1';
const host = 'localhost';

const opts = {
    id: 'test-server-1',
    type: 'test',
    host: host,
    port: port,
    info: {
        id: 'test-server-1',
        host: host,
        port: 4300
    }
};

const monitorConsole = MonitorConsole.createMonitorConsole(opts);
const modules = TestModule();
monitorConsole.register(TestModule.moduleId, modules);

monitorConsole.start(() => {

});
