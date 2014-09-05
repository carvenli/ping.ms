'use strict';
var async = require('async')
var debug = require('debug')('pingms:bot')

var Bot = require('../helpers/bot')
var Irc = require('../helpers/irc')
var logger = require('../helpers/logger').create('bot')

var config = require('../config')

var options = config.bot
var sockets = []

var irc
var startIrc = function(done){
  irc = new Irc({
    tag: logger.tagExtend('irc'),
    version: config.title + '-BOT v' + config.version
  })
  //parse uri into ircFactory compatible options
  var uri = config.main.mux.uri
  var parseEx = /^([^:]*):\/\/([^@:]*)[:]?([^@]*)@([^:]*):([0-9]*)\/(#.*)$/i;
  var secure
  var nick
  //var password
  var host
  var port
  var channel
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
        irc.connect({
          host: host,
          port: +port,
          secure: secure,
          nick: nick,
          realname: 'Ping.ms MUX',
          ident: nick.toLowerCase()
        },function(){
          irc.conn.on('close',function(){
            debug('close',arguments)
            irc.logger.warning('Connection closed, retrying in 1s...')
            setTimeout(function(){
              startIrc()
            },1000)
          })
          irc.conn.on('error',function(){
            debug('error',arguments)
            irc.logger.warning('Connection error, retrying in 1s...')
            setTimeout(function(){
              startIrc()
            },1000)
          })
          irc.connDog = setTimeout(function(){
            irc.logger.warning('Connection seems stale, retrying...')
            startIrc()
          },11000)
          next()
        })
      },
      function(next){
        irc.join(channel,next)
      }
    ],
    done
  )
}

var startBot = function(done){
  async.each(
    options.connections,
    function(conn,next){
      var botOpts = Object.create(conn)
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
      startIrc,
      startBot
    ],
    started
  )
}
