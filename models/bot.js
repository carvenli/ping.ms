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
  host: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  port: {
    type: Number,
    required: true,
    default: 4176
  },
  groups: [String],
  sponsor: {
    name: String,
    url: String
  },
  active: {
    type: Boolean,
    required: true,
    index: true,
    default: true
  },
  hits: Number,
  secret: String,
  notes: String,
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
    }
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
