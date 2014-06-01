'use strict';
var mongoose = require('mongoose')
  , validate = require('mongoose-validator').validate

mongoose.plugin(require('mongoose-list'))

var schema = new mongoose.Schema({
  name: {
    type: String,
    //unique: true,
    required: true,
    index: true
  },
  email: {
    type: String,
    unique: true,
    required: true,
    index: true,
    validate: [
      validate('len','6','100'),
      validate('isEmail')
    ]
  },
  address: {
    type: String,
    required: true
  },
  company: String,
  phone: String,
  rank: Number
})

var model = mongoose.model('contact',schema)


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
