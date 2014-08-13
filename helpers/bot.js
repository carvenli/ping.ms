'use strict';
var util = require('util')
//var async = require('async')
var Logger = require('../helpers/logger')
var BotSession = require('../helpers/botSession')
var EventEmitter = require('events').EventEmitter



/**
 * Bot Object
 *  each Bot is a ircMesh client which connects to a server
 *  in order to communicate with mux(es) also connected there
 *  this object simply augments this socket with event handling and any
 *  probe services we provide to the frontend.
 * @param {object} opts Options object
 * @constructor
 */
var Bot = function(opts){
  var that = this
  //extend Bot with EventEmitter to interface with upper layers
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
    //tear down the session in the event of being stopped
    if(result.stopped) delete that.sessions[handle]
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
  that.ircMesh.once('ctcp_response:pingms:authorize',function(data){
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
  that.ircMesh.ctcpRequest('pingMsMux1','PINGMS',{command:'authorize',secret:secret,version:that.options.version})
}


/**
 * Connect to mux
 * @param {function} done Callback for authorized connect
 */
Bot.prototype.connect = function(done){
  var that = this
  if('function' === done)
    that.on('authSuccess',done)
  //parse uri into ircFactory compatible options
  var uri = that.options.uri.toString()
  that.logger.info('connecting to ' + uri)
  var parseEx = /^([^:]*):\/\/([^@]*)@([^:]*):([0-9]*)/i;
  if(uri.match(parseEx)){
    that.options.secure = ('ircs' === uri.replace(parseEx,'$1'))
    that.options.nick = uri.replace(parseEx,'$2')
    that.options.server = uri.replace(parseEx,'$3')
    that.options.port = uri.replace(parseEx,'$4')
  }
  if(!(that.options.server && that.options.port && that.options.nick))
    return
  console.log(that.options)

  //setup ircMesh
  var botOpts = that.options
  botOpts.type = 'bot'
  botOpts.logger = that.logger
  that.ircMesh = require('../helpers/ircMesh').create(botOpts)

  //wire events
  that.ircMesh.on('debug',function(msg){that.logger.info(msg)})
  that.ircMesh.on('connecting',function(where){ that.logger.info('Connecting to ' + where) })
  //wire normal message types
  that.ircMesh.on('notice',function(o){
    that.logger.info('<' + o.source + ' NOTICE> ' + o.message)
  })
  that.ircMesh.on('privmsg',function(o){
    that.ircMesh.privmsg(o.source,o.message.toUpperCase())
  })
  that.ircMesh.on('ctcp_request',function(o){
    that.logger.info('<' + o.source + ' CTCP_REQUEST:' + o.type + '>' + ((o.message) ? ' ' + o.message : ''))
  })
  that.ircMesh.on('ctcp_response',function(o){
    that.logger.info('<' + o.source + ' CTCP_RESPONSE:' + o.type + '>' + ((o.message) ? ' ' + o.message : ''))
  })
  //wire pingms CTCP actions
  that.ircMesh.on('ctcp_request:pingms:resolve',function(data,cb){
    that.emit('resolve',data,cb)
  })
  that.ircMesh.on('ctcp_request:pingms:pingstart',function(data,cb){
    that.emit('pingStart',data,cb)
  })
  that.ircMesh.on('ctcp_request:pingms:pingstop',function(data){
    that.emit('pingStop',data)
  })


  that.ircMesh.connect(function(){
    that.logger.info('Connected')
    that.ircMesh.join('#pingms',function(o){ that.logger.info('Joined ' + o.channel) })
    //that.authorize(that.options.secret)
  })
}


/**
 * Create instance and optionally connect
 * @param {object} opts Options
 * @param {function} done Callback for authorized connect
 * @return {Bot}
 */
Bot.create = function(opts,done){
  var b = new Bot(opts)
  if('function' === typeof done)
    b.connect(done)
  return b
}


/**
 * Export module
 * @type {Bot}
 */
module.exports = Bot
