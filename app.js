'use strict';
var program = require('commander')
var debug = require('debug')('ping.ms:master')
var child = require('infant').child
var parent = require('infant').parent

var lifecycle = new (require('infant').Lifecycle)()
var Logger = require('./helpers/logger')
var logger = Logger.create('main')

var config = require('./config')

var admin = parent('./admin')
var main = parent('./main')
var peer = parent('./peer')

//parse cli
program
  .version(config.version)
  .option(
  '-v, --verbose',
  'Increase logging',
  function(v,total){
    return total + 1
  },
  0
)
  .parse(process.argv)

//set log verbosity
debug('setting up console logging with level',+program.verbose)
Logger.consoleFilter.setConfig({level: (+program.verbose || 0) + 4})

//setup lifecycle logging
lifecycle.on('start',function(item){
  logger.info('Starting ' + item.title)
})
lifecycle.on('stop',function(item){
  logger.info('Stopping ' + item.title)
})
lifecycle.on('online',function(){
  logger.info('Startup complete')
})
lifecycle.on('offline',function(){
  logger.info('Shutdown complete')
})

//admin panel
if(config.admin.enabled){
  lifecycle.add(
    'admin',
    function(next){
      admin.start(next)
    },
    function(next){
      admin.stop(next)
    }
  )
}


/**
 * Main website
 */
if(config.main.enabled){
  lifecycle.add(
    'main',
    function(next){
      main.start(next)
    },
    function(next){
      main.stop(next)
    }
  )
}


/**
 * Peer system
 */
if(config.peer.enabled){
  lifecycle.add(
    'peer',
    function(next){
      peer.start(next)
    },
    function(next){
      peer.stop(next)
    }
  )
}


/**
 * Start master
 * @param {function} done
 */
exports.start = function(done){
  lifecycle.start(
    function(err){
      if(err) throw err
      done()
    }
  )
}


/**
 * Stop master
 * @param {function} done
 */
exports.stop = function(done){
  //start the shutdown process
  logger.info('Beginning shutdown')
  lifecycle.stop(function(err){
    if(err) throw err
    done()
  })
}

if(require.main === module){
  child(
    'animegg:master',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
