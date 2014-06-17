'use strict';
var mongoose = require('mongoose')
  , schema

//load plugins
mongoose.plugin(require('mongoose-list'))

schema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  tag: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  label: {
    type: String,
    required: true
  },
  limitForAggregate: {
    type: Number,
    required: true,
    default: 1,
    index: true
  }
})


/**
 * Model name
 * @type {string}
 */
exports.name = 'group'


/**
 * Model description
 * @type {string}
 */
exports.description = 'Group model'


/**
 * Schema
 * @type {exports.Schema}
 */
exports.schema = schema


/**
 * Model
 */
exports.model = mongoose.model('Group',schema)
