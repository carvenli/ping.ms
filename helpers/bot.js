'use strict';
var io = require('socket.io-client')
  , util = require('util')
  , Logger = require('../helpers/logger')
  , BotSession = require('../helpers/botSession')
var EventEmitter = require('events').EventEmitter



/**
 * Bot Object
 *  each Bot is a socket.io client which connects to a mux (main service)
 *  this object simply augments this socket with event handling and any
 *  probe services we provide to the frontend.
 *  Events are passed bidirectionally (this is an EventEmitter just like socket.io).
 * @param {object} opts Options object
 * @constructor
 */
var Bot = function(opts){
  var that = this
  EventEmitter.apply(that)
  that.options = opts
  that.logger = Logger.create(that.options.tag)
  that.auth = {
    state: 'unknown',
    timer: null
  }
  that.sessions = {}
}
util.inherits(Bot,EventEmitter)


/**
 * Start pinging a host
 * @param {string} handle
 * @param {string} ip
 * @param {function} done
 */
Bot.prototype.pingStart = function(handle,ip,done){
  var that = this
  that.logger.info('Bot.pingStart[' + handle + ']: ' + ip)
  var session = that.sessions[handle] = new BotSession({
    tag: that.logger.tagExtend(handle)
  })
  //we need to handle result events and redistribute them
  session.on('pingResult',function(result){
    //tear down the session in the event of an error or being stopped
    if(result.stopped || result.error) delete that.sessions[handle]
    that.emit('pingResult:' + handle,result)
  })
  //start the ping session
  session.pingStart(handle,ip,done)
}


/**
 * Stop pinging a host
 * @param {string} handle
 * @return {*}
 */
Bot.prototype.pingStop = function(handle){
  var that = this
  that.logger.info('Bot.pingStop: ' + handle)
  //find the session
  if(!that.sessions[handle])
    return that.emit('pingResult:' + handle,{stopped: true})
  that.sessions[handle].pingStop()
}


/**
 * Use bot session to execute a resolve a host
 * @param {string} handle
 * @param {string} host
 * @param {function} done
 */
Bot.prototype.resolve = function(handle,host,done){
  var that = this
  that.logger.info('Bot.resolve: ' + host)
  var session = BotSession.create({
    tag: that.logger.tagExtend(handle)
  })
  session.resolve(host,done)
}


/**
 * Authorize with mux
 * @param {string} secret
 */
Bot.prototype.authorize = function(secret){
  var that = this
  that.mux.emit(
    'authorize',
    {secret: secret},
    function(data){
      var authRetry = function(){that.authorize(secret)}
      if(data.error){
        that.logger.error('auth failed!')
        that.auth.state = 'failRetry'
        clearTimeout(that.auth.timer)
        that.auth.timer = setTimeout(authRetry,that.options.auth.failDelay)
        that.emit('authFail')
      } else {
        that.logger.info('authorized')
        that.auth.state = 'authorized'
        clearTimeout(that.auth.timer)
        that.auth.timer = setTimeout(authRetry,that.options.auth.reDelay)
        that.emit('authSuccess')
      }
    }
  )
}


/**
 * Connect to mux
 */
Bot.prototype.connect = function(){
  var that = this
  that.logger.info('connecting to ' + that.options.uri)
  that.mux = io.connect(that.options.uri,{
    reconnection: true,
    reconnectionDelay: 300,
    reconnectionDelayMax: 1000,
    timeout: 10000,
    autoConnect: true
  })
  that.mux.on('connect',function(){
    that.logger.info('connected')
    that.authorize(that.options.secret)
  })
  that.mux.once('connect',function(){
    //listen for events from mux
    that.mux.on('resolve',function(data,cb){
      that.emit('resolve',data,cb)
    })
    that.mux.on('pingStart',function(data,cb){
      that.emit('pingStart',data,cb)
    })
    that.mux.on('pingStop',function(data){
      that.emit('pingStop',data)
    })
  })
}


/**
 * Create instance and connect
 * @param {object} opts Options
 * @param {function} done Callback for authorized connect
 * @return {Bot}
 */
Bot.create = function(opts,done){
  var b = new Bot(opts)
  if(!done) done = function(){}
  b.on('authSuccess',done)
  b.connect(opts.secret)
  return b
}


/**
 * Export module
 * @type {Bot}
 */
module.exports = Bot
