'use strict';
var async = require('async')
var dns = require('dns')
var debug = require('debug')('ping.ms:admin:peer')
var entities = new (require('html-entities').XmlEntities)()
var through2 = require('through2')

var peerHelper = require('../helpers/peer')
var list = require('../helpers/list')
var Peer = require('../../models/Peer').model
var Group = require('../../models/Group').model

var operationCompleteMessage =
  'Operation complete, close this window and refresh the previous page'
var validStatuses = Peer.schema.path('status').enum().enumValues


/**
 * Remove a peer by ID
 * @param {string} peerId
 * @param {function} next
 */
var remove = function(peerId,next){
  var peer
  async.series(
    [
      //find the peer
      function(next){
        Peer.findById(peerId,function(err,result){
          if(err) return next(err)
          peer = result
          next()
        })
      },
      //remove the peer
      function(next){
        peer.remove(next)
      }
    ],
    next
  )
}


/**
 * Helper to setup an html entity encoded writable stream
 * @param {http.res} res
 * @return {Stream.Transform}
 */
var encodeEntities = function(res){
  return through2(
    function(chunk,enc,next){
      res.write(entities.encode(chunk.toString()))
      next(null,chunk)
    }
  )
}


/**
 * Get the standard list of groups
 * @param {function} next
 */
var groupList = function(next){
  Group.list(
    {sort: 'name',limit: 10000},
    function(err,count,results){
      if(err) return next(err)
      next(null,results)
    }
  )
}


/**
 * List peers
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  if(
    'post' === req.method.toLowerCase() &&
    req.body.remove &&
    req.body.remove.length
  ){
    //test
    if(req.body.test){
      async.each(
        req.body.remove,
        function(id,next){
          peerHelper.test(id,next)
        },
        function(err){
          if(err) req.flash('error',err)
          else req.flash('success','Peers tested')
          res.redirect('/peer')
        }
      )
    }
    //refresh
    else if(req.body.refresh){
      async.each(
        req.body.remove,
        function(id,next){
          peerHelper.refresh(id,next)
        },
        function(err){
          if(err) req.flash('error',err)
          else req.flash('success','Peers refreshed')
          res.redirect('/peer')
        }
      )
    }
    //prepare
    else if(req.body.prepare){
      peerHelper.outputStart(res,'Prepare')
      async.each(
        req.body.remove,
        function(id,next){
          peerHelper.prepare(id,encodeEntities(res),next)
        },
        function(err){
          if(err) req.flash('error',err)
          peerHelper.banner(res,operationCompleteMessage)
          peerHelper.outputEnd(res)
        }
      )
    }
    //install
    else if(req.body.install){
      peerHelper.outputStart(res,'Install')
      async.each(
        req.body.remove,
        function(id,next){
          peerHelper.install(id,encodeEntities(res),next)
        },
        function(err){
          if(err) req.flash('error',err)
          peerHelper.banner(res,operationCompleteMessage)
          peerHelper.outputEnd(res)
        }
      )
    }
    //upgrade
    else if(req.body.upgrade){
      peerHelper.outputStart(res,'Upgrade')
      async.each(
        req.body.remove,
        function(id,next){
          peerHelper.upgrade(id,encodeEntities(res),next)
        },
        function(err){
          if(err) req.flash('error',err)
          peerHelper.banner(res,operationCompleteMessage)
          peerHelper.outputEnd(res)
        }
      )
    }
    //custom
    else if(req.body.runCommand){
      peerHelper.outputStart(res,'Command: ' + req.body.command)
      async[req.body.runCommandParallel ? 'each' : 'eachSeries'](
        req.body.remove,
        function(id,next){
          peerHelper.custom(id,req.body.command,encodeEntities(res),next)
        },
        function(err){
          if(err) req.flash('error',err)
          peerHelper.banner(res,operationCompleteMessage)
          peerHelper.outputEnd(res)
        }
      )
    }
    //update config
    else if(req.body.updateConfig){
      async.each(
        req.body.remove,
        function(id,next){
          peerHelper.updateConfig(id,next)
        },
        function(err){
          if(err) req.flash('error',err)
          else req.flash('success','Peers config updated')
          res.redirect('/peer')
        }
      )
    }
    //start
    else if (req.body.start){
      async.each(
        req.body.remove,
        function(id,next){
          peerHelper.action(id,'start',next)
        },
        function(err){
          if(err) req.flash('error',err)
          else req.flash('success','Peers started')
          res.redirect('/peer')
        }
      )
    }
    //stop
    else if (req.body.stop){
      async.each(
        req.body.remove,
        function(id,next){
          peerHelper.action(id,'stop',next)
        },
        function(err){
          if(err) req.flash('error',err)
          else req.flash('success','Peers stopped')
          res.redirect('/peer')
        }
      )
    }
    //restart
    else if (req.body.restart){
      async.each(
        req.body.remove,
        function(id,next){
          peerHelper.action(id,'restart',next)
        },
        function(err){
          if(err) req.flash('error',err)
          else req.flash('success','Peers restarted')
          res.redirect('/peer')
        }
      )
    }
    //delete
    else if (req.body.delete){
      list.remove(Peer,req.body.remove,function(err,count){
        if(err)
          req.flash(
            'error',
            'Removed ' + count + ' item(s) before removal failed ' + err
          )
        else {
          req.flash('success','Deleted ' + count + ' item(s)')
          res.redirect('/peer')
        }
      })
    }
    //nothing matched
    else {
      req.flash('warning','No action submitted')
      res.redirect('/peer')
    }
  } else {
    // jshint bitwise:false
    var limit = (req.query.limit >> 0) || 25
    var start = (req.query.start >> 0) || 0
    var search = req.query.search || ''
    if(start < 0) start = 0
    Peer.list(
      {
        start: start,
        sort: 'host',
        limit: limit,
        find: search
      },
      function(err,count,results){
        if(err) return res.send(err)
/*
        var i = 0, j = 0, tmp = new Array(count), r = null
        for(; i < count; i++){
          r = results[i]
           = r.groups.split(',').slice(1)
          for(j=0;j<c;j++){

          }
          if(r.){}
          tmp[i] = results[i]
        }
*/
        res.render('peer/list',{
          page: list.pagination(start,count,limit),
          count: count,
          search: search,
          limit: limit,
          list: results
        })
      }
    )
  }
}


