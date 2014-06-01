'use strict';
var async = require('async')
  , Contact = require('../models/contact').model


/**
 * List
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  if('post' === req.method.toLowerCase()){
    if(req.body.delete && req.body.delete.length){
      async.each(
        req.body.delete,
        function(id,next){
          Contact.findByIdAndRemove(id,next)
        },
        function(err){
          if(err) res.send(err)
          else res.redirect('/')
        }
      )
    } else res.redirect('/')
  } else {
    var limit = 10
    var start = parseInt(req.query.start,10) || 0
    if(start < 0) start = 0
    Contact.list({start: start, limit: limit, sort: 'name email'},function(err,count,results){
      if(start > count) start = count - limit
      var page = {
        start: start,
        end: start + limit,
        previous: start - limit,
        next: start + limit
      }
      if(page.previous < 0) page.previous = 0
      if(page.next > count) page.next = start
      if(page.end > count) page.end = count
      res.render('index',{
        page: page,
        count: count,
        contactList: results
      })
    })
  }
}


/**
 * Create contact
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('create',{
    name: '',
    company: '',
    email: '',
    address: '',
    phone: ''
  })
}


/**
 * Edit Page
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  Contact.findById(req.query.id,function(err,doc){
    res.render('edit',{
      id: doc.id,
      name: doc.name,
      company: doc.company,
      email: doc.email,
      address: doc.address,
      phone: doc.phone,
      rank: doc.rank
    })
  })
}


/**
 * Import data
 * @param {object} req
 * @param {object} res
 */
exports.import = function(req,res){
  if('post' === req.method.toLowerCase()){
    var body = {}
    var lineCount = 0
    var importCount = 0
    req.pipe(req.busboy)
    req.busboy.on('field',function(key,value){
      console.log(key,value)
      body[key] = value
    })
    req.busboy.on('file',function(fieldname,file){
      file.setEncoding('utf-8')
      file.on('data',function(data){
        body.data += data
      })
    })
    req.busboy.on('finish',function(){
      var lines = body.data.split('\n')
      lines.forEach(function(line){
        if(lineCount > 0 && line.length > 0){
          var parts = line.split(body.delimiter || ',')
          var doc = new Contact()
          doc.name = parts[0]
          doc.company = parts[1] || ''
          doc.email = parts[2]
          doc.address = parts[3]
          doc.phone = parts[4] || ''
          doc.rank = parts[5] || 1
          doc.save(function(err){
            if(err) console.error('Failed to import entry: ' + err)
            importCount++
          })
        }
        lineCount++
      })
      console.log('Read ' + lineCount + ' lines and imported ' + importCount + ' entries')
      res.redirect('/')
    })
  } else {
    res.render('import',{delimiter: ','})
  }

}


/**
 * Export contacts
 * @param {object} req
 * @param {object} res
 */
exports.export = function(req,res){
  if('post' === req.method.toLowerCase()){
    var getRandomInt = function(min,max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    var shuffleArray = function(array){
      var currentIndex = array.length, temporaryValue, randomIndex

      // While there remain elements to shuffle...
      while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex)
        currentIndex -= 1

        // And swap it with the current element.
        temporaryValue = array[currentIndex]
        array[currentIndex] = array[randomIndex]
        array[randomIndex] = temporaryValue
      }

      return array
    }
    var limit = parseInt(req.body.limit,10)
    var search = {}
    if('all' !== req.body.rank.toLowerCase())
      search.rank = parseInt(req.body.rank,10) || 1
    var csv = ['name','company','email','address','phone','rank'].join(req.body.delimiter) + '\n'
    var entries = []
    Contact.count(search,function(err,count){
      var stream = Contact
        .find(search)
        .skip(getRandomInt(0,count - limit))
        .limit(limit)
        .stream()
      stream.on('data',function(entry){
        entries.push([entry.name,entry.company,entry.email,entry.address,entry.phone,entry.rank])
      })
      stream.on('end',function(){
        res.set('Content-Type','text/csv')
        res.set('Content-Disposition','attachment; filename=arindb' + new Date().getTime() + '.csv')
        //randomize the set
        shuffleArray(entries)
        entries.forEach(function(entry){
          csv += entry.join(req.body.delimiter || ',') + '\n'
        })
        res.send(csv)
      })
    })
  } else {
    Contact.list({},function(err,count){
      res.render('export',{
        delimiter: ',',
        limit: count
      })
    })
  }
}


/**
 * Save new contact
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  Contact.findById(req.body.id,function(err,doc){
    if(!doc){
      doc = new Contact()
    }
    doc.name = req.body.name
    doc.company = req.body.company
    doc.email = req.body.email
    doc.address = req.body.address
    doc.phone = req.body.phone
    doc.rank = req.body.rank
    doc.save(function(err){
      if(err){
        var params = req.body
        params.alert = 'Could not add entry ' + err
        res.render('create',params)
      } else {
        res.redirect('/?success=true')
      }
    })
  })
}
