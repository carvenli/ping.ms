'use strict';
var async = require('async')
var shortId = require('shortid')
var config = require('../config')
var Logger = require('../helpers/logger')
var logger = Logger.create('MAIN:MUX')
var Bot = require('../models/bot').model

var generateHandle = function(){return shortId.generate().replace(/[-_]/g,'').toUpperCase()}
var botInterface = {}

//setup ircMesh
var muxOpts = config.get('main.mux')
muxOpts.type = 'mux'
muxOpts.appName = config.get('title') + ' ' + muxOpts.type.toUpperCase()
muxOpts.logger = logger
muxOpts.groupKey = generateHandle()
var ircMesh = require('../helpers/ircMesh').create(muxOpts)


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
ircMesh.on('join:' + muxOpts.channel,function(o){
  logger.info('<' + o.channel + '> ' +
    ((ircMesh.conn.nickname === o.nickname) ? '' : o.nickname + ' ') +
    'joined'
  )
})
ircMesh.on('part:' + muxOpts.channel,function(o){
  logger.info('<' + o.channel + '> ' +
      ((ircMesh.conn.nickname === o.nickname) ? '' : o.nickname + ' ') +
      'parted'
  )
})
//wire normal message types
ircMesh.on('notice',function(o){
  logger.info('<' + o.source + ' NOTICE> ' + o.message)
})
/*
ircMesh.on('privmsg',function(o){
  ircMesh.privmsg(o.source,o.message.toUpperCase())
})
*/
ircMesh.on('ctcp_request',function(o){
  logger.info('<' + o.source + ' CTCP_REQUEST:' + o.type + '>' + ((o.message) ? ' ' + o.message : ''))
})
ircMesh.on('ctcp_response',function(o){
  logger.info('<' + o.source + ' CTCP_RESPONSE:' + o.type + '>' + ((o.message) ? ' ' + o.message : ''))
})

//wire pingms CTCP actions
ircMesh.on('ctcp_request:pingms:authorize',function(o){
  var data = o.data
  var _logger = Logger.create(logger.tagExtend(['PINGMS',data.command,data.nickname].join(':')))
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
        _logger.warning('Bot authorize failed: ' + err.message)
        err.command = data.command
        err.error = true
        ircMesh.ctcpResponse(data.nickname,'PINGMS',err)
        return
      }
      var result = results[0]
      _logger.info('Accepted connection from "' + result.location + '"')
      botInterface[result.id] = {
        nickname: data.nickname,
        info: result
      }
      ircMesh.ctcpResponse(data.nickname,'PINGMS',{
        command: data.command,
        error: false,
        data: result
      })
    }
  )
})
ircMesh.on('ctcp_request:pingms:pingstart',function(o){
  var data = o.data
  var _logger = Logger.create(logger.tagExtend(['PINGMS',data.command,data.nickname].join(':')))
  /**
   * Start pinging a host from the browser
   */
  async.series([
      function(next){
        pingSanitize(data,next)
      }
    ],function(err){
      if(err){
        err.command = 'pingResult:' + data.handle
        err.error = err
        ircMesh.ctcpResponse(data.nickname,'PINGMS',err)
        return
      }
      //setup result handlers
      botInterface[data.bot].on('pingResult:' + data.handle,function(result){
        //salt bot id back in for mapping on the frontend
        result.id = data.bot
        ircMesh.emit('pingResult:' + data.handle,result)
        //remove result listeners when the last event arrives
        if(result.stopped){
          botInterface[data.bot].removeAllListeners('pingError:' + data.handle)
          botInterface[data.bot].removeAllListeners('pingResult:' + data.handle)
          _logger.info('Ping stopped: ' + data.handle)
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
})

ircMesh.connect(function(){
  if(muxOpts.channel) ircMesh.join(muxOpts.channel)
})
