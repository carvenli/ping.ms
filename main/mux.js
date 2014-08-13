'use strict';
var async = require('async')
var shortId = require('shortid')
var config = require('../config')
var Logger = require('../helpers/logger')
var logger = Logger.create('MAIN:MUX')
var Bot = require('../models/bot').model

//setup ircMesh
var muxOpts = config.get('main.mux')
muxOpts.type = 'mux'
muxOpts.logger = logger
var ircMesh = require('../helpers/ircMesh').create(muxOpts)

var generateHandle = function(){return shortId.generate().replace(/[-_]/g,'').toUpperCase()}

var botInterface = {}


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

ircMesh.on('debug',function(msg){logger.info(msg)})
ircMesh.on('connecting',function(where){ logger.info('Connecting to ' + where) })
ircMesh.on('registered',function(){
  logger.info('Connected')
  ircMesh.join('#pingms',function(o){ logger.info('Joined ' + o.channel) })
})
ircMesh.on('notice',function(o){
  logger.info('<' + o.source + ' NOTICE> ' + o.message)
})
ircMesh.on('ctcp_request',function(o){
  logger.info('<' + o.source + ' CTCP:' + o.type + '>' + ((o.message) ? ' ' + o.message : ''))
})
ircMesh.on('privmsg',function(o){
  ircMesh.privmsg(o.source,o.message.toUpperCase())
})
ircMesh.on('names',function(o){
  async.each(o.names,function(n,done){
    ircMesh.ctcpRequest(n.replace(/^@/,''),'VERSION')
    done()
  },function(){})
})
ircMesh.on('ctcp_response',function(o){
  logger.info('<' + o.nickname.replace(/^@/,'') + ' CTCP:' + o.type + ':RESPONSE> ' + o.message)
})

//pingms CTCP handlers
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
            ircMesh.ctcpRequest(data.nickname,'PINGMS',msg)
          },
          responseFn: function(msg){
            logger.info(msg)
          },
          replyFn: function(cmd,msg){
            msg.command = cmd
            ircMesh.ircClient.irc.ctcp(data.nickname,'PINGMS',msg)
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
          ircMesh.ircClient.emit('pingResult:' + data.handle,result)
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
ircMesh.registerCtcpHandler('PINGMS',function(o,replyFn){
  var data = JSON.parse(o.message)
  delete(o.message)
  data.nickname = o.nickname.replace(/^@/,'')
  var _logger = Logger.create(logger.tagExtend(['PINGMS',data.command,data.nickname].join(':')))
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
})

ircMesh.connect()
