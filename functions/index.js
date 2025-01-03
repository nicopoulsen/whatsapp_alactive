const functions = require('firebase-functions');
const { saveChatMessage, getChatHistory, savePreferences, getPreferences } = require('./firebase');
const { extractPreferencesFromMessage, mapBudgetToRange } = require('./gpt');
const { getMatchingClubs } = require('./clubs');
const { extractEventQuery, getEventsForClubs } = require('./events');
require('dotenv').config();

// Store the index for each user
let userClubIndexes = {}; // { senderNumber: currentClubIndex }

async function outputClubsInBatches(senderNumber, preferences) {
  const clubs = getMatchingClubs(preferences);  // This gets the full list of matching clubs
  
  // Get the current index for the user
  let currentClubIndex = userClubIndexes[senderNumber] || 0;
  
  // Slice to get the current batch of 5 clubs
  const clubBatch = clubs.slice(currentClubIndex, currentClubIndex + 5);

  let responseMessage = "Here are some clubs for you: \n\n";
  clubBatch.forEach(club => {
    responseMessage += `${club}\n`;
  });

  // Update the index for the user to the next batch
  userClubIndexes[senderNumber] = currentClubIndex + 5;

  // If there are more clubs left, ask the user if they want more
  if (userClubIndexes[senderNumber] < clubs.length) {
    responseMessage += "\nWant more clubs? Just ask!";
  }

  return responseMessage;
}

function resetClubIndex(senderNumber) {
  userClubIndexes[senderNumber] = 0;  // Reset to start from the beginning
}

