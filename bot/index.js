'use strict';
var io = require('socket.io-client')
  , config = require('./../config')
  , async = require('async')
  , hostbyname = require('hostbyname')
  , dns = require('dns')
  , netPing = require('net-ping')

var nPs = netPing.createSession({
  _debug: false,
  networkProtocol: netPing.NetworkProtocol.IPv4,
  packetSize: 56,
  ttl: 255,
  retries: 3,
  timeout: 1000
})

/*
//routing
app.get('/ping',function(req,res){
  //check the request URL
  if(config.get('bot.allowedSources').indexOf(req.ip) < 0)
    return res.status(403).end('not-allowed from ' + req.ip)
  //check the given dest
  var dest = req.param('dest')
})

app.get('/trace',function(req,res){
  //check the request URL
  if(config.get('bot.allowedSources').indexOf(req.ip) < 0)
    return res.status(403).end('not-allowed from ' + req.ip)
  //check the given dest
  var dest = req.param('dest')
  if(!dest)
    return res.status(403).end('dest not supplied')
  //do the traceroute
  var traceData = {
    dest: dest,
    ip: dest,
    ptr: dest,
    ttl: nPs.ttl
  }
  async.series(
    [
      function(next){
        //get the ip in case we were given a hostname in dest
        //this returns an ip string even if the input is already
        hostbyname.resolve(traceData.dest,'v4',function(err,results){
          if(!err && results[0]) traceData.ip = results[0]
          next()
        })
      },
      function(next){
        //get the ptr for the ip
        dns.reverse(traceData.ip,function(err,results){
          if(!err && results[0]) traceData.ptr = results[0]
          next()
        })
      },
      function(next){
        nPs.traceRoute(traceData.ip,traceData.ttl,
          function(error,target,ttl,sent,received){
            var ms = received - sent
            if(error)
              if(error instanceof netPing.TimeExceededError)
                res.jsonStream({ttl:ttl,source:error.source,rtt:ms})
              else
                res.jsonStream({ttl:ttl,error:error,rtt:ms})
            else
              res.jsonStream({ttl:ttl,target:target,rtt:ms})
          },
          function(error,target){
            if(error)
              next(target + ': ' + error.toString())
            else
              next()
          }
        )
      }
    ],
    function(){
      res.jsonStream(traceData)
      res.end()
    }
  )
})
*/
var connUrl = config.get('bot.connect')
var muxConnect = function(){
  console.log('[BOT] connecting to ' + connUrl)
  var mux = io.connect(connUrl)
  mux.on('connect',function(){
    console.log('[BOT] connected')
    mux.on('botLoginResult',function(data){
      if(data.error){
        console.log('[BOT] ERROR: auth failed!')
        setTimeout(muxConnect,2000)
      } else {
        console.log('[BOT] authorized')
        mux.on('execPing',function(data){
          var pingData = {
            count: data.count || 4,
            host: data.host,
            ip: data.host,
            ptr: data.host,
            min: null,
            avg: null,
            max: null,
            loss: 0
          }
          async.series([
            function(next){
              hostbyname.resolve(pingData.host,'v4',function(err,results){
                if(!err && results[0]) pingData.ip = results[0]
                next()
              })
            },function(next){
              dns.reverse(pingData.ip,function(err,results){
                if(!err && results[0]) pingData.ptr = results[0]
                next()
              })
            },function(next){
              mux.emit('pingInit.' + data.handle,pingData)
              async.timesSeries(pingData.count || 1,function(seq,repeat){
                nPs.pingHost(pingData.ip,function(error,target,sent,received){
                  var result = {
                    error: error,
                    target: target,
                    sent: (sent) ? +sent : false,
                    received: (received) ? +received : false,
                    rtt: (received && sent) ? (received - sent) : false
                  }
                  if(result.rtt){
                    if(null === pingData.min || result.rtt < pingData.min)
                      pingData.min = result.rtt
                    if(null === pingData.max || result.rtt > pingData.max)
                      pingData.max = result.rtt
                    pingData.avg = (null === pingData.avg) ? result.rtt : (pingData.avg + result.rtt) / 2
                  }
                  setTimeout(function(){repeat(null,result)},1000)
                  mux.emit('pingResult.' + data.handle,pingData)
                })
              },function(){
                next()
              })
            }
          ],function(){
            mux.emit('pingComplete.' + data.handle,pingData)
          })
        })
      }
    })
    mux.emit('botLogin',{secret:config.get('bot.secret')})
  })
}
muxConnect()
