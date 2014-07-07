'use strict';
var io = require('socket.io-client')
  , util = require('util')
  , EventEmitter = require('events').EventEmitter
  , async = require('async')

var propCopy = function(obj){return JSON.parse(JSON.stringify(obj))}

var netPing = require('net-ping')
var netPingSession = netPing.createSession({
  _debug: false,
  networkProtocol: netPing.NetworkProtocol.IPv4,
  packetSize: 56,
  ttl: 255,
  retries: 0,
  timeout: 1000
})

/**
 * Utility functions
 */

/**
 * BotSession Object
 *  this gets generated within Bot once for each ping/trace request (target)
 */

/**
 * Constructor
 * @param {object} opts Options object
 * @param {string} opts.tag ID from owner Bot instance
 * @param {string} opts.handle Handle for this session (from browser)
 * @param {string} opts.target Hostname or IP for destination
 * @constructor
 */
var BotSession = function(opts){
  var that = this
  EventEmitter.apply(that)
  that.options = opts
  that.logger = require('../helpers/logger').create(that.options.tag)
  that.logger.info('BotSession Constructor\n',opts)
  that.target = {
    host: that.options.host,
    ip: [],
    ptr: []
  }
  that.pingResults = []
  that.nPs = netPingSession
}
util.inherits(BotSession,EventEmitter)

BotSession.prototype.send = function(type,data){
  var self = this
  self.logger.info('BotSession.send ' + type)
  var pkt = propCopy(data)
  pkt.msgType = type
  self.emit('BotSessionMsg',pkt)
}

BotSession.prototype.ping = function(){
  var self = this
  self.logger.info('BotSession.ping')
  async.series([
    function(next){
      if(0 === self.target.ip.length){
        var DNS = require('../helpers/dns.js').create(self.target.host)
        DNS.resolve(function(results){
          self.target.ip = results.ip
          self.target.ptr = results.ptr
          self.send('dnsResolve',self.target)
          next()
        })
      } else next()
    },
    function(next){
      async.timesSeries(self.options.count || 1,function(seq,repeat){
        self.nPs.pingHost(self.target.ip,function(error,target,sent,received){
          setTimeout(function(){repeat()},1000)
          self.send('pingResult',{
            target: target,
            sent: (sent) ? +sent : false,
            received: (received) ? +received : false,
            error: error
          })
        })
      },function(){
        next()
      })
    }
  ],function(){
    self.send('pingComplete')
  })
}

/**
 * Create instance
 * @param {object} opts
 * @return {BotSession}
 */
BotSession.create = function(opts){
  return new BotSession(opts)
}

/**
 * Bot Object
 *  each Bot is a socket.io client which connects to a mux (main service)
 *  this object simply augments this socket with event handling and any
 *  probe services we provide to the frontend.
 *  Events are passed bidirectionally (this is an EventEmitter just like socket.io).
 */

/**
 * Constructor
 * @param {object} opts Options object
 * @constructor
 */
var Bot = function(opts){
  var that = this
  EventEmitter.apply(that)
  that.options = opts
  that.logger = require('../helpers/logger').create(that.options.tag)
  that.auth = {
    state: 'unknown',
    timer: null
  }
  that.sessions = {}
}
util.inherits(Bot,EventEmitter)

Bot.prototype.execPing = function(opts){
  var self = this
  self.logger.info('Bot.execPing\n',opts)
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

Bot.prototype.authorize = function(secret){
  var self = this
  self.emit('authorize',{secret: secret},
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

Bot.prototype.connect = function(){
  var self = this
  self.logger.info('connecting to ' + self.options.uri)
  self.mux = io.connect(self.options.uri)
  self.mux.once('connect',function(){
    self.logger.info('connected')
    self.on('authorize',function(data,cb){
      self.mux.emit('authorize',data,cb)
    })
    self.on('sessionMsg',function(data,cb){
      self.mux.emit('sessionMsg',data,cb)
    })
    self.authorize(self.options.secret)
  })
}

/**
 * Create instance and connect
 * @param {object} opts Options
 * @param {function} connectCb Callback for authorized connect
 * @return {Bot}
 */
Bot.create = function(opts,connectCb){
  var b = new Bot(opts)
  if('function' === typeof connectCb)
    b.on('authSuccess',connectCb)
  b.connect(opts.secret)
  return b
}

/**
 * Export module
 * @type {Bot}
 */
module.exports = Bot
