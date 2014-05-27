@checkNoStations = ->
  count = Stations.find().count()
  if count > 0
    return false
  else
    return true