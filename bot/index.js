'use strict';
var async = require('async')
//var axon = require('axon')
//var debug = require('debug')('ping.ms:bot')

var config = require('../config')


var start = function(done){
  async.each(
    config.bot.connections,
    function(opts,next){
      async.series(
        [
          //connect to something
          function(next){
            next()
          }
        ],
        next
      )
    },
    done
  )
}


/**
 * Start the bot
 * @param {function} done
 */
exports.start = function(done){
  start(done)
}

if(require.main === module){
  start(function(err){
    if(err){
      console.error(err)
      process.exit()
    }
  })
}
