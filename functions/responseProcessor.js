const { getChatHistory, saveChatMessage, getPreferences, savePreferences } = require('./firebase');
const { extractPreferencesFromMessage } = require('./gpt');
const { handleEventQuery } = require('./handlers/eventHandler');
const { sendWhatsAppMessage } = require('./metaApi');
const { extractEventQuery } = require('./events');
const { getMatchingClubs, getClubDetails } = require('./clubs');

// Store user club index for batching
let userClubIndexes = {};

async function processAndSendResponse(senderNumber, userMessage) {
  console.log(`[DEBUG] Processing response for user: ${senderNumber}, message: "${userMessage}"`);

  try {
    // Retrieve chat history and preferences
    const chatHistory = await getChatHistory(senderNumber) || [];
    console.log(`[DEBUG] Retrieved chat history:`, chatHistory);

    const preferences = await getPreferences(senderNumber) || {};
    console.log(`[DEBUG] User preferences loaded:`, preferences);

    await saveChatMessage(senderNumber, "user", userMessage);

    // Step 1: Extract preferences and update them incrementally
    const extractedPreferences = await extractPreferencesFromMessage(process.env.OPENAI_API_KEY, userMessage);
    console.log(`[DEBUG] Extracted preferences from message:`, extractedPreferences);

    const updatedPreferences = {
      gender: extractedPreferences.gender !== undefined ? extractedPreferences.gender : preferences.gender || "",
      music_preferences: extractedPreferences.music_preferences?.length
        ? Array.from(new Set([...(preferences.music_preferences || []), ...extractedPreferences.music_preferences]))
        : preferences.music_preferences || [],
      budget: extractedPreferences.budget !== undefined ? extractedPreferences.budget : preferences.budget || "",
      vibe: extractedPreferences.vibe?.length
        ? Array.from(new Set([...(preferences.vibe || []), ...extractedPreferences.vibe]))
        : preferences.vibe || [],
    };
    console.log(`[DEBUG] Updated preferences:`, updatedPreferences);

    await savePreferences(senderNumber, updatedPreferences);

    // Step 2: Check for missing preferences
    const missingFields = [];
    if (!updatedPreferences.gender) missingFields.push("gender");
    if (!updatedPreferences.music_preferences?.length) missingFields.push("music preferences (up to 3)");
    if (!updatedPreferences.budget) missingFields.push("budget");
    if (!updatedPreferences.vibe?.length) missingFields.push("vibe (up to 3)");

    if (missingFields.length > 0) {
      const promptMessage = `It seems like some information is still missing: ${missingFields.join(", ")}. Please provide them.`;
      console.log(`[DEBUG] Missing fields:`, missingFields);
      await sendWhatsAppMessage(senderNumber, promptMessage);
      return;
    }

    // Step 3: Check for "more clubs" request
    if (userMessage.toLowerCase().includes("more clubs")) {
      const currentClubIndex = userClubIndexes[senderNumber] || 0;

      const clubs = getMatchingClubs(updatedPreferences);
      const clubBatch = clubs.slice(currentClubIndex, currentClubIndex + 5);
      console.log(`[DEBUG] Clubs in current batch (index ${currentClubIndex} to ${currentClubIndex + 5}):`, clubBatch);

      const clubDetails = await getClubDetails(clubBatch);
      console.log(`[DEBUG] Detailed club information fetched:`, clubDetails);

      let responseMessage = "Here are some clubs for you:\n\n";
      if (clubDetails.length > 0) {
        clubDetails.forEach((club) => {
          responseMessage += `${club.venue_name}\n📍 Location: ${club.municipality}\n🍸 Max Price: £${club.cocktail_max_price}\n\n`;
        });
      } else {
        responseMessage = "Sorry, no matching clubs found.";
      }

      userClubIndexes[senderNumber] = currentClubIndex + 5;
      if (userClubIndexes[senderNumber] < clubs.length) {
        responseMessage += "\nWant more clubs? Just say 'more clubs'!";
      }

      await sendWhatsAppMessage(senderNumber, responseMessage);
      return;
    }

    // Step 4: Output clubs after preferences are complete
    if (Object.keys(preferences).length === 0 || !userClubIndexes[senderNumber]) {
      const clubs = getMatchingClubs(updatedPreferences);
      const clubBatch = clubs.slice(0, 5);
      const clubDetails = await getClubDetails(clubBatch);
      console.log(`[DEBUG] Detailed club information:`, clubDetails);

      let responseMessage = "Here are some clubs for you:\n\n";
      if (clubDetails.length > 0) {
        clubDetails.forEach((club) => {
          responseMessage += `${club.venue_name}\n📍 Location: ${club.municipality}\n🍸 Max Price: £${club.cocktail_max_price}\n\n`;
        });
        responseMessage += "\nWant more clubs? Just say 'more clubs'! You can also ask for event recommendations.";
      } else {
        responseMessage = "Sorry, no matching clubs found.";
      }

      await sendWhatsAppMessage(senderNumber, responseMessage);
      userClubIndexes[senderNumber] = 5;
      return;
    }

    // Step 5: Handle event queries (AFTER clubs have been output)
    const eventQuery = await extractEventQuery(process.env.OPENAI_API_KEY, userMessage);
    if (eventQuery && eventQuery.wants_events) {
      console.log(`[DEBUG] Event query extracted:`, eventQuery);

      const responseMessage = await handleEventQuery(senderNumber, eventQuery, updatedPreferences);
      return await sendWhatsAppMessage(senderNumber, responseMessage);
    }
  } catch (error) {
    console.error(`[ERROR] Error processing user response:`, error.message);
    await sendWhatsAppMessage(senderNumber, "An error occurred. Please try again later.");
  }
}

module.exports = { processAndSendResponse };
