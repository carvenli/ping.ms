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
var shortId = require('shortid')
var util = require('util')
var config = require('../config')
var Logger = require('../helpers/logger')
var Bot = require('../models/bot').model

var generateHandle = function(){return shortId.generate().replace(/[-_]/g,'').toUpperCase()}


/**
 * Clear any existing ping events registered
 * @param {object} data
 * @param {function} next
 */
var pingSanitize = function(data,next){
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
      logger.info('KILLING ' + handle)
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
 * Iterate a group of bots with a user defined handler function
 * @param {string} group
 * @param {function} action
 * @param {function} next
 */
var groupAction = function(group,action,next){
  var query = {active: true}
  //filter by group if we can
  if('all' !== group.toLowerCase())
    query.groups = new RegExp(',' + group + ',','i')
  //get bots and submit queries
  var q = Bot.find(query)
  q.sort('location')
  q.exec(function(err,results){
    if(err) return next(err.message)
    async.each(
      results,
      function(bot,next){
        if(botInterface[bot.id]){
          var handle = generateHandle()
          logger.info('Found connected bot for "' + bot.location + '", assigned handle "' + handle + '"')
          var bs = botInterface[bot.id]
          action(bot,handle,bs,next)
        } else next()
      },
      next
    )
  })
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
  //Setup logger
  that.logger = Logger.create([that.options.tag,that.options.type].join(':'))
  that.ircApi = new ircFactory.Api()
}
util.inherits(ircMesh,EventEmitter)

ircMesh.prototype.connect = function(){
  var that = this
  var ircHandle = that.options.type
  that.logger.info('Connecting to ' + [that.options.server,that.options.port].join(':'))
  that.client = that.ircApi.createClient(ircHandle,that.options)
  /*
   process.on('SIGTERM',function(){
   logger.info('Mux exiting...')
   that.client.disconnect('Mux exiting...')
   })
   */

  that.client.irc.ctcpRequest = function(target,type,forcePushBack){
    that.logger.info('>' + target + ': CTCP VERSION')
    forcePushBack = forcePushBack || false
    var msg = '\x01' + type.toUpperCase() + '\x01'
    that.client.irc.raw(['PRIVMSG',target,msg])
    if(forcePushBack){
      that.client._parseLine(
          ':' +that.client._nick + '!' +that.client._user + '@' +that.client._hostname +
          ' PRIVMSG ' + target +
          ' :' + msg
      )
    }
  }

  that.ircApi.hookEvent(ircHandle,'privmsg',
    function(o){
      var myNick =that.client.irc._nick
      if(myNick === o.target){
        if(myNick !== o.nickname)
          that.client.irc.privmsg(o.nickname,o.message.toUpperCase())
      } else {
        that.client.irc.privmsg(o.target,o.message.toUpperCase())
      }
    }
  )
  that.ircApi.hookEvent(ircHandle,'registered',
    function(){
      that.logger.info('Connected')
      that.client.irc.join('#pingms')
    }
  )
  that.ircApi.hookEvent(ircHandle,'notice',
    function(o){
      var logServerNotice = function(o){
        that.logger.info('[NOTICE:' + that.client.irc.connection.server + '] ' + o.message)
      }
      if('AUTH' === o.target)
        logServerNotice(o)
      else
      if(!o.nickname)
        logServerNotice(o)
      else
        that.logger.info('[NOTICE:' + o.nickname.replace(/^@/,'') + '] ' + o.message)
    }
  )

  that.ircApi.hookEvent(ircHandle,'join',
    function(o){
      that.logger.info('Joined ' + o.channel)
    }
  )

  that.ircApi.hookEvent(ircHandle,'names',
    function(o){
      async.each(o.names,function(n,done){
        that.client.irc.ctcpRequest(n.replace(/^@/,''),'VERSION')
        done()
      },function(){})
    }
  )

  that.ircApi.hookEvent(ircHandle,'ctcp_response',
    function(o){
      that.logger.info('<' + o.nickname.replace(/^@/,'') + ': CTCP_RESPONSE ' + o.type + ': ' + o.message)
    }
  )

  //pingms ctcp handlers
  var pingmsHandlers = {
    authorize: function(data,logger,replyFn){
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
            that.logger.warning('Bot authorize failed: ' + err.message)
            err.error = true
            replyFn(err)
            return
          }
          var result = results[0]
          that.logger.info('Accepted connection from "' + result.location + '"')
          botInterface[result.id] = {
            nickname: data.nickname,
            info: result,
            requestFn: function(msg){
              that.client.irc.ctcpRequest(data.nickname,'PINGMS',msg)
            },
            responseFn: function(msg){
              that.logger.info(msg)
            },
            replyFn: function(cmd,msg){
              msg.command = cmd
              that.client.irc.ctcp(data.nickname,'PINGMS',msg)
            }
          }
          replyFn({error: false,data: result})
        }
      )
    },
    pingStart: function(data,logger,replyFn){
      /**
       * Start pinging a host from the browser
       */
      async.series([
          function(next){
            pingSanitize(data,next)
          }
        ],function(err){
          if(err){
            replyFn('pingResult:' + data.handle,{error: err})
            return
          }
          //setup result handlers
          botInterface[data.bot].on('pingResult:' + data.handle,function(result){
            //salt bot id back in for mapping on the frontend
            result.id = data.bot
            that.client.emit('pingResult:' + data.handle,result)
            //remove result listeners when the last event arrives
            if(result.stopped){
              botInterface[data.bot].removeAllListeners('pingError:' + data.handle)
              botInterface[data.bot].removeAllListeners('pingResult:' + data.handle)
              that.logger.info('Ping stopped: ' + data.handle)
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
    }
  }
  //ctcp handlers
  var ctcpHandlers = {
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
    },
    PINGMS: function(o,replyFn){
      var data = JSON.parse(o.message)
      delete(o.message)
      data.nickname = o.nickname.replace(/^@/,'')
      var _logger = Logger.create(that.logger.tagExtend(['PINGMS',data.nickname,data.command].join(':')))
      if('function' === typeof pingmsHandlers[data.command]){
        pingmsHandlers[data.command](
          data,
          _logger,
          function(msg){
            msg.command = data.command
            replyFn(JSON.stringify(msg).replace(/\r\n/,''))
          }
        )
      } else {
        _logger.warning('No handler for CTCP:PINGMS request:',data)
      }
    }
  }

  that.ircApi.hookEvent(ircHandle,'ctcp_request',
    function(o){
      that.logger.info('<' + o.nickname.replace(/^@/,'') + ': CTCP ' + o.type)
      if('function' === typeof ctcpHandlers[o.type.toUpperCase()]){
        ctcpHandlers[o.type.toUpperCase()](
          o,
          function(msg){that.client.irc.ctcp(o.nickname,o.type,msg)}
        )
      } else {
        that.logger.warning('No handler for CTCP request:',o)
      }
    }
  )
}


/**
 * Create instance and connect
 * @param {object} opts Options
 * @return {ircMesh}
 */
ircMesh.create = function(opts){
  var m = new ircMesh(opts)
  m.connect()
  return m
}


/**
 * Export object
 * @type {ircMesh}
 */
module.exports = ircMesh
