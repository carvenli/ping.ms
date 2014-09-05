'use strict';
var async = require('async')
var debug = require('debug')('pingms:ircHelper')
var EventEmitter = require('events').EventEmitter
var ircChannels = require('irc-channels')
var irc = require('irc-connect')
var ircCtcp = require('irc-connect-ctcp')
var ObjectManage = require('object-manage')
var util = require('util')

var Logger = require('./logger')
//var ircMesh = require('./ircMesh')


/**
 * Encode a message into JSON format if it's an object
 * @param {string,object} message Message string or object
 * @return {string} Message coerced to string, or message if no coercion needed
 */
var messageEncode = function(message){
  var rv = message.toString()
  if('object' === typeof message)
    rv = 'JSON' + JSON.stringify(message).replace(/\r\n/,'')
  return rv
}


/**
 * Decode a message into JSON format if it's an object
 * @param {string} message Message string
 * @return {object} Data parsed from string, or empty object
 */
var messageDecode = function(message){
  var msg = message.toString()
  var data = {}
  async.series([
    function(next){
      msg = msg.replace(/^[^J]+(JSON\{[^}]*\}).+$/,'$1')
      if('JSON{' === msg.substring(0,5)){
        try {
          data = JSON.parse(msg.substring(4))
          next()
        } catch(e){
          next(e)
        }
      }
    }
  ],function(err){
    if(err) data = {}
  })
  return data
}



/**
 * irc Object
 *  each irc is a custom IRC client which acts as either a "mux" (server) or "bot" (client)
 * @param {object} opts Options object
 * @constructor
 */
var Irc = function(opts){
  var that = this
  //extend irc with EventEmitter to interface with upper layers
  EventEmitter.apply(that)
  //handle options
  that.options = new ObjectManage()
  that.options.$load(that.defaultOptions)
  that.options.$load(opts)
  //setup logger
  that.logger = Logger.create(that.options.tag)
  //setup object internals
  that.conn = null    //the actual connection (irc-connect instance)
  that.connDog = null //watchdog reconnection timeout pointer
  that.connInfo = {}  // connection information (global/self state)
  that.chanInfo = {}  // channel information    (channel state)
  that.userInfo = {}  // user information       (other user state)
}
util.inherits(Irc,EventEmitter)


/**
 * default options
 * @type {{tag: string}}
 */
Irc.prototype.defaultOptions = {
  tag: 'IRC'
}


/**
 * default connect options
 * @type {{host: string, port: number, secure: boolean|string, nick: string, ident: string, realname: string}}
 */
Irc.prototype.defaultConnectOptions = {
  host: 'localhost',
  port: 6667,
  secure: false,
  nick: 'SetANick',
  ident: 'noident',
  realname: 'No Realname'
}


/**
 * Set nickname on IRC
 * @param {string} nick Desired nickname
 * @param {function} done Callback
 */
Irc.prototype.nick = function(nick,done){
  var that = this
  //install server response handler, can return nickname other than requested (on clash, server bad mood, etc)
  if('function' !== typeof done){
    done = function(){
      if(arguments.length)
        debug(arguments[0])
    }
  }
  var t
  var trap = function(n){
    if(nick === n){
      clearTimeout(t)
      that.conn.removeListener('nick',trap)
      done()
    }
  }
  t = setTimeout(function(){
    that.conn.removeListener('nick',trap)
    done('IRC Requested nick "' + nick + '" but got "' + that.conn.nick() + '"')
  },2000)
  that.conn.on('nick',trap)
  //send the nickname change command to server
  that.conn.nick(nick)
}


/**
 * Join a channel
 * @param {string} channel Channel to join (include the '#')
 * @param {function} joinedCb Callback once joined
 */
Irc.prototype.join = function(channel,joinedCb){
  var that = this
  //install the callback handler
  if('function' === typeof joinedCb){
    //the 'once' is done manually because there could be some other NICK event out of order
    var cbHandler = function(event){
      //bail if it's not us
      if(that.conn.nick() !== event.nick) return
      that.conn.removeListener('JOIN',cbHandler)
      joinedCb()
    }
    that.conn.on('JOIN',cbHandler)
  }
  that.conn.send('JOIN ' + channel)
}


/**
 * Part a channel
 * @param {string} channel Channel to leave (include the '#')
 * @param {function} partedCb Callback once out
 */
Irc.prototype.part = function(channel,partedCb){
  var that = this
  if('function' === typeof partedCb)
    that.once('PART',function(){
      //channel
      //that.conn.nick()
      partedCb()
    })
  that.conn.send('PART ' + channel)
}


/**
 * Names list of a channel
 * @param {string} channel Channel to list (include the '#')
 */
Irc.prototype.names = function(channel){
  var that = this
  that.conn.names(channel)
}


/**
 * Send a PRIVMSG with any objects converted to JSON
 * @param {string} target Target (nick or channel)
 * @param {string} message Message
 */
