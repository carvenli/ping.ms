'use strict';
var express = require('express')
var flash = require('connect-flash')
var app = express()
var server = require('http').Server(app)
var config = require('../config')
var routes = require('./routes')
var RedisStore = require('connect-redis')(express)
var async = require('async')
var shortId = require('shortid')
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

//communicator server-side ("mux")
if(config.get('main.mux.enabled')){
  logger.info('Starting Mux...')
  require('./mux')
}

//setup and listen
server.listen(config.get('main.port'),config.get('main.host'))
