const functions = require("firebase-functions");
const { runGraphFlow } = require("./langgraph/mainGraph");
const { sendWhatsAppMessage } = require("./services/metaApi");
const { getChatHistory, saveChatMessage } = require("./services/firebase");
require("dotenv").config();

exports.whatsappWebhook = functions.https.onRequest(async (req, res) => {
  try {
    if (req.query["hub.verify_token"] === process.env.META_VERIFY_TOKEN) {
      console.log("✅ Meta verification successful!");
      return res.status(200).send(req.query["hub.challenge"]);
    }

    // send 200
    res.status(200).send("EVENT_RECEIVED");

    const entry = req.body?.entry?.[0];
    if (!entry) {
      return;
    }

    const changes = entry?.changes?.[0];
    const messageData = changes?.value?.messages?.[0];

    if (!messageData?.text?.body) {
      return;
    }

    const userMessage = messageData.text.body.trim();
    const senderNumber = messageData.from;

    console.log(` message: "${userMessage}" from: ${senderNumber}`);

    const chatHistory = await getChatHistory(senderNumber);
    console.log(" chat history result:", chatHistory);

    // **FIRST MESSAGE LOGIC (SEND WELCOME MESSAGE)**
    if (!chatHistory) {
      console.log("🆕 First-time user detected! Sending welcome message...");

      const welcomeMessage = `
Hello, I’m Viky, nice to meet you! 🤖✨
I’m an AI Bot that can help you discover & book **nightclubs, events, and bars** based on your tastes all in one chat! 💃🕺 

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
      console.log("message sent");

      await saveChatMessage(senderNumber, "system", "Welcome message sent.");

      return; // STOP execution here, so the graph doesn't process 
    }

    // **All OTHER messages go into the LangGraph pipeline**
    await saveChatMessage(senderNumber, "user", userMessage);

    const response = await runGraphFlow(senderNumber, userMessage);

    const finalResponse = response || "Sorry, I didn’t understand that. Try asking differently!";

    await sendWhatsAppMessage(senderNumber, finalResponse);

    await saveChatMessage(senderNumber, "system", finalResponse);
  } catch (error) {
    console.error("ERROR:", error.stack || error.message);
  }
});
