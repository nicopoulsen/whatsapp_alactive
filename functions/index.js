const functions = require("firebase-functions");
const { sendWhatsAppMessage } = require("./services/metaApi"); // Sends WhatsApp messages
const { getChatHistory } = require("./services/firebase"); // Retrieves past messages
require("dotenv").config();

exports.whatsappWebhook = functions.https.onRequest(async (req, res) => {
  try {
    console.log("Incoming request:", JSON.stringify(req.body, null, 2));

    // Meta webhook verification
    if (req.query["hub.verify_token"] === process.env.META_VERIFY_TOKEN) {
      return res.status(200).send(req.query["hub.challenge"]);
    }

    // Acknowledge the request
    res.status(200).send("EVENT_RECEIVED");

    const entry = req.body?.entry?.[0];
    if (!entry) return console.error("Missing entry in request body");

    const changes = entry?.changes?.[0];
    const messageData = changes?.value?.messages?.[0];

    if (!messageData?.text?.body) return console.error("Invalid message payload");

    const userMessage = messageData.text.body.trim();
    const senderNumber = messageData.from;

    console.log(`Received message: "${userMessage}" from: ${senderNumber}`);

    // Check if user has any past messages in Firebase (to determine if it's their first message)
    const chatHistory = await getChatHistory(senderNumber);

    if (!chatHistory) {
      // First time user → Send welcome message
      const welcomeMessage = `
Hello, I’m Viky, nice to meet you! 🤖✨
I’m an AI Bot that can help you discover & book **nightclubs, events, and bars** based on your tastes all in one chat! 💃🕺 My goal is to provide you with all the info possible so that you don’t have to search for anything! 🎉

Let’s get started! 🚀

What’s your gender? 👇
1️⃣ Woman 💃  
2️⃣ Man 🕺  
3️⃣ Other 🪩  

What do you need help with? ✨
1️⃣ Nightclubs 🪩  
2️⃣ Bar 🍸
      `;

      await sendWhatsAppMessage(senderNumber, welcomeMessage);
      console.log("✅ Welcome message sent!");
    } else {
      console.log("User has chat history - skipping welcome message.");
    }
  } catch (error) {
    console.error("Critical error in webhook handler:", error.stack || error.message);
  }
});
