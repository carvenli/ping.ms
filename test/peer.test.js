'use strict';
var amp = require('amp')
var AmpMessage = require('amp-message')
var axon = require('axon')
var P = require('bluebird')
var expect = require('chai').expect
var net = require('net')
var promisePipe = require('promisepipe')

var config = require('../config')
var peer = require('../peer/worker')

var client = axon.socket('req')

//make some promises
P.promisifyAll(peer)
P.promisifyAll(client)
P.promisifyAll(net)

describe('peer',function(){
  before(function(done){
    peer.startAsync()
      .then(function(){
        return client.connectAsync(
          +config.peer.rest.port,
          config.peer.rest.host || '127.0.0.1'
        )
      }).then(done).catch(done)
  })
  after(function(done){
    peer.stop(done)
  })
  it('should resolve forward dns',function(done){
    client.sendAsync('resolve',{domain: 'google.com'})
      .then(function(result){
        expect(result).to.be.an('array')
        expect(result.length).to.be.gt(0)
        done()
      }).catch(done)
  })
  it('should resolve ptr',function(done){
    client.sendAsync('ptr',{ip: '127.0.0.1'})
      .then(function(result){
        expect(result).to.be.an('array')
        expect(result.length).to.be.gt(0)
        done()
      }).catch(done)
  })
  it('should check for host alive',function(done){
    client.sendAsync('alive',{ip: '127.0.0.1'})
      .then(function(alive){
        expect(alive).to.equal(true)
        done()
      }).catch(done)
  })
  it('should emit a ping stream',function(done){
    this.timeout(5000)
    var result = []
    var errors = []
    var parser = new amp.Stream()
    parser.on('data',function(data){
      var msg = new AmpMessage(data)
      //check if we have an error
      var err = msg.shift()
      if(err) errors.push(err)
      //the second argument should be our result
      else result.push(msg.shift())
    })
    var socket = net.connect(
      +config.peer.stream.port,
      config.peer.stream.host || '127.0.0.1'
    )
    P.try(function(){
      //send our request by submitting one packet and closing the socket
      var msg = new AmpMessage()
      msg.push({type: 'ping', ip: '127.0.0.1', packets: 3})
      socket.end(msg.toBuffer())
      return promisePipe(socket,parser)
    }).then(function(){
      if(errors.length) throw errors
      expect(result).to.be.an('array')
      expect(result.length).to.equal(3)
      expect(result[0].ms).to.be.a('number')
      done()
    }).catch(done)
  })
  it('should trace a host',function(done){
    this.timeout(5000)
    var result = []
    var errors = []
    var parser = new amp.Stream()
    parser.on('data',function(data){
      var msg = new AmpMessage(data)
      //check if we have an error
      var err = msg.shift()
      if(err) errors.push(err)
      //the second argument should be our result
      else result.push(msg.shift())
    })
    var socket = net.connect(
      +config.peer.stream.port,
      config.peer.stream.host || '127.0.0.1'
    )
    P.try(function(){
      //send our request by submitting one packet and closing the socket
      var msg = new AmpMessage()
      msg.push({type: 'trace', ip: '127.0.0.1', packets: 3})
      socket.end(msg.toBuffer())
      return promisePipe(socket,parser)
    }).then(function(){
      if(errors.length) throw errors
      expect(result).to.be.an('array')
      expect(result.length).to.equal(3)
      expect(result[0][0].ms).to.be.a('number')
      done()
    }).catch(done)
  })
})
