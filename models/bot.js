'use strict';
var mongoose = require('mongoose')
  , schema

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
    ,_ref = that.get('metrics.dateCreated')
  if((void 0) === _ref || null === _ref)
    that.metrics.dateCreated = now
  that.metrics.dateModified = now
  _ref = that.get('groups')
  if((void 0) === _ref || null === _ref)
    that.groups = ''
  if('string' === typeof _ref)
    that.groups = ',' + _ref + ','
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
