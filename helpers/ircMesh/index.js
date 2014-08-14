'use strict';
var EventEmitter = require('events').EventEmitter
var ircFactory = require('irc-factory')
var moment = require('moment')
var ObjectManage = require('object-manage')
var util = require('util')

var config = require('../../config')
var ircApi = new ircFactory.Api()



/**
 * ircMesh Object
 *  each ircMesh is a custom IRC client which acts as either a "mux" (server) or "bot" (client)
 * @param {object} opts Options object
 * @constructor
 */
var ircMesh = function(opts){
  var that = this
  //extend ircMesh with EventEmitter to interface with upper layers
  EventEmitter.apply(that)
  //Setup logger
  that.logger = opts.logger
  delete(opts.logger)

  var om = new ObjectManage({tag:'ircMesh'})
  //load defaults
  om.load({
    nick: 'noName',
    user: '',
    realname: '',
    server: 'localhost',
    port: 6667,
    secure: false,
    capab: false,
    sasl: false,
    saslUsername: '',
    password: '',
    retryCount: 10,
    retryWait: 10000 //docs say 1000 but are wrong
  })
  //load main.ircMesh config
  om.load(config.get('main.ircMesh'))
  //load passed options
  om.load(opts)
  that.options = om.data
  //patch defaults for user and realname
  if(!that.options.user)
    that.options.user = that.options.nick
  if(!that.options.realname)
    that.options.realname = that.options.user
  that.ircApi = ircApi
  that.conn = {}
}
util.inherits(ircMesh,EventEmitter)


/**
 * Join a channel
 * @param {string} channel Channel to join (include the '#')
 * @param {function} joinedCb Callback once joined
 */
ircMesh.prototype.join = function(channel,joinedCb){
  var that = this
  if('function' === typeof joinedCb)
    that.once(['join',channel,that.conn.nickname].join(':'),joinedCb)
  that.ircClient.irc.join(channel)
}


/**
 * Part a channel
 * @param {string} channel Channel to leave (include the '#')
 * @param {function} partedCb Callback once out
 */
ircMesh.prototype.part = function(channel,partedCb){
  var that = this
  if('function' === typeof partedCb)
    that.once(['part',channel,that.conn.nickname].join(':'),partedCb)
  that.ircClient.irc.part(channel)
}


/**
 * Send a PRIVMSG
 * @param {string} target Target (nick or channel)
 * @param {string} message Message
 * @param {boolean} forcePushBack See ircFactory docs
 */
ircMesh.prototype.privmsg = function(target,message,forcePushBack){
  this.ircClient.irc.privmsg(target,message,forcePushBack)
}


/**
 * Send a CTCP Request (this is missing from ircFactory?)
 * @param {string} target Target (nick or channel)
 * @param {string} type Type
 * @param {string} message Message
 * @param {boolean} forcePushBack See ircFactory docs
 */
ircMesh.prototype.ctcpRequest = function(target,type,message,forcePushBack){
  var that = this
  if('boolean' === typeof message){
    forcePushBack = message
    message = null
  }
  forcePushBack = forcePushBack || false
  that.emit('debug','>' + target + ' CTCP_REQUEST:' + type + '<' + ((message) ? ' ' + message : ''))
  var msg = '\x01' + type.toUpperCase() + '\x01'
  that.ircClient.irc.raw(['PRIVMSG',target,msg])
  if(forcePushBack){
    that.ircClient._parseLine(
        ':' + that.ircClient._nick + '!' + that.ircClient._user + '@' + that.ircClient._hostname +
        ' PRIVMSG ' + target +
        ' :' + msg
    )
  }
}


/**
 * Send a CTCP Response
 * @param {string} target Target (nick or channel)
 * @param {string} type Type
 * @param {string} message Message
 * @param {boolean} forcePushBack See ircFactory docs
 */
ircMesh.prototype.ctcpResponse = function(target,type,message,forcePushBack){
  var that = this
  if('boolean' === typeof message){
    forcePushBack = message
    message = null
  }
  forcePushBack = forcePushBack || false
  //convert objects to one-line JSON
  if('object' === typeof message)
    message = JSON.stringify(message).replace(/\r\n/,'')
  that.emit('debug','>' + target + ' CTCP_RESPONSE:' + type + '<' + ((message) ? ' ' + message : ''))
  that.ircClient.irc.ctcp(target,type,message,forcePushBack)
}


