Router.configure
  layoutTemplate: "layout"
  loadingTemplate: "loading"

Router.map ->
  @route "welcome",
    path: "/"

  @route "stationList",
    path: "/search"