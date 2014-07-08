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
    mux.once('authSuccess',function(){
      //handle resolve requests
      mux.on('resolve',function(data,done){
        mux.resolve(data.handle,data.host,function(err,result){
          if(err) return done({error: err})
          done(result)
        })
      })
      //handle ping requests
      mux.on('ping',function(data,done){
        mux.ping(data.handle,data.ip,function(err,result){
          if(err) return done({error: err})
          done(result)
        })
      })
      /**
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
      **/
      sockets.push(mux)
      next()
    })
  }
)
