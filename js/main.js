signInWidgetConfig = {
    // Enable or disable widget functionality with the following options. Some of these features require additional configuration in your Okta admin settings. Detailed information can be found here: https://github.com/okta/okta-signin-widget#okta-sign-in-widget
    // Look and feel changes:
    //logo: '//logo.clearbit.com/okta.com', // Try changing "okta.com" to other domains, like: "workday.com", "splunk.com", or "delmonte.com"
    language: 'en', // Try: [fr, de, es, ja, zh-CN] Full list: https://github.com/okta/okta-signin-widget#language-and-text
    i18n: {
        //Overrides default text when using English. Override other languages by adding additional sections.
        en: {
            'primaryauth.title': ' ', // Changes the sign in text
            'primaryauth.submit': "Let's Go", // Changes the sign in button
            needhelp: ' ',
            // More e.g. [primaryauth.username.placeholder,  primaryauth.password.placeholder, needhelp, etc.].
            // Full list here: https://github.com/okta/okta-signin-widget/blob/master/packages/@okta/i18n/dist/properties/login.properties
        },
    },
    // Changes to widget functionality
    features: {
        //registration: true,                 // Enable self-service registration flow
        rememberMe: true, // Setting to false will remove the checkbox to save username
        //multiOptionalFactorEnroll: true,  // Allow users to enroll in multiple optional factors before finishing the authentication flow.
        //selfServiceUnlock: true,          // Will enable unlock in addition to forgotten password
        //smsRecovery: true,                // Enable SMS-based account recovery
        //callRecovery: true,               // Enable voice call-based account recovery
        router: true, // Leave this set to true for the API demo
    },
    baseUrl: 'https://live-widget.oktapreview.com',
    clientId: '0oaexo9c530ZUVuOj0h7',
    redirectUri: 'https://developer.okta.com/live-widget',
    authParams: {
        issuer: 'https://live-widget.oktapreview.com/oauth2/ausexqn31sz3HMxdf0h7',
        responseType: ['id_token', 'token'],
        scopes: ['openid', 'email', 'profile'],
    },
};

signInWidget = new OktaSignIn(signInWidgetConfig);

function widgetSuccessCallback(res) {
    console.log($('#okta-signin-username'));
    var key = '';
    if (res[0]) {
        key = Object.keys(res[0])[0];
        signInWidget.tokenManager.add(key, res[0]);
    }
    if (res[1]) {
        key = Object.keys(res[1])[0];
        signInWidget.tokenManager.add(key, res[1]);
    }
    if (res.status === 'SUCCESS') {
        var token = signInWidget.tokenManager.get(key);
        console.log('Logged in to Okta and issued token:');
        console.log(token);
        console.log('Reload this page to start over.');
        alert('Logged in! Check your developer console for details');
    }
}

function widgetErrorCallback(err) {}

signInWidget.renderEl({ el: '#widget-container' }, widgetSuccessCallback, widgetErrorCallback);

$(function() {
    var inter = setInterval(function() {
        if ($('#okta-signin-submit').length > 0) {
            clearInterval(inter);
            // we have the form. Now let's modify it.

            // move "remember me" next to the submit button
            var $rememberCont = $('.o-form-input-name-remember').closest('.o-form-fieldset');
            $('.o-form-button-bar').prepend($rememberCont);

            // use the placeholders to create labels for the inputs
            $('.o-form-fieldset-container')
                .find('input')
                .each(function(i) {
                    var futureLabel = $(this).attr('placeholder');
                    if (futureLabel) {
                        var labelText = '<div class="field-label"><label for="' + this.id + '">' + futureLabel + '</label></div>';
                        if (futureLabel.toLowerCase() === 'password') {
                            labelText =
                                '<div class="field-label"><label for="' +
                                this.id +
                                '">' +
                                futureLabel +
                                '</label> <a href="#">Forgot Password?</a></div>';
                        }
                        $(this)
                            .closest('.o-form-fieldset')
                            .prepend(labelText);
                    }
                });
        }
    }, 100);
});
