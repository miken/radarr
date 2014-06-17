Template.searchBox.events
  'submit form': (e) ->
    e.preventDefault()

    rawString = $(e.target).find("[name=loc]").val()
    # Mask process with a loading screen
    Router.go "loading"

    # Clear all Zipcodes data
    Zipcodes.remove {}
    # Convert input to zip code
    # And store zip code in the local collection
    processSuccess = processRawInput rawString
    # Wait until the zip code is stored and then call the collect function
    Meteor.setTimeout collectZipAndLoadStations, 1000