exports.whatsappWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const userMessage = req.body.Body.trim();
    const senderNumber = req.body.From;

    console.log("Received user message:", userMessage);

    // Retrieve chat history and existing preferences
    let chatHistory, preferences;
    try {
      chatHistory = await getChatHistory(senderNumber) || [];
      preferences = await getPreferences(senderNumber) || {};
    } catch (error) {
      console.error("Error retrieving chat history or preferences:", error.message);
      const fallbackResponse = "I'm having trouble accessing your preferences. Please try again later.";
      await saveChatMessage(senderNumber, "assistant", fallbackResponse);
      return res.status(500).send(`
        <Response>
          <Message>${fallbackResponse}</Message>
        </Response>
      `);
    }

    // Save user message in chat history
    try {
      await saveChatMessage(senderNumber, "user", userMessage);
    } catch (error) {
      console.error("Error saving user message:", error.message);
    }

    // Check if the user is asking for events
    let eventQuery;
    try {
      eventQuery = await extractEventQuery(process.env.OPENAI_API_KEY, userMessage);
      console.log("Event query:", eventQuery);
    } catch (error) {
      console.error("Error extracting event query:", error.message);
    }

    if (eventQuery && eventQuery.wants_events) {
      try {
        // Check if preferences are complete before processing events
        if (!preferences.gender || !preferences.music_preferences.length || !preferences.budget || !preferences.vibe.length) {
          const fallbackResponse = "Please complete your preferences before requesting event recommendations.";
          await saveChatMessage(senderNumber, "assistant", fallbackResponse);
          return res.status(200).send(`
            <Response>
              <Message>${fallbackResponse}</Message>
            </Response>
          `);
        }

        // Fetch and process events
        const recommendedClubs = await getMatchingClubs(preferences);

        if (!Array.isArray(recommendedClubs) || recommendedClubs.length === 0) {
          throw new Error("No clubs found based on the preferences.");
        }

        const events = await getEventsForClubs(recommendedClubs, eventQuery.date);

        let responseMessage = "Here are the events for the requested date:\n\n";
        for (const event of events) {
          if (event.tickets_link) {
            responseMessage += `
${event.event_name || "Event"}
📍 ${event.venue_name || "Venue Unknown"}
📅 ${event.date || "N/A"}
⏰ Time: ${event.time || "N/A"}
🔞 Minimum Age: ${event.min_age || "N/A"}
🎟 Tickets: [Get Tickets](${event.tickets_link})\n\n`;
          } else {
            responseMessage += `${event.venue_name || "Unknown Club"} - No events on this day!\n\n`;
          }
        }

        // Save assistant's response and return it to the user
        await saveChatMessage(senderNumber, "assistant", responseMessage);
        return res.status(200).send(`
          <Response>
            <Message>${responseMessage}</Message>
          </Response>
        `);
      } catch (error) {
        console.error("Error processing event request:", error.message);
        const fallbackResponse = "I couldn't fetch events at the moment. Please try again later.";
        await saveChatMessage(senderNumber, "assistant", fallbackResponse);
        return res.status(500).send(`
          <Response>
            <Message>${fallbackResponse}</Message>
          </Response>
        `);
      }
    }

    // Handle "more clubs" request
    if (userMessage.toLowerCase().includes("more clubs")) {
      const responseMessage = await outputClubsInBatches(senderNumber, preferences);
      return res.status(200).send(`
        <Response>
          <Message>${responseMessage}</Message>
        </Response>
      `);
    }

    // Extract preferences from the current message
    let extractedPreferences;
    try {
      extractedPreferences = await extractPreferencesFromMessage(process.env.OPENAI_API_KEY, userMessage);
      console.log("Extracted preferences:", extractedPreferences);
    } catch (error) {
      console.error("Error extracting preferences:", error.message);
      const fallbackResponse = "I couldn't understand your preferences. Can you rephrase?";
      await saveChatMessage(senderNumber, "assistant", fallbackResponse);
      return res.status(500).send(`
        <Response>
          <Message>${fallbackResponse}</Message>
        </Response>
      `);
    }

    // Normalize budget (map numbers like 80 to predefined ranges)
    if (extractedPreferences.budget) {
      extractedPreferences.budget = mapBudgetToRange(extractedPreferences.budget);
    }

    // Validate and merge preferences with existing ones
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

    try {
      // Save the updated preferences back to the database
      await savePreferences(senderNumber, updatedPreferences);
      console.log("Updated preferences saved:", updatedPreferences);
    } catch (error) {
      console.error("Error saving preferences:", error.message);
    }

    // Identify truly missing preferences
    const missingFields = [];
    if (!updatedPreferences.gender) missingFields.push("gender");
    if (!updatedPreferences.music_preferences || updatedPreferences.music_preferences.length === 0) missingFields.push("music preferences (up to 3)");
    if (!updatedPreferences.budget) missingFields.push("budget");
    if (!updatedPreferences.vibe || updatedPreferences.vibe.length === 0) missingFields.push("vibe (up to 3)");

    // Handle dynamic responses based on updated preferences
    let responseMessage = "";

    // Acknowledge updates if something changed
    const changedFields = Object.keys(extractedPreferences).filter(
      (key) =>
        extractedPreferences[key] &&
        extractedPreferences[key] !== preferences[key]
    );

    if (changedFields.length > 0) {
      responseMessage += `Thanks! I've updated the following: ${changedFields
        .map((field) => `${field}: ${updatedPreferences[field]}`)
        .join(", ")}.\n\n`;
    }

    // Prompt for missing preferences
    if (missingFields.length > 0) {
      responseMessage += `It seems like some information is still missing: ${missingFields.join(", ")}. Please provide them.`;
      await saveChatMessage(senderNumber, "assistant", responseMessage);
      return res.status(200).send(`
        <Response>
          <Message>${responseMessage}</Message>
        </Response>
      `);
    }

    // If all preferences are collected, fetch matching clubs
    try {
      const clubs = getMatchingClubs(updatedPreferences);
      responseMessage = clubs.length
        ? await outputClubsInBatches(senderNumber, updatedPreferences)  // Only show the first 5 clubs
        : "Sorry, no matching clubs found.";
      responseMessage += `\nIf you would like real-time events for these clubs, say something like "Recommend me events for the 27th of December."`;

      // Save assistant's response in chat history and return it to the user
      await saveChatMessage(senderNumber, "assistant", responseMessage);

      res.status(200).send(`
        <Response>
          <Message>${responseMessage}</Message>
        </Response>
      `);
    } catch (error) {
      console.error("Error fetching clubs:", error.message);
      const fallbackResponse = "I couldn't fetch clubs at the moment. Please try again later.";
      await saveChatMessage(senderNumber, "assistant", fallbackResponse);
      return res.status(500).send(`
        <Response>
          <Message>${fallbackResponse}</Message>
        </Response>
      `);
    }
  } catch (error) {
    console.error("Critical error in webhook:", error.message);
    res.status(500).send(`
      <Response>
        <Message>Something went wrong. Please try again later.</Message>
      </Response>
    `);
  }
});
