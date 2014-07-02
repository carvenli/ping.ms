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
 * mapEvents - stack our pass-up events on the given object
 * @param {Emitter} obj Object (Emitter-enabled) to augment
 * @param {array} [handles] List of additional handle suffixes, optional
 * @param {function} cb Callback when completed
 */
var mapEvents = function(obj,handles,cb){
  obj.logger.info('Mapping events')
  if('function' === typeof handles){
    cb = handles
    handles = []
  }
  var events = [
    'pingInit',
    'pingResult',
    'pingComplete'
  ]
  var doIt = function(a,done){
    async.eachSeries(a,
      function(e,next){
        obj.logger.info('Mapped "' + e + '"')
        obj[e] = function(data){obj.emit(data)}.bind(obj)
        obj.on(e,obj[e])
        next()
      },
      function(){
        done()
      }
    )
  }
  if(0 < handles.length){
    var taggedEvents = events
    async.eachSeries(handles,
      function(h,hNext){
        obj.logger.info('Handle: ' + h)
        async.eachSeries(events,
          function(e,eNext){
            obj.logger.info('Handle: ' + h)
            taggedEvents.push(e + '.' + h)
            eNext()
          },
          function(){hNext()}
        )
      },
      function(){
        events = taggedEvents
        obj.logger.info(events)
        doIt(events,cb)
      }
    )
  } else doIt(events,cb)
}

/**
 * clearEvents - Clear any pass-up events on the given object
 * @param {Emitter} obj Object (Emitter-enabled) to remove events from
 * @param {array} [handles] List of additional handle suffixes, optional
 * @param {function} cb Callback when completed
 */
var clearEvents = function(obj,handles,cb){
  obj.logger.info('Mapping events')
  if('function' === typeof handles){
    cb = handles
    handles = []
  }
  var events = [
    'pingInit',
    'pingResult',
    'pingComplete'
  ]
  var doIt = function(a,done){
    async.eachSeries(a,
      function(e,next){
        obj.logger.info('Mapped "' + e + '"')
        obj[e] = function(data){obj.emit(data)}.bind(obj)
        obj.on(e,obj[e])
        next()
      },
      function(){
        done()
      }
    )
  }
  if(0 < handles.length){
    var taggedEvents = events
    async.eachSeries(handles,
      function(h,hNext){
        obj.logger.info('Handle: ' + h)
        async.eachSeries(events,
          function(e,eNext){
            obj.logger.info('Handle: ' + h)
            taggedEvents.push(e + '.' + h)
            eNext()
          },
          function(){hNext()}
        )
      },
      function(){
        events = taggedEvents
        obj.logger.info(events)
        doIt(events,cb)
      }
    )
  } else doIt(events,cb)
}


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
  EventEmitter.apply(that)
  that.options = opts
  that.logger = require('../helpers/logger').create('BOT:' + that.options.tag + ':' + that.options.handle)
  that.logger.info('BotSession Constructor\n',opts)
  that.target = {
    host: that.options.host,
    ip: null,
    ptr: null
  }
  that.pingResults = {}
  //setup net-ping session
  that.nPs = netPing.createSession({
    _debug: false,
    networkProtocol: netPing.NetworkProtocol.IPv4,
    packetSize: 56,
    ttl: 255,
    retries: 0,
    timeout: 1000
  })
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
  self.emit(type,
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
 * Create instance
 * @param {object} opts
 * @return {BotSession}
 */
BotSession.create = function(opts){
  return new BotSession(opts)
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
  EventEmitter.apply(that)
  that.options = opts
  that.logger = require('../helpers/logger').create('BOT:' + that.options.tag)
  that.logger.info('BotSocket Constructor\n',opts)
  that.auth = {
    state: 'unknown',
    timer: null
  }
  that.sessions = {}
}
util.inherits(BotSocket,EventEmitter)

BotSocket.prototype.execPing = function(opts){
  var self = this
  self.logger.info('BotSocket.execPing\n',opts)
  if(!opts.count) opts.count = 4
  opts.tag = self.options.tag
  self.sessions[opts.handle] = BotSession.create(opts)
  self.sessions[opts.handle].ping()
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
  self.emit('botLogin',{secret: self.options.secret},
    function(data){self.handleLogin(data,cb)}
  )
}

BotSocket.prototype.connect = function(done){
  var self = this
  self.logger.info('BotSocket.connect\n',done)
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
 * @return {BotSocket}
 */
BotSocket.create = function(opts){
  var sock = new BotSocket(opts)
  return sock
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
  var n = 0
  async.each(
    self.options.connections,
    function(conn,next){
      var sockOpts = JSON.parse(JSON.stringify(conn))
      sockOpts.tag = (n++).toString()
      sockOpts.auth = JSON.parse(JSON.stringify(self.options.auth))
      var sock = BotSocket.create(sockOpts)
      mapEvents(sock,function(){
        sock.connect(function(){self.logger.info('..l..')})
        self.sockets.push(sock)
        next()
      })
    }
  )
}

/**
 * Export module
 * @type {exports.Logger}
 */
module.exports = Bot
