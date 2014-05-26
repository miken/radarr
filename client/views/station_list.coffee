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