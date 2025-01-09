//process response

const { getChatHistory, saveChatMessage, getPreferences, savePreferences } = require('./firebase');
const { extractPreferencesFromMessage } = require('./gpt');
const { handleClubRecommendations } = require('./handlers/clubHandler');
const { handleEventQuery } = require('./handlers/eventHandler');
const { sendWhatsAppMessage } = require('./metaApi');
const { extractEventQuery } = require('./events');


async function processAndSendResponse(senderNumber, userMessage) {
  try {
    const chatHistory = await getChatHistory(senderNumber) || [];
    const preferences = await getPreferences(senderNumber) || {};

    // Save user message 
    await saveChatMessage(senderNumber, "user", userMessage);

    // Check if the user wants 
    const eventQuery = await extractEventQuery(process.env.OPENAI_API_KEY, userMessage);
    if (eventQuery && eventQuery.wants_events) {
      const responseMessage = await handleEventQuery(senderNumber, eventQuery, preferences);
      return await sendWhatsAppMessage(senderNumber, responseMessage);
    }

    // Handle club recommendations
    const extractedPreferences = await extractPreferencesFromMessage(process.env.OPENAI_API_KEY, userMessage);
    const updatedPreferences = {
      ...preferences,
      ...extractedPreferences
    };
    await savePreferences(senderNumber, updatedPreferences);

    const responseMessage = await handleClubRecommendations(senderNumber, updatedPreferences);
    await sendWhatsAppMessage(senderNumber, responseMessage);
  } catch (error) {
    console.error("Error processing user response:", error.message);
    await sendWhatsAppMessage(senderNumber, "An error occurred. Please try again later.");
  }
}

module.exports = { processAndSendResponse };
