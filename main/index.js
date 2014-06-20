'use strict';
var express = require('express')
  , flash = require('connect-flash')
  , app = express()
  , server = require('http').Server(app)
  , io = require('socket.io')(server)
  , config = require('../config')
  , routes = require('./routes')
  , RedisStore = require('connect-redis')(express)
  , async = require('async')
  , shortId = require('shortid')
  , logger = require('../helpers/logger').create('main')

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

//connected bots table
var botSocket = {}

//socket.io routing
io.on('connection',function(client){
  client.on('botLogin',function(data){
    var Bot = require('../models/bot').model
    Bot
      .findOne({active:true,secret:data.secret})
      .exec(function(err,result){
        if(err) return console.log(err)
        if(result){
          logger.info('Accepted connection from "' + result.location + '"')
          botSocket[result.id] = client
          client.emit('botLoginResult',{error:false})
        } else {
          logger.warn('Incoming connection failed')
          client.emit('botLoginResult',{error:true})
        }
      })
  })
  client.on('ping',function(data){
    var Bot = require('../models/bot').model
    async.series(
      [
        function(next){
          var query = {active: true}
          //filter by group if we can
          if('All' !== data.group)
            query.groups = new RegExp(',' + data.group + ',','i')
          //get bots and submit queries
          Bot
            .find(query)
            .sort('location')
            .exec(function(err,results){
              if(err) return next(err.message)
              async.each(
                results,
                function(bot,next){
                  if(botSocket[bot.id]){
                    logger.info('Found connected bot for ' + bot.location)
                    var handle = shortId.generate().replace(/[-_]/g,'')
                    var resultHandler = function(event,data){
                      client.emit(event,{
                        id: bot.id,
                        location: bot.location,
                        sponsor: bot.sponsor,
                        result: data
                      })
                    }
                    botSocket[bot.id].on('pingInit.' + handle,function(data){resultHandler('pingInit',data)})
                    botSocket[bot.id].on('pingResult.' + handle,function(data){resultHandler('pingResult',data)})
                    botSocket[bot.id].on('pingComplete.' + handle,function(data){resultHandler('pingComplete',data)})
                    botSocket[bot.id].emit('execPing',{
                      handle:handle,
                      host:data.host
                    })
                  }
                  next()
                },
                next
              )
            })
        }
      ],
      function(err){
        if(err){
          client.emit('error',{message: err})
        }
      }
    )
  })
})

//setup and listen
server.listen(config.get('main.port'),config.get('main.host'))
