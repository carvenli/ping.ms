'use strict';
var fs = require('fs')
var ip = require('ip')
var net = require('net')
var path = require('path')
var Logger = require('../logger')

var plugin = {}


/**
 * Register this plugin with an ircMesh object
 * @param {ircMesh} that Object of type ircMesh to augment
 * @param {function} done Callback once registered
 */
plugin.register = function(that,done){
  done = done || function(){}
  that.on('ctcp_request:dcc',function(o){
    var args = o.message.split(' ')
    var type = args[0]
    var argument = args[1]
    var address = ip.fromLong(args[2])
    var port = +args[3]
    var size = +args[4]
    var _recvFile = null
    var _logger = Logger.create(that.logger.tagExtend(['DCC',type,o.nickname.replace(/^@/,'')].join(':')))
    _logger.info('Connecting to ' + [address,port].join(':'))
    var dccSocket = net.connect(port,address,function(){
        _logger.info('Connected')
        dccSocket.on('error',function(err){
          _logger.info('ERROR:',err)
        })
        dccSocket.on('end',function(){
          _logger.info('Connection closed')
        })
        switch(type){
        case 'CHAT':
          dccSocket.on('data',function(data){
            _logger.info(data.toString().replace(/[\r\n]$/g,''))
          })
          dccSocket.write('DCC CHAT GO\n')
          break
        case 'SEND':
          var fname = [fs.realpathSync('./'),argument].join(path.sep)
          if(fs.existsSync(fname)){
            _logger.info('File Exists (' + fname + ')')
            dccSocket.end()
          }
          else{
            _recvFile = fs.createWriteStream(fname)
            _recvFile.on('open',function(){
              _logger.info('Saving to file ' + fname)
              dccSocket.on('end',function(){
                _recvFile.end(function(){
                  _logger.info('Saved ' + _recvFile.bytesWritten + ' bytes to ' + fname +
                    ((size === _recvFile.bytesWritten) ? ' [size good!]' : ' [size BAD should be ' + size + ']'))
                })
              })
              dccSocket.on('data',function(data){
                dccSocket.pause()
                if(_recvFile){
                  _recvFile.write(data,function(){
                    var bytesWritten = _recvFile.bytesWritten
                    var buf = new Buffer([0,0,0,0])
                    buf.writeUInt32BE(bytesWritten,0)
                    dccSocket.write(buf,function(){
                      dccSocket.resume()
                    })
                  })
                }
              })
            })
          }
          break
        default:
          _logger.warning('Unknown CTCP DCC type:',args)
          break
        }
      })
  })
}

module.exports = plugin
