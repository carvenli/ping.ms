'use strict';
var async = require('async')
//var debug = require('debug')('ping.ms:main')

var AxonProxy = require('../helpers/AxonProxy')
var redis = require('../helpers/redis')

var config = require('../config')
var logger = require('../helpers/Logger').create('main')


/**
 * Set the express server
 * @param {function} done
 */
var startExpress = function(done){
  var bodyParser = require('body-parser')
  var flash = require('connect-flash')
  var cookieParser = require('cookie-parser')
  var express = require('express')
  var session = require('express-session')
  var morgan = require('morgan')

  var app = express()
  var server = require('http').createServer(app)
  var io = require('socket.io')(server)
  var RedisStore = require('connect-redis')(session)

  var routes = require('./routes')

  /**
   * Local tpl vars
   * @type {{title: *}}
   */
  app.locals.app = {title: config.title}
  app.locals.moment = require('moment')

  // middleware stack
  app.set('views',__dirname + '/' + 'views')
  app.set('view engine','jade')
  app.use(bodyParser.urlencoded({extended:true}))
  app.use(bodyParser.json())
  app.use(cookieParser(config.main.cookie.secret))
  app.use(session({
    cookie: {
      maxAge: config.main.cookie.maxAge
    },
    store: new RedisStore({client:redis}),
    secret: config.main.cookie.secret,
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
    app.use(morgan('dev'))
  }

  //home page
  app.get('/',routes.index)

  //bot list
  app.get('/bots',routes.bot)

  //handle socket.io
  io.on('connection',function(socket){
    //TODO: this should iterate the database and setup a handle per bot
    var bot = {
      reqRep: {
        host: null,
        port: 3001
      },
      pubSub: {
        host: null,
        port: 3002
      }
    }
    //setup a new proxy object to handle the connection
    var proxy = new AxonProxy(socket,bot.reqRep,bot.pubSub)
    //dns lookups
    proxy.clientRequest('resolve',function(req,reply){
      var that = this
      that.reqRepSocket.send('resolve',req,function(err,payload){
        if(err) return reply(that.prepareError(err))
        reply(payload)
      })
    })
    //ptr lookups
    proxy.clientRequest('ptr',function(req,reply){
      var that = this
      that.reqRepSocket.send('ptr',req,function(err,payload){
        if(err) return reply(that.prepareError(err))
        reply(payload)
      })
    })
    //ping request
    proxy.clientRequest('ping',function(req,reply){
      var that = this
      that.reqRepSocket.send('ping',req,function(err,payload){
        if(err) return reply(that.prepareError(err))
        reply(payload)
      })
    })
    //ping responses
    proxy.serverEvent('pingResponse',function(err,payload){
      var that = this
      if(err) return that.io.emit('ping:error',that.prepareError(err))
      that.io.emit(payload + ':ping:response'.token,payload)
    })
    //start the proxy session
    proxy.start(function(err){
      if(err){
        logger.warning('Failed to start AxonProxy',err)
      }
    })
  })

  //setup an listen
  server.listen(config.main.port,config.main.host,function(){
    logger.info(
        'Main listening on port ' +
        (config.main.host || '0.0.0.0') +
        ':' + config.main.port
    )
    done()
  })
}


/**
 * Start Main
 * @param {function} done Callback when finished with startup
 */
exports.start = function(done){
  async.series(
    [
      function(next){
        startExpress(next)
      }
    ],
    done
  )
}
