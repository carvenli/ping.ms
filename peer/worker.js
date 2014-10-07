'use strict';
var amp = require('amp')
var AmpMessage = require('amp-message')
var axon = require('axon')
var dns = require('dns')
var P = require('bluebird')
var worker = require('infant').worker
var net = require('net')
var netPing = require('net-ping')
var promisePipe = require('promisepipe')
var validator = require('validator')

var restServer = axon.socket('rep')

//here we are going to allow half open sockets to be happen so that the client
//can send us the request and close their stream so we know we have the whole
//payload (which will be very small) but will ease the task of parsing the req
//especially since we dont need any other data from the client
var streamServer = net.createServer({allowHalfOpen: true})

var config = require('../config')

//setup a ping session for ipv4 and ipv6 (might want to move these settings to
//the config but i dont know if its necessary, just wait until it is)
var ping4 = netPing.createSession({ttl: 64, timeout: 1000})
var ping6 = netPing.createSession({
  ttl: 64,
  timeout: 1000,
  networkProtocol: netPing.NetworkProtocol.IPv6
})

//make some promises
P.promisifyAll(restServer)
P.promisifyAll(streamServer)
P.promisifyAll(dns)
P.promisifyAll(ping4)
P.promisifyAll(ping6)

//what do we need?
// - arbiter can make RESTFUL like requests such as: resolve, ptr, alive, etc
// - arbiter can open result streams: ping results, trace, results
//what do we need to listen for
// - axon should be listening on a rep socket for the restful operations
// - axon should be listening for a special request to open a result stream

//i remember the whole idea of connecting to the server but in todays age
//it seems that requiring someone to open a port on a firewall is not a
//huge task to ask, we could proxy these requests later too

//the streams are the most important and are outside of the control flow
//i think that this will require the peer to listen on two ports

// 1) axon will listen on 3004 for requests
// 2) a raw net server will be used for the bi direction streaming since it
//    seems like axon doesnt support the pattern i want

//setup the whole restful server right here (why not its short and sweet)
var restCommands = {
  /**
   * DNS Lookups (IP4 and IP6)
   * @param {object} req
   * @param {function} reply
   */
  resolve: function(req,reply){
    P.try(function(){
      if(!req.domain || !validator.isFQDN(req.domain))
        throw new Error('Invalid domain name')
    }).then(function(){
      return dns.resolveAsync(req.domain)
    })
    .then(function(results){
      reply(null,results)
    })
    .catch(function(err){
      reply('Could not lookup domain: ' + err)
    })
  },
  /**
   * PTR Lookups (IP4 and IP6)
   * @param {object} req
   * @param {function} reply
   */
  ptr: function(req,reply){
    P.try(function(){
      if(!req.ip) throw new Error('No IP provided')
      if(!validator.isIP(req.ip))
        throw new Error('Invalid IP provided')
    }).then(function(){
      return dns.reverseAsync(req.ip)
    })
    .then(function(results){
      reply(null,results)
    })
    .catch(function(err){
      reply('could not lookup PTR: ' + err)
    })
  },
  /**
   * Check if host is alive (IP4 and IP6)
   * @param {object} req
   * @param {function} reply
   */
  alive: function(req,reply){
    P.try(function(){
      if(!req.ip) throw new Error('No IP provided')
      if(!validator.isIP(req.ip))
        throw new Error('Invalid IP provided')
    }).then(function(){
      var ping
      if(validator.isIP(req.ip,4))
        ping = ping4
      if(validator.isIP(req.ip,6))
        ping = ping6
      if(!ping)
        throw new Error('Could not find valid ping backend (bad ip)')
      return ping.pingHostAsync(req.ip)
    }).then(function(){
      reply(null,true)
    }).catch(netPing.RequestTimedOutError,function(){
      reply(null,false)
    }).catch(function(err){
      reply(new Error('Host alive check failed: ' + err))
    })
  }
}


//setup a basic router for incoming messages on the rest server
restServer.on('message',function(cmd,req,reply){
  if(!restCommands[cmd])
    return reply(new Error('Unsupported command'))
  //call the command
  restCommands[cmd](req,reply)
})


/**
 * Parse a new stream connection and return a promise that will resolve
 *   with the resulting request
 * @param {net.Socket} socket
 * @return {P}
 */
