'use strict';
var async = require('async')
var EventEmitter = require('events').EventEmitter
var ircChannels = require('irc-channels')
var irc = require('irc-connect')
var ObjectManage = require('object-manage')
var util = require('util')

var Logger = require('../../helpers/logger')
var ircCtcp = require('./ctcp')


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
  that.options.load(that.defaultOptions)
  that.options.load(opts)
  //setup logger
  that.logger = Logger.create(that.options.get('tag'))
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
 * @type {{nick: string, user: string, realname: string, server: string, port: number, secure: boolean, capab: boolean, sasl: boolean, saslUsername: string, password: string, retryCount: number, retryWait: number}}
 */
Irc.prototype.defaultConnectOptions = {
  server: 'localhost',
  port: 6667,
  secure: false,
  nick: 'SetANick',
  name: 'set_a_nick'
}


/**
 * Set nickname on IRC
 * @param {string} nick Desired nickname
 * @param {function} done Callback
 */
Irc.prototype.nick = function(nick,done){
  var that = this
  //install server response handler, can return nickname other than requested (on clash, server bad mood, etc)
  that.conn.once('nick',function(nick){
    that.logger.info('Nickname set to "' + nick + '"')
    done()
  })
  //send the nickname change command to server
  that.conn.send('NICK ',nick)
}


/**
 * Join a channel
 * @param {string} channel Channel to join (include the '#')
 * @param {function} joinedCb Callback once joined
 */
