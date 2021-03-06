const fs = require('fs');
const consoleService = require('./lib/consoleService');

module.exports.createMasterConsole = consoleService.createMasterConsole;
module.exports.createMonitorConsole = consoleService.createMonitorConsole;
module.exports.adminClient = require('./lib/client/client');

module.exports.modules = {};

fs.readdirSync(`${__dirname}/lib/modules`).forEach((filename) => {
    if (/\.js$/.test(filename)) {
        const name = filename.substr(0, filename.lastIndexOf('.'));
        const _module = require(`./lib/modules/${name}`);// eslint-disable-line
        if (!_module.moduleError) {
            Object.defineProperty(module.exports.modules, name, {
                get: () => _module,
                enumerable: true,
                configurable: true
            });
        }
    }
});
