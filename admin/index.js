'use strict';
var child = require('infant').child
var clusterSetup = require('infant').cluster

var cluster
var config = require('../config')
//load all models to avoid odd scoping
var Group = require('../models/Group')
var Peer = require('../models/Peer')
var Page = require('../models/Page')

if(require.main === module){
  child(
    'ping.ms:admin:master',
    function(done){
      cluster = clusterSetup(
        './worker',
        {
          enhanced: true,
          stopTimeout: 120000,
          recycleTimeout: 120000,
          count: config.admin.workers.count,
          maxConnections: config.admin.workers.maxConnections
        }
      )
      cluster.start(function(err){
        done(err)
      })
    },
    function(done){
      if(!cluster) return done()
      cluster.stop(function(err){
        done(err)
      })
    }
  )
} else console.log('whatSHIT')
