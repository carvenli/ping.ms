'use strict';
var debug = require('debug')('irc:ctcp')
var moment = require('moment')

var ctcpRequest = function(target,type,args){
  this.send(channel ? 'NAMES ' + channel : 'NAMES')
}
var ctcpResponse = function(target,type,params){
  var msg = [type]
  if(Array.isArray(params))
    params.forEach(function(p){msg.push(p)})
  else
    msg.push(params)
  var rv = 'NOTICE ' + target + ' :\u0001' + msg.join(' ') + '\u0001'
  console.log(rv)
  return rv
}

var onprivmsg = function(event){
  var nick = event.nick
  var target = event.params[0]
  var message = event.params[1]
  if(!(((message[0] === '+' && message[1] === '\x01') || message[0] === '\x01') && -1 < message.lastIndexOf('\x01')))
    return
  message = (message[0] === '+') ? message.slice(2) : message.slice(1)
  message = message.slice(0,message.indexOf('\x01'))
  var params = message.replace(/\s+/g,' ').split(' ')
  var type = params[0].toUpperCase()
  params = params.splice(1)
  debug('CTCP_REQUEST',nick,target,type,params)
  if('PING' === type){this.send(ctcpResponse(event.nick,type,params[0]))}
  if('TIME' === type){this.send(ctcpResponse(event.nick,type,moment().format('ddd MMM DD HH:mm:ss YYYY ZZ')))}
  if('VERSION' === type && this.version){this.send(ctcpResponse(event.nick,type,this.version))}
  this.emit('ctcp_request',{
    nick:event.nick,
    user:event.user,
    host:event.host,
    command:'CTCP_REQUEST',
    type: type,
    params: params
  })
}
var onnotice = function(event){
  console.log(event)
}

exports = module.exports = {
  __irc: function(client){
    client.ctcpRequest = ctcpRequest.bind(client)
//    client.ctcpResponse = ctcpResponse.bind(client)
    client
      .on('PRIVMSG', onprivmsg)
      .on('NOTICE', onnotice)
  }
}