Irc.prototype.privmsg = function(target,message){
  this.conn.send(['PRIVMSG ',target,' :' + messageEncode(message)])
}


/**
 * Send a CTCP Request with any objects converted to JSON
 * @param {string} target Target (nick or channel)
 * @param {string} type Type
 * @param {string} message Message
 */
Irc.prototype.ctcpRequest = function(target,type,message){
  this.conn.sendCtcpRequest(target,type,messageEncode(message))
}


/**
 * Send a CTCP Response with any objects converted to JSON
 * @param {string} target Target (nick or channel)
 * @param {string} type Type
 * @param {string} message Message
 */
Irc.prototype.ctcpResponse = function(target,type,message){
  this.conn.sendCtcpResponse(target,type,messageEncode(message))
}


/**
 * Updates the internal channel attendance
 * @param {string} channel
 */
Irc.prototype.updateAttendance = function(channel){
  var that = this
  if(!that.chanInfo[channel]) that.chanInfo[channel] = {attendance:[]}
  var attendance = []
  var names = []
  async.eachSeries(that.conn.names[channel] || [],function(nick,next){
    names.push(nick.replace(/^@/,''))
    next()
  },function(){
    var inNames = function(nick){return -1 < names.indexOf(nick.replace(/^@/,''))}
    async.eachSeries(names,function(nick,done){
      //tally everyone except ourselves
      if(that.conn.nick() !== nick)
        attendance.push(nick)
      done()
    },function(){
      //remove anyone that is gone
      async.filter(that.chanInfo[channel].attendance,function(nick,next){next((!inNames(nick)))},function(gone){
        gone.forEach(function(nick){delete that.chanInfo[channel][nick]})
      })
      async.filter(attendance,function(nick,next){next((inNames(nick)))},function(newbs){
        //update attendance
        that.chanInfo.attendance = newbs.sort()
        //log some action
        that.logger.info('<' + channel + '> attendance',that.chanInfo.attendance)
      })
    })
  })
}


/**
 * Connect to server
 * @param {object} opts Options
 * @param {function} connectedCb Callback once connected (aka welcome)
 */
