Router.configure
  layoutTemplate: "layout"
  loadingTemplate: "loading"
  waitOn: ->
    IRLibLoader.load("/jquery.liveaddress.js")

Router.map ->
  @route "welcome",
    path: "/"

  @route "stationList",
    path: "/search"
    waitOn: ->
      # Check if Station list if empty, if so, go to welcome page
      if Stations.find().count() == 0
        Router.go('welcome')
