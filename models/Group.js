'use strict';
var mongoose = require('mongoose')
var schema

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
    required: true,
    unique: true,
    index: true
  },
  label: {
    type: String,
    required: true
  }
})


/**
 * Model name
 * @type {string}
 */
exports.name = 'Group'


/**
 * Model description
 * @type {string}
 */
exports.description = 'Group model'


/**
 * Mongoose schema
 * @type {mongoose.Schema}
 */
exports.schema = schema


var Model
if(mongoose.models[exports.name])
  Model = mongoose.model(exports.name)
else
  Model = mongoose.model(exports.name,exports.schema)


/**
 * Mongoose model
 * @type {mongoose.Model}
 */
exports.model = Model