Irc.prototype.connect = function(opts,connectedCb){
  var that = this
  //handle options
  var options = new ObjectManage()
  options.$load(that.defaultConnectOptions)
  options.$load(opts)
  //log some activity
  that.logger.info('connecting to ' + options.host + ':' + options.port)
  //setup irc-connect
  that.conn = irc.create({
    host: options.host,
    port: +options.port,
    secure: options.secure?'semi':false,
    nick: options.nick,
    realname: options.realname,
    ident: options.ident
  })
  //load irc-connect plugins
  that.conn.use(irc.pong,irc.motd,irc.names,ircChannels,ircCtcp,ircCtcp.dcc)
  if(that.options.version) that.conn.ctcpSetOption('version',that.options.version)
  //map welcome and error events to callback, if any
  if('function' === typeof connectedCb){
    that.conn.once('welcome',function(){connectedCb()})
    that.conn.once('error',function(err){connectedCb(err)})
  }

  /*
   * Setup events
   */
  //setup structures on welcome, since that means we (re)connected fresh
  that.conn.on('welcome',function(msg){
    //clear the failsafe reconnect timeout
    clearTimeout(that.connDog)
    //log the connect
    that.logger.info('Connected')
    //connInfo inherits main options
    that.connInfo = options.$get()
    //add the welcome message string for posterity
    that.connInfo.welcome = msg
    //channel state, object with channel as key
    that.chanInfo = {}
    //user state, object with nick as key
    that.userInfo = {}
  })
  //track our own joining
  that.conn.on('JOIN',function(event){
    //bail if it's not us
    if(that.conn.nick() !== event.nick) return
    that.connInfo.channel = event.params[0]
  })
  //Channel state and attendance tracking section
  ;['JOIN','PART','KICK','QUIT'].forEach(function(e){
    that.conn.on(e,function(event){that.updateAttendance(event.channel || that.connInfo.channel)})
  })
  //log nick changes
  that.conn.on('nick',function(nick){
    that.logger.info('Nickname set to "' + nick + '"')
  })
  //log motd events
  that.conn.on('motd', function(){
    this.motd.trim().split('\n').forEach(function(l){
      that.logger.info('<' + that.connInfo.host + ' MOTD> ' + l)
    })
  })
  //log NAMES events
  that.conn.on('names',function(channel,names){
    that.logger.info('<' + channel + ' NAMES>',names)
  })
  //log JOIN events
  that.conn.on('JOIN',function(event){
    that.logger.info('<' + event.params[0] + '> ' +
        ((that.conn.nick() === event.nick) ? '' : event.nick + ' ') +
        'joined'
    )
  })
  //log PART events
  that.conn.on('PART',function(event){
    that.logger.info('<' + event.params[0] + '> ' +
        ((that.conn.nick() === event.nick) ? '' : event.nick + ' ') +
        'parted'
    )
  })
  //log KICK events
  that.conn.on('KICK',function(event){
    that.logger.info('<' + event.params[0] + '> ' +
        ((that.conn.nick() === event.nick) ? '' : event.nick + ' ') +
        'kicked ' + ((that.conn.nick() === event.params[1]) ? 'me' : event.params[1]) +
        ((event.params[2]) ? ' (' + event.params[2] + ')' : '')
    )
  })
  //log QUIT events
  that.conn.on('QUIT',function(event){
    that.logger.info('<' + that.connInfo.host + '> ' +
        ((that.conn.nick() === event.nick) ? '' : event.nick + ' ') +
        'has quit' + ((event.params[0]) ? ' (' + event.params[0] + ')' : '')
    )
  })
  //log PRIVMSG events
  that.conn.on('PRIVMSG',function(event){
    //bail if it's a CTCP payload (handled by plugin, which may not be loaded)
    if(that.conn.isCtcp && that.conn.isCtcp(event)) return
    event.data = messageDecode(event.params.join(' '))
    that.logger.info('<' + event.nick + '>' + ((event.params[1]) ? ' ' + event.params[1] : ''))
    if(event.data.command) that.logger.info(' :data:',event.data)
  })
  //log NOTICE events
  that.conn.on('NOTICE',function(event){
    //bail if it's a CTCP payload (handled by plugin, which may not be loaded)
    if(that.conn.isCtcp && that.conn.isCtcp(event)) return
    event.data = messageDecode(event.params.join(' '))
    that.logger.info('<' + event.nick + ' NOTICE> ' + event.params.splice(1).join(' '))
    if(event.data.command) that.logger.info(' :data:',event.data)
  })

  //CTCP MESH support
  //CTCP DCC support
  //dcc chat
  var meshLogHdr = function(e,x){
    return ['<' + e.nick,'MESH',e.type,e.address,x].join(' ').trim() + '>'
  }
  that.conn.on('ctcp_mesh_hello_request',function(event){
    var rv = {}
    async.series([
      function(next){
        that.logger.info(meshLogHdr(event,'HELLO') + '...identifying')
        //db lookup here
        next()
      }
    ],
    function(err){
      if(err){
        rv.error = true
        rv.message = err
      }
      that.conn.meshHelloResponse(rv)
    })
  })

  //CTCP DCC support
  //dcc chat
  var dccLogHdr = function(e,x){
    return ['<' + e.nick,'DCC',e.type,e.handle,x].join(' ').trim() + '>'
  }
  that.conn.on('ctcp_dcc_chat_request',function(event){
    that.logger.info(dccLogHdr(event,'REQUEST') + '...accepting')
    that.conn.dccRequestAccept(event.handle)
  })
  that.conn.on('ctcp_dcc_chat_error',function(event){
    that.logger.info(dccLogHdr(event,'REQUEST') + '...ERROR: ' + event.message)
  })
  that.conn.on('ctcp_dcc_chat_connecting',function(event){
    that.logger.info(dccLogHdr(event,'REQUEST') + '...connecting')
  })
  that.conn.on('ctcp_dcc_chat_connect',function(event){
    that.logger.info(dccLogHdr(event,'REQUEST') + '...connected')
  })
  that.conn.on('ctcp_dcc_chat_message',function(event){
    event.data = messageDecode(event.message)
    that.logger.info(dccLogHdr(event) + ' ' + event.message)
    if(event.data.command) that.logger.info(' :data:',event.data)
  })
  that.conn.on('ctcp_dcc_chat_close',function(event){
    that.logger.info(dccLogHdr(event,'REQUEST') + '...closed')
  })
  //dcc send
  that.conn.on('ctcp_dcc_send_request',function(event){
    that.logger.info(dccLogHdr(event) + '...accepting')
    that.conn.dccRequestAccept(event.handle)
  })
  that.conn.on('ctcp_dcc_send_error',function(event){
    that.logger.info(dccLogHdr(event) + '...ERROR: ' + event.message)
  })
  that.conn.on('ctcp_dcc_send_connecting',function(event){
    that.logger.info(dccLogHdr(event) + '...connecting')
  })
  that.conn.on('ctcp_dcc_send_connect',function(event){
    that.logger.info(dccLogHdr(event) + '...connected')
  })
  that.conn.on('ctcp_dcc_send_open',function(event){
    that.logger.info(dccLogHdr(event) + '...creating file "' + event.filename + '"')
  })
  that.conn.on('ctcp_dcc_send_progress',function(event){
    that.logger.info(dccLogHdr(event) + '...wrote ' + event.wrote + (event.size?'/' + event.size:''))
  })
  that.conn.on('ctcp_dcc_send_close',function(event){
    that.logger.info(dccLogHdr(event) + '...closed')
  })
  that.conn.connect()
}


/**
 * Export object
 * @type {Irc}
 */
module.exports = Irc
