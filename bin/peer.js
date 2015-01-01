'use strict';
var Table = require('cli-table')
var program = require('commander')
var mongoose = require('mongoose')

var Peer = require('../models/Peer')

var config = require('../config')

mongoose.connect(config.mongoose.dsn,config.mongoose.options,function(err){
  if(err) throw err
  //create
  program
    .command('create')
    .option('-l, --location <s>','Location')
    .option('-H, --host <s>','Host')
    .description('Create new peer')
    .action(function(opts){
      if(!opts.location || !opts.host){
        throw new Error('Host and location are required')
      }
      var doc = new Peer({
        location: opts.location,
        host: opts.host,
        active: true
      })
      doc.save(function(err){
        if(err) throw new Error('Failed to create peer: ' + err)
        console.log('Peer created!')
        process.exit()
      })
    })
  //update
  program
    .command('update')
    .option('-H, --host <s>','Host used to look up peer')
    .option('-I, --newHost <s>','New host if its being changed')
    .option('-l, --location <s>','Location')
    .option('-p, --primaryGroup <s>','Primary Group')
    .option('-g, --groups <s>','Groups')
    .option('-n, --sponsorName <s>','Sponsor Name')
    .option('-u, --sponsorUrl <s>','Sponsor Url')
    .option('-N, --notes <s>','Notes')
    .option('-a, --active <s>','Active true|false or 1|0')
    .description('Update existing staff member')
    .action(function(opts){
      if(!opts.host) throw new Error('Host is required')
      Peer.findOne({host: opts.host},function(err,doc){
        if(err) throw new Error('Could not lookup peer to edit ' + err)
        if(!doc) throw new Error('Peer not found')
        if(opts.newHost) doc.host = opts.newHost
        if(opts.location) doc.location = opts.location
        if(opts.primaryGroup) doc.primaryGroup = opts.primaryGroup
        if(opts.groups) doc.groups = opts.groups
        if(opts.sponsorName) doc.sponsor.name = opts.sponsorName
        if(opts.sponsorUrl) doc.sponsor.url = opts.sponsorUrl
        if(opts.notes) doc.notes = opts.notes
        if(opts.active)
          doc.active = ('true' === opts.active || 1 === opts.active)
        doc.save(function(err){
          if(err) throw new Error('Could not save peer: ' + err)
          console.log('Peer updated successfully!')
          process.exit()
        })
      })
    })
  //remove
  program
    .command('remove')
    .option('-h, --host <s>','Host of peer to remove')
    .description('Remove peer')
    .action(function(opts){
      if(!opts.host) throw new Error('Host required... exiting')
      Peer.findOne({host: opts.host},function(err,doc){
        if(err) throw new Error('Could not lookup peer to remove ' + err)
        doc.remove(function(err){
          if(err){
            console.log('Error: could not remove peer: ' + err)
          } else {
            console.log('Peer removed successfully!')
          }
          process.exit()
        })
      })
    })
  //list
  program
    .command('list')
    .description('List peers')
    .action(function(){
      Peer.list({},function(err,count,results){
        var table = new Table({
          head: ['Host','Location','Primary Group','Hits','Active']
        })
        if(results instanceof Array){
          results.forEach(function(row){
            table.push([
              row.host,
              row.location,
              row.primaryGroup,
              row.hits,
              row.active ? 'Yes' : 'No'
            ])
          })
        }
        console.log(table.toString())
        process.exit()
      })
    })
  program.version(config.version)
  var cli = program.parse(process.argv)
  if(!cli.args.length) program.help()
})