Irc.prototype.join = function(channel,joinedCb){
  var that = this
  //install the callback handler
  that.conn.once('JOIN',function(event){
    //bail if it's not us
    if(that.connInfo.nick !== event.nick) return
    if('function' === typeof joinedCb) joinedCb()
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
    that.once('PART',function(){
      //channel
      //that.connInfo.nick
      partedCb()
    })
  that.client.send('PART ' + channel)
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
  this.client.send(['PRIVMSG',target,':' + messageEncode(message)])
}


/**
 * Send a CTCP Request with any objects converted to JSON
 * @param {string} target Target (nick or channel)
 * @param {string} type Type
 * @param {string} message Message
 */
Irc.prototype.ctcpRequest = function(target,type,message){
  this.client.sendCtcpRequest(target,type,messageEncode(message))
}


/**
 * Send a CTCP Response with any objects converted to JSON
 * @param {string} target Target (nick or channel)
 * @param {string} type Type
 * @param {string} message Message
 */
Irc.prototype.ctcpResponse = function(target,type,message){
  this.client.sendCtcpResponse(target,type,messageEncode(message))
}


/**
 * Updates the internal channel attendance
 * @param {string} channel
 */
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
/*
    //init the channel structure for this channel
    that.once('join',function(event){
      if(that.conn.nickname !== event.nick) return
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
            ){ that.conn.sendCtcpRequest(name,'MESH',{command:'hello',channel:channel}) }
          next()
        })
      })
    })
*/
    //log this attendance update
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
  //log some activity
  that.logger.info('connecting to ' + options.get('server') + ':' + options.get('port'))
  //setup irc-connect (connect is also a constructor)
  that.conn = irc.connect(
    options.get('server'),
    {
      name: options.get('name') || options.get('nick'),
      port: +options.get('port')
    }
  )
  //load irc-connect plugins
  that.conn.use(irc.pong,irc.motd,irc.names,ircChannels,ircCtcp)
  //map welcome and error events to callback, if any
  if('function' === typeof connectedCb){
    that.conn.once('welcome',function(){connectedCb()})
    that.conn.once('error',function(err){connectedCb(err)})
  }

  /*
   * Setup events
   */
  //log raw incoming for debug
  //that.conn.on('data',function(event,raw){that.logger.warning(raw)})
  //setup structures on welcome, since that means we (re)connected fresh
  that.conn.on('welcome',function(msg){
    //clear the failsafe reconnect timeout
    clearTimeout(that.connDog)
    //log the connect
    that.logger.info('Connected')
    //connInfo inherits main options
    that.connInfo = options.get()
    //add the welcome message string for posterity
    that.connInfo.welcome = msg
    //channel state, object with channel as key
    that.chanInfo = {}
    //user state, object with nick as key
    that.userInfo = {}
  })
  //track nick changes in connInfo
  that.conn.on('nick',function(nick){
    that.connInfo.nick = nick
  })
  //track our own joining
  that.conn.on('JOIN',function(event){
    //bail if it's not us
    if(that.connInfo.nick !== event.nick) return
    that.connInfo.channel = event.params[0]
    if('function' === typeof joinedCb){
      joinedCb()
    }
  })
  //Channel state and attendance tracking section
  ;['JOIN','PART','KICK','QUIT'].forEach(function(e){
    that.conn.on(e,function(event){that.updateAttendance(event.channel || that.connInfo.channel)})
  })
  //log motd events
  that.conn.on('motd', function(){
    this.motd.trim().split('\n').forEach(function(l){
      that.logger.info('<' + that.connInfo.server + ' MOTD> ' + l)
    })
  })
  //log NAMES events
  that.conn.on('names',function(channel,names){
    that.logger.info('<' + channel + ' NAMES>',names)
  })
  //log JOIN events
  that.conn.on('JOIN',function(event){
    that.logger.info('<' + event.params[0] + '> ' +
        ((that.connInfo.nick === event.nick) ? '' : event.nick + ' ') +
        'joined'
    )
  })
  //log PART events
  that.conn.on('PART',function(event){
    that.logger.info('<' + event.params[0] + '> ' +
        ((that.connInfo.nick === event.nick) ? '' : event.nick + ' ') +
        'parted'
    )
  })
  //log KICK events
  that.conn.on('KICK',function(event){
    that.logger.info('<' + event.params[0] + '> ' +
        ((that.connInfo.nick === event.nick) ? '' : event.nick + ' ') +
        'kicked ' + ((that.connInfo.nick === event.params[1]) ? 'me' : event.params[1]) +
        ((event.params[2]) ? ' (' + event.params[2] + ')' : '')
    )
  })
  //log QUIT events
  that.conn.on('QUIT',function(event){
    that.logger.info('<' + that.connInfo.server + '> ' +
        ((that.connInfo.nick === event.nick) ? '' : event.nick + ' ') +
        'has quit' + ((event.params[0]) ? ' (' + event.params[0] + ')' : '')
    )
  })
  //log PRIVMSG events
  that.conn.on('PRIVMSG',function(event){
    //bail if it's a CTCP payload (handled by plugin, which may not be loaded)
    if('function' === typeof that.conn.isCtcp && that.conn.isCtcp(event)) return
    event.data = messageDecode(event.params.join(' '))
    that.logger.info('<' + event.nick + '>' + ((event.params[1]) ? ' ' + event.params[1] : ''))
    if(event.data.command) that.logger.info(' :data:',event.data)
  })
  //log NOTICE events
  that.conn.on('NOTICE',function(event){
    //bail if it's a CTCP payload (handled by plugin, which may not be loaded)
    if('function' === typeof that.conn.isCtcp && that.conn.isCtcp(event)) return
    event.data = messageDecode(event.params.join(' '))
    that.logger.info('<' + event.nick + ' NOTICE> ' + event.params.join(' '))
    if(event.data.command) that.logger.info(' :data:',event.data)
  })
  //include the CTCP DCC plugin
  //require('./ctcpDcc').register(that)
  //log ctcp_request events (won't be emitted if plugin is not loaded)
  that.conn.on('ctcp_request',
    function(event){
      event.data = messageDecode(event.message)
      that.logger.info('<' + event.nick + ' CTCP_REQUEST:' + event.type + '>' +
        ((event.message) ? ' ' + event.message : '')
      )
      if(event.data.command) that.logger.info(' :data:',event.data)
    }
  )

  //log ctcp_response events (won't be emitted if plugin is not loaded)
  that.conn.on('ctcp_response',
    function(event){
      event.data = messageDecode(event.message)
      that.logger.info('<' + event.nick + ' CTCP_RESPONSE:' + event.type + '>' +
        ((event.message) ? ' ' + event.message : '')
      )
      if(event.data.command) that.logger.info(' :data:',event.data)
    }
  )

  /*
   * CTCP MESH handlers
   */
  //MESH HELLO response
  that.on('ctcp_response',function(event){
    if('MESH' !== event.type || 'HELLO' !== event.params[0].toUpperCase()) return
    event.data = messageDecode(event.message)
    if(event.data && event.data.channel && that.options.get('version') === event.data.version){
      if(!that.isMemberInChannelInfo(event.data.channel,'meshed',event.nick))
        that.pushChannelInfo(event.data.channel,'meshed',event.nick)
      that.deleteValueFromChannelInfo(event.data.channel,'others',event.nick)
    }
  })
  //MESH HELLO request
  that.on('ctcp_request',function(event){
    if('MESH' !== event.type || 'HELLO' !== event.params[0].toUpperCase()) return
    event.data = messageDecode(event.message)
    if(event.data && event.nick && event.type){
      event.data.version = that.options.version
      that.ctcpResponse(event.nick,event.type,event.data)
    }
  })
}


/**
 * Export object
 * @type {Irc}
 */
module.exports = Irc
