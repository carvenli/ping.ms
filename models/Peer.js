'use strict';
var mongoose = require('mongoose')
var ip = require('ip')
var fs = require('graceful-fs')
var config = require('../config')

//moment and the duration plugin
require('moment-duration-format')
var moment = require('moment')
var schema

//load plugins
mongoose.plugin(require('mongoose-list'),{
  'sort': 'host'
})


/**
 * Schema type definition
 */
schema = new mongoose.Schema({
  host: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  ip: {
    type: Number,
    required: true,
    index: true,
    set: function(val){
      return ip.toLong(val)
    },
    get: function(val){
      return ip.fromLong(val)
    }
  },
  config: {
    type: String,
    default: fs.existsSync(config.admin.defaultConfig) ?
      fs.readFileSync(config.admin.defaultConfig) : null
  },
  version: {
    type: String,
    default: 'unknown'
  },
  sshUsername: {
    type: String,
    default: 'root'
  },
  sshPort: {
    type: Number,
    default: 22
  },
  status: {
    type: String,
    required: true,
    index: true,
    enum: [
      'unknown',
      'staging',
      'stopped',
      'ok',
      'error'
    ],
    default: 'unknown'
  },
  log: [
    {
      date: {
        type: Date,
        required: true,
        default: Date.now
      },
      message: String,
      level: {
        type: String,
        default: 'info'
      }
    }
  ],
  //meta info
  os: {
    type: String,
    name: String,
    version: String,
    arch: String,
    kernel: String,
    uptime: String,
    load: Array
  },
  port: {
    type: Number,
    required: true,
    default: 3004
  },
  portStream: {
    type: Number,
    required: true,
    default: 3005
  },
  location: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  groups: String,
  primaryGroup: String,
  sponsor: {
    name: String,
    url: String
  },
  hits: {
    type: Number,
    default: 0
  },
  secret: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  notes: String,
  active: {
    type: Boolean,
    required: true,
    default: true,
    index: true
  },
  metrics: {
    dateCreated: {
      label: 'Creation Date',
      type: Date,
      default: Date.now,
      required: true,
      index: true
    },
    dateModified: {
      label: 'Last Modified',
      type: Date,
      default: Date.now,
      required: true,
      index: true
    },
    dateSeen: {
      label: 'Last Seen',
      type: Date,
      index: true
    },
    version: String
  }
})


/**
 * Do some shit here that makes the uptime fancy
 * @return {*}
 * @this {Peer}
 */
schema.methods.uptime = function(){
  return moment.duration(this.os.uptime * 1000).format(
    'd [days], h [hrs], m [min]'
  )
}

// handling of created/modified and uri creation
schema.pre('save',function(next){
  var that = this
  var now = new Date()
  //dateModified
  // (*->now)
  that.metrics.dateModified = now
  //dateCreated
  // (null->now, !null{RW})
  if(that.isNew){
    that.log.push({message: 'Peer created'})
    that.metrics.dateCreated = now
  }
  //groups
  // (null->'', [str]->',[str],')
  // also splits [str] into _groupArray for internal use
  var _groupArray = []
  var _ref = that.get('groups')
  if((void 0) === _ref || null === _ref)
    that.groups = ''
  if('string' === typeof _ref){
    _groupArray = _ref.split(',').filter(
      function(e){
        return ('string' === typeof e) && (0 < e.length)
      }
    )
    that.groups = ',' + _groupArray.join(',') + ','
  }
  //primaryGroup
  // (null->(groups==''->'', groups.len==1->groups[0], !null{RW}:[dfl]||IN(groups)->[val])
  _ref = that.get('primaryGroup')
  var _gLen = _groupArray.length
  var _default = function(){
    if(0 === _gLen)
      that.primaryGroup = ''
    if(1 === _gLen)
      that.primaryGroup = _groupArray[0]
  }
  if((void 0) === _ref || null === _ref)
    _default()
  else {
    var i = 0, j = 1, tmp = new Array(_gLen)
    if(_gLen){
      for(; i < _gLen; i++){
        if(_groupArray[i] === _ref){
          that.primaryGroup = _ref
          tmp[0] = _ref
        } else {
          tmp[j] = _groupArray[i]
          j++
        }
      }
      _groupArray = tmp
      that.groups = ',' + _groupArray.join(',') + ','
    }
    if(!that.primaryGroup)
      _default()
  }
  //metrics.version
  // (null->'', !null[RW])
  _ref = that.get('metrics.version')
  if((void 0) === _ref || null === _ref)
    that.metrics.version = ''
  next()
})


/**
 * Model name
 * @type {string}
 */
exports.name = 'peer'


/**
 * Model description
 * @type {string}
 */
exports.description = 'Peer model'


/**
 * Mongoose schema
 * @type {mongoose.Schema}
 */
exports.schema = schema


/**
 * Mongoose model
 * @type {mongoose.Model}
 */
exports.model = mongoose.model('Peer',schema)
