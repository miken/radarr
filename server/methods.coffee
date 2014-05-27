getSSToken = () ->
  # Token will change depending on hostname
  fullUrl = Meteor.absoluteUrl()
  if fullUrl.indexOf("localhost") > -1
    token = "4954915183782114106"
  else if fullUrl.indexOf("meteor.com") > -1
    token = "4954915181771352772"
  if token
    return token
  else
    throw new Meteor.Error 422, "Unauthorized token. Please check your Smarty Streets account for tokens."

if Meteor.isServer
  Meteor.methods
    getStationFromYes: (zipCode) ->
      yesApiUrl = "http://api.yes.com/1/stations?loc=#{zipCode}&max=100"
      HTTP.get(yesApiUrl)

    convertAddressToZip: (city, state) ->
      token = getSSToken()
      SmartyStreetsApiUrl = "https://api.smartystreets.com/zipcode?auth-token=#{token}&city=#{city}&state=#{state}"
      HTTP.get(SmartyStreetsApiUrl)

    processRawInput: (rawString) ->
      # User can input either
      # 'Cambridge, MA'
      # or '02139'
      zipRegex = /^\d{5}$/
      cityStateRegex = /^.*\, ?[a-zA-Z]*/
      if zipRegex.test rawString
        # It looks like a zip code
        zipCode = rawString
        return zipCode
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
            console.log error
          else
            response = results.data[0]
            # We'll pick out the first object from the zipcodes property
            zipObject = response.zipcodes[0]
            Session.set 'zipCode', zipObject.zipcode
        # Collect zipCode from Session
        zipCode = Session.get 'zipCode'
        return zipCode
      # Else raise an error
      else
        throw new Meteor.Error 404, "Not a valid location."