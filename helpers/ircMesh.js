'use strict';
var async = require('async')
var EventEmitter = require('events').EventEmitter
var fs = require('fs')
var ip = require('ip')
var ircFactory = require('irc-factory')
var moment = require('moment')
var net = require('net')
var ObjectManage = require('object-manage')
var path = require('path')
var util = require('util')
var config = require('../config')
var Logger = require('../helpers/logger')
var Bot = require('../models/bot').model



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
    user: 'noName',
    realname: 'noName',
    server: 'localhost',
    port: 6667,
    secure: false,
    capab: false,
    sasl: false,
    saslUsername: '',
    password: '',
    retryCount: 10,
    retryWait: 1000
  })
  //load main.ircMesh config
  om.load(config.get('main.ircMesh'))
  //load passed options
  om.load(opts)
  var ext = om.data.type.charAt(0).toUpperCase() + om.data.type.slice(1).toLowerCase()
  om.load({
    nick: om.data.nick + ext,
    user: om.data.user + ext,
    realname: om.data.realname + ext
  })
  that.options = om.data

  //constructor stubs that differ based on 'type'
  var _inits = {
    mux: function(){
      that.bots = {}
    },
    bot: function(){
      that.auth = {
        state: 'unknown',
        timer: null
      }
      that.muxes = {}
    }
  }
  if('function' === typeof _inits[that.options.type]) _inits[that.options.type]()
  that.ircApi = new ircFactory.Api()
  //CTCP handlers
  that.ctcpHandlers = {
    PING: function(o,replyFn){replyFn(o.message)},
    VERSION: function(o,replyFn){replyFn('ping.ms MUX:' + config.get('version') + ':nodejs')},
    TIME: function(o,replyFn){replyFn(':' + moment().format('ddd MMM DD HH:mm:ss YYYY ZZ'))},
    DCC: function(o,replyFn){
      var args = o.message.split(' ')
      var type = args[0]
      var argument = args[1]
      var address = ip.fromLong(args[2])
      var port = +args[3]
      var size = +args[4]
      var _recvFile = null
      var _logger = Logger.create(that.logger.tagExtend(['DCC',type,o.nickname.replace(/^@/,'')].join(':')))
      _logger.info('Connecting to ' + [address,port].join(':'))
      var dccSocket = net.connect(
        port,
        address,
        function(){
          _logger.info('Connected')
          dccSocket.on('error',function(err){
            _logger.info('ERROR:',err)
          })
          dccSocket.on('end',function(){
            _logger.info('Connection closed')
          })
          switch(type){
          case 'CHAT':
            dccSocket.on('data',function(data){
              _logger.info(data.toString().replace(/[\r\n]$/g,''))
            })
            dccSocket.write('DCC CHAT GO\n')
            break
          case 'SEND':
            var fname = [fs.realpathSync('./'),argument].join(path.sep)
            if(fs.existsSync(fname)){
              _logger.info('File Exists (' + fname + ')')
              dccSocket.end()
            } else {
              _recvFile = fs.createWriteStream(fname)
              _recvFile.on('open',function(){
                _logger.info('Saving to file ' + fname)
                dccSocket.on('end',function(){
                  _recvFile.end(function(){
                    _logger.info('Saved ' + _recvFile.bytesWritten + ' bytes to ' + fname +
                        ((size === _recvFile.bytesWritten) ? ' [size good!]' : ' [size BAD should be ' + size + ']')
                    )
                  })
                })
                dccSocket.on('data',function(data){
                  dccSocket.pause()
                  if(_recvFile){
                    _recvFile.write(data,function(){
                      var bytesWritten = _recvFile.bytesWritten
                      var buf = new Buffer([0,0,0,0])
                      buf.writeUInt32BE(bytesWritten,0)
                      dccSocket.write(buf,function(){
                        dccSocket.resume()
                      })
                    })
                  }
                })
              })
            }
            break
          default:
            break
          }
        }
      )
    }
  }
}
util.inherits(ircMesh,EventEmitter)


/**
 * Map a handler function to a CTCP type
 * @param {string} type Type
 * @param {function} handler Handler
 */
ircMesh.prototype.registerCtcpHandler= function(type,handler){
  this.ctcpHandlers[type.toUpperCase()] = handler
}


/**
 * Join a channel
 * @param {string} channel Channel to join (include the '#')
 * @param {function} joinedCb Callback once joined
 */
ircMesh.prototype.join = function(channel,joinedCb){
  if('function' === typeof joinedCb)
    this.once('join' + channel,joinedCb)
  this.ircClient.irc.join(channel)
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
 * @param {boolean} forcePushBack See ircFactory docs
 */
ircMesh.prototype.ctcpRequest = function(target,type,forcePushBack){
  var that = this
  that.emit('debug','>' + target + ': CTCP ' + type)
  forcePushBack = forcePushBack || false
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
 * Connect to mux
 */
ircMesh.prototype.connect = function(){
  var that = this
  var ircHandle = that.options.type
  that.emit('connecting',that.options.server + ':' + that.options.port)
  that.ircClient = that.ircApi.createClient(ircHandle,that.options)

  //map REGISTERED event
  that.ircApi.hookEvent(ircHandle,'registered',
    function(o){
      o.handle = ircHandle
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

  //map JOIN events with channel tracking for callback
  that.ircApi.hookEvent(ircHandle,'join',
    function(o){
      o.handle = ircHandle
      that.emit('join' + o.channel,o)
      that.emit('join',o)
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
      var func = that.ctcpHandlers[o.type.toUpperCase()]
      if('function' === typeof func){
        func(
          o,
          function(msg){that.ircClient.irc.ctcp(o.nickname,o.type,msg)}
        )
      } else {
        that.emit('debug',['No handler for CTCP request:',o])
      }
    }
  )

  //map CTCP_RESPONSE event
  that.ircApi.hookEvent(ircHandle,'ctcp_response',
    function(o){
      o.handle = ircHandle
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
  var m = new ircMesh(opts)
  return m
}


/**
 * Export object
 * @type {ircMesh}
 */
module.exports = ircMesh
