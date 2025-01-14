const { getChatHistory, saveChatMessage, getPreferences, savePreferences } = require('./firebase');
const { extractPreferencesFromMessage, mapBudgetToRange} = require('./gpt');
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

    // Step 1: Extract preferences from the message
    let extractedPreferences;
    try {
      extractedPreferences = await extractPreferencesFromMessage(process.env.OPENAI_API_KEY, userMessage);
      console.log("[DEBUG] Extracted preferences:", extractedPreferences);
    } catch (error) {
      console.error("Error extracting preferences:", error.message);
      const fallbackResponse = "I couldn't understand your preferences. Can you rephrase?";
      await saveChatMessage(senderNumber, "assistant", fallbackResponse);
      await sendWhatsAppMessage(senderNumber, fallbackResponse);
      return;
    }

    // Normalize budget if present (e.g., map numbers like 80 to predefined ranges)
    if (extractedPreferences.budget) {
      extractedPreferences.budget = mapBudgetToRange(extractedPreferences.budget);
    }

    // Step 2: Merge extracted preferences with existing ones
    const updatedPreferences = {
      gender: extractedPreferences.gender || preferences.gender || "",
      music_preferences: extractedPreferences.music_preferences.length > 0
        ? extractedPreferences.music_preferences
        : preferences.music_preferences || [],
      budget: extractedPreferences.budget || preferences.budget || "",
      vibe: extractedPreferences.vibe.length > 0
        ? extractedPreferences.vibe
        : preferences.vibe || [],
    };
    console.log("[DEBUG] Updated preferences:", updatedPreferences);

    // Save updated preferences back to the database
    try {
      await savePreferences(senderNumber, updatedPreferences);
      console.log("[DEBUG] Preferences saved successfully:", updatedPreferences);
    } catch (error) {
      console.error("Error saving preferences:", error.message);
    }

    // Step 3: Check for missing preferences
    const missingFields = [];
    if (!updatedPreferences.gender) missingFields.push("gender");
    if (!updatedPreferences.music_preferences || updatedPreferences.music_preferences.length === 0)
      missingFields.push("music preferences (up to 3)");
    if (!updatedPreferences.budget) missingFields.push("budget");
    if (!updatedPreferences.vibe || updatedPreferences.vibe.length === 0) missingFields.push("vibe (up to 3)");

    // Handle missing preferences
    if (missingFields.length > 0) {
      const promptMessage = `It seems like some information is still missing: ${missingFields.join(", ")}. Please provide them.`;
      console.log("[DEBUG] Missing fields:", missingFields);
      await saveChatMessage(senderNumber, "assistant", promptMessage);
      await sendWhatsAppMessage(senderNumber, promptMessage);
      return;
    }

    // Step 4: Handle "more clubs" request
    if (userMessage.toLowerCase().includes("more clubs")) {
      const currentClubIndex = userClubIndexes[senderNumber] || 0;

      const clubs = getMatchingClubs(updatedPreferences);
      const clubBatch = clubs.slice(currentClubIndex, currentClubIndex + 5);
      console.log("[DEBUG] Clubs in current batch:", clubBatch);

      const clubDetails = await getClubDetails(clubBatch);
      console.log("[DEBUG] Fetched club details:", clubDetails);

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

    // Step 5: Output clubs if preferences are complete
    if (Object.keys(preferences).length === 0 || !userClubIndexes[senderNumber]) {
      const clubs = getMatchingClubs(updatedPreferences);
      const clubBatch = clubs.slice(0, 5);
      const clubDetails = await getClubDetails(clubBatch);
      console.log("[DEBUG] Detailed club information:", clubDetails);

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

    // Step 6: Handle event queries
    const eventQuery = await extractEventQuery(process.env.OPENAI_API_KEY, userMessage);
    if (eventQuery && eventQuery.wants_events) {
      console.log("[DEBUG] Event query extracted:", eventQuery);

      const responseMessage = await handleEventQuery(senderNumber, eventQuery, updatedPreferences);
      await sendWhatsAppMessage(senderNumber, responseMessage);
      return;
    }
  } catch (error) {
    console.error("[ERROR] Error processing user response:", error.message);
    await sendWhatsAppMessage(senderNumber, "An error occurred. Please try again later.");
  }
}

module.exports = { processAndSendResponse };
