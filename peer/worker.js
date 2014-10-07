'use strict';
var amp = require('amp')
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
    new P()
      .then(function(){
        if(!req.domain || !validator.isFQDN(req.domain))
          throw new Error('Invalid domain name')
      }).then(function(){
        return dns.resolve(req.domain)
      })
      .then(function(results){
        reply(null,results)
      })
      .catch(function(err){
        reply(new Error('Could not lookup domain: ' + err))
      })
  },
  /**
   * PTR Lookups (IP4 and IP6)
   * @param {object} req
   * @param {function} reply
   */
  ptr: function(req,reply){
    new P()
      .then(function(){
        if(!req.ip) throw new Error('No IP provided')
        if(!validator.isIP(req.ip))
          throw new Error('Invalid IP provided')
      }).then(function(){
        return dns.reverse(req.ip)
      })
      .then(function(results){
        reply(null,results)
      })
      .catch(function(err){
        reply(new Error('could not lookup PTR: ' + err))
      })
  },
  /**
   * Check if host is alive (IP4 and IP6)
   * @param {object} req
   * @param {function} reply
   */
  alive: function(req,reply){
    new P()
      .then(function(){
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
 * Send a ping to a host with a promise and write it to a socket
 *   we need a function to use as an interval to send the pings
 * @param {object} socket
 * @param {netPing.Session} ping
 * @param {string} ip
 * @param {number} interval
 */
var sendPing = function(socket,ping,ip,interval){
  ping.pingHostAsync(ip)
    .then(function(target,sent,received){
      var ms = sent - received
      socket.write(amp.encode({result: {
        target: target,
        sent: sent,
        received: received,
        ms: ms
      }}))
    })
    .catch(function(err){
      //at this point we send an error and tear down the socket
      if(interval) clearInterval(interval)
      socket.end(amp.encode(new Error('Ping has failed: ' + err)))
    })
}


//setup our connection handling for the stream results
streamServer.on('connection',function(socket){
  //setup our ping handler
  var pingInterval
  //parse out the request early here and setup our promise chain
  var req
  //note: i found this sweet stream parser inside of AMP undocumented used in
  //axon which was basically the point of using axon but it makes it easier
  //having this socket serve a more specific purpose, i think it could be
  //upgraded to do traceroutes without much hassle and its already good for
  //ipv6 support
  var parser = new amp.Stream()
  parser.once('data',function(data){
    req = data
  })
  //once the pipe finishes we know we have the request so lets start pinging
  promisePipe(socket,parser)
    .then(function(){
      var ping
      if(!req.ip) throw new Error('No IP provided to ping')
      if(!validator.isIP(req.ip))
        throw new Error('Invalid IP address')
      if(req.duration && !validator.isNumeric(req.duration))
        throw new Error('Invalid duration')
      //default to 4 packets (we kill before so it will never fire the last
      //interval, this could probably cleaned up to use a packet counter instead
      if(!req.duration) req.duration = 4999
      //get the correct ping instance
      if(validator.isIP(req.ip,4))
        ping = ping4
      if(validator.isIP(req.ip,6))
        ping = ping6
      //send the first ping
      sendPing(ping,req.ip)
      //now set up the interval for it to continue
      pingInterval = setInterval(function(){
        sendPing(ping,req.ip,pingInterval)
      },1000)
      //setup the duration timer to teardown
      setTimeout(function(){
        if(pingInterval) clearInterval(pingInterval)
        socket.end()
      },req.duration)
    })
    .catch(function(err){
      if(pingInterval) clearInterval(pingInterval)
      socket.end(amp.encode(new Error('Failed to make ping session: ' + err)))
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
  worker(restServer,'peer:worker',exports.start,exports.stop)
