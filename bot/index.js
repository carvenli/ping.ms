'use strict';
var async = require('async')
  , logger = require('../helpers/logger').create('bot')
  , config = require('../config')
  , Bot = require('../helpers/bot.js')

async.each(
  config.get('bot'),
  function(options,next){
    var bot = new Bot()
    bot.connect(options.host,options.secret,function(err,socket){
      if(err) return next(err)
      next()
      //handle ping requests
      socket.on('ping',function(data){
        var ping = bot.ping({
          host: data.host
        })
        ping.on('error',function(err){
          socket.emit('error',err)
        })
        ping.on('resolve',function(res){
          socket.emit('dnsResolve',res)
        })
        ping.on('init',function(res){
          socket.emit('pingInit',res)
        })
        ping.on('result',function(res){
          socket.emit('pingResult',res)
        })
        ping.on('complete',function(res){
          socket.emit('pingComplete',res)
        })
        ping.exec()
      })
      //handle trace requests
      socket.on('traceroute',function(data){
        var trace = bot.trace({
          host: data.host
        })
        trace.on('error',function(err){
          socket.emit('error',err)
        })
        trace.on('resolve',function(res){
          socket.emit('dnsResolve',res)
        })
        trace.on('hop',function(res){
          socket.emit('traceHop',res)
        })
        trace.exec()
      })
    })
  },
  function(err){
    if(err) logger.error(err)
  }
)
