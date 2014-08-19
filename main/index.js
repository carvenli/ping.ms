'use strict';
var async = require('async')
var debug = require('debug')('pingms:main')

var config = require('../config')
var Logger = require('../helpers/logger')
var logger = Logger.create('main')

var irc
var startIrc = function(next){
  var Irc = require('../helpers/irc')

  irc = new Irc({
    tag: logger.tagExtend('irc'),
    version: config.get('title') + '-MUX v' + config.get('version')
  })
  //parse uri into ircFactory compatible options
  var uri = config.get('main.mux.uri')
  var parseEx = /^([^:]*):\/\/([^@:]*)[:]?([^@]*)@([^:]*):([0-9]*)\/(#.*)$/i;
  var secure
  var nick
  var password
  var host
  var port
  var channel
  if(parseEx.test(uri)){
    secure = ('ircs' === uri.replace(parseEx,'$1'))
    nick = uri.replace(parseEx,'$2')
    password = uri.replace(parseEx,'$3')
    host = uri.replace(parseEx,'$4')
    port = uri.replace(parseEx,'$5')
    channel = uri.replace(parseEx,'$6')
  }
  async.series(
    [
      function(next){
        if(!(host && port && nick)){
          next('IRC couldnt connect, no host/port/nick in config')
          return
        }
        irc.connect({
          host: host,
          port: +port,
          secure: secure,
          nick: nick,
          realname: 'Ping.ms MUX',
          ident: nick.toLowerCase()
        },function(){
          irc.conn.on('close',function(){
           debug('close',arguments)
						irc.logger.warning('Connection closed, retrying in 1s...')
           setTimeout(function(){
             startIrc()
           },1000)
          })
          irc.conn.on('error',function(){
            debug('error',arguments)
						irc.logger.warning('Connection error, retrying in 1s...')
            setTimeout(function(){
              startIrc()
            },1000)
          })
          irc.connDog = setTimeout(function(){
            irc.logger.warning('Connection seems stale, retrying...')
            startIrc()
          },11000)
          next()
        })
      },
      function(next){
        irc.join(channel,next)
      }
    ],
    next
  )
}

var startExpress = function(next){
  var bodyParser = require('body-parser')
  var express = require('express')
  var flash = require('connect-flash')
  var cookieParser = require('cookie-parser')
  var methodOverride = require('method-override')
  var morgan = require('morgan')
  var session = require('express-session')

  var app = express()
  var server = require('http').Server(app)
  var io = require('socket.io')(server)
  var RedisStore = require('connect-redis')(express)

  var routes = require('./routes')

  /**
   * Local tpl vars
   * @type {{title: *}}
   */
  app.locals.app = {title: config.get('title')}
  app.locals.moment = require('moment')

  // middleware stack
  app.set('views',__dirname + '/' + 'views')
  app.set('view engine','jade')
  app.use(bodyParser.urlencoded({extended:true}))
  app.use(bodyParser.json())
  app.use(methodOverride())
  app.use(cookieParser(config.get('main.cookie.secret')))
  app.use(session({
    cookie: {
      maxAge: config.get('main.cookie.maxAge')
    },
    store: new RedisStore(),
    secret: config.get('main.cookie.secret'),
    resave: true,
    saveUninitialized: true
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
    app.use(morgan('dev'))
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


/**
 * Start Main
 * @param {function} started Callback when finished with startup
 */
exports.start = function(started){
  async.series(
    [
      startIrc,
      startExpress
    ],
    started
  )
}
