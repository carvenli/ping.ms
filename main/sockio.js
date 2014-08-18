'use strict';
var async = require('async')

var Bot = require('../models/bot').model

var botInterface = {}

//socket.io routing
module.exports.connection = function(logger,client){
  if(!client) return
  var groupAction = function(a,b,c){c()}
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
        botInterface[data.bot].on('pingResult:' + data.handle,function(result){
          //salt bot id back in for mapping on the frontend
          result.id = data.bot
          client.emit('pingResult:' + data.handle,result)
          //remove result listeners when the last event arrives
          if(result.stopped){
            botInterface[data.bot].removeAllListeners('pingError:' + data.handle)
            botInterface[data.bot].removeAllListeners('pingResult:' + data.handle)
            logger.info('Ping stopped: ' + data.handle)
            botInterface[data.bot].metrics.dateSeen = new Date()
            Bot.findByIdAndUpdate(data.bot,{$set:{metrics: botInterface[data.bot].metrics}},function(){})
          }
        })
        //start the ping session
        botInterface[data.bot].emit('pingStart',{handle: data.handle, ip: data.ip})
        //tally a hit
        Bot.findByIdAndUpdate(data.bot,{$inc:{hits: 1}},function(){})
      }
    )
  })
  /**
   * Stop pinging a host from the browser
   */
  client.on('pingStop',function(data){
    if(!data.bot || !botInterface[data.bot]) return
    //stop the ping session
    botInterface[data.bot].emit('pingStop',{handle: data.handle})
  })
}
