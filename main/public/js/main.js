/* global socket: false */
$(document).ready(function(){
  var tbody = $('#resultBody')
  var results = $('#results')
  $('#ping').submit(function(e){
    e.preventDefault()
    //clear results
    tbody.empty()
    //add waiting
    tbody.html('<tr id="waiting"><td colspan="7">Waiting for results...</td></tr>')
    //remove hidden class
    results.removeClass('hidden')
    //send the ping submission to the backend
    socket.emit('ping',{
      host: $('#host').val(),
      group: $('#group').val()
    })
  })
  socket.on('pingResult',function(data){
    //if the waiting banner still exists clear it
    var waiting = $('#waiting')
    if(waiting.length) waiting.remove()
    //figure out sponsor
    var sponsor
    if(data.sponsor.url)
      sponsor = '<td><a href="'+ data.sponsor.url +'">'+ data.location + '</a></td>'
    else
      sponsor = '<td>' + data.location + '</td>'
    //add the result
    tbody.append(
      '<tr>' +
      sponsor +
      '<td>' + data.ip + '</td>' +
      '<td>' + data.ping.min + '</td>' +
      '<td>' + data.ping.max +'</td>' +
      '<td>' + data.ping.avg + '</td>' +
      '<td>' + data.ping.loss + '%</td>' +
      '<td><a href="#">Traceroute</a></td>' +
      '</tr>'
    )
  })
})
