'use strict';
var config = require('./config')

var logger = require('./helpers/logger').create('main')
var redis = require('./helpers/redis')
var mesh = require('./mesh')
var ping = require('./mesh/ping')
var announce = require('./mesh/announce')
var async = require('async')

//services that dont require mongoose
logger.info('Starting services that don\'t require mongoose...')
//flush redis before startup
redis.flushdb()
//start booting
async.series(
  [
    //start mesh
    function(next){
      if(config.get('mesh.enabled')){
        logger.info('Starting mesh')
        mesh.on('error',function(err){
          logger.error(err)
        })
        mesh.start(next)
      }
    },
    //go to ready state 1
    function(next){
      logger.info('Going to readyState 1')
      mesh.readyState(1,next)
    },
    //start ping
    function(next){
      if(config.get('mesh.enabled') && config.get('mesh.ping.enabled')){
        logger.info('Starting ping')
        ping.start(next)
      } else next()
    },
    //go to ready state 2
    function(next){
      logger.info('Going to readyState 2')
      mesh.readyState(2,next)
    },
    //start announce
    function(next){
      if(config.get('mesh.enabled') && config.get('mesh.announce.enabled')){
        logger.info('Starting announce')
        announce.start(next)
      } else next()
    },
    //bot
    function(next){
      if(config.get('bot.enabled')){
        logger.info('Starting Bot...')
        require('./bot')
      }
      next()
    }
  ],
  function(err){
    if(err){
      logger.error('Startup failed: ' + err)
      process.exit()
    }
  }
)

if(config.get('mongoose.enabled')){
  var mongoose = require('mongoose')
  //services that do require mongoose
  logger.info('Starting services that do require mongoose...')
  //connect to mongoose first
  mongoose.connect(config.get('mongoose.dsn'),config.get('mongoose.options'),function(err){
    if(err){
      logger.error('Failed to connect to mongoose: ' + err)
      process.exit()
    }
    //admin
    if(config.get('admin.enabled')){
      logger.info('Starting Admin...')
      require('./admin')
    }
    //main
    if(config.get('main.enabled')){
      logger.info('Starting Main...')
      require('./main')
    }
    logger.info('Startup complete')
  })
} else {
  logger.info('Mongoose not enabled, skipping services that require it')
}
