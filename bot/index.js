'use strict';
var async = require('async')
var logger = require('../helpers/logger').create('bot')
var config = require('../config')
var Bot = require('../helpers/bot.js')
var propCopy = function(obj){return JSON.parse(JSON.stringify(obj))}

var options = config.get('bot')
var sockets = []

var startIrc = function(next){
  irc = new Irc({
    tag: logger.tagExtend('irc'),
    version: [config.get('title'),config.get('version')].join(':')
  })
  //parse uri into ircFactory compatible options
  var uri = config.get('main.mux.uri')
  var parseEx = /^([^:]*):\/\/([^@:]*)[:]?([^@]*)@([^:]*):([0-9]*)\/(#.*)$/i;
  var secure
  var nick
  var password
  var server
  var port
  var channel
  if(parseEx.test(uri)){
    secure = ('ircs' === uri.replace(parseEx,'$1'))
    nick = uri.replace(parseEx,'$2')
    password = uri.replace(parseEx,'$3')
    server = uri.replace(parseEx,'$4')
    port = uri.replace(parseEx,'$5')
    channel = uri.replace(parseEx,'$6')
  }
  async.series(
    [
      function(next){
        if(!(server && port && nick)){
          next('IRC couldnt connect, no server/port/nick in config')
          return
        }
        irc.connect({
          server:server,
          port:+port
        },function(){
          irc.conn.on('close',function(){
            irc.logger.warning('Connection closed, retrying...')
            startIrc()
            setTimeout(function(){startIrc()},1000)
          })
          irc.conn.on('error',function(){
            setTimeout(function(){
              irc.logger.warning('Connection error, retrying...')
              startIrc()
            },1000)
          })
          irc.connDog = setTimeout(function(){
            irc.logger.warning('Connection seems stale, retrying...')
            startIrc()
          },11000)
          irc.conn.version = ['ping.ms MUX',config.get('version'),'nodejs'].join(':')
          next()
        })
      },
      function(next){
        irc.nick(nick,next)
      },
      function(next){
        irc.join(channel,next)
      }
    ],
    next
  )
}




module.exports = function(done){
  async.each(options.connections,function(conn,next){
    var botOpts = propCopy(conn)
    botOpts.tag = logger.tagExtend(sockets.length)
    botOpts.version = config.get('version')
    botOpts.title = config.get('title')
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
  },function(){
    done(null,sockets)
  })
}
