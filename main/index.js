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
var logger = require('../helpers/logger').create('main')
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

//connected bots table
var botSocket = {}


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
        if(botSocket[bot.id]){
          var handle = generateHandle()
          logger.info('Found connected bot for "' + bot.location + '", assigned handle "' + handle + '"')
          var bs = botSocket[bot.id]
          action(bot,handle,bs,next)
        } else next()
      },
      next
    )
  })
}


/**
 * Clear any existing ping events registered
 * @param {object} data
 * @param {function} next
 */
var pingSanitize = function(data,next){
  var re = /^(.*):([^:]*)$/
  var currentSourceId = data.handle.replace(re,'$1')
  async.each(
    Object.keys(botSocket[data.bot]._events),
    function(ev,next){
      var test = /^ping(Error|Result):(.*)$/
      if(!test.test(ev)) return next()
      ev = ev.replace(test,'$2')
      var sourceId = ev.replace(re,'$1')
      if(sourceId !== currentSourceId) return next()
      var handle = ev.replace(re,'$1:$2')
      logger.info('KILLING ' + handle)
      //botSocket[data.bot].emit('pingStop',{handle: m[1]}
      botSocket[data.bot].removeAllListeners('pingError:' + handle)
      botSocket[data.bot].removeAllListeners('pingResult:' + handle)
      //stop the ping session
      botSocket[data.bot].emit('pingStop',{handle: handle})
      next()
    },
    next
  )
}

//communicator server-side ("mux")
logger.info('Starting Mux...')
var muxHandle = 'mux'
var mux = new ircFactory.Api()
var client = mux.createClient(muxHandle,{
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
})
/*
process.on('SIGTERM',function(){
  logger.info('Mux exiting...')
  client.disconnect('Mux exiting...')
})
*/

mux.hookEvent(muxHandle,'*',
  function(message){
    logger.info('[MUX]',message)
  }
)
mux.hookEvent(muxHandle,'PRIVMSG',
  function(message){
    logger.info('[MUX PRIVMSG]',message)
  }
)
mux.hookEvent(muxHandle,'registered',
  function(message){
    client.irc.join('#pingms')
  }
)

//setup and listen
server.listen(config.get('main.port'),config.get('main.host'))
