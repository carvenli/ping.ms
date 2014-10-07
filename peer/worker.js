'use strict';
var axon = require('axon')
var P = require('bluebird')
var worker = require('infant').worker

var app = express()
var server = axon.createSocket('req')

var config = require('../config')

//make some promises
P.promisifyAll(server)

//setup templating
app.set('views',__dirname + '/views')
app.set('view engine','jade')

//static file server
app.use(express.static(__dirname + '/public'))


/**
 * Start embed system
 * @param {function} done
 */
exports.start = function(done){
  server.listenAsync(config.peer.port,config.peer.host)
    .then(done).catch(done)
}


/**
 * Stop embed system
 * @param {function} done
 */
exports.stop = function(done){
  server.closeAsync()
    .then(done).catch(done)
}


//worker startup through infant
if(require.main === module)
  worker(server,'peer:worker',exports.start,exports.stop)

