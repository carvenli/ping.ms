'use strict';
var io = require('socket.io-client')
  , config = require('./../config')
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
  that.options = opts
  that.logger = require('../helpers/logger').create('BOT:' + that.options.tag + ':' + that.options.handle)
  that.target = {
    host: that.options.target,
    ip: null,
    ptr: null
  }
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
  hostbyname.resolve(self.target.host,'v4',function(err,results){
    if(!err && results[0]) self.target.ip = results[0]
    next()
  })
}

BotSession.prototype.targetIpToPtr = function(next){
  var self = this
  dns.reverse(self.target.ip,function(err,results){
    if(!err && results[0]) self.target.ptr = results[0]
    next()
  })
}

BotSession.prototype.execResolve = function(replyFn){
  var self = this
  async.series([self.targetHostToIP,self.targetIpToPtr],
    function(){replyFn(self.target)}
  )
}

BotSession.prototype.execPing = function(opts){
  var self = this
  if(!opts.count) opts.count = 4
  self.pingData = {
    dns: self.target,
    host: opts.host,
    ip: opts.host,
    ptr: opts.host,
    results: []
  }
  async.series([
    function(next){
      hostbyname.resolve(self.pingData.host,'v4',function(err,results){
        if(!err && results[0]) self.pingData.ip = results[0]
        next()
      })
    },function(next){
      dns.reverse(self.pingData.ip,function(err,results){
        if(!err && results[0]) self.pingData.ptr = results[0]
        next()
      })
    },function(next){
      self.mux.emit('pingInit.' + opts.handle,self.pingData)
      async.timesSeries(opts.count || 1,function(seq,repeat){
        self.nPs.pingHost(self.pingData.ip,function(error,target,sent,received){
          var result = {
            target: target,
            sent: (sent) ? +sent : false,
            received: (received) ? +received : false,
            error: error
          }
          self.pingData.results.push(result)
          setTimeout(function(){repeat()},1000)
          self.mux.emit('pingResult.' + opts.handle,self.pingData)
        })
      },function(){
        next()
      })
    }
  ],function(){
    self.mux.emit('pingComplete.' + opts.handle,self.pingData)
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
  that.options = opts
  that.logger = require('../helpers/logger').create('BOT:' + that.options.tag)
  that.auth = {
    config: that.options.auth || config.get('bot.auth'),
    state: 'unknown',
    timer: null
  }
  that.sessions = {}
  that.mux = io.connect(that.options.uri)
}

BotSocket.prototype.handleLogin = function(data,cb){
  var self = this
  if(data.error){
    self.logger.error('auth failed!')
    clearTimeout(self.auth.timer)
    self.auth.timer = setTimeout(self.authorize,self.options.auth.failDelay)
  } else {
    self.logger.info('authorized')
    clearTimeout(self.auth.timer)
    self.auth.timer = setTimeout(self.authorize,self.options.auth.reDelay)
    //(re)map the listeners
    self.mux.removeListener('execPing',self.execPing)
    self.mux.on('execPing',self.execPing)
    if('function' === typeof cb){
      cb()
      cb = null
    }
  }
}

BotSocket.prototype.authorize = function(cb){
  var self = this
  self.mux.emit('botLogin',{secret: self.secret},
    function(data){self.handleLogin(data,cb)}
  )
}

BotSocket.prototype.connect = function(cb){
  var self = this
  var done = cb
  self.logger.info('connecting to ' + self.uri)
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
  that.logger = require('../helpers/logger').create('BOT')
  that.sockets = []
  var conn = config.get('bot.connections')
  async.times(conn.length,function(n,next){
    next(null,new BotSocket(conn[n]))
  },function(err,set){
    that.sockets = set
    async.each(that.sockets,function(i,done){i.connect(done)})
  })
}


/**
 * Export module
 * @type {exports.Logger}
 */
module.exports = Bot