/**
 * Create peer
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('peer/create')
}


/**
 * Peer update form
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  async.parallel(
    {
      //get the peer
      peer:
        function(next){
          Peer.findById(req.query.id,function(err,result){
            if(err) return next(err)
            if(!result) return next('Peer not found')
            next(null,result)
          })
        },
      //get the groups
      groups: groupList
    },
    //display the edit page
    function(err,results){
      if(err){
        req.flash('error',err)
        res.redirect('/peers')
      } else {
        debug('r:',results)
        if(!results) results = {}
        if(!results.peer) results.peer = {}
        if(!results.groups) results.groups = {}
        res.render('peer/edit',{
          peer: results.peer,
          groups: results.groups,
          statuses: validStatuses
        })
      }
    }
  )
}


/**
 * Save peer
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var id, doc
  async.series(
    [
      //find an existing peer
      function(next){
        Peer.findById(req.body.id,function(err,result){
          if(err) return next(err.message)
          if(!result) doc = new Peer()
          else doc = result
          next()
        })
      },
      //resolve ip if we have to
      function(next){
        if(req.body.ip) return next()
        dns.lookup(req.body.host,function(err,result){
          if(err) return next(err.message)
          if(!result) return next('Could not look up IP from host name')
          req.body.ip = result
          next()
        })
      },
      //populate data
      function(next){
        doc.host = req.body.host
        doc.ip = req.body.ip
        doc.sshPort = req.body.sshPort || 22
        doc.config = req.body.config || undefined
        if(-1 === validStatuses.indexOf(doc.status))
          doc.status = 'unknown'
        if(-1 === validStatuses.indexOf(req.body.status))
          req.body.status = doc.status
        if(doc.status !== req.body.status)
          doc.status = req.body.status
        doc.location = req.body.location
        doc.secret = req.body.secret || doc.secret || ''
        doc.groups = req.body.groups || ''
        doc.primaryGroup = req.body.primaryGroup || ''
        doc.notes = req.body.notes || ''
        doc.sponsor.name = req.body.sponsorName || ''
        doc.sponsor.url = req.body.sponsorUrl || ''
        doc.active = req.body.active ? true : false
        next()
      },
      //log
      function(next){
        //come up with a snapshot for the log
        var snapshot = doc.toJSON()
        delete snapshot.log
        delete snapshot._id
        doc.log.push({
          message: 'Peer saved ' + JSON.stringify(snapshot),
          level: 'success'
        })
        next()
      },
      //save
      function(next){
        doc.save(function(err,result){
          if(err) return next(err.message)
          id = result.id
          next()
        })
      },
      //refind updated peer
      function(next){
        Peer.findOne({location: doc.location},function(err,result){
          if(err) return next(err)
          if(!result) return next('Could not find peer after saving')
          doc = result
          next()
        })
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer "' + doc.location + '" Saved')
      res.redirect(id ? '/peer/edit?id=' + id : '/peer')
    }
  )
}


/**
 * Test peer for readiness
 * @param {object} req
 * @param {object} res
 */
