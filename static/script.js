//Shared across pages

function navFunction() {
  var x = document.getElementById("myTopnav");
  if (x.className === "topnav") { x.className += " responsive";
          } 
  else {
            x.className = "topnav";
          }
       }

//Plaid specific
(async function ($) {
              var handler = Plaid.create({
                // Create a new link_token to initialize Link
                token: (await $.post('/link/create_link_token')).link_token,
                receivedRedirectUri: null,
                onLoad: function () {
                  // Optional, called when Link loads
                },
                onSuccess: function (public_token, metadata) {
                  // Send the public_token to your app server.
                  // The metadata object contains info about the institution the
                  // user selected and the account ID or IDs, if the
                  // Account Select view is enabled.
                  $.post('/link/exchange_public_token', {
                    public_token: public_token, metadata,
                  },
                    function (result) {
                      if (result == true) {
                        alert("Tried to load a duplicate account, can't do that")
                      }
                    }
                  );
                },
                onExit: function (err, metadata) {
                  // The user exited the Link flow.
                  if (err != null) {
                    // The user encountered a Plaid API error prior to exiting.
                  }
                  // metadata contains information about the institution
                  // that the user selected and the most recent API request IDs.
                  // Storing this information can be helpful for support.
                },
                onEvent: function (eventName, metadata) {
                  // Optionally capture Link flow events, streamed through
                  // this callback as your users connect an Item to Plaid.
                  // For example:
                  // eventName = "TRANSITION_VIEW"
                  // metadata  = {
                  //   link_session_id: "123-abc",
                  //   mfa_type:        "questions",
                  //   timestamp:       "2017-09-14T14:42:19.350Z",
                  //   view_name:       "MFA",
                  // }
                }
              });

              $('#link-button').on('click', function (e) {
                handler.open();
              });
            })(jQuery);