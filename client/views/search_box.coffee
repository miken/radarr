# Create a local collection of zipcodes
# Usually there should only be one zipcode stored
@Zipcodes = new Meteor.Collection null

loadStationFromLoc = (zipCode) ->
  # First, clear off all Station data
  Stations.remove {}
  # Then make an API call to YES to retrieve the list of stations
  Meteor.call "getStationFromYes", zipCode, (error, results) ->
    if error
      throwError error.reason
    else
      stations = results.data.stations

      # Use this regex to generate frequencyString from desc
      frequencyStringRegex = /\d+.?\d+/
      # Use this regex to generate description from desc
      descriptionStringRegex = /(?:\s[-]\s)\b(.*)/

      for s in stations
        do (s) ->
          # Parse frequency from desc
          frequencyStringResult = frequencyStringRegex.exec s.desc
          if frequencyStringResult
            frequencyString = frequencyStringResult[0]

          # Parse description from desc
          descriptionStringResult = descriptionStringRegex.exec s.desc
          if descriptionStringResult
            # The 0th element gives the result with the space, i.e. ' - Station Name'
            # The 1st element gives the result without the space, i.e. 'Station Name'
            # So pick the 1st element
            descriptionString = descriptionStringResult[1]

          # Pick out selected properties from s
          newStation = _.extend(_.pick(s, "name"),
            description: if descriptionString then descriptionString else "No description"
            band: if s.name.indexOf("-AM") == -1 then "FM" else "AM"
            frequencyString: frequencyString
            frequency: if frequencyString then parseFloat frequencyString, 10 else 9999
          )

          Stations.insert(newStation)

      # Check if there's any stations
      stationCount = Stations.find().count()
      if stationCount > 0
        Router.go 'stationList'
      else
        # No stations found
        Router.go 'noStations'


processRawInput = (rawString) ->
  # User can input either
  # 'Cambridge, MA'
  # or '02139'
  zipRegex = /^\d{5}$/
  cityStateRegex = /^.*\, ?[a-zA-Z]*/
  if zipRegex.test rawString
    # It looks like a zip code
    zipCode = rawString
    newCode =
      code: zipCode
    Zipcodes.insert newCode
  else if cityStateRegex.test rawString
    # It looks like <City>, <STATE>
    # Then it needs to be converted into zip code
    # using look up service
    inputArray = rawString.split(",")
    # Use trim() to remove leading and trailing spaces
    city = inputArray[0].trim()
    state = inputArray[1].trim()
    # Now obtain zipcode using Smarty Streets API
    Meteor.call "convertAddressToZip", city, state, (error, results) ->
      if error
        throwError error.reason
      else
        response = results.data[0]
        # We'll pick out the first object from the zipcodes property
        if typeof response.zipcodes isnt "undefined"
          zipObject = response.zipcodes[0]
          zipCode = zipObject.zipcode
          newCode =
            code: zipCode
          Zipcodes.insert newCode
        else
          # Probably the API couldn't find a destination so throw an error here
          error = new Meteor.Error 404, "Can't find stations for the given location."
          throwError error.reason
  else
    error = new Meteor.Error 404, "Not a valid location."
    throwError error.reason

collectZipAndLoadStations = () ->
  newCode = Zipcodes.findOne {}
  if newCode
    Router.go "loading"
    zipCode = newCode.code
    loadStationFromLoc zipCode


Template.searchBox.events
  'submit form': (e) ->
    e.preventDefault()

    rawString = $(e.target).find("[name=loc]").val()

    # Clear all Zipcodes data
    Zipcodes.remove {}
    # Convert input to zip code
    # And store zip code in the local collection
    processSuccess = processRawInput rawString
    # Wait until the zip code is stored and then call the collect function
    Meteor.setTimeout collectZipAndLoadStations, 1000