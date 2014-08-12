'use strict';
var express = require('express')
var flash = require('connect-flash')
var app = express()
var server = require('http').Server(app)
var ircFactory = require('irc-factory')
var config = require('../config')
var routes = require('./routes')
var RedisStore = require('connect-redis')(express)
var async = require('async')
var shortId = require('shortid')
var net = require('net')
var ip = require('ip')
var fs = require('fs')
var path = require('path')
var Logger = require('../helpers/logger')
var logger = Logger.create('main')
var Bot = require('../models/bot').model

var generateHandle = function(){return shortId.generate().replace(/[-_]/g,'').toUpperCase()}


/**
 * Local tpl vars
 * @type {{title: *}}
 */
app.locals.app = {title: config.get('title')}
app.locals.moment = require('moment')

// middleware stack
app.set('views',__dirname + '/' + 'views')
app.set('view engine','jade')
app.use(express.json())
app.use(express.urlencoded())
app.use(express.methodOverride())
app.use(express.cookieParser(config.get('main.cookie.secret')))
app.use(express.session({
  cookie: {
    maxAge: config.get('main.cookie.maxAge')
  },
  store: new RedisStore(),
  secret: config.get('main.cookie.secret')
}))
app.use(flash())
app.use(function(req,res,next){
  res.locals.flash = req.flash.bind(req)
  next()
})
app.use(express.static(__dirname + '/public'))

//try to find a news page matching the uri, if not continue
app.use(function(req,res,next){
  var Page = require('../models/page').model
  Page.findOne({uri: req.path},function(err,result){
    if(err) return next(err.message)
    if(!result) return next()
    //found a page render it
    res.render('news',{
      pageTitle: result.title,
      page: result
    })
  })
})

// development only
if('development' === app.get('env')){
  app.locals.pretty = true
  app.use(express.errorHandler())
  app.use(express.logger('dev'))
}

//home page
app.get('/',routes.index)

//bot list
app.get('/bots',routes.bot)

//connected bots table, by collection _id
var botInterface = {}


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

