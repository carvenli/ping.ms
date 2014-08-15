'use strict';
var async = require('async')
var logger = require('../helpers/logger').create('bot')
var config = require('../config')
var Bot = require('../helpers/bot.js')
var propCopy = function(obj){return JSON.parse(JSON.stringify(obj))}

var options = config.get('bot')
var sockets = []
async.each(
  options.connections,
  function(conn,next){
    var botOpts = propCopy(conn)
    botOpts.tag = logger.tagExtend(sockets.length)
    botOpts.version = config.get('version')
    botOpts.title = config.get('title')
    var bot = Bot.create(botOpts)
    sockets.push(bot)
    //handle resolve requests
    bot.on('resolve',function(data,done){
      bot.resolve(data.handle,data.host,function(err,result){
        if(err) return done({error: err})
        done(result)
      })
    })
    //handle ping requests
    bot.on('pingStart',function(data){
      //redistribute events back to the client
      bot.on('pingResult:' + data.handle,function(result){
        if(result.stopped) bot.removeAllListeners('pingResult:' + data.handle)
        bot.mux.emit('pingResult:' + data.handle,result)
      })
      //start the ping session
      bot.pingStart(data.handle,data.ip)
    })
    //stop the ping session
    bot.on('pingStop',function(data){
      bot.pingStop(data.handle)
    })
    bot.connect()
    next()
  }
)
