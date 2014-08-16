'use strict';
var util = require('util')
//var async = require('async')
var Logger = require('./logger')
var BotSession = require('./botSession')
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
 * Connect to ircMesh
 * @param {function} done Callback for authorized connect
 */
Bot.prototype.connect = function(done){
  var that = this
  if('function' === done)
    that.on('authSuccess',done)
  //parse uri into ircFactory compatible options
  var uri = that.options.uri.toString()
  var parseEx = /^([^:]*):\/\/([^@]*)@([^:]*):([0-9]*)\/(#.*)$/i;
  if(uri.match(parseEx)){
    that.options.secure = ('ircs' === uri.replace(parseEx,'$1'))
    that.options.nick = uri.replace(parseEx,'$2')
    that.options.server = uri.replace(parseEx,'$3')
    that.options.port = uri.replace(parseEx,'$4')
    that.options.channel = uri.replace(parseEx,'$5')
  }
  if(!(that.options.server && that.options.port && that.options.nick))
    return

  //setup ircMesh
  var botOpts = that.options
  botOpts.type = 'bot'
  botOpts.appName = that.options.title + ' ' + botOpts.type.toUpperCase()
  botOpts.logger = that.logger
  that.ircMesh = require('./ircMesh').create(botOpts)

  //wire events
  that.ircMesh.on('debug',function(msg){that.logger.info(msg)})
  that.ircMesh.on('verbose',function(msg){that.logger.info(msg)})
  that.ircMesh.on('connecting',function(where){ that.logger.info('Connecting to ' + where) })
  that.ircMesh.on('attendance:#test',function(msg){that.logger.info('attendance:',msg)})
  //wire normal message types
  that.ircMesh.on('privmsg',function(o){
    console.log(o)
    if(-1 !== that.conn.chan[o.channel].meshed.indexOf(o.nickname)){
      var m = o.message.split(' ')
      switch(m[0].toLowerCase()){
      case 'resolve':
        var host = m[1] || 'none'
        var handle = m[2] || 'none'
        that.resolve(handle,host,function(err,result){
          var msg = (err) ? {error:err,result:result} : result
          that.ircMesh.privmsg(o.source,msg)
        })
        break
      }
    }
  })
  //wire pingms CTCP actions
  that.ircMesh.on('ctcp_request:pingms:resolve',function(o,cb){
    that.emit('resolve',o.data,cb)
  })
  that.ircMesh.on('ctcp_request:pingms:pingstart',function(o,cb){
    that.emit('pingStart',o.data,cb)
  })
  that.ircMesh.on('ctcp_request:pingms:pingstop',function(o){
    that.emit('pingStop',o.data)
  })

  that.ircMesh.connect(function(){
    that.ircMesh.join(that.options.channel)
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
