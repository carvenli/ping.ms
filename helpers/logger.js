'use strict';
var winston = require('winston')
  , mkdirp = require('mkdirp')
  , fs = require('fs')
  , path = require('path')
  , loggers = {}
module.exports = function(service){
  if(!loggers[service]){
    var logFile = __dirname + '/../log/' + service + '.log'
    if(!fs.existsSync(logFile)){
      mkdirp.sync(path.dirname(logFile))
      fs.writeFileSync(logFile,'')
    }
    var logger = new winston.Logger({
      transports: [new winston.transports.File({filename: logFile})]
    })
    logger.cli()
    logger.addConsole = function(level){
      logger.add(winston.transports.Console,{colorize: true, level: level || 'info'})
    }
    loggers[service] = logger
  }
  return loggers[service]
}