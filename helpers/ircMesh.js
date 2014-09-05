'use strict';
var async = require('async')
var debug = require('debug')('irc:ctcp:mesh')
var ip = require('ip')

var dnsHelper = require('../helpers/dns')



/**
 * Plugin constructor, contain reference to client
 * @constructor
 */
var IrcMesh = function(){
  var that = this
  that.options = {
    site: 'setme.tosomething.org'
  }
  that.registered = {}
  that.sessions = {}
  return that
}


/**
 * Get an option
 * @param {string} option Option
 * @return {*} Value (no filter, could return undefined, null, whatever)
 */
IrcMesh.prototype.getOption = function(option){
  var that = this
  var value = that.options[option]
  debug('getting options[\''+option+'\'] which is currently ' + value)
  return value
}


/**
 * Set an option
 * @param {string} option Option
 * @param {*} value Value
 */
IrcMesh.prototype.setOption = function(option,value){
  var that = this
  debug('setting options[\''+option+'\'] = ' + value)
  that.options[option] = value
}


/**
 * Send a DCC CHAT Request
 * @param {string} target Target
 * @return {void} fire escape
 */
IrcMesh.prototype.chatRequest = function(target){
  if(!target) return
  var that = this
  that.ctcpRequestSend(target,'DCC',['CHAT','chat',ip.toLong('127.6.6.6'),'1666'])
}


/**
 * Make sure we have at least an empty structure for this channel/nick combo
 * avoids having existence checks all over the place
 * @param {string} channel Channel
 * @param {string} nick Nick
 */
IrcMesh.prototype.ensureStruct = function(channel,nick){
  var that = this
  that.info[channel] = that.info[channel] || {}
  that.info[channel][nick] = that.info[channel][nick] || {}
}


/**
 * Add or mark a participant in the structure
 * @param {string} channel Channel
 * @param {string} nick Nick
 */
IrcMesh.prototype.addParticipant = function(channel,nick){
  var that = this
  that.ensureStruct(channel,nick)
  that.info[channel][nick].meshed = true
}


/**
 * Add or mark a non-participant in the structure
 * @param {string} channel Channel
 * @param {string} nick Nick
 */
IrcMesh.prototype.addNonparticipant = function(channel,nick){
  var that = this
  that.ensureStruct(channel,nick)
  that.info[channel][nick].meshed = false
}


/**
 * Send a MESH request
 * @param {string} nick Nick
 * @param {string} command Mesh Command
 * @param {object} append Additional properties to add to packet
 */
IrcMesh.prototype.sendMeshRequest = function(nick,command,append){
  var that = this
  if('object' !== typeof append) append = {}
  that.irc.ctcpRequest(nick,'MESH',Object.merge(append,{command:command.toUpperCase()}))
}


/**
 * Check participation
 * furthermore, if we don't know the nick we fire off a discovery cycle
 * @param {string} channel Channel
 * @param {string} nick Nick
 * @return {boolean} if we already know this nick and it's participating
 */
IrcMesh.prototype.isParticipant = function(channel,nick){
  var that = this
  that.ensureStruct(channel,nick)
  var exists = ('boolean' === typeof that.info[channel][nick].meshed)
  if(exists) return exists
  //if we don't have a meshed entry we haven't seen this nick (in this channel)
  //setup a response timeout to see who didn't reply
  if(that.info[channel][nick].timeout) clearTimeout(that.info[channel][nick].timeout)
  //grab an attendance snapshot
  var attendance = Object.create(that.irc.chanInfo[channel].attendance)
  var inAttendance = function(nick){return -1 < attendance.indexOf(nick)}
  async.filter(attendance,function(nick,next){next((!inAttendance(nick)))},function(newbs){
    attendance = newbs
    var inCurrentAttendance = function(nick){return -1 < that.irc.chanInfo[channel].attendance.indexOf(nick)}
    var isMeshed = function(nick){return (true === that.info[channel][nick].meshed)}
    that.info[channel][nick].timeout = setTimeout(function(){
      //clear any meshed that have left the channel since snapshot
      if(!inCurrentAttendance(nick)){
        delete(attendance[nick])
        delete(that.info[channel][nick])
      }
      //anyone in attendance that is not yet meshed, is alien
      async.filter(attendance,function(nick,next){next((!isMeshed(nick)))},function(aliens){
        aliens.forEach(function(nick){that.addNonparticipant(channel,nick)})
      })
    },5000)
    //send out all the HELLO's to newbs
    async.each(attendance,function(nick,next){
      if(!that.isParticipant(channel,nick)){ that.sendMeshRequest(nick,'hello',{channel: channel}) }
      next()
    })
  })
}


