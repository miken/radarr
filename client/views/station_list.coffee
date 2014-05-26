# write a function that converts coordinates to US zip code

# Create a local collection of stations
Stations = new Meteor.Collection(null)

# Make an API call to YES to retrieve the list of stations
Meteor.call "getStationFromYes", "90401", (error, results) ->
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
        # The 0th element gives the result with the space
        # The 1st element gives the result without the space
        descriptionString = descriptionStringResult[1]

      # Pick out selected properties from s
      newStation = _.extend(_.pick(s, "name"),
        description: if descriptionString then descriptionString else "No description"
        band: if s.name.indexOf("-AM") == -1 then "FM" else "AM"
        frequencyString: frequencyString
        frequency: if frequencyString then parseFloat frequencyString, 10 else 9999
      )

      Stations.insert(newStation)

Template.stationList.helpers
  fmStations: ->
    # Sort station list by frequency, then by name
    Stations.find {band: "FM"},
      sort:
        ["frequency", "name"]

  amStations: ->
    # Sort station list by frequency, then by name
    Stations.find {band: "AM"},
      sort:
        ["frequency", "name"]