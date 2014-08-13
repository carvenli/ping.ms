'use strict';
var async = require('async')
var shortId = require('shortid')
var config = require('../config')
var Logger = require('../helpers/logger')
var logger = Logger.create('MAIN:MUX')
var Bot = require('../models/bot').model

//setup ircMesh
config.set('main.mux.type','mux')
var ircMesh = require('../helpers/ircMesh').create(config.get('main.mux'))

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

ircMesh.on('log',function(msg){ logger.info(msg) })
ircMesh.on('registered',function(){
  logger.info('Connected')
  ircMesh.join('#pingms')
})
ircMesh.on('notice',function(o){
  var logServerNotice = function(o){
    logger.info('[NOTICE:' + ircMesh.ircClient.irc.connection.server + '] ' + o.message)
  }
  if('AUTH' === o.target)
    logServerNotice(o)
  else if(!o.nickname)
    logServerNotice(o)
  else
    logger.info('[NOTICE:' + o.nickname.replace(/^@/,'') + '] ' + o.message)
})
ircMesh.on('join',function(o){ logger.info('Joined ' + o.channel) })

ircMesh.connect()
