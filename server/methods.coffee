if Meteor.isServer
  Meteor.methods
    getStationFromYes: (zipCode) ->
      yesApiUrl = "http://api.yes.com/1/stations?loc=#{zipCode}&max=100"
      HTTP.get(yesApiUrl)

    convertAddressToZip: () ->
      # Token will change depending on hostname
      fullUrl = Meteor.absoluteUrl()

      if fullUrl.indexOf("localhost") > -1
        token = "4954915183782114106"
      else if fullUrl.indexOf("meteor.com") > -1
        token = "4954915181771352772"
      if token
        SmartyStreetsApiUrl = "https://api.smartystreets.com/zipcode?auth-token=#{token}&city=Cambridge&state=MA"
        HTTP.get(SmartyStreetsApiUrl)
      else
        throw new Meteor.Error 422, "Unauthorized token. Please check your Smarty Streets account for tokens."