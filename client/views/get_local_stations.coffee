Template.getLocalStations.events
  'submit form': (e) ->
    e.preventDefault()

    # Find current latitude using navigator
    if navigator.geolocation
      # First cover up with a loading screen
      Router.go "loading"
      # Then call getCurrentPosition method
      navigator.geolocation.getCurrentPosition (position) ->
        # Insert new coords into Coords collection
        lat = position.coords.latitude
        lng = position.coords.longitude
        coords = "#{lat},#{lng}"
        # Call server method convertLatLngToZip to convert coordinates to zip code
        Meteor.call "convertLatLngToZip", coords, (error, response) ->
          if error
            # Go to empty station list and throw error
            Router.go "welcome"
            throwError error.reason
          else
            # Convert JSON response to object
            responseObj = JSON.parse(response.content)
            # Pick the first response from the results array
            addressComponents = responseObj.results[0].address_components
            # In this array of address components, the first element
            # usually returns the zip code
            zipCode = addressComponents[0].short_name

            # Clear out Zipcodes collection just in case
            Zipcodes.remove {}
            # Insert this zip into the zipcode collection
            newCode =
              code: zipCode
            Zipcodes.insert newCode
            # With this zipCode retrieved, call on collectZipAndLoadStations
            # Wait until the zip code is stored and then call the collect function
            Meteor.setTimeout collectZipAndLoadStations, 1000
    else
      throw new Meteor.Error 422, "Cannot locate your current location."