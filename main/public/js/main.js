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
  var updateTable = function(data){
    //if the waiting banner still exists clear it
    var waiting = $('.waiting')
    if(waiting.length) waiting.remove()
    //figure out sponsor
    var sponsor
    if(data.sponsor.url)
      sponsor = '<td><a href="'+ data.sponsor.url +'">'+ data.location + '</a></td>'
    else
      sponsor = '<td>' + data.location + '</td>'
    //add the result
    var row = tbody.find('tr#' + data.id)
    if(!row.length){
      tbody.append('<tr id="' + data.id + '"></tr>')
      row = tbody.find('tr#' + data.id)
    }
    row.html(
        sponsor +
        '<td>' + data.result.ip + '</td>' +
        '<td>' + data.result.min + '</td>' +
        '<td>' + data.result.max +'</td>' +
        '<td>' + data.result.avg + '</td>' +
        '<td>' + data.result.loss + '%</td>' +
        '<td><a href="#">Traceroute</a></td>'
    )
  }
  socket.on('pingResult',function(data){
    updateTable(data)
  })
})
