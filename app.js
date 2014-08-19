'use strict';
var async = require('async')

var config = require('./config')
var logger = require('./helpers/logger').create()

//services that dont require mongoose
logger.info('Starting services that don\'t require mongoose...')
//start booting
async.series(
  [
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
    async.series(
      [
        function(next){
          //admin
          if(config.get('admin.enabled')){
            logger.info('Starting Admin...')
            require('./admin').start(next)
          } else next()
        },
        function(next){
          //main
          if(config.get('main.enabled')){
            logger.info('Starting Main...')
            require('./main').start(next)
          } else next()
        }
      ],function(err){
        if(err){
          logger.error('Startup failed: ' + err)
          process.exit()
        }
        logger.info('Startup complete')
      })
  })
} else {
  logger.info('Mongoose not enabled, skipping services that require it')
}
