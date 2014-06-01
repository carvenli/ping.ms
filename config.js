'use strict';
var ObjectManage = require('object-manage')
  , fs = require('fs')

var config = new ObjectManage()
config.load({
  //options
  version: JSON.parse(fs.readFileSync('package.json', 'utf8')).version,
  mongoose: {
    dsn: 'mongodb://localhost/arindb',
    options: {
      native_parser: true
    }
  },
  mux: {
    listen: {
      host: null,
      port: 80
    },
    admin: {
      user: 'admin',
      password: 'blah1234'
    },
    allowedBots: [
      '127.0.0.1',
      'ping.ms',
      '199.87.234.131'
    ]
  },
  bot: {
    listen: {
      host: null,
      port: 4176
    },
    allowedSources: [
      '127.0.0.1',
      'ping.ms',
      '199.87.234.131'
    ]
  }
})

if(fs.existsSync('./config.local.js')){
  config.load(require(__dirname + '/config.local.js'))
}


/**
 * Export config
 * @type {ObjectManage}
 */
module.exports = config
