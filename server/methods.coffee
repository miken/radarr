if Meteor.isServer
  Meteor.methods
    getStationFromYes: (zipCode) ->
      yesApiUrl = "http://api.yes.com/1/stations?loc=#{zipCode}&max=100"
      HTTP.get(yesApiUrl)