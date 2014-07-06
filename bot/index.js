'use strict';
var async = require('async')
  , logger = require('../helpers/logger').create('bot')
  , config = require('../config')
  , Bot = require('../helpers/bot.js')

var propCopy = function(obj){return JSON.parse(JSON.stringify(obj))}

var options = config.get('bot')
  , sockets = []
async.each(
  options.connections,
  function(conn,next){
    var muxOpts = propCopy(conn)
    muxOpts.auth = propCopy(options.auth)
    muxOpts.tag = logger.tagExtend(sockets.length)
    var mux = Bot.create(muxOpts)
    mux.on('authSuccess',function(){
      //handle ping requests
      mux.on('ping',function(data){
        var ping = mux.ping({
          host: data.host
        })
        ping.on('error',function(err){
          mux.emit('error',err)
        })
        ping.on('resolve',function(res){
          mux.emit('dnsResolve',res)
        })
        ping.on('init',function(res){
          mux.emit('pingInit',res)
        })
        ping.on('result',function(res){
          mux.emit('pingResult',res)
        })
        ping.on('complete',function(res){
          mux.emit('pingComplete',res)
        })
        ping.exec()
      })
      //handle trace requests
      mux.on('traceroute',function(data){
        var trace = mux.trace({
          host: data.host
        })
        trace.on('error',function(err){
          mux.emit('error',err)
        })
        trace.on('resolve',function(res){
          mux.emit('dnsResolve',res)
        })
        trace.on('hop',function(res){
          mux.emit('traceHop',res)
        })
        trace.exec()
      })
      next()
    })
    sockets.push(mux)
  }
)
