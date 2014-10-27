'use strict';
var fs = require('graceful-fs')
var ObjectManage = require('object-manage')

var config

//setup config object
config = new ObjectManage()
//dist config schema
config.$load({
  title: 'Ping.ms',
  version: require('./package.json').version,
  mongoose: {
    name: 'pingms',
    dsn: 'mongodb://localhost/pingms',
    options: {native_parser: true} // jshint ignore:line
  },
  admin: {
    enabled: false,
    port: 3003,
    host: null,
    user: 'admin',
    password: null,
    defaultConfig:__dirname + '/peer/config.default.js',
    ssh: {
      privateKey: 'admin/ssh/ping.ms.key',
      publicKey: 'admin/ssh/ping.ms.pub'
    },
    workers: {
      count: 1,
      maxConnections: 1000
    },
    cookie: {
      secret: 'ping.ms',
      maxAge: 2592000000 //30 days
    }
  },
  main: {
    enabled: false,
    port: 3000,
    host: null,
    workers: {
      count: 1,
      maxConnections: 1000
    },
    cookie: {
      secret: 'ping.ms',
      maxAge: 2592000000 //30 days
    }
  },
  peer: {
    enabled: false,
    connectTimeout: 10000, //10s
    rest: {
      port: 3004,
      host: null
    },
    stream: {
      port: 3005,
      host: null
    },
    workers: {
      count: 1,
      maxConnections: 1000
    }
  }
})

//load user config
if(fs.existsSync(__dirname + '/config.local.js')){
  config.$load(require(__dirname + '/config.local.js'))
}


/**
 * Export config
 * @type {ObjectManage}
 */
module.exports = config
