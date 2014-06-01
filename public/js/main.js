var checkboxToggle = true
$('#toggle').click(function(){
  $('table.table td input').prop('checked',checkboxToggle)
  checkboxToggle = !checkboxToggle
})
