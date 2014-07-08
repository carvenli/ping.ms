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
 * Use bot session to execute a ping request
 * @param {object} opts
 */
Bot.prototype.ping = function(opts){
  var self = this
  self.logger.info('Bot.ping\n',opts)
  if(!opts.count) opts.count = 4
  opts.tag = self.logger.tagExtend(opts.handle)
  delete(opts.handle)
  self.sessions[opts.handle] = BotSession.create(opts)
  //wire the backchannel
  self.sessions[opts.handle].on('BotSessionMsg',function(msg){
    msg.handle = opts.handle
    self.emit('sessionMsg',msg)
  })
  self.sessions[opts.handle].ping()
}


/**
 * Use bot session to execute a resolve a host
 * @param {string} handle
 * @param {string} host
 * @param {function} done
 */
Bot.prototype.resolve = function(handle,host,done){
  var self = this
  self.logger.info('Bot.resolve: ' + host)
  var session = BotSession.create({
    tag: self.logger.tagExtend(handle)
  })
  session.resolve(host,done)
}


/**
 * Authorize with mux
 * @param {string} secret
 */
Bot.prototype.authorize = function(secret){
  var self = this
  self.mux.emit(
    'authorize',
    {secret: secret},
    function(data){
      var authRetry = function(){self.authorize(secret)}
      if(data.error){
        self.logger.error('auth failed!')
        self.auth.state = 'failRetry'
        clearTimeout(self.auth.timer)
        self.auth.timer = setTimeout(authRetry,self.options.auth.failDelay)
        self.emit('authFail')
      } else {
        self.logger.info('authorized')
        self.auth.state = 'authorized'
        clearTimeout(self.auth.timer)
        self.auth.timer = setTimeout(authRetry,self.options.auth.reDelay)
        self.emit('authSuccess')
      }
    }
  )
}


/**
 * Connect to mux
 */
Bot.prototype.connect = function(){
  var self = this
  self.logger.info('connecting to ' + self.options.uri)
  self.mux = io.connect(self.options.uri)
  self.mux.once('connect',function(){
    //map events from our local emitter back to mux
    self.logger.info('connected')
    self.on('sessionMsg',function(data,cb){
      self.mux.emit('sessionMsg',data,cb)
    })
    //listen for events from mux
    self.mux.on('resolve',function(data,cb){
      self.emit('resolve',data,cb)
    })
    self.authorize(self.options.secret)
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
