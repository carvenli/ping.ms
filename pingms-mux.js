'use strict';
var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , config = require('./config')
  , routes = require('./routes')
  , mongoose = require('mongoose')

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

  app.post('/save',routes.save)
  app.post('/import',routes.import)
  app.post('/export',routes.export)
  app.post('/',routes.index)

  app.get('/create',routes.create)
  app.get('/edit',routes.edit)
  app.get('/import',routes.import)
  app.get('/export',routes.export)
  app.get('/',routes.index)

  server.listen(config.get('mux.listen.port'),config.get('mux.listen.host'),function(){
    console.log(
        'ping.ms mux listening on port ' +
        (config.get('mux.listen.host') || '0.0.0.0') +
        ':' + config.get('mux.listen.port')
    )
  })
})