/**
 * Detect MESH Type
 * @param {object} event Event from CTCP plugin event
 * @return {string|boolean} Type, or false if not MESH
 */
IrcMesh.prototype.typeDetect = function(event){
  return ('MESH' === event.type) ? event.params[0].toUpperCase() : false
}

var address = null
var dnsResolve = function(host,done){
  if(!host){
    done('Passed host "' + host + '" evaluates false')
    return
  }
  dnsHelper.ip(host,function(err,addresses){
    if(err || !addresses.length){
      done('Could not resolve host "' + host + '"')
      return
    }
    if(1 < addresses.length)
      debug('WARNING: Host "' + host + '" has multiple address records:',addresses)
    address = addresses[0]
    done()
  })
}


/**
 * Event receiver for ctcp_request events
 * @param {string} type Type
 * @param {object} event Event from irc-connect-ctcp
 * @return {void} fire escape
 */
IrcMesh.prototype.meshRequestRecv = function(type,event){
  var that = this
  var params = {}
  if('HELLO' === type){
    that.clientOn('')
    if(event.data && event.nick && event.type){
      event.data.version = that.irc.options.version
      event.data.channel = that.irc.connInfo.channel
      that.irc.ctcpResponse(event.nick,event.type,event.data)
    }
    that.ctcpResponseSend(event.nick,type,params)
  }
}


/**
 * Event handler for ctcp_response events
 * @param {string} type Type
 * @param {object} event Event from irc-connect-ctcp
 * @return {void} fire escape
 */
IrcMesh.prototype.meshResponseRecv = function(type,event){
  var that = this
  if('HELLO' === type){
    if(event.data && event.data.channel && that.irc.options.version === event.data.version){
      //func you if you don't like this mapper hack
      var m = function(func){return that[func](event.data.channel,event.nick)}
      if(!m('isParticipant')) m('addParticipant')
    }
  }
}


/**
 * Event receiver for ctcp_request and ctcp_response events
 * @param {object} event Event from irc-connect-ctcp
 * @return {void} fire escape
 */
IrcMesh.prototype.eventReceiver = function(event){
  var that = this
  var type = that.typeDetect(event)
  //TODO decide which req/res we are routing to
  var handler = function(){}
  //bail on non-MESH or unhandled types
  if(!type || -1 === ['HELLO','SESSION','CMD'].indexOf(type)) return
  async.series([
      function(next){ dnsResolve(event,next) },
      function(next){
        that.sessions[address] = {
          nick: event.nick,
          authorized: false
        }
        debug('Session "' + address + '" created for "' + event.nick + '"')
        next()
      }
    ],function(err){
      if(err) debug(err)
      else {
        handler(type,event)
        /*
         that.emit('request',address)
         //set the session expiration in case it is never accepted (60 seconds)
         that.sessionTimeout[address] = setTimeout(function(){
         debug('Session ' + address + ' timed out')
         that.emit('error',address,{message:'TimedOut'})
         that.clearSession(address)
         },60000)
         */
      }
    }
  )
}


/**
 * Export plugin
 * @type {object}
 * @return {void} fire escape
 */
module.exports = {
  __irc: function(client){
    if(!client.isCtcp){
      debug('irc-connect-ctcp plugin not loaded, bailing')
      return false
    }
    //safety check complete
    var mesh = new IrcMesh()
    //bind upper emit/send
    mesh.clientVersion = client.getMainVersion.bind(client)
    mesh.clientEmit = client.emit.bind(client)
    mesh.clientSend = client.send.bind(client)
    //no need to double rebind these
    mesh.ctcpRequestSend = client.ctcpRequestSend
    mesh.ctcpResponseSend = client.ctcpResponseSend
    //client function bindery
    client.meshSetOption = mesh.setOption.bind(mesh)
    client.meshGetOption = mesh.getOption.bind(mesh)
    client.meshRequestAccept = mesh.requestAccept.bind(mesh)
    client.meshChatWrite = mesh.chatWrite.bind(mesh)
    //client event hooks
    client
      .on('ctcp_request',mesh.eventReceiver.bind(mesh))
    client
      .on('ctcp_response',mesh.eventReceiver.bind(mesh))

    debug('Plugin registered')
  }
}
