/* global socket: false */
$(document).ready(function(){
  var tbody = $('#results table>tbody')
  var results = $('#results')
  $('#ping').submit(function(e){
    e.preventDefault()
    //clear results
    tbody.empty()
    //add waiting
    tbody.html('<tr><td colspan="7">Waiting for results...</td></tr>')
    //remove hidden class
    results.removeClass('hidden')
    //send the ping submission to the backend
    socket.emit('ping',{
      host: $('#host').val(),
      group: $('#group').val()
    })
  })
})

