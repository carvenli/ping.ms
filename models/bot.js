'use strict';
var mongoose = require('mongoose')
var schema

//load plugins
mongoose.plugin(require('mongoose-list'))

schema = new mongoose.Schema({
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
  active: {
    type: Boolean,
    required: true,
    default: true,
    index: true
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
  metrics: {
    dateCreated: {
      label: 'Created',
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

// handling of created/modified and uri creation
schema.pre('save',function(next){
  var that = this
  var now = new Date()
  //dateModified
  // (*->now)
  that.metrics.dateModified = now
  //dateCreated
  // (null->now, !null{RW})
  var _ref = that.get('metrics.dateCreated')
  if((void 0) === _ref || null === _ref)
    that.metrics.dateCreated = now
  //groups
  // (null->'', [str]->',[str],')
  // also splits [str] into _groupArray for internal use
  var _groupArray = []
  _ref = that.get('groups')
  if((void 0) === _ref || null === _ref)
    that.groups = ''
  if('string' === typeof _ref){
    _groupArray = _ref.split(',')
    that.groups = ',' + _ref + ','
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
    var i = 0, found = false
    if(_gLen)
      do {
        if(_groupArray[i] === _ref){
          that.primaryGroup = _ref
          found = true
        }
        i = (found) ? _gLen : i + 1
      } while(i < _gLen)
    if(!found)
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
exports.name = 'bot'


/**
 * Model description
 * @type {string}
 */
exports.description = 'Bot model'


/**
 * Schema
 * @type {exports.Schema}
 */
exports.schema = schema


/**
 * Model
 */
exports.model = mongoose.model('Bot',schema)
