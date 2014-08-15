'use strict';
var async = require('async')
var EventEmitter = require('events').EventEmitter
var shortId = require('shortid')
var util = require('util')

var Logger = require('./logger')
var Bot = require('../models/bot').model

var botInterface = {}

var propCopy = function(obj){return JSON.parse(JSON.stringify(obj))}
var generateHandle = function(){return shortId.generate().replace(/[-_]/g,'').toUpperCase()}



/**
 * Mux Object
 *  each Mux is a ircMesh client which connects to a server
 *  in order to communicate with mux(es) also connected there
 *  this object simply augments this socket with event handling and any
 *  probe services we provide to the frontend.
 * @param {object} opts Options object
 * @constructor
 */
var Mux = function(opts){
  var that = this
  //extend Mux with EventEmitter to interface with upper layers
  EventEmitter.apply(that)
  that.options = opts
  that.logger = Logger.create(that.options.tag)
}
util.inherits(Mux,EventEmitter)


/**
 * Clear any existing ping events registered
 * @param {object} data
 * @param {function} next
 */
Mux.prototype.pingSanitize = function(data,next){
  var re = /^(.*):([^:]*)$/
  var currentSourceId = data.handle.replace(re,'$1')
  async.each(
    Object.keys(botInterface[data.bot]._events),
    function(ev,next){
      var test = /^ping(Error|Result):(.*)$/
      if(!test.test(ev)) return next()
      ev = ev.replace(test,'$2')
      var sourceId = ev.replace(re,'$1')
      if(sourceId !== currentSourceId) return next()
      var handle = ev.replace(re,'$1:$2')
      that.logger.info('KILLING ' + handle)
      //botInterface[data.bot].emit('pingStop',{handle: m[1]}
      botInterface[data.bot].removeAllListeners('pingError:' + handle)
      botInterface[data.bot].removeAllListeners('pingResult:' + handle)
      //stop the ping session
      botInterface[data.bot].emit('pingStop',{handle: handle})
      next()
    },
    next
  )
}


/**
 * Connect to ircMesh
 * @param {function} done Callback for authorized connect
 */
Mux.prototype.connect = function(done){
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
  var muxOpts = propCopy(that.options)
  muxOpts.type = 'mux'
  muxOpts.appName = that.options.title + ' ' + muxOpts.type.toUpperCase()
  muxOpts.logger = that.logger
  that.ircMesh = require('./ircMesh').create(muxOpts)

  that.ircMesh.on('debug',function(msg){that.logger.info(msg)})
  that.ircMesh.on('connecting',function(where){ that.logger.info('Connecting to ' + where) })
  that.ircMesh.on('join:' + muxOpts.channel,function(o){
    that.logger.info('<' + o.channel + '> ' +
        ((that.ircMesh.conn.nickname === o.nickname) ? '' : o.nickname + ' ') +
        'joined'
    )
  })
  that.ircMesh.on('part:' + muxOpts.channel,function(o){
    that.logger.info('<' + o.channel + '> ' +
        ((that.ircMesh.conn.nickname === o.nickname) ? '' : o.nickname + ' ') +
        'parted'
    )
  })
  //wire normal message types
  that.ircMesh.on('notice',function(o){
    that.logger.info('<' + o.source + ' NOTICE> ' + o.message)
  })
  /*
   that.ircMesh.on('privmsg',function(o){
   that.ircMesh.privmsg(o.source,o.message.toUpperCase())
   })
   */
  that.ircMesh.on('ctcp_request',function(o){
    that.logger.info('<' + o.source + ' CTCP_REQUEST:' + o.type + '>' + ((o.message) ? ' ' + o.message : ''))
  })
  that.ircMesh.on('ctcp_response',function(o){
    that.logger.info('<' + o.source + ' CTCP_RESPONSE:' + o.type + '>' + ((o.message) ? ' ' + o.message : ''))
  })

  //wire pingms CTCP actions
  that.ircMesh.on('ctcp_request:pingms:authorize',function(o){
    var data = o.data
    var _logger = Logger.create(that.logger.tagExtend(['PINGMS',data.command,data.nickname].join(':')))
    /**
     * Authorize bot and register if successful
     */
    async.series([
        //lookup bot
        function(next){
          Bot.findOne({secret: data.secret},function(err,result){
            if(err) return next({message: err.message,reason: 'generalFailure'})
            if(!result) return next({message: 'Bot not found, bad secret',reason: 'badSecret'})
            result.metrics.version = data.version
            result.metrics.dateSeen = new Date()
            Bot.findByIdAndUpdate(result.id,{$set: {metrics: result.toJSON().metrics}},function(){})
            if(result && !result.active)
              return next({message: 'Bot found, however inactive',reason: 'notActive'},result)
            //auth accepted
            next(null,result)
          })
        }
      ],function(err,results){
        if(err){
          _logger.warning('Bot authorize failed: ' + err.message)
          err.command = data.command
          err.error = true
          that.ircMesh.ctcpResponse(data.nickname,'PINGMS',err)
          return
        }
        var result = results[0]
        _logger.info('Accepted connection from "' + result.location + '"')
        botInterface[result.id] = {
          nickname: data.nickname,
          info: result
        }
        that.ircMesh.ctcpResponse(data.nickname,'PINGMS',{
          command: data.command,
          error: false,
          data: result
        })
      }
    )
  })
  that.ircMesh.on('ctcp_request:pingms:pingstart',function(o){
    var data = o.data
    var _logger = Logger.create(that.logger.tagExtend(['PINGMS',data.command,data.nickname].join(':')))
    /**
     * Start pinging a host from the browser
     */
    async.series([
        function(next){
          pingSanitize(data,next)
        }
      ],function(err){
        if(err){
          err.command = 'pingResult:' + data.handle
          err.error = err
          that.ircMesh.ctcpResponse(data.nickname,'PINGMS',err)
          return
        }
        //setup result handlers
        botInterface[data.bot].on('pingResult:' + data.handle,function(result){
          //salt bot id back in for mapping on the frontend
          result.id = data.bot
          that.ircMesh.emit('pingResult:' + data.handle,result)
          //remove result listeners when the last event arrives
          if(result.stopped){
            botInterface[data.bot].removeAllListeners('pingError:' + data.handle)
            botInterface[data.bot].removeAllListeners('pingResult:' + data.handle)
            _logger.info('Ping stopped: ' + data.handle)
            botInterface[data.bot].metrics.dateSeen = new Date()
            Bot.findByIdAndUpdate(data.bot,{$set: {metrics: botInterface[data.bot].metrics}},function(){})
          }
        })
        //start the ping session
        botInterface[data.bot].emit('pingStart',{handle: data.handle,ip: data.ip})
        //tally a hit
        Bot.findByIdAndUpdate(data.bot,{$inc: {hits: 1}},function(){})
      }
    )
  })

  that.ircMesh.connect(function(){
    if(muxOpts.channel) that.ircMesh.join(muxOpts.channel)
  })
}


/**
 * Create instance and optionally connect
 * @param {object} opts Options
 * @param {function} done Callback for authorized connect
 * @return {Mux}
 */
Mux.create = function(opts,done){
  var b = new Mux(opts)
  if('function' === typeof done)
    b.connect(done)
  return b
}


/**
 * Export module
 * @type {Mux}
 */
module.exports = Mux
