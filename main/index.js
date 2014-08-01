'use strict';
var express = require('express')
var flash = require('connect-flash')
var app = express()
var server = require('http').Server(app)
var io = require('socket.io')(server)
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

//socket.io routing
io.on('connection',function(client){
  /**
   * Authorize incoming bot connections
   */
  client.on('authorize',function(data,done){
    async.series(
      [
        //lookup bot
        function(next){
          Bot.findOne({secret: data.secret},function(err,result){
            if(err) return next({message: err.message, reason: 'generalFailure'})
            if(!result) return next({message: 'Bot not found, bad secret', reason: 'badSecret'})
            result.metrics.version = data.version
            result.metrics.dateSeen = new Date()
            client.metrics = result.toJSON().metrics
            Bot.findByIdAndUpdate(result.id,{$set:{metrics: client.metrics}},function(){})
            if(result && !result.active)
              return next({message: 'Bot found, however inactive', reason: 'notActive'},result)
            //auth accepted
            next(null,result)
          })
        }
      ],
      function(err,results){
        if(err){
          logger.warning('Bot authorize failed: ' + err.message)
          return done({error: true, reason: err.reason})
        }
        logger.info('Accepted connection from "' + results[0].location + '"')
        botSocket[results[0].id] = client
        done({error:false})
      }
    )
  })
  /**
   * Resolve an IP to domain and respond with the individual bot responses
   */
  client.on('botList',function(opts,done){
    var query = {active: true}
    //filter by group if we can
    if(opts.group){
      if('all' !== opts.group.toLowerCase())
        query.groups = new RegExp(',' + opts.group + ',','i')
    }
    Bot.find(query).select('-secret').sort('groups location').exec(function(err,results){
      if(err) return done({error: err})
      done({results: results})
    })
  })
  /**
   * Resolve an IP to domain and respond with the individual bot responses
   */
  client.on('resolve',function(data,done){
    var results = {}
    async.series(
      [
        function(next){
          groupAction(
            data.group,
            function(bot,handle,socket,next){
              var query = {
                handle: handle,
                host: data.host
              }
              socket.emit('resolve',query,function(data){
                if(data.error) return next(data.error)
                var result = data
                result.handle = handle
                results[bot.id] = result
                next()
              })
            },
            next
          )
        }
      ],
      function(err){
        if(err) return done({error: err})
        done({results: results})
      }
    )
  })
  /**
   * Start pinging a host from the browser
   */
  client.on('pingStart',function(data){
    async.series(
      [
        function(next){
          pingSanitize(data,next)
        }
      ]
      ,function(err){
        if(err){
          client.emit('pingResult:' + data.handle,{error: err})
          return
        }
        //setup result handlers
        botSocket[data.bot].on('pingResult:' + data.handle,function(result){
          //salt bot id back in for mapping on the frontend
          result.id = data.bot
          client.emit('pingResult:' + data.handle,result)
          //remove result listeners when the last event arrives
          if(result.stopped){
            botSocket[data.bot].removeAllListeners('pingError:' + data.handle)
            botSocket[data.bot].removeAllListeners('pingResult:' + data.handle)
            logger.info('Ping stopped: ' + data.handle)
            botSocket[data.bot].metrics.dateSeen = new Date()
            Bot.findByIdAndUpdate(data.bot,{$set:{metrics: botSocket[data.bot].metrics}},function(){})
          }
        })
        //start the ping session
        botSocket[data.bot].emit('pingStart',{handle: data.handle, ip: data.ip})
        //tally a hit
        Bot.findByIdAndUpdate(data.bot,{$inc:{hits: 1}},function(){})
      }
    )
  })
  /**
   * Stop pinging a host from the browser
   */
  client.on('pingStop',function(data){
    if(!data.bot || !botSocket[data.bot]) return
    //stop the ping session
    botSocket[data.bot].emit('pingStop',{handle: data.handle})
  })
})

//setup and listen
server.listen(config.get('main.port'),config.get('main.host'))