//communicator server-side ("mux")
logger.info('Starting Mux...')
;(function(parentLogger){
  var logger = Logger.create(parentLogger.tagExtend('MUX'))
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

  var muxHandle = 'mux'
  var mux = new ircFactory.Api()
  var opts = {
    nick: config.get('main.mux.nick') || 'pingMsMux',
    user: config.get('main.mux.user') || 'pingMsMux',
    realname: config.get('main.mux.realname') || 'pingMsMux',
    server: config.get('main.mux.server') || 'localhost',
    port: config.get('main.mux.port') || 6667,
    secure: config.get('main.mux.secure') || false,
    capab: config.get('main.mux.capab') || false,
    sasl: config.get('main.mux.sasl') || false,
    saslUsername: config.get('main.mux.saslUsername') || config.get('main.mux.user') || 'pingMsMux',
    password: config.get('main.mux.sasl') || '',
    retryCount: config.get('main.mux.retryCount') || 10,
    retryWait: config.get('main.mux.retryWait') || 1000
  }
  logger.info('Connecting to ' + [opts.server,opts.port].join(':'))
  var client = mux.createClient(muxHandle,opts)
  /*
  process.on('SIGTERM',function(){
    logger.info('Mux exiting...')
    client.disconnect('Mux exiting...')
  })
  */

  client.irc.ctcpRequest = function(target,type,forcePushBack){
    logger.info('>' + target + ': CTCP VERSION')
    forcePushBack = forcePushBack || false
    var msg = '\x01' + type.toUpperCase() + '\x01'
    client.irc.raw(['PRIVMSG',target,msg])
    if(forcePushBack){
      client._parseLine(
        ':' + client._nick + '!' + client._user + '@' + client._hostname +
        ' PRIVMSG ' + target +
        ' :' + msg
      )
    }
  }

  mux.hookEvent(muxHandle,'privmsg',
    function(o){
      var myNick = client.irc._nick
      if(myNick === o.target){
        if(myNick !== o.nickname)
          client.irc.privmsg(o.nickname,o.message.toUpperCase())
      } else {
        client.irc.privmsg(o.target,o.message.toUpperCase())
      }
    }
  )
  mux.hookEvent(muxHandle,'registered',
    function(){
      logger.info('Connected')
      client.irc.join('#pingms')
    }
  )
  mux.hookEvent(muxHandle,'notice',
    function(o){
      var logServerNotice = function(o){
        logger.info('[NOTICE:' + client.irc.connection.server + '] ' + o.message)
      }
      if('AUTH' === o.target)
        logServerNotice(o)
      else
        if(!o.nickname)
          logServerNotice(o)
        else
          logger.info('[NOTICE:' + o.nickname.replace(/^@/,'') + '] ' + o.message)
    }
  )

  mux.hookEvent(muxHandle,'join',
    function(o){
      logger.info('Joined ' + o.channel)
    }
  )

  mux.hookEvent(muxHandle,'names',
    function(o){
      async.each(o.names,function(n,done){
        client.irc.ctcpRequest(n.replace(/^@/,''),'VERSION')
        done()
      },function(){})
    }
  )

  mux.hookEvent(muxHandle,'ctcp_response',
    function(o){
      logger.info('<' + o.nickname.replace(/^@/,'') + ': CTCP_RESPONSE ' + o.type + ': ' + o.message)
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
            logger.warning('Bot authorize failed: ' + err.message)
            err.error = true
            replyFn(err)
            return
          }
          var result = results[0]
          logger.info('Accepted connection from "' + result.location + '"')
          botInterface[result.id] = {
            nickname: data.nickname,
            info: result,
            requestFn: function(msg){
              client.irc.ctcpRequest(data.nickname,'PINGMS',msg)
            },
            responseFn: function(msg){
              logger.info(msg)
            },
            replyFn: function(cmd,msg){
              msg.command = cmd
              client.irc.ctcp(data.nickname,'PINGMS',msg)
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
            client.emit('pingResult:' + data.handle,result)
            //remove result listeners when the last event arrives
            if(result.stopped){
              botInterface[data.bot].removeAllListeners('pingError:' + data.handle)
              botInterface[data.bot].removeAllListeners('pingResult:' + data.handle)
              logger.info('Ping stopped: ' + data.handle)
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
    TIME: function(o,replyFn){replyFn(':' + app.locals.moment().format('ddd MMM DD HH:mm:ss YYYY ZZ'))},
    DCC: function(o,replyFn){
      var args = o.message.split(' ')
      var type = args[0]
      var argument = args[1]
      var address = ip.fromLong(args[2])
      var port = +args[3]
      var size = +args[4]
      var _recvFile = null
      var _logger = Logger.create(logger.tagExtend(['DCC',type,o.nickname.replace(/^@/,'')].join(':')))
      _logger.info('Connecting to ' + [address,port].join(':'))
      var client = net.connect(
        port,
        address,
        function(){
          _logger.info('Connected')
          client.on('error',function(err){
            _logger.info('ERROR:',err)
          })
          client.on('end',function(){
            _logger.info('Connection closed')
          })
          switch(type){
          case 'CHAT':
            client.on('data',function(data){
              _logger.info(data.toString().replace(/[\r\n]$/g,''))
            })
            client.write('DCC CHAT GO\n')
            break
          case 'SEND':
            var fname = [fs.realpathSync('./'),argument].join(path.sep)
            if(fs.existsSync(fname)){
              _logger.info('File Exists (' + fname + ')')
              client.end()
            } else {
            _recvFile = fs.createWriteStream(fname)
            _recvFile.on('open',function(){
              _logger.info('Saving to file ' + fname)
              client.on('end',function(){
                _recvFile.end(function(){
                  _logger.info('Saved ' + _recvFile.bytesWritten + ' bytes to ' + fname +
                    ((size === _recvFile.bytesWritten) ? ' [size good!]' : ' [size BAD should be ' + size + ']')
                  )
                })
              })
              client.on('data',function(data){
                client.pause()
                if(_recvFile){
                  _recvFile.write(data,function(){
                    var bytesWritten = _recvFile.bytesWritten
                    var buf = new Buffer([0,0,0,0])
                    buf.writeUInt32BE(bytesWritten,0)
                    client.write(buf,function(){
                      client.resume()
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
      var _logger = Logger.create(logger.tagExtend(['PINGMS',data.nickname,data.command].join(':')))
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

  mux.hookEvent(muxHandle,'ctcp_request',
    function(o){
      logger.info('<' + o.nickname.replace(/^@/,'') + ': CTCP ' + o.type)
      if('function' === typeof ctcpHandlers[o.type.toUpperCase()]){
        ctcpHandlers[o.type.toUpperCase()](
          o,
          function(msg){client.irc.ctcp(o.nickname,o.type,msg)}
        )
      } else {
        logger.warning('No handler for CTCP request:',o)
      }
    }
  )
})(logger)

//setup and listen
server.listen(config.get('main.port'),config.get('main.host'))
