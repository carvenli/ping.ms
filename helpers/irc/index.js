'use strict';
var async = require('async')
var EventEmitter = require('events').EventEmitter
var ircChannels = require('irc-channels')
var irc = require('irc-connect')
var ObjectManage = require('object-manage')
var util = require('util')

var Logger = require('../../helpers/logger')
var ircCtcp = require('./ctcp')

//JSON handlers


/**
 * messageEncode
 * @param {string,object} message Message string or object
 * @return {string} Message coerced to string
 */
var messageEncode = function(message){
  if('object' === typeof message)
    message = 'JSON' + JSON.stringify(message).replace(/\r\n/,'')
  return message.toString()
}


/**
 * messageDecode
 * @param {string} message Message string
 * @return {object} Data parsed from string, or empty object
 */
var messageDecode = function(message){
  var data = {}
  if(message){
    if('JSON{' === message.substring(0,5)){
      data = JSON.parse(message.substring(4))
    }
  }
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
  that.options.load(that.defaultOptions)
  that.options.load(opts)
  //Setup logger
  that.logger = Logger.create(that.options.get('tag'))
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
 * @type {{nick: string, user: string, realname: string, server: string, port: number, secure: boolean, capab: boolean, sasl: boolean, saslUsername: string, password: string, retryCount: number, retryWait: number}}
 */
Irc.prototype.defaultConnectOptions = {
  tag: 'IRC'
}


/**
 * Set nickname on IRC
 * @param {function} done Callback
 */
Irc.prototype.nick = function(nick,done){
  var that = this
  that.conn.once('nick',function(nick){
    that.logger.info('Nickname set to "' + nick + '"')
    done()
  })
  that.conn.send('NICK ',nick)
}


/**
 * Join a channel
 * @param {string} channel Channel to join (include the '#')
 * @param {function} joinedCb Callback once joined
 */
Irc.prototype.join = function(channel,joinedCb){
  var that = this
/*
  //init the channel structure for this channel
  that.once(['join',channel].join(':'),function(o){
    if(that.conn.nickname !== event.nick) return
    that.conn.chan[channel] = {names:[],meshed:[],others:[]}
    var ev = 'names:' + channel
    that.removeAllListeners(ev)
    that.on(ev,function(o){
      var names = o.names
      //setup a response timeout to see who didn't reply
      if(that._meshTimeout) clearTimeout(that._meshTimeout)
      that._meshTimeout = setTimeout(function(){
        //clear any meshed that have left the channel
        if('object' === typeof that.getChannelInfo(channel)){
          if(!that.getChannelInfo(channel).meshed) that.setChannelInfo(channel,'meshed',[])
          async.filter(that.getChannelInfo(channel).meshed,function(name,next){
            next(-1 !== names.indexOf(name))
          },function(results){
            that.setChannelInfo(channel,'meshed',results)
          })
        }
        //anyone in names that is not now in meshed, is alien
        async.filter(names,function(name,next){
          next((!that.isMemberInChannelInfo(channel,'meshed',name)))
        },function(results){
          that.setChannelInfo([channel,'others'],results)
          that.emit('attendance:' + channel,that.getChannelInfo(channel).meshed)
        })
      },5000)
      async.each(o.names,function(name,next){
        if(
          (!that.isMemberInChannelInfo(channel,'meshed',name)) &&
          (!that.isMemberInChannelInfo(channel,'others',name))
          ){ that.ctcpRequest(name,'MESH',{command:'hello',channel:channel}) }
        next()
      })
    })
  })
*/
  that.conn.on('JOIN',function(event){
    if(that.connInfo.nick !== event.nick) return
    that.connInfo.channel = event.params[0]
    if('function' === typeof joinedCb){
      joinedCb()
    }
  })
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
    that.once(['part',channel,that.connInfo.nick].join(':'),partedCb)
  that.ircClient.irc.part(channel)
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
 * Send a PRIVMSG
 * @param {string} target Target (nick or channel)
 * @param {string} message Message
 * @param {boolean} forcePushBack See ircFactory docs
 */
Irc.prototype.privmsg = function(target,message,forcePushBack){
  message = messageEncode(message)
  this.ircClient.irc.privmsg(target,message,forcePushBack)
}


/**
 * Send a CTCP Request (this is missing from ircFactory?)
 * @param {string} target Target (nick or channel)
 * @param {string} type Type
 * @param {string} message Message
 * @param {boolean} forcePushBack See ircFactory docs
 */
Irc.prototype.ctcpRequest = function(target,type,message,forcePushBack){
  var that = this
  if('boolean' === typeof message){
    forcePushBack = message
    message = null
  }
  forcePushBack = forcePushBack || false
  message = messageEncode(message)
  that.logger.warning('>' + target + ' CTCP_REQUEST:' + type + '<' + ((message) ? ' ' + message : ''))
  var msg = '\x01' + type.toUpperCase() + (('string' === typeof message) ? ' ' + message : '') + '\x01'
  that.ircClient.irc.raw(['PRIVMSG',target,msg])
  if(forcePushBack){
    that.ircClient._parseLine(
        ':' + that.ircClient._nick + '!' + that.ircClient._user + '@' + that.ircClient._hostname +
        ' PRIVMSG ' + target +
        ' :' + msg
    )
  }
}


/**
 * Send a CTCP Response
 * @param {string} target Target (nick or channel)
 * @param {string} type Type
 * @param {string} message Message
 * @param {boolean} forcePushBack See ircFactory docs
 */
Irc.prototype.ctcpResponse = function(target,type,message,forcePushBack){
  var that = this
  if('boolean' === typeof message){
    forcePushBack = message
    message = null
  }
  forcePushBack = forcePushBack || false
  message = messageEncode(message)
  that.logger.warning('>' + target + ' CTCP_RESPONSE:' + type + '<' + ((message) ? ' ' + message : ''))
  that.ircClient.irc.ctcp(target,type,message,forcePushBack)
}

var _connect = function(that,options,connectedCb){
  that.logger.info('connecting to ' + options.get('server') + ':' + options.get('port'))
  that.conn = irc.connect(
    options.get('server'),
    {
      name: options.get('name') || options.get('nick'),
      port: +options.get('port')
    }
  )
  that.conn.use(irc.pong,irc.motd,irc.names,ircChannels,ircCtcp)
  //map RPL_WELCOME event
  that.conn.once('welcome',function(){
    if('function' === typeof connectedCb) connectedCb()
  })
  that.conn.once('error',function(err){
    console.log('ERROR:',err)
    if('function' === typeof connectedCb) connectedCb(err)
  })
}

Irc.prototype.updateAttendance = function(channel){
  var that = this
  var attendance = []
  var names = that.conn.names[channel] || []
  async.eachSeries(names,function(name,done){
    //strip "op" status
    name = name.replace(/^@/,'')
    //skip ourselves
    if(that.connInfo.nick !== name)
      attendance.push(name)
    done()
  },function(){
    that.logger.info('<' + channel + '> attendance',attendance.sort())
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
  options.load(that.defaultConnectOptions)
  options.load(opts)
  _connect(that,options,connectedCb)
  that.conn.on('data',function(event,raw){that.logger.warning(raw)})
  that.conn.on('welcome',function(msg){
    clearTimeout(that.connDog) // clear the failsafe reconnect timeout
    that.logger.info('Connected')
    that.connInfo = options.get()
    that.connInfo.welcome = msg
    that.chanInfo = {}
    that.userInfo = {}
  })
  that.conn.on('nick',function(nick){
    that.connInfo.nick = nick
  })
  that.conn.on('motd', function(){
    this.motd.trim().split('\n').forEach(function(l){
      that.logger.info('<' + that.connInfo.server + ' MOTD> ' + l)
    })
  })
  //map NOTICE events
  that.conn.on('NOTICE',function(event){
    that.logger.info('<' + event.nick + ' NOTICE> ' + event.params.join(' '))
  })
  that.conn.on('ctcp_request',function(event){
    console.log(event)
  })
  /*
   * Channel state and attendance tracking section
   */

  //map channel events
  that.conn.on('names',function(channel,names){
    that.logger.info('<' + channel + ' NAMES>',names)
  })
  that.conn.on('JOIN',function(event){
    that.logger.info('<' + event.params[0] + '> ' +
        ((that.connInfo.nick === event.nick) ? '' : event.nick + ' ') +
        'joined'
    )
  })
  that.conn.on('PART',function(event){
    that.logger.info('<' + event.params[0] + '> ' +
        ((that.connInfo.nick === event.nick) ? '' : event.nick + ' ') +
        'parted'
    )
  })
  that.conn.on('KICK',function(event){
    that.logger.info('<' + event.params[0] + '> ' +
        ((that.connInfo.nick === event.nick) ? '' : event.nick + ' ') +
        'kicked ' + ((that.connInfo.nick === event.params[1]) ? 'me' : event.params[1]) +
        ((event.params[2]) ? ' (' + event.params[2] + ')' : '')
    )
  })
  that.conn.on('QUIT',function(event){
    that.logger.info('<' + that.connInfo.server + '> ' +
        ((that.connInfo.nick === event.nick) ? '' : event.nick + ' ') +
        'has quit' + ((event.params[0]) ? ' (' + event.params[0] + ')' : '')
    )
  })
  ;['JOIN','PART','KICK','QUIT'].forEach(function(e){that.conn.on(e,function(){that.updateAttendance(that.connInfo.channel)})})

  //map PRIVMSG events
  that.conn.on('PRIVMSG',function(event){
      if(-1 < event.params[1].lastIndexOf('\u0001')) return
      event.data = messageDecode(event.params[1])
      that.logger.info('<' + event.nick + '>' + ((event.params[1]) ? ' ' + event.params[1] : ''))
      if(event.data.command) that.logger.info(' :data:',event.data)
    }
  )
/*
  //FUCK THIS
  that.on('privmsg',function(o){
    if(o.message.match(/^dump$/i))
      this.privmsg(o.source,{a:that.getChannelInfo(o.channel),b:that.conn.chan[o.channel]})
  })

 /*
 //CTCP handlers
 that.on('ctcp_response:mesh:hello',function(o){
 if(o.data && o.data.channel && config.get('version') === o.data.version){
 if(!that.isMemberInChannelInfo(o.data.channel,'meshed',event.nick))
 that.pushChannelInfo(o.data.channel,'meshed',event.nick)
 that.deleteValueFromChannelInfo(o.data.channel,'others',event.nick)
 }
 })
 that.on('ctcp_request:mesh:hello',function(o){
 if(o.data && event.nick && o.type){
 o.data.version = config.get('version')
 that.ctcpResponse(event.nick,o.type,o.data)
 }
 })
 //standard CTCP stuff from here down
 that.on('ctcp_request:ping',function(o){
 that.ctcpResponse(event.nick,o.type,o.message)
 })
 that.on('ctcp_request:version',function(o){
 that.ctcpResponse(event.nick,o.type,[that.options.appName,config.get('version'),'nodejs'].join(':'))
 })
 that.on('ctcp_request:time',function(o){
 that.ctcpResponse(event.nick,o.type,moment().format('ddd MMM DD HH:mm:ss YYYY ZZ'))
 })
 //include the DCC plugin
 //require('./ctcpDcc').register(that)

  //map CTCP_REQUEST event
  that.ircApi.hookEvent(ircHandle,'ctcp_request',
    function(o){
      o.handle = ircHandle
      o.source = event.nick.replace(/^@/,'')
      o.data = messageDecode(o.message)
      that.logger.info('<' + o.source + ' CTCP_REQUEST:' + o.type + '>' + ((o.message) ? ' ' + o.message : ''))
      if(o.data.command)
        that.emit(['ctcp_request',o.type.toLowerCase(),o.data.command].join(':'),o)
      that.emit('ctcp_request:' + o.type.toLowerCase(),o)
      that.emit('ctcp_request',o)
    }
  )

  //map CTCP_RESPONSE event
  that.ircApi.hookEvent(ircHandle,'ctcp_response',
    function(o){
      o.handle = ircHandle
      o.source = event.nick.replace(/^@/,'')
      o.data = messageDecode(o.message)
      that.logger.info('<' + o.source + ' CTCP_RESPONSE:' + o.type + '>' + ((o.message) ? ' ' + o.message : ''))
      if(o.data.command)
        that.emit(['ctcp_response',o.type.toLowerCase(),o.data.command].join(':'),o)
      that.emit('ctcp_response:' + o.type.toLowerCase(),o)
      that.emit('ctcp_response',o)
    }
  )
*/
}


/**
 * Export object
 * @type {Irc}
 */
module.exports = Irc
