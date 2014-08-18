'use strict';
var async = require('async')
var debug = require('debug')('irc:ctcp:mesh')

var propCopy = function(obj){return JSON.parse(JSON.stringify(obj))}



/**
 * Plugin constructor, contain reference to client
 * @param {Irc} irc Reference to Irc helper object
 * @constructor
 */
var CtcpMesh = function(irc){
  var that = this
  that.irc = irc
  that.info = {}
}

CtcpMesh.prototype.ensureStruct = function(channel,nick){
  var that = this
  that.info[channel] = that.info[channel] || {}
  that.info[channel][nick] = that.info[channel][nick] || {}
}

CtcpMesh.prototype.addParticipant = function(channel,nick){
  var that = this
  that.ensureStruct(channel,nick)
  that.info[channel][nick].meshed = true
}

CtcpMesh.prototype.addNonparticipant = function(channel,nick){
  var that = this
  that.ensureStruct(channel,nick)
  that.info[channel][nick].meshed = false
}

CtcpMesh.prototype.sendMeshRequest = function(nick,command,append){
  var that = this
  if('object' !== typeof append) append = {}
  that.irc.ctcpRequest(nick,'MESH',Object.merge(append,{command:command.toUpperCase()}))
}

CtcpMesh.prototype.isParticipant = function(channel,nick){
  var that = this
  that.ensureStruct(channel,nick)
  var exists = ('boolean' === typeof that.info[channel][nick].meshed)
  if(exists) return exists
  //if we don't have a meshed entry we haven't seen this nick (in this channel)
  //setup a response timeout to see who didn't reply
  if(that.info[channel][nick].timeout) clearTimeout(that.info[channel][nick].timeout)
  //grab an attendance snapshot
  var attendance = propCopy(that.irc.chanInfo[channel].attendance)
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

CtcpMesh.prototype.getMeshCommand = function(event){
  return ('MESH' === event.type && event.data.command) ? event.data.command.toUpperCase() : false
}

CtcpMesh.prototype.register = function(){
  var that = this
  if(!that.irc.conn.ctcp){
    debug('irc-connect CTCP plugin not loaded, bailing')
    return false
  }
  /*
   * CTCP MESH handlers
   */
  //MESH HELLO response
  that.irc.conn.on('ctcp_response',function(event){
    if('HELLO' !== that.getMeshCommand(event)) return
    if(event.data && event.data.channel && that.irc.options.get('version') === event.data.version){
      //func you if you don't like this mapper hack
      var m = function(func){return that[func](event.data.channel,event.nick)}
      if(!m('isParticipant')) m('addParticipant')
    }
  })
  //MESH HELLO request
  that.irc.conn.on('ctcp_request',function(event){
    if('HELLO' !== that.getMeshCommand(event)) return
    if(event.data && event.nick && event.type){
      event.data.version = that.irc.options.get('version')
      event.data.channel = that.irc.connInfo.channel
      that.irc.ctcpResponse(event.nick,event.type,event.data)
    }
  })
  debug('registered')
  return that
}


/**
 * Export plugin
 * @type {CtcpMesh}
 */
module.exports = CtcpMesh
