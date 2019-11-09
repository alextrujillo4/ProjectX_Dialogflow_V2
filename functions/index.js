'use strict';
const express = require('express'),
    bodyParser = require('body-parser');

const functions = require('firebase-functions'); // Cloud Functions for Firebase library
const req = require('request');
const DialogflowApp = require('actions-on-google').DialogflowApp; // Google Assistant helper library

var admin = require("firebase-admin");
var serviceAccount = require("./firebase-disg-service-key.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://seguros-sample.firebaseio.com"
});

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    // console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
    if (request.body.result) {
        processV1Request(request, response);
    } else if (request.body.queryResult) {
        processV2Request(request, response);
    } else {
        console.log('Invalid Request');
        return response.status(400).end('Invalid Webhook Request (expecting v1 or v2 webhook request)');
    }
});

/*
* Function to handle v2 webhook requests from Dialogflow
*/
function processV2Request (request, response) {
    // An action is a string used to identify what needs to be done in fulfillment
    let action = (request.body.queryResult.action) ? request.body.queryResult.action : 'default';
    // Parameters are any entites that Dialogflow has extracted from the request.
    let parameters = request.body.queryResult.parameters || {}; // https://dialogflow.com/docs/actions-and-parameters
    // Contexts are objects used to track and store conversation state
    let inputContexts = request.body.queryResult.contexts; // https://dialogflow.com/docs/contexts
    // Get the request source (Google Assistant, Slack, API, etc)
    let requestSource = (request.body.originalDetectIntentRequest) ? request.body.originalDetectIntentRequest.source : undefined;
    // Get the session ID to differentiate calls from different users
    let session = (request.body.session) ? request.body.session : undefined;
    // Create handlers for Dialogflow actions as well as a 'default' handler
    const actionHandlers = {

        'input.unknown': () => {
            sendResponse('I didn\'t get that one! -hb'); // Send simple response to user
        },
        // Default handler for unknown or undefined actions
        'default': () => {
            let responseToUser = {
              fulfillmentText: 'Sorry! I can\'t do that ... YET! -hb' // displayed response
            };
            sendResponse(responseToUser);
        },
        'query.welcome_intent': () => {
            sendResponse(welcomeInten());
        },
        'query.carousel': () => {
            sendResponse(carouselIntent());
        },
        'query.packet_price' :() => {
            console.log("Price Intent");
            let packetSelected = parameters.product;
            console.log("Parameter => " + packetSelected);
            return new Promise ((resolve, reject) => {
                admin.database().ref("Products/" + packetSelected).once('value', (snapshot) => {
                    let responseToUser ={};
                    if (snapshot.hasChild("name")) {
                        let object = snapshot.val();
                        console.log("Product Found!");
                        responseToUser = {
                            "fulfillmentMessages": [
                                {
                                    'platform': 'ACTIONS_ON_GOOGLE',
                                    'simpleResponses': {
                                        'simpleResponses': [
                                            {
                                                "textToSpeech": "El precio del " + packetSelected + " es:" + object.price ,
                                                "displayText": packetSelected + " : " +  object.price
                                            }
                                        ]
                                    }
                                },
                                {
                                    'platform': 'ACTIONS_ON_GOOGLE',
                                    'basicCard':
                                        {
                                            "title":  object.name ,
                                            "subtitle": "Selecciona el botón para ir al producto.",
                                            "formattedText": "Image Formatted",
                                            "image":
                                                {
                                                    "imageUri": object.url,
                                                    "accessibilityText": "Imagen de Seguro"
                                                },
                                            "buttons": [
                                                {
                                                    "title": "Ir al seguro",
                                                    "openUriAction": {
                                                        "uri": object.url
                                                    }
                                                }
                                            ]
                                        }
                                },
                                {
                                    'platform': 'ACTIONS_ON_GOOGLE',
                                    "suggestions": {
                                        'suggestions': [
                                            {
                                                "title": "¿Qué puedes hacer?"
                                            }
                                        ]
                                    }
                                }
                            ]
                        };
                    }else {
                        console.log("Product Not Found!");
                        responseToUser = {
                            "fulfillmentMessages": [
                                {
                                    'platform': 'ACTIONS_ON_GOOGLE',
                                    'simpleResponses': {
                                        'simpleResponses': [
                                            {
                                                "textToSpeech": "Producto No encontrado :(",
                                                "displayText": "Producto No encontrado :("
                                            }
                                        ]
                                    }
                                }
                            ]
                        };
                    }
                    sendResponse(responseToUser);
                    resolve();
                    return;
                });
            });
        }

    };
    // If undefined or unknown action use the default handler
    if (!actionHandlers[action]) {
        action = 'default';
    }
    // Run the proper handler function to handle the request from Dialogflow
    actionHandlers[action]();
    // Function to send correctly formatted responses to Dialogflow which are then sent to the user
    function sendResponse (responseToUser) {
        // if the response is a string send it as a response to the user
        if (typeof responseToUser === 'string') {
            let responseJson = {fulfillmentText: responseToUser}; // displayed response
            response.json(responseJson); // Send response to Dialogflow
        } else {
            // If the response to the user includes rich responses or contexts send them to Dialogflow
            let responseJson = {};
            // Define the text response
            responseJson.fulfillmentText = responseToUser.fulfillmentText;
            // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
            if (responseToUser.fulfillmentMessages) {
                responseJson.fulfillmentMessages = responseToUser.fulfillmentMessages;
            }
            // Optional: add contexts (https://dialogflow.com/docs/contexts)
            if (responseToUser.outputContexts) {
                responseJson.outputContexts = responseToUser.outputContexts;
            }
            // Send the response to Dialogflow
            console.log('Response to Dialogflow: ' + JSON.stringify(responseJson));
            response.json(responseJson);
        }
    }

    function welcomeInten() {
        console.log("Welcome Intent");
        let responseToUser = {
            "fulfillmentMessages": [
                {
                    'platform': 'ACTIONS_ON_GOOGLE',
                    'simpleResponses': {
                        'simpleResponses': [
                            {
                                "textToSpeech": "Hola! Soy su asistente de Seguros. ¿Cómo puedo ayudarte?",
                                "displayText":  "Hola! Soy su asistente de Seguros. ¿Cómo puedo ayudarte? 😀"
                            }
                        ]
                    }
                },
                {
                    'platform': 'ACTIONS_ON_GOOGLE',
                    "suggestions": {
                        'suggestions': [
                            {
                                "title": "Precio Packet 1"
                            },
                            {
                                "title": "Precio Packet 2"
                            },
                            {
                                "title": "Precio Packet 3"
                            }
                        ]
                    }
                }
            ]
        };
        return responseToUser;
    }

    function carouselIntent() {
        console.log("Carousel  Intent");
        //TODO: Create Carousel Object, Call Furebasedatabase and show every data in a carousel.
        let responseToUser = {
            "fulfillmentMessages": [
                {
                    'platform': 'ACTIONS_ON_GOOGLE'
                }
            ]
        };
        return responseToUser;
    }
}


