'use strict';
var io = require('socket.io-client')
  , util = require('util')
  , EventEmitter = require('events').EventEmitter
  , async = require('async')
  , hostbyname = require('hostbyname')
  , dns = require('dns')
  , netPing = require('net-ping')

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
    ip: null,
    ptr: null
  }
  that.pingResults = {}
  //setup net-ping session
  that.nPs = netPing.createSesssion({
    _debug: false,
    networkProtocol: netPing.NetworkProtocol.IPv4,
    packetSize: 56,
    ttl: 255,
    retries: 0,
    timeout: 1000
  })
  console.trace('bot session constructor finished')
}
util.inherits(BotSession,EventEmitter)

BotSession.prototype.targetHostToIP = function(next){
  var self = this
  self.logger.info('BotSession.targetHostToIP\n',next)
  hostbyname.resolve(self.target.host,'v4',function(err,results){
    if(!err && results[0]) self.target.ip = results[0]
    next()
  })
}

BotSession.prototype.targetIpToPtr = function(next){
  var self = this
  self.logger.info('BotSession.targetIpToPtr\n',next)
  dns.reverse(self.target.ip,function(err,results){
    if(!err && results[0]) self.target.ptr = results[0]
    next()
  })
}

BotSession.prototype.execResolve = function(replyFn){
  var self = this
  self.logger.info('BotSession.execResolve\n',replyFn)
  async.series([self.targetHostToIP.bind(self),self.targetIpToPtr.bind(self)],
    function(){replyFn(self.target)}
  )
}

BotSession.prototype.send = function(type){
  var self = this
  self.logger.info('BotSession.send\n',type)
  self.emit('BotSessionMsg',
    {
      msgType: type,
      dnsData: self.target,
      host: self.target.host,
      ip: self.target.ip,
      ptr: self.target.ptr,
      results: self.pingResults
    }
  )
}

BotSession.prototype.ping = function(){
  var self = this
  self.logger.info('BotSession.ping')
  async.series([
    function(next){
      if(!self.target.ip)
        self.execResolve(function(){next()})
      else
        next()
    },
    function(next){
      self.send('pingInit')
      async.timesSeries(self.options.count || 1,function(seq,repeat){
        self.nPs.pingHost(self.pingResults.ip,function(error,target,sent,received){
          setTimeout(function(){repeat()},1000)
          self.pingResults.push({
            target: target,
            sent: (sent) ? +sent : false,
            received: (received) ? +received : false,
            error: error
          })
          self.send('pingResult')
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
  that.logger.info('Bot Constructor\n',opts)
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
  console.trace('bot session creatings')
  //self.sessions[opts.handle] = BotSession.create(opts)
  var session = BotSession.create(opts)
  console.trace('bot session created')
  //wire the backchannel
  BotSession.on('BotSessionMsg',function(msg){
    self.logger('BotSessionMsg rcv:\n',msg)
    var type = msg.msgType
    delete(msg.msgType)
    self.mux.emit(type,msg)
  })
  console.trace('bot session ping')
  self.sessions[opts.handle].ping()
}

Bot.prototype.handleLogin = function(data,cb){
  var self = this
  self.logger.info('Bot.handleLogin\n',data,cb)
  if(data.error){
    self.logger.error('auth failed!')
    self.auth.state = 'failRetry'
    clearTimeout(self.auth.timer)
    self.auth.timer = setTimeout(self.authorize.bind(self),self.options.auth.failDelay)
  } else {
    self.logger.info('authorized')
    self.auth.state = 'authorized'
    clearTimeout(self.auth.timer)
    self.auth.timer = setTimeout(self.authorize.bind(self),self.options.auth.reDelay)
    //(re)map the listeners
    self.mux.removeListener('execPing',self.execPing.bind(self))
    self.mux.on('execPing',self.execPing.bind(self))
    //self.mux.removeListener('execTrace',self.execTrace)
    //self.mux.on('execTrace',self.execTrace)
    if('function' === typeof cb){
      cb()
      cb = null
    }
  }
}

Bot.prototype.authorize = function(cb){
  var self = this
  self.logger.info('Bot.authorize\n',cb)
  self.mux.emit('botLogin',{secret: self.options.secret},
    function(data){self.handleLogin(data,cb)}
  )
}

Bot.prototype.connect = function(done){
  var self = this
  self.logger.info('Bot.connect\n',done)
  self.logger.info('connecting to ' + self.options.uri)
  self.mux = io.connect(self.options.uri)
  self.mux.once('connect',function(){
    self.logger.info('connected')
    self.authorize(function(){
      if('function' === typeof done){
        done()
        done = null
      }
    })
  })
}

/**
 * Create instance
 * @param {object} opts
 * @return {Bot}
 */
Bot.create = function(opts){
  return (new Bot(opts))
}

/**
 * Export module
 * @type {exports.Logger}
 */
module.exports = Bot
