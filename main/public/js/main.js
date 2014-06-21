/* global socket: false, Handlebars: false */
$(document).ready(function(){
  var template = Handlebars.compile($('#ping-result-template').html())

  var pingResults = []
  var pingExists = function(id){
    var exists = false
    pingResults.forEach(function(row){
      if(row.id === id) exists = true
    })
    return exists
  }
  var pingUpdate = function(data){
    if(!pingExists(data.id)) pingResults.push(data)
    else {
      pingResults.forEach(function(row,i,o){
        if(row.id !== data.id) return
        o[i] = data
      })
    }
    $('#pingResults').html(template({pingResults: pingResults}))
    var pulsar = $('tr#' + data.id + ' > .pulsar > span')
    pulsar.fadeIn(0,function(){pulsar.fadeOut(1000)})
  }
  $('#ping').submit(function(e){
    e.preventDefault()
    $('#pingResults').html(template())
    $('#pingResultWrapper').removeClass('hidden')
    //send the ping submission to the backend
    socket.emit('ping',{
      host: $('#host').val(),
      group: $('#group').val()
    })
  })
  socket.on('pingInit',pingUpdate)
  socket.on('pingResult',pingUpdate)
  socket.on('pingComplete',function(data){
    pingUpdate(data)
    var pulsar = $('tr#' + data.id + ' > .pulsar')
    //we replace the html here ON PURPOSE to autocancel all other previous animations
    //do not convert to simple class refuckery, thanks
    pulsar.html('<span class="glyphicon glyphicon-ok text-success"/>')
  })
})
