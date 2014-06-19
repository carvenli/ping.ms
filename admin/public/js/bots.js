var generateSecret = function(){
  $('[name=secret]')[0].value = generatePassword(15,false)
}
$(document).ready(function(){$('.multiselect').multiselect({
  buttonText: function(options){
    if(0 === options.length)
      return '<span class="label label-default">(none)</span> <b class="caret"></b>'
    else {
      var selected = ''
      options.each(function(){
        var label = ($(this).attr('value') !== undefined) ? $(this).attr('value') : $(this).html()
        selected += '<span class="label label-primary">' + label + '</span> '
      })
      return selected.substr(0, selected.length - 1) + ' <b class="caret"></b>'
    }
  }
})})
