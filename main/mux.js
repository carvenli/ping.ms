'use strict';
var async = require('async')
var logger = require('../helpers/logger').create('main:mux')
var config = require('../config')
var Mux = require('../helpers/mux.js')
var propCopy = function(obj){return JSON.parse(JSON.stringify(obj))}

var options = config.get('main.mux')
var sockets = []
module.exports = function(done){
  async.each(options.connections,function(conn,next){
    var muxOpts = propCopy(conn)
    muxOpts.tag = logger.tagExtend(sockets.length)
    muxOpts.version = config.get('version')
    muxOpts.title = config.get('title')
    var mux = Mux.create(muxOpts)
    sockets.push(mux)
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
        mux.emit('pingResult:' + data.handle,result)
      })
      //start the ping session
      mux.pingStart(data.handle,data.ip)
    })
    //stop the ping session
    mux.on('pingStop',function(data){
      mux.pingStop(data.handle)
    })
    mux.connect(next)
  },function(){
    done(null,sockets)
  })
}
