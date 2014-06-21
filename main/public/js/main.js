/* global socket: false, Handlebars: false */
$(document).ready(function(){
  var template = Handlebars.compile($('#ping-result-template').html())
  var pulsarBeat = function(id){
    var pulsar = $('tr#' + id + '>.pulsar>span')
    pulsar.fadeIn(0,function(){pulsar.fadeOut(1000)})
  }
  var pulsarFinal = function(id){
    //we replace the html here ON PURPOSE to autocancel all other previous animations
    //do not convert to simple class refuckery, thanks
    $('tr#' + id + ' > .pulsar').html('<span class="glyphicon glyphicon-ok text-success"/>')
  }
  var pingInit = function(data){
    //destroy the Waiting message if any
    $('tr#waiting').remove()
    //dump existing if any (shouldn't be?)
    $('tr#'+data.id).remove()
    //eventually add some smart row placement here
    if(null === data.result.min) data.result.min = '-'
    if(null === data.result.max) data.result.max = '-'
    if(null === data.result.avg) data.result.avg = '-'
    if(null === data.result.loss) data.result.loss = '-'
    $('#pingTable > tbody').append(template({data: data}))
  }
  var pingResult = function(data){
    var row = $('tr#'+data.id)
    if(!row.length) console.log('EPIC FAIL')
    row.find('.ip').html(data.result.ip)
    row.find('.min').html(data.result.min)
    row.find('.avg').html(data.result.avg)
    row.find('.max').html(data.result.max)
    row.find('.loss').html(data.result.loss)
    pulsarBeat(data.id)
  }
  var pingComplete = function(data){
    var row = $('tr#'+data.id)
    if(!row.length) console.log('EPIC FAIL')
    pulsarFinal(data.id)
  }
  socket.on('pingInit',pingInit)
  socket.on('pingResult',pingResult)
  socket.on('pingComplete',pingComplete)
  $('#ping').submit(function(e){
    e.preventDefault()
    var host = $('#host').val().replace(/\s+/g,'')
    if('' === host) return(false)
    $('#pingResultWrapper').removeClass('hidden')
    //send the ping submission to the backend
    socket.emit('ping',{
      host: host,
      group: $('#group').val()
    })
  })
})
