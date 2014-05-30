'use strict';
var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , config = require('./config')

//routing
app.get('/',function(req,res){res.end('stuff happens here')})

server.listen(config.get('mux.listen.port'),config.get('mux.listen.host'),function(err){
  if(err) return console.log(err)
  console.log('ping.ms mux running on port ' + config.get('mux.listen.port'))
})
