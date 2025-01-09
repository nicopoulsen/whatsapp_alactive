//main file for receiving from webhook, and sending via token

const functions = require('firebase-functions');
const { processAndSendResponse } = require('./responseProcessor'); // Custom response handler
require('dotenv').config();

exports.whatsappWebhook = functions.https.onRequest((req, res) => {
  try {
    console.log('Incoming request:', JSON.stringify(req.body, null, 2));
    console.log('Query parameters:', req.query);

    if (req.query['hub.verify_token'] === process.env.META_VERIFY_TOKEN) {
      console.log('Meta verification request received.');
      return res.status(200).send(req.query['hub.challenge']); // 
    }

    res.status(200).send('EVENT_RECEIVED'); 

    const entry = req.body?.entry?.[0];
    if (!entry) {
      console.error('Invalid payload: Missing "entry" in request body');
      return; 
    }

    const changes = entry?.changes?.[0];
    const messageData = changes?.value?.messages?.[0];

    if (!messageData?.text?.body) {
      console.error(
        'Invalid message payload. Missing required fields:',
        JSON.stringify(req.body, null, 2)
      );
      return; 
    }

    const userMessage = messageData.text.body.trim();
    const senderNumber = messageData.from;

    console.log(`Received user message: "${userMessage}" from: ${senderNumber}`);

    // Process the message and send a response asynchronously
    processAndSendResponse(senderNumber, userMessage)
      .then(() => {
        console.log('Response processed successfully.');
      })
      .catch((error) => {
        console.error('Error processing response:', error.message);
      });
  } catch (error) {
    console.error('Critical error in webhook handler:', error.stack || error.message);
  }
});
