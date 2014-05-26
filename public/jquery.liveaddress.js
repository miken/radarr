/**
	LiveAddress API jQuery Plugin
	by SmartyStreets - smartystreets.com

	(c) 2012-2013 SmartyStreets

	LICENSED UNDER THE GNU GENERAL PUBLIC LICENSE VERSION 3
	(http://opensource.org/licenses/gpl-3.0.html)

	Documentation: 			http://smartystreets.com/kb/liveaddress-api/website-forms
	Version: 				(See variable below for version)
	Minified:				(See documentation or GitHub repository for minified script file)
	Latest stable version: 	(See documentation)
	Bleeding-edge release: 	https://github.com/smartystreets/jquery.liveaddress

	Feel free to contribute to this project on GitHub by
	submitting pull requests and reporting issues.
**/


(function($, window, document) {
	"use strict";		//  http://ejohn.org/blog/ecmascript-5-strict-mode-json-and-more/

	/*
	  *	PRIVATE MEMBERS
	*/

	var instance;			// Contains public-facing functions and variables
	var ui = new UI;		// Internal use only, for UI-related tasks
	var version = "2.4.11";	// Version of this copy of the script
	
	var defaults = {
		candidates: 3,															// Number of suggestions to show if ambiguous
		autocomplete: 10,														// Number of autocomplete suggestions; set to 0 or false to disable
		requestUrl: "https://api.smartystreets.com/street-address",				// API endpoint
		timeout: 5000,															// How long to wait before the request times out (5000 = 5 seconds)
		speed: "medium",														// Animation speed
		ambiguousMessage: "Choose the correct address",							// Message when address is ambiguous
		invalidMessage: "Address not verified",									// Message when address is invalid
		fieldSelector: "input[type=text], input:not([type]), textarea, select",	// Selector for possible address-related form elements
		submitSelector: "[type=submit], [type=image], [type=button]:last, button:last"	// Selector to find a likely submit button or submit image (in a form)
	};
	var config = {};				// Configuration settings as set by the user or just the defaults
	var forms = [];					// List of forms (which hold lists of addresses)
	var defaultSelector = 'body';	// Default selector which should be over the whole page (must be compatible with the .find() function; not document)
	var mappedAddressCount = 0;		// The number of currently-mapped addresses
	var acceptableFields = ["street", "street2", "secondary", "city", "state", "zipcode", "lastline", "addressee", "urbanization", "country"]; // API input field names

	/*
	  *	ENTRY POINT
	*/
	
	$.LiveAddress = function(arg)
	{
		return $(defaultSelector).LiveAddress(arg);
	};

	$.fn.LiveAddress = function(arg)
	{
		if (instance)
			return instance;

		var matched = this, wasChained = matched.prevObject ? !!matched.prevObject.prevObject : false;

		// Make sure the jQuery version is compatible
		var vers = $.fn.jquery.split(".");
		if (vers.length >= 2)
		{
			if (vers[0] < 1 || (vers[0] == 1 && vers[1] < 5))
			{
				console.log("jQuery version "+$.fn.jquery+" found, but LiveAddress requires jQuery version 1.5 or higher. Aborting.");
				return false;
			}
		}
		else
			return false;

		if (arg.debug)
			console.log("LiveAddress API jQuery Plugin version "+version+" (Debug mode)");

		// Mapping fields requires that the document be fully loaded in order to attach UI elements
		if (document.readyState === "complete")
			window.loaded = true;
		else
			$(window).load(function() { window.loaded = true; });

		// Determine if user passed in an API key or a settings/config object
		if (typeof arg === 'string')
		{
			// Use the default configuration
			config = { key: arg, candidates: defaults.candidates };
		}
		else if (typeof arg === 'object')
		{
			// Persist the user's configuration
			config = $.extend(config, arg);
		}

		// Enforce some defaults
		config.candidates = config.candidates || defaults.candidates;
		config.ui = typeof config.ui === 'undefined' ? true : config.ui;
		config.autoMap = typeof config.autoMap === 'undefined' ? true : config.autoMap;
		config.autoVerify = typeof config.autoVerify === 'undefined' ? true : config.autoVerify;
		config.submitVerify = typeof config.submitVerify === 'undefined' ? true : config.submitVerify;
		config.timeout = config.timeout || defaults.timeout;
		config.ambiguousMessage = config.ambiguousMessage || defaults.ambiguousMessage;
		config.invalidMessage = config.invalidMessage || defaults.invalidMessage;
		config.fieldSelector = config.fieldSelector || defaults.fieldSelector;
		config.submitSelector = config.submitSelector || defaults.submitSelector;
		config.requestUrl = config.requestUrl || defaults.requestUrl;
		config.autocomplete = typeof config.autocomplete === 'undefined' ? defaults.autocomplete : config.autocomplete;
		config.cityFilter = typeof config.cityFilter === 'undefined' ? "" : config.cityFilter;
		config.stateFilter = typeof config.stateFilter === 'undefined' ? "" : config.stateFilter;
		config.cityStatePreference = typeof config.cityStatePreference === 'undefined' ? "" : config.cityStatePreference;
		config.geolocate = typeof config.geolocate === 'undefined' ? true : config.geolocate;

		config.candidates = config.candidates < 1 ? 0 : (config.candidates > 10 ? 10 : config.candidates);

		if (typeof config.autocomplete === 'number')
			config.autocomplete = config.autocomplete < 1 ? false : (config.autocomplete > 10 ? 10 : config.autocomplete);

		/*
		  *	EXPOSED (PUBLIC) FUNCTIONS
		*/
		instance = {
			events: EventHandlers,
			on: function(eventType, userHandler)
			{
				if (!EventHandlers[eventType] || typeof userHandler !== 'function')
					return false;

				var previousHandler = EventHandlers[eventType];
				EventHandlers[eventType] = function(event, data) {
					userHandler(event, data, previousHandler);
				};
			},
			mapFields: function(map)
			{
				var doMap = function(map)
				{
					if (map === "auto")
						return ui.automap(matched);
					else if (typeof map === 'object')
						return ui.mapFields(map, matched);
					else if (!map && typeof config.addresses === 'object')
						return ui.mapFields(config.addresses, matched)
					else if (config.autoMap)
						return ui.automap(matched);
					else
						return false;
				};
				if ($.isReady)
					doMap(map);
				else
					$(function() {
						if (!wasChained)
							matched = $(matched.selector);
						doMap(map);
					});
			},
			makeAddress: function(addressData)
			{
				if (typeof addressData !== "object")
					return instance.getMappedAddressByID(addressData) || new Address({ street: addressData });
				else
					return new Address(addressData);
			},
			verify: function(input, callback)
			{
				var addr = instance.makeAddress(input);			// Below means, force re-verify even if accepted/unchanged.
				trigger("VerificationInvoked", { address: addr, verifyAccepted: true, invoke: callback });
			},
			getMappedAddresses: function()
			{
				var addr = [];
				for (var i = 0; i < forms.length; i++)
					for (var j = 0; j < forms[i].addresses.length; j++)
						addr.push(forms[i].addresses[j]);
				return addr;
			},
			getMappedAddressByID: function(id)
			{
				for (var i = 0; i < forms.length; i++)
					for (var j = 0; j < forms[i].addresses.length; j++)
						if (forms[i].addresses[j].id() == id)
							return forms[i].addresses[j];
			},
			setKey: function(htmlkey)
			{
				config.key = htmlkey;
			},
			setCityFilter: function(cities)
			{
				config.cityFilter = cities;
			},
			setStateFilter: function(states)
			{
				config.stateFilter = states;
			},
			setCityStatePreference: function(pref)
			{
				config.cityStatePreference = pref;
			},
			activate: function(addressID)
			{
				var addr = instance.getMappedAddressByID(addressID);
				if (addr)
					addr.active = true;
			},
			deactivate: function(addressID)
			{
				if (!addressID)
					return ui.clean();
				var addr = instance.getMappedAddressByID(addressID);
				if (addr)
					addr.active = false;
			},
			autoVerify: function(setting)
			{
				if (typeof setting === 'undefined')
					return config.autoVerify;
				else if (setting === "disable" || setting === "off" || !setting)
					config.autoVerify = false;
				else
					config.autoVerify = true;
			},
			version: version
		};

		
		// Bind each handler to an event
		for (var prop in EventHandlers)
			bind(prop);

		// Map the fields
		instance.mapFields();

		return instance;
	};



	/*
	  *	PRIVATE FUNCTIONS / OBJECTS
	*/



	/*
		The UI object auto-maps the fields and controls
		interaction with the user during the address
		verification process.
	*/
	function UI()
	{
		var submitHandler;				// Function which is later bound to handle form submits
		var mapMeta = {
			formDataProperty: "smarty-form",	// Indicates whether we've stored the form already
			identifiers: {
				streets: {				// both street1 and street2, separated later.
					names: [			// Names are hidden from the user; "name" and "id" attributes
						'street',
						'address',		// This ("address") is a dangerous inclusion; but we have a strong set of exclusions below to prevent false positives.
						'address1',		// If there are automapping issues (specifically if it is too greedy when mapping fields) it will be because
						'address2',		// of these arrays for the "streets" fields, namely the "address" entry right around here, or potentially others.
						'addr1',
						'addr2',
						'address-1',
						'address-2',
						'address_1',
						'address_2',
						'line',
						'primary'
					],
					labels: [			// Labels are visible to the user (labels and placeholder texts)
						'street',
						'address',		// hazardous (e.g. "Email address") -- but we deal with that later
						'line ',
						' line'
					]
				},
				secondary: {
					names: [
						'suite',
						'apartment',
						'primary',
						//'box',		// This false-positives fields like "searchBox" ...
						'pmb',
						//'unit',		// I hesitate to allow this, since "Units" (as in quantity) might be common...
						'secondary'
					],
					labels: [
						'suite',
						'apartment',
						'apt:',
						'apt.',
						'ste:',
						'ste.',
						'unit:',
						'unit.',
						'unit ',
						'box',
						'pmb'
					]
				},
				city: {
					names: [
						'city',
						'town',
						'village',
						'cityname',
						'city-name',
						'city_name',
						'cities'
					],
					labels: [
						'city',
						'town',
						'city name'
					]
				},
				state: {
					names: [
						'state',
						'province',
						'region',
						'section',
						'territory'
					],
					labels: [
						'state',
						'province',
						'region',
						'section',
						'territory'
					]
				},
				zipcode: {
					names: [
						'zip',
						'zipcode',
						'zip-code',
						'zip_code',
						'postal_code',
						'postal-code',
						'postalcode',
						'postcode',
						'post-code',
						'post_code',
						'postal',
						'zcode'
					],
					labels: [
						'zip',
						'zip code',
						'postal code',
						'postcode',
						'locality'
					]
				},
				lastline: {
					names: [
						'lastline',
						'last-line',
						'citystatezip',
						'city-state-zip',
						'city_state_zip'
					],
					labels: [
						'last line',
						'city/state/zip',
						'city / state / zip',
						'city - state - zip',
						'city-state-zip',
						'city, state, zip'
					]
				},
				country: {				// We only use country to see if we should submit to the API
					names: [
						'country',
						'nation',
						'sovereignty'
					],
					labels: [
						'country',
						'nation',
						'sovereignty'
					]
				}
			},	// We'll iterate through these (above) to make a basic map of fields, then refine:
			street1exacts: {		// List of case-insensitive EXACT matches for street1 field
				names: [
					'address',
					'street',
					'address1',
					'streetaddress',
					'street-address',
					'street_address',
					'streetaddr',
					'street-addr',
					'street_addr',
					'str',
					'str1',
					'street1',
					'addr'
				]
			},
			street2: {			// Terms which would identify a "street2" field
				names: [
					'address2',
					'address_2',
					'address-2',
					'street2',
					'addr2',
					'addr_2',
					'line2',
					'str2',
					'second',
					'two'
				],
				labels: [
					' 2',
					'second ',
					'two'
				]
			},
			exclude: {			// Terms we look for to exclude an element from the mapped set to prevent false positives
				names: [		// The intent is to keep non-address elements from being mapped accidently.
					'email',
					'e-mail',
					'e_mail',
					'firstname',
					'first-name',
					'first_name',
					'lastname',
					'last-name',
					'last_name',
					'fname',
					'lname',
					'name',			// Sometimes problematic ("state_name" ...) -- also see same label value below
					'eml',
					'type',
					'township',
					'zip4',
					'plus4',
					'method',
					'location',
					'store',
					'save',
					'keep',
					'phn',
					'phone',
					'cardholder',	// I hesitate to exclude "card" because of common names like: "card_city" or something...
					'security',
					'comp',
					'firm',
					'org',
					'addressee',
					'addresses',
					'group',
					'gate',
					'fax',
					'cvc',
					'cvv',
					'file',
					'search',
					'list'			// AmeriCommerce cart uses this as an "Address Book" dropdown to choose an entire address...
				],
				labels: [
					'email',
					'e-mail',
					'e mail',
					' type',
					'save ',
					'keep',
					'name',
					'method',
					'phone',
					'organization',
					'company',
					'addressee',
					'township',
					'firm',
					'group',
					'gate',
					'cardholder',
					'cvc',
					'cvv',
					'search',
					'file',
					' list',
					'fax',
					'book'
				]
			}
		};

		var autocompleteResponse;		// The latest response from the autocomplete server
		var autocplCounter = 0;			// A counter so that only the most recent JSONP request is used
		var autocplRequests = [];		// The array that holds autocomplete requests in order
		var loaderWidth = 24, loaderHeight = 8;		// TODO: Update these if the image changes
		var uiCss = "<style>"
			+ ".smarty-dots { display: none; position: absolute; z-index: 999; width: "+loaderWidth+"px; height: "+loaderHeight+"px; background-image: url('data:image/gif;base64,R0lGODlhGAAIAOMAALSytOTi5MTCxPTy9Ly6vPz6/Ozq7MzKzLS2tOTm5PT29Ly+vPz+/MzOzP///wAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQJBgAOACwAAAAAGAAIAAAEUtA5NZi8jNrr2FBScQAAYVyKQC6gZBDkUTRkXUhLDSwhojc+XcAx0JEGjoRxCRgWjcjAkqZr5WoIiSJIaohIiATqimglg4KWwrDBDNiczgDpiAAAIfkECQYAFwAsAAAAABgACACEVFZUtLK05OLkxMbE9PL0jI6MvL68bG5s7Ors1NbU/Pr8ZGJkvLq8zM7MXFpctLa05ObkzMrM9Pb0nJqcxMLE7O7s/P78////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABWDgZVWQcp2nJREWmhLSKRWOcySoRAWBEZ8IBi+imAAcxwXhZODxDCfFwxloLI6A7OBCoPKWEG/giqxRuOLKRSA2lpVM6kM2dTZmyBuK0Aw8fhcQdQMxIwImLiMSLYkVPyEAIfkECQYAFwAsAAAAABgACACEBAIEpKak1NbU7O7svL68VFZU/Pr8JCIktLK05OLkzMrMDA4M9Pb0vLq87Ors9PL0xMLEZGZk/P78tLa05ObkzM7MFBIU////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABWLgJVGCcZ2n9DASmq7nUwDAQaAPhCAEgzqNncIQodEWgxNht7tdDBMmorIw0gKXh3T3uCSYgV3VitUiwrskZTspGpFKsJMRRVdkNBuKseT5Tg4TUQo+BgkCfygSDCwuIgN/IQAh+QQJBgAXACwAAAAAGAAIAIRUVlS0srTk4uR8enz08vTExsRsbmzs6uyMjoz8+vzU1tRkYmS8urzMzsxcWly0trTk5uR8fnz09vTMyszs7uycmpz8/vz///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFYOBlUVBynad1QBaaEtIpIY5jKOgxAM5w5IxAYJKo8HgLwmnnAAAGsodQ2FgcnYUL5Nh0QLTTqbXryB6cXcBPEBYaybEL0wm9SNqFWfOWY0Z+JxBSAXkiFAImLiolLoZxIQAh+QQJBgAQACwAAAAAGAAIAIQEAgS0srTc2tz08vTMyszk5uT8+vw0MjS8ury0trTk4uT09vTMzszs6uz8/vw0NjT///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFWiAELYMjno4gmCfkDItoEEGANKfwAMAjnA1EjWBg1I4G14HHO5gMiWOAEZUqIAIm86eQeo/XrBbA/RqlMceS6RxVa4xZLVHI7QCHn6hQRbAWDSwoKoIiLzEQIQAh+QQJBgAXACwAAAAAGAAIAIRUVlS0srTk4uR8enz08vTExsRsbmzs6uyMjoz8+vzU1tRkYmS8urzMzsxcWly0trTk5uR8fnz09vTMyszs7uycmpz8/vz///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFY+B1SYQlntYBmeeVQJSZTEHAHCcUOUCEiwqDw4GQNGrIhGgA4DkGIsIC0ARUHsia4AKpOiGXghewyGq5YwCu4Gw6jlnJ0gu9SKvWRKH2AIt0TQN+F0FNRSISMS0XKSuLCQKKIQAh+QQJBgAXACwAAAAAGAAIAIQEAgSkpqTU1tTs7uy8vrxUVlT8+vwkIiS0srTk4uTMyswMDgz09vS8urzs6uz08vTEwsRkZmT8/vy0trTk5uTMzswUEhT///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFZOB1MY8knhJpnpchUKahIEjjnAxEE8xJHABA4VGhGQ0ighFBEA0swWBkYgxMEpfHkva4BKLBxRaBHdACCHT3C14U0VbkRWlsXgYLcERGJQxOD3Q8PkBCfyMDKygMDIoiDAIJJiEAIfkECQYAFwAsAAAAABgACACEVFZUtLK05OLkxMbE9PL0jI6MvL68bG5s7Ors1NbU/Pr8ZGJkvLq8zM7MXFpctLa05ObkzMrM9Pb0nJqcxMLE7O7s/P78////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABWPgdUmEJZ4WaZ6XAlWmEgUBg5wSRRvSmRwOR0HSoBkVIoMxYBARFgBHdPJYBgSXijVAuAykUsBii5VsK96oelFc9i5K40MkgYInigHtAcHFH28XP1EFXSMwLBcWFRIrJwoCiCEAOw=='); }"
			+ ".smarty-ui { position: absolute; z-index: 99999; text-shadow: none; text-align: left; text-decoration: none; }"
			+ ".smarty-popup { border: 3px solid #4C4C4C; padding: 0; background: #F6F6F6; box-shadow: 0px 10px 35px rgba(0, 0, 0, .8); }"
			+ ".smarty-popup-header { background: #DDD; height: 12px; text-transform: uppercase; font: bold 12px/1em 'Arial Black', sans-serif; padding: 12px; }"
			+ ".smarty-popup-ambiguous-header { color: #333; }"
			+ ".smarty-popup-invalid-header { color: #CC0000; }"
			+ ".smarty-popup-close { color: #CC0000 !important; text-decoration: none !important; position: absolute; right: 15px; top: 10px; display: block; padding: 4px 6px; text-transform: uppercase; }"
			+ ".smarty-popup-close:hover { color: #FFF !important; background: #CC0000; }"
			+ ".smarty-choice-list .smarty-choice { background: #FFF; padding: 10px 15px; color: #1A1A1A; }"
			+ ".smarty-choice { display: block; font: 300 14px/1.5em sans-serif; text-decoration: none !important; border-top: 1px solid #CCC; }"
			+ ".smarty-choice-list .smarty-choice:hover { color: #EEE !important; background: #333; text-decoration: none !important; }"
			+ ".smarty-choice-alt { border-top: 1px solid #4C4C4C; background: #F6F6F6 !important; box-shadow: inset 0 4px 15px -5px rgba(0, 0, 0, .45); }"
			+ ".smarty-choice-alt .smarty-choice-abort, .smarty-choice-override { padding: 6px 15px; color: #B3B3B3 !important; font-size: 12px; text-decoration: none !important; }"
			+ ".smarty-choice-alt .smarty-choice:first-child { border-top: 0; }"
			+ ".smarty-choice-abort:hover { color: #333 !important; }"
			+ ".smarty-choice-override:hover { color: #CC0000 !important; }"
			+ ".smarty-tag { position: absolute; display: block; overflow: hidden; font: 15px/1.2em sans-serif; text-decoration: none !important; width: 20px; height: 18px; border-radius: 25px; transition: all .25s; -moz-transition: all .25s; -webkit-transition: all .25s; -o-transition: all .25s; }"
			+ ".smarty-tag:hover { width: 70px; text-decoration: none !important; color: #999; }"
			+ ".smarty-tag:hover .smarty-tag-text { color: #000 !important; }"
			+ ".smarty-tag-grayed { border: 1px solid #B4B4B4 !important; color: #999 !important; background: #DDD !important; box-shadow: inset 0 9px 15px #FFF; }"
			+ ".smarty-tag-green { border: 1px solid #407513 !important; color: #407513 !important; background: #A6D187 !important; box-shadow: inset 0 9px 15px #E3F6D5; }"
			+ ".smarty-tag-grayed:hover { border-color: #333 !important; }"
			+ ".smarty-tag-check { padding-left: 4px; text-decoration: none !important; }"
			+ ".smarty-tag-text { font-size: 12px !important; position: absolute; top: 0; left: 16px; width: 50px !important; text-align: center !important; }"
			+ ".smarty-autocomplete { border: 1px solid #777; background: white; overflow: hidden; white-space: nowrap; box-shadow: 1px 1px 3px #555; }"
			+ ".smarty-suggestion { display: block; color: #444; text-decoration: none !important; font-size: 12px; padding: 1px 5px; }"
			+ ".smarty-active-suggestion { background: #EEE; color: #000; border: none; outline: none; }"
			+ ".smarty-no-suggestions { padding: 1px 5px; font-size: 12px; color: #AAA; font-style: italic; }"
			+ "</style>";


		this.postMappingOperations = function()
		{
			// Injects materials into the DOM, binds to form submit events, etc... very important.

			if (config.ui)
			{
				// Prepend CSS to head tag to allow cascading and give their style rules priority
				$('head').prepend(uiCss);

				// For each address on the page, inject the loader and "address verified" markup after the last element
				var addresses = instance.getMappedAddresses();
				for (var i = 0; i < addresses.length; i++)
				{
					var id = addresses[i].id();
					$('body').append('<div class="smarty-ui"><div title="Loading..." class="smarty-dots smarty-addr-'+id+'"></div></div>');
					var offset = uiTagOffset(addresses[i].corners(true));
					$('body').append('<div class="smarty-ui" style="top: '+offset.top+'px; left: '+offset.left+'px;"><a href="javascript:" class="smarty-tag smarty-tag-grayed smarty-addr-'+id+'" title="Address not verified. Click to verify." data-addressid="'+id+'"><span class="smarty-tag-check">&#10003;</span><span class="smarty-tag-text">Verify</span></a></div>');
					
					// Move the UI elements around when browser window is resized
					$(window).resize({ addr: addresses[i] }, function(e)
					{
						var addr = e.data.addr;
						var offset = uiTagOffset(addr.corners(true));	// Position of lil' tag
						$('.smarty-tag.smarty-addr-'+addr.id())
							.parent('.smarty-ui')
							.css('top', offset.top+'px')
							.css('left', offset.left+'px');

						var addrOffset = addr.corners();				// Position of any popup windows
						$('.smarty-popup.smarty-addr-'+addr.id())
							.parent('.smarty-ui')
							.css('top', addrOffset.top+'px')
							.css('left', addrOffset.left+'px');

						if (config.autocomplete)						// Position of autocomplete boxes
						{
							var containerUi = $('.smarty-autocomplete.smarty-addr-'+addr.id()).closest('.smarty-ui');
							var domFields = addr.getDomFields();
							if (domFields['street'])
							{
								containerUi.css({
									"left": $(domFields['street']).offset().left + "px",
									"top": ($(domFields['street']).offset().top + $(domFields['street']).outerHeight()) + "px"
								});
							}
						}
					});

					// Disable for addresses defaulting to a foreign/non-US value
					if (!addresses[i].isDomestic())
					{
						var uiTag = $('.smarty-ui .smarty-tag.smarty-addr-'+id)
						if (uiTag.is(':visible'))
							uiTag.hide();
						addresses[i].accept({ address: addresses[i] }, false);
					}
				}

				$('body').delegate('.smarty-tag-grayed', 'click', function(e)
				{
					// "Verify" clicked -- manually invoke verification
					var addrId = $(this).data('addressid');
					instance.verify(addrId);
				});

				$('body').delegate('.smarty-undo', 'click', function(e)
				{
					// "Undo" clicked -- replace field values with previous input
					var addrId = $(this).parent().data('addressid');
					var addr = instance.getMappedAddressByID(addrId);
					addr.undo(true);
					// If fields are re-mapped after an address was verified, it loses its "accepted" status even if no values were changed.
					// Thus, in some rare occasions, the undo link and the "verified!" text may not disappear when the user clicks "Undo",
					// The undo functionality still works in those cases, but with no visible changes, the address doesn't fire "AddressChanged"...
				});



				// Prepare autocomplete UI
				if (config.autocomplete && config.key)
				{
					// For every mapped address, wire up autocomplete
					for (var i = 0; i < forms.length; i++)
					{
						var f = forms[i];

						for (var j = 0; j < f.addresses.length; j++)
						{
							var addr = f.addresses[j];
							var domFields = addr.getDomFields();

							if (domFields['street'])
							{
								var strField = $(domFields['street']);
								var containerUi = $('<div class="smarty-ui"></div>');
								var autoUi = $('<div class="smarty-autocomplete"></div>');

								autoUi.addClass('smarty-addr-' + addr.id());
								containerUi.data("addrID", addr.id())
								containerUi.append(autoUi);
								
								containerUi.css({
									"position": "absolute",
									"left": strField.offset().left + "px",
									"top": (strField.offset().top + strField.outerHeight()) + "px"
								});

								containerUi.hide().appendTo("body");

								containerUi.delegate(".smarty-suggestion", "click", { addr: addr, containerUi: containerUi }, function(event) {
									var sugg = autocompleteResponse.suggestions[$(this).data('suggIndex')];
									useAutocompleteSuggestion(event.data.addr, sugg, event.data.containerUi);
								});

								containerUi.delegate(".smarty-suggestion", "mouseover", function() {
									$('.smarty-active-suggestion').removeClass('smarty-active-suggestion');
									$(this).addClass('smarty-active-suggestion');
								});

								containerUi.delegate(".smarty-active-suggestion", "mouseleave", function() {
									$(this).removeClass('smarty-active-suggestion');
								});


								strField.attr("autocomplete", "off");	// Tell Firefox to keep quiet

								strField.blur({ containerUi: containerUi }, function(event) {
									setTimeout( (function(event) { return function() { if (event.data) event.data.containerUi.hide(); }; })(event), 300);	// This line is proudly IE9-compatible
								});

								strField.keydown({ containerUi: containerUi, addr: addr }, function(event) {
									var suggContainer = $('.smarty-autocomplete', event.data.containerUi);
									var currentChoice = $('.smarty-active-suggestion:visible', suggContainer).first();
									var choiceSelectionIsNew = false;

									if (event.keyCode == 9)			// Tab key
									{
										if (currentChoice.length > 0)
										{
											var domFields = event.data.addr.getDomFields();
											if (domFields['zipcode'])
												$(domFields['zipcode']).focus();
											else
												$(domFields['street']).blur();
											useAutocompleteSuggestion(event.data.addr, autocompleteResponse.suggestions[currentChoice.data("suggIndex")], event.data.containerUi);
											return addr.isFreeform() ? true : suppress(event);
										}
										else
											event.data.containerUi.hide();
										return;
									}
									else if (event.keyCode == 40)	// Down arrow
									{
										if (!currentChoice.hasClass('smarty-suggestion'))
										{
											currentChoice = $('.smarty-suggestion', suggContainer).first().mouseover();
											choiceSelectionIsNew = true;
										}

										if (!choiceSelectionIsNew)
										{
											if (currentChoice.next('.smarty-addr-'+event.data.addr.id()+' .smarty-suggestion').length > 0)
												currentChoice.next('.smarty-suggestion').mouseover();
											else
												currentChoice.removeClass('smarty-active-suggestion');
										}

										moveCursorToEnd(this);
										return;
									}
									else if (event.keyCode == 38)	// Up arrow
									{
										if (!currentChoice.hasClass('smarty-suggestion'))
										{
											currentChoice = $('.smarty-suggestion', suggContainer).last().mouseover();
											choiceSelectionIsNew = true;
										}

										if (!choiceSelectionIsNew)
										{
											if (currentChoice.prev('.smarty-addr-'+event.data.addr.id()+' .smarty-suggestion').length > 0)
												currentChoice.prev('.smarty-suggestion').mouseover();
											else
												currentChoice.removeClass('smarty-active-suggestion');
										}

										moveCursorToEnd(this);
										return;
									}
								});

								// Flip the on switch!
								strField.keyup({ form: f, addr: addr, streetField: strField, containerUi: containerUi }, doAutocomplete);
							}
						}

						$(document).keyup(function(event) {
							if (event.keyCode == 27)	// Esc key
								$('.smarty-autocomplete').closest('.smarty-ui').hide();
						});
					}

					// Try .5 and 1.5 seconds after the DOM loads to re-position UI elements; hack for Firefox.
					setTimeout(function() { $(window).resize(); }, 500);
					setTimeout(function() { $(window).resize(); }, 1500);
				}
			}
			
			if (config.submitVerify)
			{
				// Bind to form submits through form submit and submit button click events
				for (var i = 0; i < forms.length; i++)
				{
					var f = forms[i];
	
					submitHandler = function(e)
					{
						// Don't invoke verification if it's already processing or autocomplete is open and the user was pressing Enter to use a suggestion
						if ((e.data.form && e.data.form.processing) || $('.smarty-active-suggestion:visible').length > 0)
							return suppress(e);

						/*
							IMPORTANT!
							Prior to version 2.4.8, the plugin would call syncWithDom() at submit-time
							in case programmatic changes were made to the address input fields, including
							browser auto-fills. The sync function would detect those changes and force
							a re-verification to not let invalid addresses through. Unfortunately, this
							frequently caused infinite loops (runaway lookups), ultimately preventing
							form submission, which is unacceptable. As a safety measure to protect our
							customer's subscriptions, we've removed syncWithDom(). The website owner is
							responsible for making sure that any changes to address field values raise the
							"change" event on that element. Example: $('#city').val('New City').change();
						*/
	
						if (!e.data.form.allActiveAddressesAccepted())
						{
							// We could verify all the addresses at once, but that can overwhelm the user.
							// An API request is usually quick, so let's do one at a time: it's much cleaner.
							var unaccepted = e.data.form.activeAddressesNotAccepted();
							if (unaccepted.length > 0)
								trigger("VerificationInvoked", { address: unaccepted[0], invoke: e.data.invoke, invokeFn: e.data.invokeFn });
							return suppress(e);
						}
					};
	
					// Performs the tricky operation of uprooting existing event handlers that we have references to
					// (either by jQuery's data cache or HTML attributes) planting ours, then laying theirs on top
					var bindSubmitHandler = function(domElement, eventName)
					{
						if (!domElement || !eventName)
							return;
	
						var oldHandlers = [], eventsRef = $._data(domElement, 'events');
	
						// If there are previously-bound-event-handlers (from jQuery), get those.
						if (eventsRef && eventsRef[eventName] && eventsRef[eventName].length > 0)
						{
							// Get a reference to the old handlers previously bound by jQuery
							oldHandlers = $.extend(true, [], eventsRef[eventName]);
						}
	
						// Unbind them...
						$(domElement).unbind(eventName);
	
						// ... then bind ours first ...
						$(domElement)[eventName]({ form: f, invoke: domElement, invokeFn: eventName }, submitHandler);
	
						// ... then bind theirs last:
						// First bind their onclick="..." or onsubmit="..." handles...
						if (typeof domElement['on'+eventName] === 'function')
						{
							var temp = domElement['on'+eventName];
							domElement['on'+eventName] = null;
							$(domElement)[eventName](temp);
						}
	
						// ... then finish up with their old jQuery handles.
						for (var j = 0; j < oldHandlers.length; j++)
							$(domElement)[eventName](oldHandlers[j].data, oldHandlers[j].handler);
					};
	
					// Take any existing handlers (bound via jQuery) and re-bind them for AFTER our handler(s).
					var formSubmitElements = $(config.submitSelector, f.dom);
	
					// Form submit() events are apparently invoked by CLICKING the submit button (even jQuery does this at its core for binding)
					// (but jQuery, when raising a form submit event with .submit() will NOT necessarily click the submit button)
					formSubmitElements.each(function(idx) {
						bindSubmitHandler(this, 'click');	// These get fired first
					});
	
					// These fire after button clicks, so these need to be bound AFTER binding to the submit button click events
					bindSubmitHandler(f.dom, 'submit');
				}
			}

			trigger("MapInitialized");
		};

		function doAutocomplete(event)
		{
			var addr = event.data.addr;
			var streetField = event.data.streetField;
			var input = $.trim(event.data.streetField.val());
			var containerUi = event.data.containerUi;
			var suggContainer = $('.smarty-autocomplete', containerUi);

			if (!input)
			{
				addr.lastStreetInput = input;
				suggContainer.empty();
				containerUi.hide();
			}

			if (event.keyCode == 13)	// Enter/return
			{
				if ($('.smarty-active-suggestion:visible').length > 0)
					useAutocompleteSuggestion(addr, autocompleteResponse.suggestions[$('.smarty-active-suggestion:visible').first().data('suggIndex')], containerUi);
				containerUi.hide();
				streetField.blur();
				return suppress(event);
			}

			if (event.keyCode == 40)	// Down arrow
			{
				moveCursorToEnd(streetField[0]);
				return;
			}

			if (event.keyCode == 38)	// Up arrow
			{
				moveCursorToEnd(streetField[0]);
				return;
			}

			if (!input || input == addr.lastStreetInput || !addr.isDomestic())
				return;

			addr.lastStreetInput = input;	// Used so that autocomplete only fires on real changes (i.e. not just whitespace)

			trigger('AutocompleteInvoked', {
				containerUi: containerUi,
				suggContainer: suggContainer,
				streetField: streetField,
				input: input,
				addr: addr
			});
		}

		this.requestAutocomplete = function(event, data)
		{
			if (data.input && data.addr.isDomestic() && autocompleteResponse)
				data.containerUi.show();

			var autocplrequest = {
				callback: function(counter, json)
				{
					autocompleteResponse = json;
					data.suggContainer.empty();

					if (!json.suggestions || json.suggestions.length == 0)
					{
						data.suggContainer.html('<div class="smarty-no-suggestions">No suggestions</div>');
						return;
					}

					for (var j = 0; j < json.suggestions.length; j++)
					{
						var link = $('<a href="javascript:" class="smarty-suggestion">' + json.suggestions[j].text.replace(/<|>/g, "") + '</a>');
						link.data("suggIndex", j);
						data.suggContainer.append(link);
					}

					data.suggContainer.css({
						"width": Math.max(data.streetField.outerWidth(), 250) + "px"
					});

					data.containerUi.show();

					// Delete all older callbacks so they don't get executed later because of latency
					autocplRequests.splice(0, counter);
				},
				number: autocplCounter++
			};

			autocplRequests[autocplrequest.number] = autocplrequest;

			$.getJSON("https://autocomplete-api.smartystreets.com/suggest?callback=?", {
				"auth-id": config.key,
				prefix: data.input,
				city_filter: config.cityFilter,
				state_filter: config.stateFilter,
				prefer: config.cityStatePreference,
				suggestions: config.autocomplete,
				geolocate: config.geolocate
			}, function(json)
			{
				trigger("AutocompleteReceived", $.extend(data, {
					json: json,
					autocplrequest: autocplrequest
				}));
			});
		};

		this.showAutocomplete = function(event, data)
		{
			if (autocplRequests[data.autocplrequest.number])
				autocplRequests[data.autocplrequest.number].callback(data.autocplrequest.number, data.json);
		};

		function useAutocompleteSuggestion(addr, suggestion, containerUi)
		{
			var domfields = addr.getDomFields();
			containerUi.hide();		// It's important that the suggestions are hidden before AddressChanged event fires

			if (addr.isFreeform())
				$(domfields['street']).val(suggestion.text).change();
			else
			{
				if (domfields['street'])
					$(domfields['street']).val(suggestion.street_line).change();
				if (domfields['city'])
					$(domfields['city']).val(suggestion.city).change();
				if (domfields['state'])
					$(domfields['state']).val(suggestion.state).change();
				if (domfields['lastline'])
					$(domfields['lastline']).val(suggestion.city + " " + suggestion.state).change();
			}
		}

		// Computes where the little checkmark tag of the UI goes, relative to the boundaries of the last field
		function uiTagOffset(corners)
		{
			return {
				top: corners.top + corners.height / 2 - 10,
				left: corners.right - 6
			};
		}

		// This function is used to find and properly map elements to their field type
		function filterDomElement(domElement, names, labels)
		{
			/*
				Where we look to find a match, in this order:
			 	name, id, <label> tags, placeholder, title
			 	Our searches first conduct fairly liberal "contains" searches:
			 	if the attribute even contains the name or label, we map it.
			 	The names and labels we choose to find are very particular.
			 */

			var name = lowercase(domElement.name);
			var id = lowercase(domElement.id);
			var selectorSafeID = id.replace(/[\[|\]|\(|\)|\:|\'|\"|\=|\||\#|\.|\!|\||\@|\^|\&|\*]/g, '\\\\$&');
			var placeholder = lowercase(domElement.placeholder);
			var title = lowercase(domElement.title);

			// First look through name and id attributes of the element, the most common
			for (var i = 0; i < names.length; i++)
				if (name.indexOf(names[i]) > -1 || id.indexOf(names[i]) > -1)
					return true;

			// If we can't find it in name or id, look at labels associated to the element.
			// Webkit automatically associates labels with form elements for us. But for other
			// browsers, we have to find them manually, which this next block does.
			if (!('labels' in domElement))
			{
				var lbl = $('label[for="' + selectorSafeID + '"]')[0] || $(domElement).parents('label')[0];
				domElement.labels = !lbl ? [] : [lbl];
			}

			// Iterate through the <label> tags now to search for a match.
			for (var i = 0; i < domElement.labels.length; i++)
			{
				// This inner loop compares each label value with what we're looking for
				for (var j = 0; j < labels.length; j++)
					if ($(domElement.labels[i]).text().toLowerCase().indexOf(labels[j]) > -1)
						return true;
			}

			// Still not found? Then look in "placeholder" or "title"...
			for (var i = 0; i < labels.length; i++)
			if (placeholder.indexOf(labels[i]) > -1 || title.indexOf(labels[i]) > -1)
				return true;

			// Got all the way to here? Probably not a match then.
			return false;
		};

		// User aborted the verification process (X click or esc keyup)
		function userAborted(uiPopup, e)
		{
			// Even though there may be more than one bound, and this disables the others,
			// this is for simplicity: and I figure, it won't happen too often.
			// (Otherwise "Completed" events are raised by pressing Esc even if nothing is happening)
			$(document).unbind('keyup');
			$(uiPopup).slideUp(defaults.speed, function() { $(this).parent('.smarty-ui').remove(); });
			trigger("Completed", e.data);
		}

		// When we're done with a "pop-up" where the user chooses what to do,
		// we need to remove all other events bound on that whole "pop-up"
		// so that it doesn't interfere with any future "pop-ups".
		function undelegateAllClicks(selectors)
		{
			for (var selector in selectors)
				$('body').undelegate(selectors[selector], 'click');
		}

		// Utility function
		function moveCursorToEnd(el)	// Courtesy of http://css-tricks.com/snippets/javascript/move-cursor-to-end-of-input/
		{
			if (typeof el.selectionStart == "number")
				el.selectionStart = el.selectionEnd = el.value.length;
			else if (typeof el.createTextRange != "undefined")
			{
				el.focus();
				var range = el.createTextRange();
				range.collapse(false);
				range.select();
			}
		}


		// If anything was previously mapped, this resets it all for a new mapping.
		this.clean = function()
		{
			if (forms.length == 0)
				return;

			if (config.debug)
				console.log("Cleaning up old form map data and bindings...");

			// Spare none alive!

			for (var i = 0; i < forms.length; i++)
			{
				$(forms[i].dom).data(mapMeta.formDataProperty, '');

				// Clean up each form's DOM by resetting the address fields to the way they were
				for (var j = 0; j < forms[i].addresses.length; j++)
				{
					var doms = forms[i].addresses[j].getDomFields();
					for (var prop in doms)
					{
						if (config.debug)
							$(doms[prop]).css('background', 'none').attr('placeholder', '');
						$(doms[prop]).unbind('change');
					}
					if (doms['street'])
						$(doms['street']).unbind('keyup').unbind('keydown').unbind('blur');
				}

				// Unbind our form submit and submit-button click handlers
				$.each(forms, function(idx) { $(this.dom).unbind('submit', submitHandler); });
				$(config.submitSelector, forms[i].dom).each(function(idx) { $(this).unbind('click', submitHandler); });
			}

			$('.smarty-ui').undelegate('.smarty-suggestion', 'click').undelegate('.smarty-suggestion', 'mouseover').undelegate('.smarty-suggestion', 'mouseleave').remove();
			$('body').undelegate('.smarty-undo', 'click');
			$('body').undelegate('.smarty-tag-grayed', 'click');
			$(window).unbind('resize');
			$(document).unbind('keyup');

			forms = [];
			mappedAddressCount = 0;

			if (config.debug)
				console.log("Done cleaning up; ready for new mapping.");
		};


		// ** AUTOMAPPING ** //
		this.automap = function(context)
		{
			if (config.debug)
				console.log("Automapping fields...");

			this.clean();

			//$('form').add($('iframe').contents().find('form')).each(function(idx) 	// Include forms in iframes, but they must be hosted on same domain (and iframe must have already loaded)
			$('form').each(function(idx)	 // For each form ...
			{
				var form = new Form(this);
				var potential = {};

				// Look for each type of field in this form
				for (var fieldName in mapMeta.identifiers)
				{
					var names = mapMeta.identifiers[fieldName].names;
					var labels = mapMeta.identifiers[fieldName].labels;

					// Find matching form elements and store them away
					potential[fieldName] = $(config.fieldSelector, this)
						.filter(function()
						{
							// This potential address input element must be within the user's set of selected elements
							return $(context).has(this).length > 0; // (Using has() is compatible with as low as jQuery 1.4)
						})
						.filter(':visible')		// No "hidden" input fields allowed
						.filter(function()
						{
							var name = lowercase(this.name), id = lowercase(this.id);

							// "Street address line 1" is a special case because "address" is an ambiguous
							// term, so we pre-screen this field by looking for exact matches.
							if (fieldName == "streets")
							{
								for (var i = 0; i < mapMeta.street1exacts.names.length; i++)
									if (name == mapMeta.street1exacts.names[i] || id == mapMeta.street1exacts.names[i])
										return true;
							}

							// Now perform the main filtering.
							// If this is TRUE, then this form element is probably a match for this field type.
							var filterResult = filterDomElement(this, names, labels);

							if (fieldName == "streets")
							{
								// Looking for "address" is a very liberal search, so we need to see if it contains another
								// field name, too... this helps us find freeform addresses (SLAP).
								var otherFields = ["secondary", "city", "state", "zipcode", "country", "lastline"];
								for (var i = 0; i < otherFields.length; i ++)
								{
									// If any of these filters turns up true, then it's
									// probably neither a "street" field, nor a SLAP address.
									if (filterDomElement(this, mapMeta.identifiers[otherFields[i]].names,
											mapMeta.identifiers[otherFields[i]].labels))
										return false;
								}
							}

							return filterResult;
						})
						.not(function()
						{
							// The filter above can be a bit liberal at times, so we need to filter out
							// results that are actually false positives (fields that aren't part of the address)
							// Returning true from this function excludes the element from the result set.
							var name = lowercase(this.name), id = lowercase(this.id);
							if (name == "name" || id == "name")	// Exclude fields like "First Name", et al.
								return true;
							return filterDomElement(this, mapMeta.exclude.names, mapMeta.exclude.labels);
						})
						.toArray();
				}

				// Now prepare to differentiate between street1 and street2.
				potential.street = [], potential.street2 = [];

				// If the ratio of 'street' fields to the number of addresses in the form
				// (estimated by number of city or zip fields) is about the same, it's all street1.
				if (potential.streets.length <= potential.city.length * 1.5
					|| potential.streets.length <= potential.zipcode.length * 1.5)
				{
					potential.street = potential.streets;
				}
				else
				{
					// Otherwise, differentiate between the two
					for (var i = 0; i < potential.streets.length; i++)
					{
						// Try to map it to a street2 field first. If it fails, it's street1.
						// The second condition is for naming schemes like "street[]" or "address[]", where the names
						// are the same: the second one is usually street2.
						var current = potential.streets[i];
						if (filterDomElement(current, mapMeta.street2.names, mapMeta.street2.labels)
							|| (i > 0 && current.name == potential.streets[i-1].name))
						{
							// Mapped it to street2
							potential.street2.push(current);
						}
						else	// Could not map to street2, so put it in street1
							potential.street.push(current);
					}
				}

				delete potential.streets;	// No longer needed; we've moved them into street/street2.

				if (config.debug)
					console.log("For form " + idx + ", the initial scan found these fields:", potential);



				// Now organize the mapped fields into addresses

				// The number of addresses will be the number of street1 fields,
				// and in case we support it in the future, maybe street2, or
				// in case a mapping went a little awry.
				var addressCount = Math.max(potential.street.length, potential.street2.length);

				if (config.debug && addressCount == 0)
					console.log("No addresses were found in form " + idx + ".");

				for (var i = 0; i < addressCount; i++)
				{
					var addrObj = {};
					for (var field in potential)
					{
						var current = potential[field][i];
						if (current)
							addrObj[field] = current;
					}

					// Don't map the address if there's not enough fields for a complete address
					var hasCityAndStateOrZip = addrObj.zipcode || (addrObj.state && addrObj.city);
					var hasCityOrStateOrZip = addrObj.city || addrObj.state || addrObj.zipcode;
					if ((!addrObj.street && hasCityAndStateOrZip) || (addrObj.street && !hasCityAndStateOrZip && hasCityOrStateOrZip))
					{
						if (config.debug)
							console.log("Form " + idx + " contains some address input elements that could not be resolved to a complete address.");
						continue;
					}

					form.addresses.push(new Address(addrObj, form, "auto" + (++mappedAddressCount)));
				}

				// Save the form we just finished mapping
				forms.push(form);

				if (config.debug)
					console.log("Form " + idx + " is finished:", form);
			});

			if (config.debug)
				console.log("Automapping complete.");
			
			trigger("FieldsMapped");
		};


		// ** MANUAL MAPPING ** //
		this.mapFields = function(map, context)
		{
			// "map" should be an array of objects mapping field types
			// to a field by selector, all supplied by the user.
			// "context" should be the set of elements in which fields will be mapped
			// Context can be acquired like: $('#something').not('#something-else').LiveAddress( ... ); ...

			if (config.debug)
				console.log("Manually mapping fields given this data:", map);
			
			this.clean();
			var formsFound = [];
			map = map instanceof Array ? map : [map];

			for (var addrIdx in map)
			{
				var address = map[addrIdx];

				if (!address.street)
					continue;

				// Convert selectors into actual DOM references
				for (var fieldType in address)
				{
					if (fieldType != "id")
					{
						if (!arrayContains(acceptableFields, fieldType))
						{	// Make sure the field name is allowed
							if (config.debug)
								console.log("NOTICE: Field named " + fieldType + " is not allowed. Skipping...");
							delete address[fieldType];
							continue;
						}
						var matched = $(address[fieldType], context);
						if (matched.length == 0)
						{	// Don't try to map an element that couldn't be matched or found at all
							if (config.debug)
								console.log("NOTICE: No matches found for selector " + address[fieldType] + ". Skipping...");
							delete address[fieldType];
							continue;
						}
						else if (matched.parents('form').length == 0)
						{	// We should only map elements inside a <form> tag; otherwise we can't bind to submit handlers later
							if (config.debug)
								console.log("NOTICE: Element with selector \"" + address[fieldType] + "\" is not inside a <form> tag. Skipping...");
							delete address[fieldType];
							continue;
						}
						else
							address[fieldType] = matched[0];
					}
				}

				if (!((address.street) && (((address.city) && (address.state)) || (address.zipcode) || (address.lastline)
					 || (!address.street2 && !address.city && !address.state && !address.zipcode && !address.lastline))))
				{
					if (config.debug)
						console.log("NOTICE: Address map (index "+addrIdx+") was not mapped to a complete street address. Skipping...");
					continue;
				}

				// Acquire the form based on the street address field (the required field)
				var formDom = $(address.street).parents('form')[0];
				var form = new Form(formDom);
				
				// Persist a reference to the form if it wasn't acquired before
				if (!$(formDom).data(mapMeta.formDataProperty))
				{
					// Mark the form as mapped then add it to our list
					$(formDom).data(mapMeta.formDataProperty, 1);
					formsFound.push(form);
				}
				else
				{
					// Find the form in our list since we already put it there
					for (var i = 0; i < formsFound.length; i++)
					{
						if (formsFound[i].dom == formDom)
						{
							form = formsFound[i];
							break;
						}
					}
				}

				// Add this address to the form
				mappedAddressCount ++;
				form.addresses.push(new Address(address, form, address.id));

				if (config.debug)
					console.log("Finished mapping address with ID: "+form.addresses[form.addresses.length-1].id());
			}

			forms = formsFound;
			trigger("FieldsMapped");
		};


		this.disableFields = function(address)
		{
			// Given an address, disables the input fields for the address, also the submit button
			if (!config.ui)
				return;

			var fields = address.getDomFields();
			for (var field in fields)
				$(fields[field]).prop ? $(fields[field]).prop('disabled', true) :  $(fields[field]).attr('disabled', 'disabled');

			// Disable submit buttons
			if (address.form && address.form.dom)
			{
				var buttons = $(config.submitSelector, address.form.dom);
				buttons.prop ? buttons.prop('disabled', true) :  buttons.attr('disabled', 'disabled');
			}
		};

		this.enableFields = function(address)
		{
			// Given an address, re-enables the input fields for the address
			if (!config.ui)
				return;

			var fields = address.getDomFields();
			for (var field in fields)
				$(fields[field]).prop ? $(fields[field]).prop('disabled', false) : $(fields[field]).removeAttr('disabled');

			// Enable submit buttons
			if (address.form && address.form.dom)
			{
				var buttons = $(config.submitSelector, address.form.dom);
				buttons.prop ? buttons.prop('disabled', false) : buttons.removeAttr('disabled');
			}
		};

		this.showLoader = function(addr)
		{
			if (!config.ui || !addr.hasDomFields())
				return;

			// Get position information now instead of earlier in case elements shifted since page load
			var lastFieldCorners = addr.corners(true);
			var loaderUI = $('.smarty-dots.smarty-addr-'+addr.id()).parent();

			loaderUI.css("top", (lastFieldCorners.top + lastFieldCorners.height / 2 - loaderHeight / 2) + "px")
						.css("left", (lastFieldCorners.right - loaderWidth - 10) + "px");
			$('.smarty-dots', loaderUI).show();
		};

		this.hideLoader = function(addr)
		{
			if (config.ui)
				$('.smarty-dots.smarty-addr-'+addr.id()).hide();
		};

		this.markAsValid = function(addr)
		{
			if (!config.ui || !addr)
				return;
			
			var domTag = $('.smarty-tag.smarty-tag-grayed.smarty-addr-'+addr.id());
			domTag.removeClass('smarty-tag-grayed').addClass('smarty-tag-green').attr("title", "Address verified! Click to undo.");
			$('.smarty-tag-text', domTag).text('Verified').hover(function () {
				$(this).text('Undo');
			}, function() {
				$(this).text('Verified');
			}).addClass('smarty-undo');
		};

		this.unmarkAsValid = function(addr)
		{
			var validSelector = '.smarty-tag.smarty-addr-'+addr.id();
			if (!config.ui || !addr || $(validSelector).length == 0)
				return;
			
			var domTag = $('.smarty-tag.smarty-tag-green.smarty-addr-'+addr.id());
			domTag.removeClass('smarty-tag-green').addClass('smarty-tag-grayed').attr("title", "Address not verified. Click to verify.");
			$('.smarty-tag-text', domTag).text('Verify').unbind('mouseenter mouseleave').removeClass('smarty-undo');
		};

		this.showAmbiguous = function(data)
		{
			if (!config.ui || !data.address.hasDomFields())
				return;

			var addr = data.address;
			var response = data.response;
			var corners = addr.corners();
			corners.width = Math.max(corners.width, 300); 	// minimum width
			corners.height = Math.max(corners.height, response.length * 63 + 119);	// minimum height

			var html = '<div class="smarty-ui" style="top: '+corners.top+'px; left: '+corners.left+'px; width: '+corners.width+'px; height: '+corners.height+'px;">'
				+ '<div class="smarty-popup smarty-addr-'+addr.id()+'" style="width: '+(corners.width - 6)+'px; height: '+(corners.height - 3)+'px;">'
				+ '<div class="smarty-popup-header smarty-popup-ambiguous-header">'+config.ambiguousMessage+'<a href="javascript:" class="smarty-popup-close smarty-abort" title="Cancel">x</a></div>'
				+ '<div class="smarty-choice-list">';

			for (var i = 0; i < response.raw.length; i++)
			{
				var line1 = response.raw[i].delivery_line_1, city = response.raw[i].components.city_name,
					st = response.raw[i].components.state_abbreviation,
					zip = response.raw[i].components.zipcode + "-" + response.raw[i].components.plus4_code;
				html += '<a href="javascript:" class="smarty-choice" data-index="'+i+'">'+line1+'<br>'+city+', '+st+' '+zip+'</a>';
			}

			html += '</div><div class="smarty-choice-alt">';
			html += '<a href="javascript:" class="smarty-choice smarty-choice-abort smarty-abort">Click here to change your address</a>';
			html += '<a href="javascript:" class="smarty-choice smarty-choice-override">Click here to certify the address is correct<br>('+addr.toString()+')</a>';
			html += '</div></div></div>';
			$(html).hide().appendTo('body').show(defaults.speed);

			// Scroll to it if needed
			if ($(document).scrollTop() > corners.top - 100
				|| $(document).scrollTop() < corners.top - $(window).height() + 100)
			{
				$('html, body').stop().animate({
					scrollTop: $('.smarty-popup.smarty-addr-'+addr.id()).offset().top - 100
				}, 500);
			}

			data.selectors = {
				goodAddr: '.smarty-popup.smarty-addr-'+addr.id()+' .smarty-choice-list .smarty-choice',
				useOriginal: '.smarty-popup.smarty-addr-'+addr.id()+' .smarty-choice-override',
				abort: '.smarty-popup.smarty-addr-'+addr.id()+' .smarty-abort'
			};

			// User chose a candidate address
			$('body').delegate(data.selectors.goodAddr, 'click', data, function(e)
			{
				$('.smarty-popup.smarty-addr-'+addr.id()).slideUp(defaults.speed, function()
				{
					$(this).parent('.smarty-ui').remove();
					$(this).remove();
				});

				undelegateAllClicks(e.data.selectors);
				delete e.data.selectors;

				trigger("UsedSuggestedAddress", {
					address: e.data.address,
					response: e.data.response,
					invoke: e.data.invoke,
					invokeFn: e.data.invokeFn,
					chosenCandidate: response.raw[$(this).data('index')]
				});
			});

			// User wants to revert to what they typed (forced accept)
			$('body').delegate(data.selectors.useOriginal, 'click', data, function(e)
			{
				$(this).parents('.smarty-popup').slideUp(defaults.speed, function()
				{
					$(this).parent('.smarty-ui').remove();
					$(this).remove();
				});

				undelegateAllClicks(e.data.selectors);
				delete e.data.selectors;
				trigger("OriginalInputSelected", e.data);
			});

			// User presses Esc key
			$(document).keyup(data, function(e)
			{
				if (e.keyCode == 27) //Esc
				{
					undelegateAllClicks(e.data.selectors);
					delete e.data.selectors;
					userAborted($('.smarty-popup.smarty-addr-'+e.data.address.id()), e);
					suppress(e);
				}
			});

			// User clicks "x" in corner or chooses to try a different address (same effect as Esc key)
			$('body').delegate(data.selectors.abort, 'click', data, function(e)
			{
				undelegateAllClicks(e.data.selectors);
				delete e.data.selectors;
				userAborted($(this).parents('.smarty-popup'), e);
			});
		};


		this.showInvalid = function(data)
		{
			if (!config.ui || !data.address.hasDomFields())
				return;

			var addr = data.address;
			var response = data.response;
			var corners = addr.corners();
			corners.width = Math.max(corners.width, 300); 	// minimum width
			corners.height = Math.max(corners.height, 180);	// minimum height

			var html = '<div class="smarty-ui" style="top: '+corners.top+'px; left: '+corners.left+'px; width: '+corners.width+'px; height: '+corners.height+'px;">'
				+ '<div class="smarty-popup smarty-addr-'+addr.id()+'" style="width: '+(corners.width - 6)+'px; height: '+(corners.height - 3)+'px;">'
				+ '<div class="smarty-popup-header smarty-popup-invalid-header">'+config.invalidMessage+'<a href="javascript:" class="smarty-popup-close smarty-abort" title="Cancel">x</a></div>'
				+ '<div class="smarty-choice-list"><a href="javascript:" class="smarty-choice smarty-choice-abort smarty-abort">Click here to change your address</a></div>'
				+ '<div class="smarty-choice-alt"><a href="javascript:" class="smarty-choice smarty-choice-override">Click here to certify the address is correct<br>('+addr.toString()+')</a></div>'
				+ '</div></div>';

			$(html).hide().appendTo('body').show(defaults.speed);

			data.selectors = {
				useOriginal: '.smarty-popup.smarty-addr-'+addr.id()+' .smarty-choice-override ',
				abort: '.smarty-popup.smarty-addr-'+addr.id()+' .smarty-abort'
			}

			// Scroll to it if necessary
			if ($(document).scrollTop() > corners.top - 100
				|| $(document).scrollTop() < corners.top - $(window).height() + 100)
			{
				$('html, body').stop().animate({
					scrollTop: $('.smarty-popup.smarty-addr-'+addr.id()).offset().top - 100
				}, 500);
			}

			// User rejects original input and agrees to double-check it
			$('body').delegate(data.selectors.abort, 'click', data, function(e)
			{
				userAborted('.smarty-popup.smarty-addr-'+e.data.address.id(), e);
				delete e.data.selectors;
				trigger("InvalidAddressRejected", e.data);
			});

			// User certifies that what they typed is correct
			$('body').delegate(data.selectors.useOriginal, 'click', data, function(e)
			{
				userAborted('.smarty-popup.smarty-addr-'+e.data.address.id(), e);
				delete e.data.selectors;
				trigger("OriginalInputSelected", e.data);
			});

			// User presses esc key
			$(document).keyup(data, function(e)
			{
				if (e.keyCode == 27) //Esc
				{
					$(data.selectors.abort).click();
					undelegateAllClicks(e.data.selectors);
					userAborted('.smarty-popup.smarty-addr-'+e.data.address.id(), e);
				}
			});
		};

		this.isDropdown = function(dom)
		{
 			return dom && ((dom.tagName || dom.nodeName || "").toUpperCase() == "SELECT");
		};
	}








	/*
		Represents an address inputted by the user, whether it has been verified yet or not.
		formObj must be a Form OBJECT, not a <form> tag... and the addressID is optional.
	*/
	function Address(domMap, formObj, addressID)
	{
		// PRIVATE MEMBERS //

		var self = this;							// Pointer to self so that internal functions can reference its parent
		var fields;									// Data values and references to DOM elements
		var id;										// An ID by which to classify this address on the DOM
		var state = "accepted"; 					// Can be: "accepted" or "changed"
		// Example of a field:  street: { value: "123 main", dom: DOMElement, undo: "123 mai"}
		// Some of the above fields will only be mapped manually, not automatically.
		
		// Private method that actually changes the address. The keepState parameter is
		// used by the results of verification after an address is chosen; (or an "undo"
		// on a freeform address), otherwise an infinite loop of requests is executed
		// because the address keeps changing! (Set "suppressAutoVerify" to true when coming from the "Undo" link)	
		var doSet = function(key, value, updateDomElement, keepState, sourceEvent, suppressAutoVerify)
		{
			if (!arrayContains(acceptableFields, key))	// Skip "id" and other unacceptable fields
				return false;

			if (!fields[key])
				fields[key] = {};

			value = value.replace(/<|>/g, "");	// prevents script injection attacks (< and > aren't in addresses, anyway)

			var differentVal = fields[key].value != value;

			fields[key].undo = fields[key].value || "";
			fields[key].value = value;

			if (updateDomElement && fields[key].dom)
				$(fields[key].dom).val(value);
			
			var eventMeta = {
				sourceEvent: sourceEvent,	// may be undefined
				field: key,
				address: self,
				value: value,
				suppressAutoVerification: suppressAutoVerify || false
			};
			
			if (differentVal && !keepState)
			{
				ui.unmarkAsValid(self);
				var uiTag = config.ui ? $('.smarty-ui .smarty-tag.smarty-addr-'+id) : undefined;
				if (self.isDomestic())
				{
					if (uiTag && !uiTag.is(':visible'))
						uiTag.show();	// Show checkmark tag if address is in US
					self.unaccept();
					trigger("AddressChanged", eventMeta);
				}
				else
				{
					if (uiTag && uiTag.is(':visible'))
						uiTag.hide();	// Hide checkmark tag if address is non-US
					self.accept({ address: self }, false);
				}
			}

			return true;
		};




		// PUBLIC MEMBERS //

		this.form = formObj;	// Reference to the parent form object (NOT THE DOM ELEMENT)
		this.verifyCount = 0;	// Number of times this address was submitted for verification
		this.lastField;			// The last field found (last to appear in the DOM) during mapping, or the order given
		this.active = true;		// If true, verify the address. If false, pass-thru entirely.
		this.lastStreetInput = "";	// Used by autocomplete to detect changes

		// Constructor-esque functionality (save the fields in this address object)
		this.load = function(domMap, addressID)
		{
			fields = {};
			id = addressID ? addressID.replace(/[^a-z0-9_\-]/ig, '') : randomInt(1, 99999);		// Strips non-selector-friendly characters

			if (typeof domMap === 'object')	// can be an actual map to DOM elements or just field/value data
			{
				// Find the last field likely to appear on the DOM (used for UI attachments)
				this.lastField = domMap.lastline || domMap.zipcode || domMap.state || domMap.city || domMap.street;

				var isEmpty = true;	// Whether the address has data in it (pre-populated) -- first assume it is empty.

				for (var prop in domMap)
				{
					if (!arrayContains(acceptableFields, prop)) // Skip "id" and any other unacceptable field
						continue;
					var elem, val, elemArray, isData;
					try
					{
						elem = $(domMap[prop]);
						elemArray = elem.toArray();
						isData = elemArray ? elemArray.length == 0 : false;
					}
					catch (e) { isData = true; }

					if (isData) // Didn't match an HTML element, so treat it as an address string ("street1" data) instead
						val = domMap[prop] || "";
					else
						val = elem.val() || "";

					fields[prop] = {};
					fields[prop].value = val;
					fields[prop].undo = val;
					isEmpty = isEmpty ? val.length == 0 || ui.isDropdown(domMap[prop]) : false;  // dropdowns could have an initial value, yet the address may be "empty" (<option value="None" selected>(Select state)</option>) ...

					if (!isData)
					{
						if (config.debug)
						{
							elem.css('background', '#FFFFCC');
							elem.attr('placeholder', prop + ":" + id);
						}
						fields[prop].dom = domMap[prop];
					}


					// This has to be passed in at bind-time; they cannot be obtained at run-time
					var data = {
						address: this,
						field: prop,
						value: val
					};
					
					// Bind the DOM element to needed events, passing in the data above
					// NOTE: When the user types a street, city, and state, then hits Enter without leaving
					// the state field, this change() event fires before the form is submitted, and if autoVerify is
					// on, the verification will not invoke form submit, because it didn't come from a form submit.
					// This is known behavior and is actually proper functioning in this uncommon edge case.
					!isData && $(domMap[prop]).change(data, function(e)
					{
						e.data.address.set(e.data.field, e.target.value, false, false, e, false);
					});
				}

				if (!isEmpty)
					state = "changed";
			}
		};

		// Run the "constructor" to load up the address
		this.load(domMap, addressID);


		this.set = function(key, value, updateDomElement, keepState, sourceEvent, suppressAutoVerify)
		{
			if (typeof key === 'string' && arguments.length >= 2)
				return doSet(key, value, updateDomElement, keepState, sourceEvent, suppressAutoVerify);
			else if (typeof key === 'object')
			{
				var successful = true;
				for (var prop in key)
					successful = doSet(prop, key[prop], updateDomElement, keepState, sourceEvent, suppressAutoVerify) ? successful : false;
				return successful;
			}
		};

		this.replaceWith = function(resp, updateDomElement, e)
		{
			// Given the response from an API request associated with this address,
			// replace the values in the address... and if updateDomElement is true,
			// then change the values in the fields on the page accordingly.
			
			if (typeof resp === 'array' && resp.length > 0)
				resp = resp[0];

			if (self.isFreeform())
			{
				var singleLineAddr = (resp.addressee ? resp.addressee + " " : "") +
					(resp.delivery_line_1 ? resp.delivery_line_1 + " " : "") +
					(resp.delivery_line_2 ? resp.delivery_line_2 + " " : "") +
					(resp.components.urbanization ? resp.components.urbanization + " " : "") +
					(resp.last_line ? resp.last_line : "");

				self.set("street", singleLineAddr, updateDomElement, true, e, false);
			}
			else
			{
				if (resp.addressee)
					self.set("addressee", resp.addressee, updateDomElement, true, e, false);
				if (resp.delivery_line_1)
					self.set("street", resp.delivery_line_1, updateDomElement, true, e, false);
				if (resp.last_line && fields["lastline"])
					self.set("lastline", resp.last_line, updateDomElement, true, e, false);
				self.set("street2", resp.delivery_line_2 || "", updateDomElement, true, e, false);	// Rarely used; must otherwise be blank.
				self.set("secondary", "", updateDomElement, true, e, false);	// Not used in standardized addresses
				if (resp.components.urbanization)
					self.set("urbanization", resp.components.urbanization, updateDomElement, true, e, false);
				if (resp.components.city_name)
					self.set("city", resp.components.city_name, updateDomElement, true, e, false);
				if (resp.components.state_abbreviation)
					self.set("state", resp.components.state_abbreviation, updateDomElement, true, e, false);
				if (resp.components.zipcode && resp.components.plus4_code)
					self.set("zipcode", resp.components.zipcode + "-" + resp.components.plus4_code, updateDomElement, true, e, false);
			}
		};

		this.corners = function(lastField)
		{
			var corners = {};

			if (!lastField)
			{
				for (var prop in fields)
				{
					if (!fields[prop].dom || !$(fields[prop].dom).is(':visible'))
						continue;

					var dom = fields[prop].dom;
					var offset = $(dom).offset();
					offset.right = offset.left + $(dom).outerWidth();
					offset.bottom = offset.top + $(dom).outerHeight();

					corners.top = !corners.top ? offset.top : Math.min(corners.top, offset.top);
					corners.left = !corners.left ? offset.left : Math.min(corners.left, offset.left);
					corners.right = !corners.right ? offset.right : Math.max(corners.right, offset.right);
					corners.bottom = !corners.bottom ? offset.bottom : Math.max(corners.bottom, offset.bottom);
				}
			}
			else
			{
				var jqDom = $(self.lastField);
				corners = jqDom.offset();
				corners.right = corners.left + jqDom.outerWidth();
				corners.bottom = corners.top + jqDom.outerHeight();
			}

			corners.width = corners.right - corners.left;
			corners.height = corners.bottom - corners.top;

			return corners;
		};

		this.verify = function(invoke, invokeFn)
		{
			// Invoke contains the element to "click" on once we're all done, or is a user-defined callback function (may also be undefined)
			if (!invoke && !self.enoughInput())
			{
				if (config.debug)
					console.log("NOTICE: The address does not have enough input to verify. Since no callback is specified, there is nothing to do.");
				return trigger("Completed", { address: self, invoke: invoke, invokeFn: invokeFn, response: new Response([]) });
			}

			if (!self.enoughInput())
				return trigger("AddressWasInvalid", { address: self, response: new Response([]), invoke: invoke, invokeFn: invokeFn });

			ui.disableFields(self);
			self.verifyCount ++;
			var addrData = self.toRequest();
			var credentials = config.token ? "auth-id="+encodeURIComponent(config.key)+"&auth-token="+encodeURIComponent(config.token) : "auth-token="+encodeURIComponent(config.key);

			$.ajax(
			{
				url: config.requestUrl+"?"+credentials+"&plugin="+encodeURIComponent(instance.version)+(config.debug ? "_debug" : "")+"&callback=?",
				dataType: "jsonp",
				data: addrData,
				timeout: config.timeout
			})
			.done(function(response, statusText, xhr)
			{
				trigger("ResponseReceived", { address: self, response: new Response(response), invoke: invoke, invokeFn: invokeFn });
			})
			.fail(function(xhr, statusText)
			{
				trigger("RequestTimedOut", { address: self, status: statusText, invoke: invoke, invokeFn: invokeFn });
				self.verifyCount --; 			// Address verification didn't actually work, so don't count it
			});

			// Remember, the above callbacks happen later and this function is
			// executed immediately afterward, probably before a response is received.
			trigger("RequestSubmitted", { address: self });
		};

		this.enoughInput = function()
		{
			return (fields.street && fields.street.value)
				&& (
					(
						(fields.city && fields.city.value)
						&& (fields.state && fields.state.value && fields.state.value.length > 1)	// The last is for dropdowns that default to "0" (like osCommerce)
					)
					|| (fields.zipcode && fields.zipcode.value)
					|| (fields.lastline && fields.lastline.value)
					|| (!fields.street2 && !fields.city && !fields.state && !fields.zipcode && !fields.lastline) // Allow freeform addresses (only a street field)
				   );
		};

		this.toRequest = function()
		{
			var obj = {};
			for (var key in fields)
			{
				var keyval = {};
				keyval[key] = fields[key].value.replace(/\r|\n/g, " "); // Line breaks to spaces
				$.extend(obj, keyval);
			}
			return $.extend(obj, {candidates: config.candidates});
		};

		this.toString = function()
		{
			return (fields.street ? fields.street.value + " " : "")
				+ (fields.street2 ? fields.street2.value + " " : "")
				+ (fields.secondary ? fields.secondary.value + " " : "")
				+ (fields.city ? fields.city.value + " " : "")
				+ (fields.state ? fields.state.value + " " : "")
				+ (fields.zipcode ? fields.zipcode.value : "");
		}

		this.abort = function(event, keepAccept)
		{
			keepAccept = typeof keepAccept === 'undefined' ? false : keepAccept;
			if (!keepAccept)
				self.unaccept();
			delete self.form.processing;
			return suppress(event);
		}

		// Based on the properties in "fields," determines if this is a single-line address
		this.isFreeform = function()
		{
			return fields.street && !fields.street2 && !fields.secondary
					&& !fields.addressee && !fields.city && !fields.state
					&& !fields.zipcode && !fields.urbanization && !fields.lastline;
		}
		
		this.get = function(key)
		{
			return fields[key] ? fields[key].value : null
		};

		this.undo = function(updateDomElement)
		{
			updateDomElement = typeof updateDomElement === 'undefined' ? true : updateDomElement;
			for (var key in fields)
				this.set(key, fields[key].undo, updateDomElement, false, undefined, true);
		};

		this.accept = function(data, showValid)
		{
			showValid = typeof showValid === 'undefined' ? true : showValid;
			state = "accepted";
			ui.enableFields(self);
			if (showValid)	// If user chooses original input or the request timed out, the address wasn't "verified"
				ui.markAsValid(self);
			trigger("AddressAccepted", data);
		};

		this.unaccept = function()
		{
			state = "changed";
			ui.unmarkAsValid(self);
			return self;
		};

		this.getUndoValue = function(key)
		{
			return fields[key].undo;
		};

		this.status = function()
		{
			return state;
		};

		this.getDomFields = function()
		{
			// Gets just the DOM elements for each field
			var obj = {};
			for (var prop in fields)
			{
				var ext = {};
				ext[prop] = fields[prop].dom;
				$.extend(obj, ext);
			}
			return obj;
		};

		this.hasDomFields = function()
		{
			for (var prop in fields)
				if (fields[prop].dom)
					return true;
		}

		this.isDomestic = function()
		{
			if (!fields.country)
				return true;
			var countryValue = fields.country.value.toUpperCase().replace(/\.|\s|\(|\)|\\|\/|-/g, "");
			var usa = ["", "0", "1", "COUNTRY", "NONE", "US", "USA", "USOFA", "USOFAMERICA", "AMERICAN", // 1 is AmeriCommerce
						"UNITEDSTATES", "UNITEDSTATESAMERICA",	"UNITEDSTATESOFAMERICA", "AMERICA",
						"840", "223", "AMERICAUNITEDSTATES", "AMERICAUS", "AMERICAUSA"];	// 840 is ISO: 3166; and 223 is some shopping carts
			return arrayContains(usa, countryValue) || fields.country.value == "-1";
		}

		this.autocompleteVisible = function()
		{
			return config.ui && config.autocomplete && $('.smarty-autocomplete.smarty-addr-'+self.id()).is(':visible');
		}

		this.id = function()
		{
			return id;
		};
	}


	/*
		Represents a <form> tag which contains mapped fields.
	*/
	function Form(domElement)
	{
		this.addresses = [];
		this.dom = domElement;

		this.activeAddressesNotAccepted = function()
		{
			var addrs = [];
			for (var i = 0; i < this.addresses.length; i++)
			{
				var addr = this.addresses[i];
				if (addr.status() != "accepted" && addr.active)
					addrs.push(addr);
			}
			return addrs;
		};

		this.allActiveAddressesAccepted = function()
		{
			return this.activeAddressesNotAccepted().length == 0;
		};
	}


	/*
		Wraps output from the API in an easier-to-handle way
	*/

	function Response(json)
	{
		// PRIVATE MEMBERS //

		var checkBounds = function(idx)
		{
			// Ensures that an index is within the number of candidates
			if (idx >= json.length || idx < 0)
			{
				if (json.length == 0)
					throw new Error("Candidate index is out of bounds (no candidates returned; requested " + idx + ")");
				else
					throw new Error("Candidate index is out of bounds (" + json.length + " candidates; indicies 0 through " + (json.length - 1) + " available; requested " + idx + ")");
			}
		};
		
		var maybeDefault = function(idx)
		{
			// Assigns index to 0, the default value, if no value is passed in
			return typeof idx === 'undefined' ? 0 : idx;
		};


		// PUBLIC-FACING MEMBERS //

		this.raw = json;
		this.length = json.length;

		this.isValid = function()
		{
			return this.length == 1;
		};

		this.isInvalid = function()
		{
			return this.length == 0;
		};

		this.isAmbiguous = function()
		{
			return this.length > 1;
		};

		// These next functions are not comprehensive, but helpful for common tasks.

		this.isMissingSecondary = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].analysis.dpv_footnotes.indexOf("N1") > -1
					|| this.raw[idx].analysis.dpv_footnotes.indexOf("R1") > -1
					|| (this.raw[idx].analysis.footnotes && this.raw[idx].analysis.footnotes.indexOf("H#") > -1);
		};

		this.isBadSecondary = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].analysis.footnotes && this.raw[idx].analysis.footnotes.indexOf("S#") > -1;
		}

		this.componentChanged = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].analysis.footnotes && this.raw[idx].analysis.footnotes.indexOf("L#") > -1;
		}

		this.betterAddressExists = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].analysis.footnotes && this.raw[idx].analysis.footnotes.indexOf("P#") > -1;
		}

		this.isExactMatch = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].analysis.footnotes && this.raw[idx].analysis.dpv_footnotes == "AABB";
		}

		this.isUniqueZipCode = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].analysis.dpv_footnotes.indexOf("U1") > -1
					|| (this.raw[idx].analysis.footnotes && this.raw[idx].analysis.footnotes.indexOf("Q#") > -1);
		}

		this.fixedAbbreviations = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].analysis.footnotes && this.raw[idx].analysis.footnotes.indexOf("N#") > -1;
		}

		this.fixedZipCode = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].analysis.footnotes && this.raw[idx].analysis.footnotes.indexOf("A#") > -1;
		}

		this.fixedSpelling = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].analysis.footnotes.indexOf("B#") > -1
				|| (this.raw[idx].analysis.footnotes && this.raw[idx].analysis.footnotes.indexOf("M#") > -1);
		}

		this.isBuildingDefault = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].metadata.building_default_indicator;
		}

		this.isMilitary = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].analysis.dpv_footnotes.indexOf("F1") > -1;
		}

		this.hasExtraSecondary = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].analysis.dpv_footnotes.indexOf("CC") > -1;
		}

		this.isLacsLink = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].analysis.lacslink_code == "A";
		}

		this.isCommercial = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].metadata.rdi == "Commercial";
		}

		this.isResidential = function(idx)
		{
			idx = maybeDefault(idx); checkBounds(idx);
			return this.raw[idx].metadata.rdi == "Residential";
		}
	}
	

	/*
	 *	EVENT HANDLER "SHTUFF"
	 */


	/*
		Called every time a LiveAddress event is raised.
		This allows us to maintain the binding even if the
		callback function is changed later.
		"event" is the actual event object, and
		"data" is anything extra to pass to the event handler.
	*/
	function HandleEvent(event, data)
	{
		var handler = EventHandlers[event.type];
		if (handler)
			handler(event, data);
	}

	// Submits a form by calling `click` on a button element or `submit` on a form element
	var submitForm = function(invokeOn, invokeFunction)
	{
		if (invokeOn && typeof invokeOn !== 'function' && invokeFunction)
			if (invokeFunction == "click")
				$(invokeOn).trigger('click');	// Very particular: we MUST fire the native 'click' event!
			else if (invokeFunction == "submit")
				$(invokeOn).submit();	// For submit(), we have to use jQuery's, so that all its submit handlers fire.
	};

	var EventHandlers = {
		FieldsMapped: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "FieldsMapped", "(Fields mapped to their respective addresses)", event, data);

			// We wait until the window is all loaded in case some elements are still loading
			window.loaded ? ui.postMappingOperations() : $(window).load(ui.postMappingOperations);
		},

		MapInitialized: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "MapInitialized", "(Mapped fields have been wired up to the window"+(config.ui ? ", document, and UI" : " and document")+")", event, data);
		},

		AutocompleteInvoked: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "AutocompleteInvoked", "(A request is about to be sent to the autocomplete service)", event, data);
			ui.requestAutocomplete(event, data);
		},

		AutocompleteReceived: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "AutocompleteReceived", "(A response has just been received from the autocomplete service)", event, data);
			ui.showAutocomplete(event, data);
		},

		AddressChanged: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "AddressChanged", "(Address changed)", event, data);
			
			// If autoVerify is on, AND there's enough input in the address,
			// AND it hasn't been verified automatically before -OR- it's a freeform address,
			// AND autoVerification isn't suppressed (from an Undo click, even on a freeform address)
			// AND it has a DOM element (it's not just a programmatic Address object)
			// AND the address is "active" for verification
			// AND the autocomplete suggestions aren't visible
			// AND the form, if any, isn't already chewing on an address...
			// THEN verification has been invoked.
			if (config.autoVerify && data.address.enoughInput()
				&& (data.address.verifyCount == 0 || data.address.isFreeform())
				&& !data.suppressAutoVerification
				&& data.address.hasDomFields()
				&& data.address.active
				&& !data.address.autocompleteVisible()
				&& (data.address.form && !data.address.form.processing))
				trigger("VerificationInvoked", { address: data.address });
		},

		VerificationInvoked: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "VerificationInvoked", "(Address verification invoked)", event, data);
			
			// Abort now if an address in the same form is already being processed
			if (!data.address || (data.address && data.address.form && data.address.form.processing))
			{
				if (config.debug)
					console.log("NOTICE: VerificationInvoked event handling aborted. Address is missing or an address in the same form is already processing.");
				return;
			}
			else if (data.address.status() == "accepted" && !data.verifyAccepted)
			{
				if (config.debug)
					console.log("NOTICE: VerificationInvoked raised on an accepted or un-changed address. Nothing to do.");
				return trigger("Completed", data);
			}
			else if (data.address.form)
				data.address.form.processing = true;

			data.address.verify(data.invoke, data.invokeFn);
		},

		RequestSubmitted: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "RequestSubmitted", "(Request submitted to server)", event, data);
			
			ui.showLoader(data.address);
		},

		ResponseReceived: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "ResponseReceived", "(Response received from server, but has not been inspected)", event, data);

			ui.hideLoader(data.address);
			
			if (typeof data.invoke === "function")
				data.invoke(data.response);	// User-defined callback function; we're all done here.
			else
			{
				if (data.response.isInvalid())
					trigger("AddressWasInvalid", data);
				else if (data.response.isValid())
					trigger("AddressWasValid", data);
				else
					trigger("AddressWasAmbiguous", data);
			}
		},

		RequestTimedOut: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "RequestTimedOut", "(Request timed out)", event, data);

			if (data.address.form)
				delete data.address.form.processing;	// Tell the potentially duplicate event handlers that we're done.

			// If this was a form submit, don't let a network failure hold them back; just accept it and move on
			if (data.invoke)
				data.address.accept(data, false);

			ui.enableFields(data.address);
			ui.hideLoader(data.address);
		},

		AddressWasValid: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "AddressWasValid", "(Response indicates input address was valid)", event, data);

			var addr = data.address;
			var resp = data.response;

			data.response.chosen = resp.raw[0];
			addr.replaceWith(resp.raw[0], true, event);
			addr.accept(data);
		},

		AddressWasAmbiguous: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "AddressWasAmbiguous", "(Response indiciates input address was ambiguous)", event, data);

			ui.showAmbiguous(data);
		},

		AddressWasInvalid: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "AddressWasInvalid", "(Response indicates input address was invalid)", event, data);

			ui.showInvalid(data);
		},

		OriginalInputSelected: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "OriginalInputSelected", "(User chose to use original input)", event, data);

			data.address.accept(data, false);
		},

		UsedSuggestedAddress: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "UsedSuggestedAddress", "(User chose to a suggested address)", event, data);

			data.response.chosen = data.chosenCandidate;
			data.address.replaceWith(data.chosenCandidate, true, event);
			data.address.accept(data);
		},

		InvalidAddressRejected: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "InvalidAddressRejected", "(User chose to correct an invalid address)", event, data);
			
			if (data.address.form)
				delete data.address.form.processing;	// We're done with this address and ready for the next, potentially

			trigger("Completed", data);
		},

		AddressAccepted: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "AddressAccepted", "(Address marked accepted)", event, data);

			if (!data)
				data = {};

			if (data.address && data.address.form)
				delete data.address.form.processing;	// We're done with this address and ready for the next, potentially
			
			// If this was the result of a form submit, re-submit the form (whether by clicking the button or raising form submit event)
			if (data.invoke && data.invokeFn)
				submitForm(data.invoke, data.invokeFn);

			trigger("Completed", data);
		},

		Completed: function(event, data)
		{
			if (config.debug)
				console.log("EVENT:", "Completed", "(All done)", event, data);

			if (data.address)
			{
				ui.enableFields(data.address);
				if (data.address.form)
					delete data.address.form.processing;	// We're done with this address and ready for the next, potentially
			}
		}
	};


	/*
	 *	MISCELLANEOUS
	 */

	function arrayContains(array, subject)
	{
		// See if an array contains a particular value
		for (var i in array)
			if (array[i] === subject) return true;
		return false;
	}

	function randomInt(min, max)
	{
		// Generate a random integer between min and max
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	function lowercase(string)
	{
		// Return an empty string if not defined, or a lowercase string with '[]' stripped.
		return string ? string.toLowerCase().replace('[]', '') : '';
	}

	function trigger(eventType, metadata)
	{
		// Raise an event (in our case, a custom event)
		$(document).triggerHandler(eventType, metadata);
	}

	function bind(eventType)
	{
		// Bind a custom handler to an event
		$(document).bind(eventType, HandleEvent);
	}

	function suppress(event)
	{
		// Used to prevent form submits, and stop other events if needed
		if (!event) return false;
		if (event.preventDefault) event.preventDefault();
		if (event.stopPropagation) event.stopPropagation();
		if (event.stopImmediatePropagation) event.stopImmediatePropagation();
		event.cancelBubble = true;
		return false;
	}

})(jQuery, window, document);