'use strict';
var async = require('async')
var flash = require('connect-flash')
var shortId = require('shortid')

var express = require('express')
var RedisStore = require('connect-redis')(express)

var config = require('../config')
var Logger = require('../helpers/logger')
var logger = Logger.create('main')
var Irc = require('../helpers/irc')

var routes = require('./routes')

var generateHandle = function(){return shortId.generate().replace(/[-_]/g,'').toUpperCase()}

var irc
var startIrc = function(next){
  irc = new Irc({tag:logger.tagExtend('irc'),version:config.get('version')})
  //parse uri into ircFactory compatible options
  var uri = config.get('main.mux.uri')
  var parseEx = /^([^:]*):\/\/([^@:]*)[:]?([^@]*)@([^:]*):([0-9]*)\/(#.*)$/i;
  var secure
  var nick
  var password
  var server
  var port
  var channel
  if(parseEx.test(uri)){
    secure = ('ircs' === uri.replace(parseEx,'$1'))
    nick = uri.replace(parseEx,'$2')
    password = uri.replace(parseEx,'$3')
    server = uri.replace(parseEx,'$4')
    port = uri.replace(parseEx,'$5')
    channel = uri.replace(parseEx,'$6')
  }
  async.series(
    [
      function(next){
        if(!(server && port && nick)){
          next('IRC couldnt connect, no server/port/nick in config')
          return
        }
        irc.connect({
          server:server,
          port:+port
        },function(){
          irc.conn.on('close',function(){
            irc.logger.warning('Connection closed, retrying...')
            startIrc()
            setTimeout(function(){startIrc()},1000)
          })
          irc.conn.on('error',function(){
            setTimeout(function(){
              irc.logger.warning('Connection error, retrying...')
              startIrc()
            },1000)
          })
          irc.connDog = setTimeout(function(){
            irc.logger.warning('Connection seems stale, retrying...')
            startIrc()
          },11000)
          irc.conn.version = ['ping.ms MUX',config.get('version'),'nodejs'].join(':')
          next()
        })
      },
      function(next){
        irc.nick(nick,next)
      },
      function(next){
        irc.join(channel,next)
      }
    ],
    next
  )
}


/**
 * Start Main
 * @param {function} started Callback when finished with startup
 */
exports.start = function(started){
  async.series(
    [
      startIrc,
      function(next){
        var app = express()
        var server = require('http').Server(app)
        var io = require('socket.io')(server)

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

        //socket.io routing
        io.on('connection',require('./sockio').connection)

        server.listen(config.get('main.port'),config.get('main.host'),function(){
          logger.info(
              'Express listening on port ' +
              (config.get('main.host') || '0.0.0.0') +
              ':' + config.get('main.port')
          )
          next()
        })
      }
    ],
    started
  )
}
