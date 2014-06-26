'use strict';
var io = require('socket.io-client')
  , async = require('async')
  , hostbyname = require('hostbyname')
  , dns = require('dns')

/**
 * BotSession Object
 *  this gets generated within BotSocket once for each ping/trace request (target)
 */

/**
 * Constructor
 * @param {object} opts Options object
 * @param {string} opts.tag ID from owner BotSocket instance
 * @param {string} opts.handle Handle for this session (from browser)
 * @param {string} opts.target Hostname or IP for destination
 * @constructor
 */
var BotSession = function(opts){
  var that = this
  that.parent = opts.parent
  that.options = opts
  that.logger = require('../helpers/logger').create('BOT:' + that.parent.tag + ':' + that.options.handle)
  that.logger.info('BotSession Constructor\n',opts)
  that.target = {
    host: that.options.host,
    ip: null,
    ptr: null
  }
  that.pingResults = {}
  //setup net-ping session
  var netPing = require('net-ping')
  that.nPs = netPing.createSession({
    _debug: false,
    networkProtocol: netPing.NetworkProtocol.IPv4,
    packetSize: 56,
    ttl: 255,
    retries: 0,
    timeout: 1000
  })
}

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
  async.series([self.targetHostToIP,self.targetIpToPtr],
    function(){replyFn(self.target)}
  )
}

BotSession.prototype.send = function(type){
  var self = this
  self.logger.info('BotSession.send\n',type)
  self.parent.emit(type + '.' + self.options.handle,
    {
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
 * BotSocket Object
 *  each Bot has a sockets Array property, which holds multiples of these
 */

/**
 * Constructor
 * @param {object} opts Options object
 * @param {string} opts.tag Tag used for logging
 * @param {object} opts.auth [optional] Object to override auth section from config
 * @param {object} opts.auth [optional] Object to override auth section from config
 * @constructor
 */
var BotSocket = function(opts){
  var that = this
  that.parent = opts.parent
  that.options = opts
  that.logger = require('../helpers/logger').create('BOT:' + that.options.tag)
  that.logger.info('BotSocket Constructor\n',opts)
  that.auth = {
    state: 'unknown',
    timer: null
  }
  that.sessions = {}
  that.mux = io.connect(that.options.uri)
}

BotSocket.prototype.emit = function(type,data){
  var self = this
  self.logger.info('BotSocket.emit\n',type,data)
  self.mux.emit(type,data)
}

BotSocket.prototype.execPing = function(opts){
  var self = this
  self.logger.info('BotSocket.execPing\n',opts)
  if(!opts.count) opts.count = 4
  var sess = new BotSession(opts)
  self.sessions[opts.handle] = sess
  sess.ping()
}

BotSocket.prototype.handleLogin = function(data,cb){
  var self = this
  self.logger.info('BotSocket.handleLogin\n',data,cb)
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

BotSocket.prototype.authorize = function(cb){
  var self = this
  self.logger.info('BotSocket.authorize\n',cb)
  self.mux.emit('botLogin',{secret: self.options.secret},
    function(data){self.handleLogin(data,cb)}
  )
}

BotSocket.prototype.connect = function(cb){
  var self = this
  self.logger.info('BotSocket.connect\n',cb)
  var done = cb
  self.logger.info('connecting to ' + self.options.uri)
  self.mux.on('connect',function(){
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
 * Bot Object
 *  this is the main, public object
 */

/**
 * Constructor
 * @param {object} opts Options object
 * @constructor
 */
var Bot = function(opts){
  var that = this
  that.options = opts
  that.logger = require('../helpers/logger').create('BOT')
  that.logger.info('Bot Constructor\n',opts)
  that.sockets = []
}

Bot.prototype.start = function(){
  var self = this
  self.logger.info('Bot.start')
  async.times(
    self.options.connections.length,
    function(n,next){
      var sockOpts = self.options.connections[n]
      sockOpts.tag = n.toString()
      sockOpts.parent = self
      sockOpts.auth = self.options.auth
      next(null,new BotSocket(sockOpts))
    },
    function(err,set){
      self.sockets = set
      async.each(self.sockets,function(i,done){i.connect(done)})
    }
  )
}


/**
 * Export module
 * @type {exports.Logger}
 */
module.exports = Bot
