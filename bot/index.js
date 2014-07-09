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
      mux.on('pingStart',function(data,done){
        //redistribute events back to the client
        mux.on('pingError:' + data.handle,function(err){
          mux.mux.emit('pingError:' + data.handle,err)
        })
        mux.on('pingResult:' + data.handle,function(result){
          mux.mux.emit('pingResult:' + data.handle,result)
        })
        //start the ping session
        mux.pingStart(data.handle,data.ip,function(err,result){
          if(err) return done({error: err})
          done(result)
        })
      })
      //handle ping requests
      mux.on('pingStop',function(data,done){
        //clear event listeners
        mux.removeAllListeners('pingResult:' + data.handle)
        mux.removeAllListeners('pingError:' + data.handle)
        //stop the ping session
        mux.pingStop(data.handle,function(err,result){
          if(err) return done({error: err})
          done(result)
        })
      })
      sockets.push(mux)
      next()
    })
  }
)