//FIREBASE SAMPLE
/*db.child("0").child("precio").once('value').then(function (snap){
    console.log("snapVal()", snap.val());
});*/

/*
Emojis: https://getemoji.com/
Firebase Documentation ReadData: https://firebase.google.com/docs/database/web/read-and-write
Google cloud documentation: https://cloud.google.com/dialogflow/docs/fulfillment-how
Google Cloud Responses: https://cloud.google.com/dialogflow/docs/reference/rest/v2/projects.agent.intents#simpleresponses
Facebook integration: https://cloud.google.com/dialogflow/docs/integrations/facebook
Facebook Responses: https://developers.facebook.com/docs/messenger-platform/reference/send-api/
 */

/* //FACEBOOK SAMPLE RESPONSE
"fulfillmentMessages": [
    {//SIMPLE RESPONSE
        "platform": "FACEBOOK",
        "text": {
            "text": [
                `Simple Response`
            ]
        },
    },
    {//CAROUSEL
    "platform": "FACEBOOK",
        "payload": {
          "facebook": {
            "attachment": {
              "type": "template",
              "payload": {
                "template_type": "list",
                "top_element_style": "large",
                "elements": [
                  {
                    "title": "Producto1",
                    "image_url": "URL",
                    "subtitle": "Subtitle."
                  },
                  {
                    "title": "Producto2",
                    "image_url": "URL",
                    "subtitle": "Subtitle."
                    }
                ]
              }
            }
          }
        }
     },
    {//QUICK REPLIES
        "platform": "FACEBOOK",
        "quickReplies": {
            "title": "Titulo",
            "quickReplies": [
                "Quick1",
                "Quick2",
                "Quick3",
            ]
        }
    }
]
};
 */