# write a function that converts coordinates to US zip code

loadStationFromLoc = (loc) ->
  # First, clear off all Station data
  Stations.remove {}

  # Then make an API call to YES to retrieve the list of stations
  Meteor.call "getStationFromYes", loc, (error, results) ->
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

    # Once all stations are loaded, route to stationList to display
    Router.go('stationList')

Template.searchBox.events
  'submit form': (e) ->
    e.preventDefault()

    # Right now it's zip code
    loc = $(e.target).find("[name=loc]").val()

    # Use this to call API and reload Station
    loadStationFromLoc loc
