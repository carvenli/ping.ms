'use strict';
var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , io = require('socket.io')(server)
  , config = require('./../config')
  , routes = require('./routes')
  , mongoose = require('mongoose')
  , Group = require('./../models/groups.js')
  , Server = require('./../models/servers.js')
  , util = require('util')

mongoose.connect(config.get('mongoose.dsn'),config.get('mongoose.options'),function(err){
  if(err){
    console.log('Failed to connect to mongoose ' + err)
    process.exit()
  }
  //global tpl vars
  app.locals.pretty = true

  app.set('views',__dirname + '/' + 'views')
  app.set('view engine','jade')
  app.use(express.basicAuth(config.get('mux.admin.user'),config.get('mux.admin.password')))
  app.use(express.urlencoded())
  app.use(express.json())
  app.use(express.static(__dirname + '/public'))

  // development only
  if('development' === app.get('env')){
    app.use(express.logger('dev'))
    app.use(express.errorHandler())
  }

  app.get('/',routes.index)

  io.on('connection',function(socket){
    console.log('a user connected: ' + util.inspect(socket))
    socket.on('disconnect',function(){console.log('user disconnected')})
    socket.on('groupList',function(opts){
      console.log(opts)
      Group.list({sort:'index'},
        function(err,count,results){socket.emit('groupListResult',{groups:results})}
      )
    })
    socket.on('serverList',function(opts){
      console.log(opts)
      Server.list({sort:'index'},
        function(err,count,results){socket.emit('serverListResult',{servers:results})}
      )
    })
  })

  server.listen(config.get('mux.listen.port'),config.get('mux.listen.host'),function(){
    console.log(
        'ping.ms mux listening on port ' +
        (config.get('mux.listen.host') || '0.0.0.0') +
        ':' + config.get('mux.listen.port')
    )
  })
})
