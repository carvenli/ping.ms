'use strict';
var async = require('async')
var bcrypt = require('bcrypt')
var mongoose = require('mongoose')
var validate = require('mongoose-validator').validate

var schema
var model

//load plugins
mongoose.plugin(require('mongoose-merge-plugin'))
mongoose.plugin(require('mongoose-list'),{
  'sort': 'name.first name.last',
  'sort_fields': ['email','name.first','name.last']
})

//define schema
schema = new mongoose.Schema({
  email: {
    label: 'Email',
    type: String,
    lowercase: true,
    unique: true,
    required: true,
    index: true,
    validate: [
      validate('len','6','100'),
      validate('isEmail')
    ]
  },
  password: {
    label: 'Password',
    type: String,
    required: true,
    select: false,
    get: function(){ return '********' },
    set: function(v){
      return bcrypt.hashSync(v,bcrypt.genSaltSync(12))
    },
    validate: [
      validate('len','8','64')
    ]
  },
  name: {
    type: String,
    required: true
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
    },
    dateSeen: {
      label: 'Last Successful Login',
      type: {},
      index: true,
      default: null
    },
    dateFail: {
      label: 'Last Failed Login',
      type: Date,
      index: true
    }
  }
})

schema.statics.login = function(email,password,done){
  var now = new Date()
  var errorMessage = 'Invalid email address or password'
  var staff = {}
  async.series(
    [
      //find the staff member
      function(next){
        model.collection.findOne({email: email}, function(err,result){
          if(err) return next(err)
          if(!result) return next('No staff member found')
          if(!result.active) return next('Staff member inactive')
          staff = result
          next()
        })
      },
      //verify password
      function(next){
        bcrypt.compare(password,staff.password,function(err,isMatch){
          if(err) return next(err)
          if(!isMatch) return next('Invalid password')
          next()
        })
      },
      //find fresh result
      function(next){
        model.findOne({email: email},function(err,result){
          if(err) return next(err)
          if(!result || !result.active) return next('Invalid or inactive staff member 2nd try')
          staff = result
          next()
        })
      },
      //update last login
      function(next){
        model.findByIdAndUpdate(staff.id,{'metrics.dateSeen': now},next)
      }
    ],
    //process results
    function(err){
      if(err){
        console.error('Failed login ' + err)
        if(!staff.id) return done(errorMessage)
        model.findByIdAndUpdate(staff.id,{'metrics.dateFail': now},function(err){
          if(err) console.error('Failed to update failed login stamp ' + err)
          done(errorMessage)
        })
      } else done(null,staff)
    }
  )
}

// handling of created/modified
schema.pre('save',function(next){
  var now = new Date()
    ,_ref = this.get('metrics.dateCreated')
  if((void 0) === _ref || null === _ref)
    this.metrics.dateCreated = now
  this.metrics.dateModified = now
  next()
})

//setup the model
model = mongoose.model('Staff',schema)

//export model
exports.name = 'staff'
exports.description = 'Staff Model'
exports.schema = schema
exports.model = model
