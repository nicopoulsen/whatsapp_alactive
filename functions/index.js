const functions = require("firebase-functions");
const { runGraphFlow } = require("./langgraph/mainGraph");
const { sendWhatsAppMessage } = require("./services/metaApi");
const { getChatHistory, saveChatMessage } = require("./services/firebase");
require("dotenv").config();

exports.whatsappWebhook = functions.https.onRequest(async (req, res) => {
  try {
    console.log("🔹 Incoming request:", JSON.stringify(req.body, null, 2));

    // Meta webhook verification
    if (req.query["hub.verify_token"] === process.env.META_VERIFY_TOKEN) {
      console.log("✅ Meta verification successful!");
      return res.status(200).send(req.query["hub.challenge"]);
    }

    // Acknowledge receipt
    res.status(200).send("EVENT_RECEIVED");

    // Extract WhatsApp message
    const entry = req.body?.entry?.[0];
    if (!entry) {
      console.error("❌ ERROR: Missing entry in request body");
      return;
    }

    const changes = entry?.changes?.[0];
    const messageData = changes?.value?.messages?.[0];

    if (!messageData?.text?.body) {
      console.error("❌ ERROR: No text message found in payload");
      return;
    }

    const userMessage = messageData.text.body.trim();
    const senderNumber = messageData.from;

    console.log(`📩 Received message: "${userMessage}" from: ${senderNumber}`);

    // **Check Firebase for chat history**
    const chatHistory = await getChatHistory(senderNumber);
    console.log(" Chat history result:", chatHistory);

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
      console.log("✅ Welcome message sent!");

      // ✅ Save first user interaction to Firebase
      await saveChatMessage(senderNumber, "system", "Welcome message sent.");
      console.log("📝 User interaction saved in Firebase!");

      return; // STOP execution here, so the graph doesn't process this.
    }

    // **All OTHER messages go into the LangGraph pipeline**
    await saveChatMessage(senderNumber, "user", userMessage);
    console.log("📥 User message saved in Firebase!");

    console.log("🔁 Processing user message through LangGraph...");
    const response = await runGraphFlow(senderNumber, userMessage);

    // Ensure LangGraph returns a response
    const finalResponse = response || "Sorry, I didn’t understand that. Try asking differently!";

    // Send response to user
    await sendWhatsAppMessage(senderNumber, finalResponse);
    console.log("✅ Response sent:", finalResponse);

    // Save bot's response in Firebase
    await saveChatMessage(senderNumber, "system", finalResponse);
    console.log("📤 Bot response saved in Firebase!");
  } catch (error) {
    console.error("🔥 CRITICAL ERROR:", error.stack || error.message);
  }
});
