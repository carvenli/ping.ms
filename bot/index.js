'use strict';
var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , config = require('./../config')
  , async = require('async')
  , hostbyname = require('hostbyname')
  , dns = require('dns')
  , netPing = require('net-ping')
  , jsonStream = require('express-jsonstream')

app.use(jsonStream())
app.use(express.urlencoded())

var nPs = netPing.createSession({
  _debug: false,
  networkProtocol: netPing.NetworkProtocol.IPv4,
  packetSize: 56,
  ttl: 255,
  retries: 3,
  timeout: 1000
})

//routing
app.get('/ping',function(req,res){
  //check the request URL
  if(config.get('bot.allowedSources').indexOf(req.ip) < 0)
    return res.status(403).end('not-allowed from ' + req.ip)
  //check the given dest
  var dest = req.param('dest')
  if(!dest)
    return res.status(403).end('dest not supplied')
  var pingData = {
    count: req.param('count') || 4,
    dest: dest,
    ip: dest,
    ptr: dest,
    min: null,
    avg: null,
    max: null,
    mdev: 0
  }
  async.series([
    function(next){
      hostbyname.resolve(pingData.dest,'v4',function(err,results){
        if(!err && results[0]) pingData.ip = results[0]
        next()
      })
    },function(next){
      dns.reverse(pingData.ip,function(err,results){
        if(!err && results[0]) pingData.ptr = results[0]
        next()
      })
    },function(next){
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
          res.jsonStream(result)
        })
      },function(){
        next()
      })
    }
  ],function(){
    res.jsonStream(pingData)
    res.end()
  })
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

server.listen(config.get('bot.listen.port'),config.get('bot.listen.host'),function(err){
  if(err) return console.log(err)
  console.log('ping.ms bot running on port ' + config.get('bot.listen.port'))
})
