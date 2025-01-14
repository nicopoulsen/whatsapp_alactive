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
    console.time("[TIMING] getChatHistory");
    const chatHistory = await getChatHistory(senderNumber) || [];
    console.timeEnd("[TIMING] getChatHistory");
    console.log(`[DEBUG] Retrieved chat history:`, chatHistory);

    console.time("[TIMING] getPreferences");
    const preferences = await getPreferences(senderNumber) || {};
    console.timeEnd("[TIMING] getPreferences");
    console.log(`[DEBUG] User preferences loaded:`, preferences);

    console.time("[TIMING] saveChatMessage (user)");
    await saveChatMessage(senderNumber, "user", userMessage);
    console.timeEnd("[TIMING] saveChatMessage (user)");

    // Step 1: Extract preferences from the message
    let extractedPreferences;
    try {
      console.time("[TIMING] extractPreferencesFromMessage");
      extractedPreferences = await extractPreferencesFromMessage(process.env.OPENAI_API_KEY, userMessage);
      console.timeEnd("[TIMING] extractPreferencesFromMessage");
      console.log("[DEBUG] Extracted preferences:", extractedPreferences);
    } catch (error) {
      console.error("Error extracting preferences:", error.message);

      const fallbackResponse = "I couldn't understand your preferences. Can you rephrase?";
      console.time("[TIMING] saveChatMessage (assistant fallback)");
      await saveChatMessage(senderNumber, "assistant", fallbackResponse);
      console.timeEnd("[TIMING] saveChatMessage (assistant fallback)");

      console.time("[TIMING] sendWhatsAppMessage (fallback)");
      await sendWhatsAppMessage(senderNumber, fallbackResponse);
      console.timeEnd("[TIMING] sendWhatsAppMessage (fallback)");

      return;
    }

    // Normalize budget if present (e.g., map numbers like 80 to predefined ranges)
    // (mapBudgetToRange is likely a small synchronous function, but we can still track it)
    if (extractedPreferences.budget) {
      console.time("[TIMING] mapBudgetToRange");
      extractedPreferences.budget = mapBudgetToRange(extractedPreferences.budget);
      console.timeEnd("[TIMING] mapBudgetToRange");
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
      console.time("[TIMING] savePreferences");
      await savePreferences(senderNumber, updatedPreferences);
      console.timeEnd("[TIMING] savePreferences");
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

      console.time("[TIMING] saveChatMessage (assistant missingFields)");
      await saveChatMessage(senderNumber, "assistant", promptMessage);
      console.timeEnd("[TIMING] saveChatMessage (assistant missingFields)");

      console.time("[TIMING] sendWhatsAppMessage (missingFields)");
      await sendWhatsAppMessage(senderNumber, promptMessage);
      console.timeEnd("[TIMING] sendWhatsAppMessage (missingFields)");
      return;
    }

    // Step 4: Handle "more clubs" request
    if (userMessage.toLowerCase().includes("more clubs")) {
      const currentClubIndex = userClubIndexes[senderNumber] || 0;

      console.time("[TIMING] getMatchingClubs");
      const clubs = getMatchingClubs(updatedPreferences);
      console.timeEnd("[TIMING] getMatchingClubs");

      const clubBatch = clubs.slice(currentClubIndex, currentClubIndex + 5);
      console.log("[DEBUG] Clubs in current batch:", clubBatch);

      console.time("[TIMING] getClubDetails");
      const clubDetails = await getClubDetails(clubBatch);
      console.timeEnd("[TIMING] getClubDetails");
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

      console.time("[TIMING] sendWhatsAppMessage (more clubs)");
      await sendWhatsAppMessage(senderNumber, responseMessage);
      console.timeEnd("[TIMING] sendWhatsAppMessage (more clubs)");
      return;
    }

    // Step 5: Output clubs if preferences are complete
    if (Object.keys(preferences).length === 0 || !userClubIndexes[senderNumber]) {
      console.time("[TIMING] getMatchingClubs (initial list)");
      const clubs = getMatchingClubs(updatedPreferences);
      console.timeEnd("[TIMING] getMatchingClubs (initial list)");

      const clubBatch = clubs.slice(0, 5);

      console.time("[TIMING] getClubDetails (initial list)");
      const clubDetails = await getClubDetails(clubBatch);
      console.timeEnd("[TIMING] getClubDetails (initial list)");

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

      console.time("[TIMING] sendWhatsAppMessage (initial clubs)");
      await sendWhatsAppMessage(senderNumber, responseMessage);
      console.timeEnd("[TIMING] sendWhatsAppMessage (initial clubs)");

      userClubIndexes[senderNumber] = 5;
      return;
    }

    // Step 6: Handle event queries
    console.time("[TIMING] extractEventQuery");
    const eventQuery = await extractEventQuery(process.env.OPENAI_API_KEY, userMessage);
    console.timeEnd("[TIMING] extractEventQuery");

    if (eventQuery && eventQuery.wants_events) {
      console.log("[DEBUG] Event query extracted:", eventQuery);

      console.time("[TIMING] handleEventQuery");
      const responseMessage = await handleEventQuery(senderNumber, eventQuery, updatedPreferences);
      console.timeEnd("[TIMING] handleEventQuery");

      console.time("[TIMING] sendWhatsAppMessage (events)");
      await sendWhatsAppMessage(senderNumber, responseMessage);
      console.timeEnd("[TIMING] sendWhatsAppMessage (events)");

      return;
    }
  } catch (error) {
    console.error("[ERROR] Error processing user response:", error.message);
    console.time("[TIMING] sendWhatsAppMessage (catch error)");
    await sendWhatsAppMessage(senderNumber, "An error occurred. Please try again later.");
    console.timeEnd("[TIMING] sendWhatsAppMessage (catch error)");
  }
}

module.exports = { processAndSendResponse };
