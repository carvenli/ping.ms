'use strict';
var mongoose = require('mongoose')
  , validator = require('validator')
  , markdown = require('markdown').markdown
  , urlname = require('../helpers/urlname')
  , schema

//load plugins
mongoose.plugin(require('mongoose-merge-plugin'))
mongoose.plugin(require('mongoose-list'))

schema = new mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  html: {
    type: String
  },
  title: {
    type: String,
    required: true
  },
  uri: {
    type: String,
    require: true,
    index: true
  },
  active: {
    label: 'Active',
    type: Boolean,
    required: true,
    default: false
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
    }
  }
})

//content validator and sanitizer
schema.pre('save',function(next){
  var now = new Date()
    ,_ref = this.get('metrics.dateCreated')
  if((void 0) === _ref || null === _ref)
    this.metrics.dateCreated = now
  this.metrics.dateModified = now
  if(!this.uri) this.uri = '/' + urlname.format(this.title)
  try {
    this.content = validator.trim(this.content)
    this.content = validator.escape(this.content)
    //this.content = sanitize(this.content).xss()
    this.html = markdown.toHTML(this.content)
    next()
  } catch(err){
    next(err)
  }
})

//export model now
exports.name = 'page'
exports.description = 'Content page model'
exports.schema = schema
exports.model = mongoose.model('Page',schema)