exports.test = function(req,res){
  async.series(
    [
      function(next){
        peerHelper.test(req.query.id,next)
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer tested successfully')
      res.redirect(req.query.id ? '/peer/edit?id=' + req.query.id : '/peer')
    }
  )
}


/**
 * Refersh peer stats
 * @param {object} req
 * @param {object} res
 */
exports.refresh = function(req,res){
  async.series(
    [
      function(next){
        peerHelper.refresh(req.query.id,next)
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer refreshed successfully')
      res.redirect(req.query.id ? '/peer/edit?id=' + req.query.id : '/peer')
    }
  )
}


/**
 * Prepare peer
 * @param {object} req
 * @param {object} res
 */
exports.prepare = function(req,res){
  peerHelper.outputStart(res,'Prepare')
  async.series(
    [
      function(next){
        peerHelper.prepare(req.query.id,encodeEntities(res),next)
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer prepared successfully')
      peerHelper.banner(res,operationCompleteMessage)
      peerHelper.outputEnd(res)
    }
  )
}


/**
 * Install peer
 * @param {object} req
 * @param {object} res
 */
exports.install = function(req,res){
  peerHelper.outputStart(res,'Install')
  async.series(
    [
      function(next){
        peerHelper.install(req.query.id,encodeEntities(res),next)
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer installed successfully')
      peerHelper.banner(res,operationCompleteMessage)
      peerHelper.outputEnd(res)
    }
  )
}


/**
 * Upgrade peer
 * @param {object} req
 * @param {object} res
 */
exports.upgrade = function(req,res){
  peerHelper.outputStart(res,'Upgrade')
  async.series(
    [
      function(next){
        peerHelper.upgrade(req.query.id,encodeEntities(res),next)
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer upgraded successfully')
      peerHelper.banner(res,operationCompleteMessage)
      peerHelper.outputEnd(res)
    }
  )
}


/**
 * Run command
 * @param {object} req
 * @param {object} res
 */
exports.runCommand = function(req,res){
  peerHelper.outputStart(res,'Command: ' + req.body.command)
  async.series(
    [
      function(next){
        peerHelper.custom(req.body.id,req.body.command,encodeEntities(res),next)
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Command executed')
      peerHelper.banner(res,operationCompleteMessage)
      peerHelper.outputEnd(res)
    }
  )
}


/**
 * Update config
 * @param {object} req
 * @param {object} res
 */
exports.updateConfig = function(req,res){
  async.series(
    [
      function(next){
        peerHelper.updateConfig(req.query.id,next)
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer config updated successfully')
      res.redirect(req.query.id ? '/peer/edit?id=' + req.query.id : '/peer')
    }
  )
}


/**
 * Start peer
 * @param {object} req
 * @param {object} res
 */
exports.start = function(req,res){
  async.series(
    [
      function(next){
        peerHelper.action(req.query.id,'start',next)
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer started')
      res.redirect(req.query.id ? '/peer/edit?id=' + req.query.id : '/peer')
    }
  )
}


/**
 * Stop peer
 * @param {object} req
 * @param {object} res
 */
exports.stop = function(req,res){
  async.series(
    [
      function(next){
        peerHelper.action(req.query.id,'stop',next)
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer stopped')
      res.redirect(req.query.id ? '/peer/edit?id=' + req.query.id : '/peer')
    }
  )
}


/**
 * Restart peer
 * @param {object} req
 * @param {object} res
 */
exports.restart = function(req,res){
  async.series(
    [
      function(next){
        peerHelper.action(req.query.id,'restart',next)
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer restarted')
      res.redirect(req.query.id ? '/peer/edit?id=' + req.query.id : '/peer')
    }
  )
}