/**
 * Connect to server
 * @param {function} connectedCb Callback once connected (aka registered)
 */
ircMesh.prototype.connect = function(connectedCb){
  var that = this
  var ircHandle = that.options.type

  //CTCP handlers
  that.on('ctcp_request:ping',function(o){
    that.ctcpResponse(o.nickname,o.type,o.message)
  })
  that.on('ctcp_request:version',function(o){
    that.ctcpResponse(o.nickname,o.type,[that.options.appName,config.get('version'),'nodejs'].join(':'))
  })
  that.on('ctcp_request:time',function(o){
    that.ctcpResponse(o.nickname,o.type,moment().format('ddd MMM DD HH:mm:ss YYYY ZZ'))
  })
  //include the DCC plugin
  require('./ctcpDcc').register(that)

  that.emit('connecting',that.options.server + ':' + that.options.port)
  //clamp the retryWait to 10000 minimum here to stop weird shit
  that.options.retryWait = (10000 >= that.options.retryWait) ? that.options.retryWait : 10000
  that.ircClient = that.ircApi.createClient(ircHandle,that.options)

  //map REGISTERED event
  that.ircApi.hookEvent(ircHandle,'registered',
    function(o){
      o.handle = ircHandle
      that.conn = o
      if('function' === typeof connectedCb)
        that.on('registered',connectedCb)
      that.emit('registered',o)
    }
  )

  //map NOTICE events
  that.ircApi.hookEvent(ircHandle,'notice',
    function(o){
      o.handle = ircHandle
      //augment with a 'source' because ircFactory is somewhat lacking on this
      if('AUTH' === o.target)
        o.source = that.ircClient.irc.connection.server + ':AUTH'
      else if(!o.nickname)
        o.source = that.ircClient.irc.connection.server
      else
        o.source = o.nickname.replace(/^@/,'')
      that.emit('notice',o)
    }
  )

  //map JOIN events with channel and nickname tracking for callbacks
  that.ircApi.hookEvent(ircHandle,'join',
    function(o){
      o.handle = ircHandle
      that.emit(['join',o.channel,o.nickname].join(':'),o)
      that.emit(['join',o.channel].join(':'),o)
      that.emit('join',o)
    }
  )


  //map PART events with channel and nickname tracking for callbacks
  that.ircApi.hookEvent(ircHandle,'part',
    function(o){
      o.handle = ircHandle
      that.emit(['part',o.channel,o.nickname].join(':'),o)
      that.emit(['part',o.channel].join(':'),o)
      that.emit('part',o)
    }
  )

  //map NAMES event
  that.ircApi.hookEvent(ircHandle,'names',
    function(o){
      o.handle = ircHandle
      that.emit('names',o)
    }
  )

  //map PRIVMSG events
  that.ircApi.hookEvent(ircHandle,'privmsg',
    function(o){
      o.handle = ircHandle
      o.source = o.target
      //extra checking for self-messages
      var myNick = that.ircClient.irc._nick
      if(myNick === o.target){
        if(myNick !== o.nickname)
          o.source = o.nickname
      }
      that.emit('privmsg',o)
    }
  )

  //map CTCP_REQUEST event
  that.ircApi.hookEvent(ircHandle,'ctcp_request',
    function(o){
      o.handle = ircHandle
      o.source = o.nickname.replace(/^@/,'')
      that.emit('ctcp_request',o)
      that.emit('ctcp_request:' + o.type.toLowerCase(),o)
    }
  )

  //map CTCP_RESPONSE event
  that.ircApi.hookEvent(ircHandle,'ctcp_response',
    function(o){
      o.handle = ircHandle
      o.source = o.nickname.replace(/^@/,'')
      that.emit('ctcp_response',o)
      that.emit('ctcp_response:' + o.type.toLowerCase(),o)
    }
  )
}


/**
 * Create instance
 * @param {object} opts Options
 * @return {ircMesh}
 */
ircMesh.create = function(opts){
  var m = new ircMesh(opts)
  return m
}


/**
 * Export object
 * @type {ircMesh}
 */
module.exports = ircMesh
