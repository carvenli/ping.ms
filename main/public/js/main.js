/* global socket: false */
$(document).ready(function(){
  var tbody = $('#resultBody')
  var results = $('#results')
  $('#ping').submit(function(e){
    e.preventDefault()
    //clear results
    tbody.empty()
    //add waiting
    tbody.html('<tr class="waiting"><td colspan="7">Waiting for results...</td></tr>')
    //remove hidden class
    results.removeClass('hidden')
    //send the ping submission to the backend
    socket.emit('ping',{
      host: $('#host').val(),
      group: $('#group').val()
    })
  })
  socket.on('pingInit',function(data){
    var idGen = function(tag){return tag + '_' + data.id}
    var cellGen = function(item){
      return '<td id="' + idGen(item) + '">' + data.result[item] + '</td>'
    }
    //if the waiting banner still exists clear it
    var waiting = $('.waiting')
    if(waiting.length) waiting.remove()
    //figure out sponsor
    var sponsor = '<td id="' + idGen('sponsor') + '">'
    if(data.sponsor.url)
      sponsor = sponsor + '<a href="'+ data.sponsor.url +'">'+ data.location + '</a>'
    else
      sponsor = sponsor + data.location
    sponsor = sponsor + '</td>'
    //add the result
    var row = tbody.find('tr#' + idGen('row'))
    if(!row.length){
      tbody.append('<tr id="' + idGen('row') + '"></tr>')
      row = tbody.find('tr#' + idGen('row'))
    }
    row.html(
        sponsor +
        cellGen('ip') +
        cellGen('min') +
        cellGen('max') +
        cellGen('avg') +
        cellGen('loss') +
        '<td id="' + idGen('traceLink') + '"><a href="#">Traceroute</a></td>'
    )
  })
  socket.on('pingResult',function(data){
    //update the row
    var row = tbody.find('tr#row_' + data.id)
    if(row.length){
      var rowUpdate = function(tag){
        row.find('td#' + tag + '_' + data.id).html(data.result[tag])
      }
      rowUpdate('ip')
      rowUpdate('min')
      rowUpdate('max')
      rowUpdate('avg')
      rowUpdate('loss')
    }
  })
})
