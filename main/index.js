'use strict';
var express = require('express')
  , flash = require('connect-flash')
  , app = express()
  , server = require('http').Server(app)
  , io = require('socket.io')(server)
  , config = require('../config')
  , routes = require('./routes')
  , RedisStore = require('connect-redis')(express)

//setup global tpl vars
app.locals.app = {title: config.get('title')}

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

//try to find a page matching the uri, if not continue
app.use(function(req,res,next){
  var Page = require('../models/page').model
  Page.findOne({uri: req.path},function(err,result){
    if(err) return next(err.message)
    if(!result) return next()
    //found a page render it
    res.render('page',{
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
io.on('connection',function(socket){
  socket.on('ping',function(data){
    console.log(data)
    socket.emit('pingResult',{stuff: 'foo'})
  })
})

//setup and listen
server.listen(config.get('main.port'),config.get('main.host'))
