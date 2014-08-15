'use strict';
var async = require('async')
var EventEmitter = require('events').EventEmitter
var ircFactory = require('irc-factory')
var moment = require('moment')
var ObjectManage = require('object-manage')
var util = require('util')

var config = require('../../config')
var ircApi = new ircFactory.Api()
//un-boner normal crashing (ircFactory.Api constructor installs a stupid handler)
process.removeAllListeners('uncaughtException')

//JSON handlers


/**
 * messageEncode
 * @param {string,object} message Message string or object
 * @return {string} Message coerced to string
 */
var messageEncode = function(message){
  if('object' === typeof message)
    message = 'JSON' + JSON.stringify(message).replace(/\r\n/,'')
  return message.toString()
}


/**
 * messageDecode
 * @param {string} message Message string
 * @return {object} Data parsed from string, or empty object
 */
var messageDecode = function(message){
  var data = {}
  if(message){
    if('JSON{' === message.substring(0,5)){
      data = JSON.parse(message.substring(4))
    }
  }
  return data
}



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
  //init the channel structure for this channel
  that.conn.chan[channel] = {names:[],meshed:[],others:[]}
  var ev = 'names:' + channel
  that.removeAllListeners(ev)
  that.on(ev,function(o){
    var names = that.conn.chan[channel].names = o.names
    //setup a response timeout to see who didn't reply
    if(that._meshTimeout) clearTimeout(that._meshTimeout)
    that._meshTimeout = setTimeout(function(){
      async.filter(names,function(name,next){
        next(-1 === that.conn.chan[channel].meshed.indexOf(name))
      },function(results){
        that.conn.chan[channel].others = results
        that.emit('debug',that.conn.chan)
      })
    },5000)
    async.each(o.names,function(name,next){
      if(-1 === that.conn.chan[channel].meshed.indexOf(name) && -1 === that.conn.chan[channel].others.indexOf(name)){
        that.ctcpRequest(name,'MESH',{command:'hello',channel:channel})
      }
      next()
    })
  })
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
 * Names list of a channel
 * @param {string} channel Channel to list (include the '#')
 * @param {function} namesCb Callback once with results (optional)
 */
ircMesh.prototype.names = function(channel,namesCb){
  var that = this
  if('function' === typeof namesCb)
    that.once('names' + ':' + channel,namesCb)
  that.ircClient.irc.raw('NAMES ' + channel)
}


/**
 * Send a PRIVMSG
 * @param {string} target Target (nick or channel)
 * @param {string} message Message
 * @param {boolean} forcePushBack See ircFactory docs
 */
ircMesh.prototype.privmsg = function(target,message,forcePushBack){
  message = messageEncode(message)
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
  message = messageEncode(message)
  that.emit('debug','>' + target + ' CTCP_REQUEST:' + type + '<' + ((message) ? ' ' + message : ''))
  var msg = '\x01' + type.toUpperCase() + (('string' === typeof message) ? ' ' + message : '') + '\x01'
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
  message = messageEncode(message)
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
  that.on('ctcp_response:mesh:hello',function(o){
    if(o.data && o.data.channel && config.get('version') === o.data.version){
      if(-1 === that.conn.chan[o.data.channel].meshed.indexOf(o.nickname))
        that.conn.chan[o.data.channel].meshed.push(o.nickname)
      var idx = that.conn.chan[o.data.channel].others.indexOf(o.nickname)
      if(-1 < idx) delete(that.conn.chan[o.data.channel].others[idx])
    }
  })
  that.on('ctcp_request:mesh:hello',function(o){
    if(o.data && o.nickname && o.type){
      o.data.version = config.get('version')
      that.ctcpResponse(o.nickname,o.type,o.data)
    }
  })
  //standard CTCP stuff from here down
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
      that.conn.chan = {}
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

  /*
   * Channel state and attendance tracking section
   */

  //map channel events
  async.each(
    ['names','join','part','kick','quit'],
    function(event,next){
      that.ircApi.hookEvent(ircHandle,event,
        function(o){
          o.handle = ircHandle
          if(o.channel){
            if('names' !== event)
              that.names(o.channel)
            else {
              var names = o.names
              o.names = []
              async.eachSeries(names,function(name,done){
                //strip "op" status
                name = name.replace(/^@/,'')
                if(that.conn.nickname !== name)
                  o.names.push(name)
                done()
              })
            }
            if(o.nickname){
              that.emit([event,o.channel,o.nickname].join(':'),o)
            }
            that.emit([event,o.channel].join(':'),o)
          }
          that.emit(event,o)
        }
      )
      next()
    }
  )

  //map PRIVMSG events
  that.ircApi.hookEvent(ircHandle,'privmsg',
    function(o){
      o.handle = ircHandle
      o.source = o.target
      o.data = messageDecode(o.message)
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
      o.data = messageDecode(o.message)
      if(o.data.command)
        that.emit(['ctcp_request',o.type.toLowerCase(),o.data.command].join(':'),o)
      that.emit('ctcp_request:' + o.type.toLowerCase(),o)
      that.emit('ctcp_request',o)
    }
  )

  //map CTCP_RESPONSE event
  that.ircApi.hookEvent(ircHandle,'ctcp_response',
    function(o){
      o.handle = ircHandle
      o.source = o.nickname.replace(/^@/,'')
      o.data = messageDecode(o.message)
      if(o.data.command)
        that.emit(['ctcp_response',o.type.toLowerCase(),o.data.command].join(':'),o)
      that.emit('ctcp_response:' + o.type.toLowerCase(),o)
      that.emit('ctcp_response',o)
    }
  )
}


/**
 * Create instance
 * @param {object} opts Options
 * @return {ircMesh}
 */
ircMesh.create = function(opts){
  return new ircMesh(opts)
}


/**
 * Export object
 * @type {ircMesh}
 */
module.exports = ircMesh
