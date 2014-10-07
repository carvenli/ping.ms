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
  admin: {
    enabled: false,
    port: 3003,
    host: null,
    workers: {
      count: 1,
      maxConnections: 1000
    },
    cookie: {
      secret: '',
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
      secret: '',
      maxAge: 2592000000 //30 days
    }
  },
  peer: {
    enabled: false,
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
