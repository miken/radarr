Router.configure
  layoutTemplate: "layout"
  loadingTemplate: "loading"
  waitOn: ->
    IRLibLoader.load("/liveaddress.min.js")

Router.map ->
  @route "welcome",
    path: "/"

  @route "loading",
    path: "/pleasewait"

  @route "tryAgain",
    path: "/tryagain"

  @route "noStations",
    path: "/nostations"

  @route "stationList",
    path: "/search"

Router.onBeforeAction "loading"
Router.onBeforeAction ->
   clearErrors()