'use strict';
var child = require('infant').child
var clusterSetup = require('infant').cluster

var cluster
var config = require('../config')

if(require.main === module){
  child(
    'admin:master',
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
}
