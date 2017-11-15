const MasterConsole = require('../lib/consoleService');
const TestModule = require('./module');

const port = 3300;
const host = 'localhost';

const opts = {
    port: port,
    master: true
};

const masterConsole = MasterConsole.createMasterConsole(opts);
const modules = TestModule();
masterConsole.register(TestModule.moduleId, modules);

masterConsole.start(() => {

});
