const functions = require('firebase-functions');
const { saveChatMessage, getChatHistory, savePreferences, getPreferences } = require('./firebase');
const { processMessageWithGPT, extractPreferencesFromMessage } = require('./gpt');
const { getMatchingClubs } = require('./clubs');
require('dotenv').config();

exports.whatsappWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const userMessage = req.body.Body.trim();
    const senderNumber = req.body.From;

    let chatHistory = await getChatHistory(senderNumber) || [];
    let preferences = await getPreferences(senderNumber);

    if (!preferences) {
      preferences = await extractPreferencesFromMessage(process.env.OPENAI_API_KEY, userMessage);
      await savePreferences(senderNumber, preferences);
      await saveChatMessage(senderNumber, "user", userMessage);
      await saveChatMessage(senderNumber, "assistant", "Preferences saved. Looking for matching clubs...");
    }

    const clubs = getMatchingClubs(preferences);
    const responseMessage = clubs.length
      ? `Here are some clubs for you: ${clubs.join(", ")}`
      : "Sorry, no matching clubs found.";

    await saveChatMessage(senderNumber, "assistant", responseMessage);

    res.status(200).send(`
      <Response>
        <Message>${responseMessage}</Message>
      </Response>
    `);
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send(`
      <Response>
        <Message>Something went wrong. Please try again later.</Message>
      </Response>
    `);
  }
});
