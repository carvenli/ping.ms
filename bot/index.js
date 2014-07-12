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
    muxOpts.version = config.get('version')
    var mux = Bot.create(muxOpts)
    sockets.push(mux)
    mux.once('authSuccess',function(){
      //handle resolve requests
      mux.on('resolve',function(data,done){
        mux.resolve(data.handle,data.host,function(err,result){
          if(err) return done({error: err})
          done(result)
        })
      })
      //handle ping requests
      mux.on('pingStart',function(data){
        //redistribute events back to the client
        mux.on('pingResult:' + data.handle,function(result){
          if(result.stopped) mux.removeAllListeners('pingResult:' + data.handle)
          mux.mux.emit('pingResult:' + data.handle,result)
        })
        //start the ping session
        mux.pingStart(data.handle,data.ip)
      })
      //stop the ping session
      mux.on('pingStop',function(data){
        mux.pingStop(data.handle)
      })
      next()
    })
  }
)
