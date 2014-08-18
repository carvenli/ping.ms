'use strict';
var debug = require('debug')('irc:ctcp')
var moment = require('moment')

var CtcpPlugin = function(client){
  var that = this
  that.client = client
}
CtcpPlugin.prototype.payloadEncode = function(direction,target,type,params){
  var cmd = ('req' === direction) ? 'PRIVMSG' : 'NOTICE'
  var msg = [type]
  if(Array.isArray(params)) params.forEach(function(p){msg.push(p)})
  else msg.push(params)
  var rv = [cmd,target,':\u0001' + msg.join(' ') + '\u0001'].join(' ')
  console.log(rv)
  return rv
}
CtcpPlugin.prototype.payloadDecode = function(event){
  var rv = {}
  rv.nick = event.nick
  rv.target = event.params[0]
  var message = event.params[1]
  if(!(((message[0] === '+' && message[1] === '\x01') || message[0] === '\x01') && -1 < message.lastIndexOf('\x01')))
    return false
  message = (message[0] === '+') ? message.slice(2) : message.slice(1)
  message = message.slice(0,message.indexOf('\x01'))
  var params = message.replace(/\s+/g,' ').split(' ')
  var type = params[0].toUpperCase()
  params = params.splice(1)
  rv.type = type
  rv.params = params
  rv.raw = message
  return rv
}
CtcpPlugin.prototype.sendRequest = function(target,type,params){
  this.client.send(this.payloadEncode('req',target,type,params))
}
CtcpPlugin.prototype.sendResponse = function(target,type,params){
  this.client.send(this.payloadEncode('res',target,type,params))
}
CtcpPlugin.prototype.recvRequest = function(event){
  var c = this.payloadDecode(event)
  if(!c) return
  debug('CTCP_REQUEST',c.nick,c.target,c.type,c.params)
  if('PING' === c.type){this.sendResponse(c.nick,c.type,c.params[0])}
  if('TIME' === c.type){this.sendResponse(c.nick,c.type,moment().format('ddd MMM DD HH:mm:ss YYYY ZZ'))}
  if('VERSION' === c.type && this.client.version){this.sendResponse(c.nick,c.type,this.client.version)}
  this.client.emit('ctcp_request',{
    nick:c.nick,
    user:c.user,
    host:c.host,
    command:'CTCP_REQUEST',
    type: c.type,
    params: c.params
  })
}
CtcpPlugin.prototype.recvResponse = function(event){
  var c = this.payloadDecode(event)
  if(!c) return
  debug('CTCP_RESPONSE',c.nick,c.target,c.type,c.params)
  this.client.emit('ctcp_response',{
    nick:c.nick,
    user:c.user,
    host:c.host,
    command:'CTCP_RESPONSE',
    type: c.type,
    params: c.params
  })
}

exports = module.exports = {
  __irc: function(client){
    var ctcp = new CtcpPlugin(client)
    client.sendCtcpRequest = ctcp.sendRequest.bind(ctcp)
    client.sendCtcpResponse = ctcp.sendResponse.bind(ctcp)
    client
      .on('PRIVMSG', ctcp.recvRequest.bind(ctcp))
      .on('NOTICE', ctcp.recvResponse.bind(ctcp))
  }
}