var parseStreamConnection = function(socket){
  return new P(function(resolve,reject){
    //parse out the request early here and setup our promise chain
    var req
    //note: i found this sweet stream parser inside of AMP undocumented used in
    //axon which was basically the point of using axon but it makes it easier
    //having this socket serve a more specific purpose, i think it could be
    //upgraded to do traceroutes without much hassle and its already good for
    //ipv6 support
    var parser = new amp.Stream()
    parser.once('data',function(data){
      req = new AmpMessage(data).shift()
    })
    //once the pipe finishes we know we have the request so lets start pinging
    promisePipe(socket,parser)
      .then(function(){
        if('object' !== typeof req)
          reject('Invalid request sent to open result stream')
        else
        resolve(req)
      }).catch(reject)
  })
}


/**
 * Create a result stream session, with a callback handler that is all promise
 *  based
 * @param {string} type
 * @param {net.Socket} socket
 * @param {object} req
 * @param {function} onSend
 * @return {P}
 */
var session = function(type,socket,req,onSend){
  var ping
  if(!req.ip) throw new Error('No IP provided to ' + type)
  if(!validator.isIP(req.ip))
    throw new Error('Invalid IP address')
  if(req.packets && !validator.isNumeric(req.packets))
    throw new Error('Invalid duration')
  //default to 4 packets
  if(!req.packets) req.packets = 4
  //get the correct ping instance
  if(validator.isIP(req.ip,4))
    ping = ping4
  if(validator.isIP(req.ip,6))
    ping = ping6
  //send the first ping
  return new P(function(resolve,reject){
    var sentCount = 0
    var send = function(ip){
      sentCount++
      //if we have packets left just set another timeout
      if(sentCount < req.packets)
        setTimeout(function(){send(ip)},1000)
      //if we got here send a new ping packet and write the result to the stream
      onSend(ping,ip,sentCount,req.packets).then(resolve,reject)
    }
    //get the party started
    send(req.ip)
  })
}


/**
 * Setup a new ping session and return a promise that is fulfilled when the
 *  duration has been completed
 * @param {net.Socket} socket
 * @param {object} req
 * @return {P}
 */
var pingSession = function(socket,req){
  return session('ping',socket,req,function(ping,ip,count,max){
    return ping.pingHostAsync(ip)
      .then(function(result){
        var msg = new AmpMessage()
        msg.push(null)
        msg.push({
          target: result[0],
          sent: result[1],
          received: result[2],
          ms: result[2] - result[1]
        })
        if(count < max)
          socket.write(msg.toBuffer())
        else
          socket.end(msg.toBuffer())
      })
  })
}


/**
 * Run a single traceroute and return the result
 * @param {netPing} ping
 * @param {string} ip
 * @return {P}
 */
var runTrace = function(ping,ip){
  return new P(function(resolve,reject){
    var result = []
    ping.traceRoute(
      ip,
      function(err,target,ttl,sent,received){
        result.push({
          error: err,
          target: target,
          ttl: ttl,
          sent: sent,
          received: received,
          ms: received - sent
        })
      },
      function(err){
        if(err) reject(err)
        else resolve(result)
      })
  })
}


/**
 * Setup a new trace session and return a promise that is fulfilled when the
 *  duration has been completed
 * @param {net.Socket} socket
 * @param {object} req
 * @return {P}
 */
var traceSession = function(socket,req){
  return session('trace',socket,req,function(ping,ip,count,max){
    return runTrace(ping,ip)
      .then(function(result){
        var msg = new AmpMessage()
        msg.push(null)
        msg.push(result)
        if(count < max)
          socket.write(msg.toBuffer())
        else
          socket.end(msg.toBuffer())
      })
  })
}

//setup our connection handling for the stream results
streamServer.on('connection',function(socket){
  //parse out our request
  parseStreamConnection(socket)
    .then(function(req){
      //determine the request type
      if('ping' === req.type || !req.type)
        return pingSession(socket,req)
      if('trace' === req.type)
        return traceSession(socket,req)
      throw new Error('Invalid result stream requested')
    })
    .catch(function(err){
      var msg = new AmpMessage()
      if(err instanceof Error) msg.push(err.toString())
      else msg.push(err)
      socket.end(msg.toBuffer())
    })
})


/**
 * Start peer system
 * @param {function} done
 */
exports.start = function(done){
  restServer.bindAsync(+config.peer.rest.port,config.peer.rest.host)
    .then(function(){
      return streamServer.listenAsync(
        +config.peer.stream.port,
        config.peer.stream.host)
    })
    .then(done).catch(done)
}


/**
 * Stop peer system
 * @param {function} done
 */
exports.stop = function(done){
  restServer.closeAsync()
    .then(function(){return streamServer.closeAsync()})
    .then(done).catch(done)
}


//worker startup through infant
if(require.main === module)
  worker(restServer,'ping.ms:peer:worker',exports.start,exports.stop)
