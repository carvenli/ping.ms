'use strict';
var ObjectManage = require('object-manage')
  , fs = require('fs')
  , config

//setup config object
config = new ObjectManage()
//dist config schema
config.load({
  title: 'ping.ms',
  version: '0.1.0',
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
    port: 4176,
    host: null,
    secret: ''
  },
  main: {
    enabled: false,
    port: 3000,
    host: null,
    cookie: {
      secret: '',
      maxAge: 2592000000 //30 days
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
