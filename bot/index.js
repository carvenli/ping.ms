'use strict';
var async = require('async')
var debug = require('debug')('pingms:bot')

var Bot = require('../helpers/bot')
var Irc = require('../helpers/irc')
var logger = require('../helpers/logger').create('bot')

var config = require('../config')

var options = config.bot
var sockets = []
var reportFunc = function(err){ if(err) debug('ERROR:',err) }

var irc = {}
var startIrc = function(conn,done){
  if('function' !== typeof done) done = reportFunc
  var uri = '' + conn.uri + ''
  var index = ':' + (Object.keys(irc).length)
  irc[uri] = new Irc({
    tag: logger.tagExtend('irc' + index),
    version: config.title + '-BOT v' + config.version
  })
  //parse uri into ircFactory compatible options
  var parseEx = /^([^:]*):\/\/([^@:]*)[:]?([^@]*)@([^:]*):([0-9]*)\/(#.*)$/i;
  var secure
  var nick
  //var password
  var host
  var port
  var channel
  console.log(uri)
  if(parseEx.test(uri)){
    secure = ('ircs' === uri.replace(parseEx,'$1'))
    nick = uri.replace(parseEx,'$2')
    //password = uri.replace(parseEx,'$3')
    host = uri.replace(parseEx,'$4')
    port = uri.replace(parseEx,'$5')
    channel = uri.replace(parseEx,'$6')
  }
  async.series(
    [
      function(next){
        if(!(host && port && nick)){
          next('IRC couldnt connect, no host/port/nick in config')
          return
        }
        irc[uri].connect({
          host: host,
          port: +port,
          secure: secure,
          nick: nick,
          realname: 'Ping.ms BOT',
          ident: nick.toLowerCase()
        },function(){
          irc[uri].conn.on('close',function(){
            debug('close',arguments)
            irc[uri].logger.warning('Connection closed, retrying in 1s...')
            setTimeout(function(){
              startIrc(uri)
            },1000)
          })
          irc[uri].conn.on('error',function(){
            debug('error',arguments)
            irc[uri].logger.warning('Connection error, retrying in 1s...')
            setTimeout(function(){
              startIrc(uri)
            },1000)
          })
          irc[uri].connDog = setTimeout(function(){
            irc[uri].logger.warning('Connection seems stale, retrying...')
            startIrc(uri)
          },11000)
          next()
        })
      },
      function(next){
        irc[uri].join(channel,next)
      }
    ],
    done
  )
}

var startBot = function(done){
  async.each(
    options.connections,
    function(uri,next){
      var botOpts = Object.create(uri)
      botOpts.tag = logger.tagExtend(sockets.length)
      botOpts.version = config.version
      botOpts.title = config.title
      var bot = Bot.create(botOpts)
      sockets.push(bot)
      //handle resolve requests
      bot.on('resolve',function(data,done){
        bot.resolve(data.handle,data.host,function(err,result){
          if(err) return done({error: err})
          done(result)
        })
      })
      //handle ping requests
      bot.on('pingStart',function(data){
        //redistribute events back to the client
        bot.on('pingResult:' + data.handle,function(result){
          if(result.stopped) bot.removeAllListeners('pingResult:' + data.handle)
          bot.emit('pingResult:' + data.handle,result)
        })
        //start the ping session
        bot.pingStart(data.handle,data.ip)
      })
      //stop the ping session
      bot.on('pingStop',function(data){
        bot.pingStop(data.handle)
      })
      bot.connect(next)
    },
    done
  )
}


/**
 * Start Main
 * @param {function} started Callback when finished with startup
 */
exports.start = function(started){
  async.series(
    [
      function(next){
        async.each(
          options.connections,
          startIrc,
          function(err){
            reportFunc(err)
            next(err)
          }
        )
      },
      startBot
    ],
    started
  )
}
