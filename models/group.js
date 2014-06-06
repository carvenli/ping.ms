'use strict';
var mongoose = require('mongoose')

mongoose.plugin(require('mongoose-list'))

var schema = new mongoose.Schema({
  index: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    index: true
  },
  ref: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  desc: {
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

var model = mongoose.model('group',schema)


/**
 * Export schema
 * @type {mongoose.Schema}
 */
exports.schema = schema


/**
 * Export model
 * @type {mongoose.Model}
 */
exports.model = model
