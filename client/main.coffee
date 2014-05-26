if Meteor.isClient
  Template.hello.greeting = ->
    "Welcome to fmlist."

  Template.hello.events "click input": ->
    console.log "You pressed the button"  if typeof console isnt "undefined"

if Meteor.isServer
  Meteor.startup ->
