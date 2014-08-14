'use strict';
var ObjectManage = require('object-manage')
var fs = require('fs')
var config
require('pkginfo')(module,'version')

//setup config object
config = new ObjectManage()
//dist config schema
config.load({
  title: 'ping.ms',
  version: module.exports.version,
  mongoose: {
    enabled: false,
    name: 'ping-ms',
    dsn: 'mongodb://localhost/ping-ms',
    options: {native_parser: true} // jshint ignore:line
  },
  admin: {
    enabled: false,
    port: 3003,
    host: null,
    mainBaseUrl: 'http://localhost:3000',
    cookie: {
      secret: '',
      maxAge: 2592000000 //30 days
    }
  },
  bot: {
    enabled: false,
    auth: {
      reDelay: 3600000, // 1 hour
      failDelay: 10000 // 10 seconds
    },
    connections:[
//      {uri: 'irc://pingMsBot@localhost:6667/#pingms',retryCount: 65534}
    ]
  },
  main: {
    enabled: false,
    port: 3000,
    host: null,
    cookie: {
      secret: '',
      maxAge: 2592000000 //30 days
    },
    mux: {
      enabled: false,
      server: 'localhost',
      port: 6667,
      secure: false,
      nick: 'pingMsMux',
      channel: '#pingms',
      retryCount: 65534
    }
  }
})
//load user config
if(fs.existsSync(__dirname + '/config.local.js')){
  config.load(require(__dirname + '/config.local.js'))
}


/**
 * Export config
 * @type {ObjectManage}
 */
module.exports = config
