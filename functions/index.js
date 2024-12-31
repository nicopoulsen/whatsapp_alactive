const functions = require('firebase-functions');
const { saveChatMessage, getChatHistory, savePreferences, getPreferences } = require('./firebase');
const { extractPreferencesFromMessage, mapBudgetToRange } = require('./gpt');
const { getMatchingClubs } = require('./clubs');
const { extractEventQuery, getEventsForClubs } = require('./events'); // Added event-related functions
require('dotenv').config();

exports.whatsappWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const userMessage = req.body.Body.trim();
    const senderNumber = req.body.From;

    // Retrieve chat history and existing preferences
    let chatHistory = await getChatHistory(senderNumber) || [];
    let preferences = await getPreferences(senderNumber) || {}; // Ensure existing preferences are loaded

    // Save user message in chat history
    await saveChatMessage(senderNumber, "user", userMessage);

    // Check if the user is asking for events
    const eventQuery = await extractEventQuery(process.env.OPENAI_API_KEY, userMessage);

    if (eventQuery.wants_events) {
      // If the user wants events, get matching clubs and their events
      const recommendedClubs = await getMatchingClubs(preferences); // Use preferences for recommended clubs
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
          responseMessage += `${event.club || "Unknown Club"} - No events on this day!\n\n`;
        }
      }

      // Save assistant's response and return it to the user
      await saveChatMessage(senderNumber, "assistant", responseMessage);
      return res.status(200).send(`
        <Response>
          <Message>${responseMessage}</Message>
        </Response>
      `);
    }

    // Extract preferences from the current message
    const extractedPreferences = await extractPreferencesFromMessage(process.env.OPENAI_API_KEY, userMessage);

    // Normalize budget (map numbers like 80 to predefined ranges)
    if (extractedPreferences.budget) {
      extractedPreferences.budget = mapBudgetToRange(extractedPreferences.budget);
    }

    // Validate and merge preferences with existing ones
    const updatedPreferences = {
      gender: extractedPreferences.gender || preferences.gender || "", // Preserve valid gender
      music_preferences: extractedPreferences.music_preferences.length > 0
        ? extractedPreferences.music_preferences
        : preferences.music_preferences || [], // Preserve valid music preferences
      budget: extractedPreferences.budget || preferences.budget || "", // Preserve valid budget
      vibe: extractedPreferences.vibe.length > 0
        ? extractedPreferences.vibe
        : preferences.vibe || [], // Preserve valid vibe
    };

    // Save the updated preferences back to the database
    await savePreferences(senderNumber, updatedPreferences);

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
        extractedPreferences[key] && // Ensure the value is not empty
        extractedPreferences[key] !== preferences[key] // Check if the value has actually changed
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
    const clubs = getMatchingClubs(updatedPreferences);
    responseMessage = clubs.length
      ? `Here are some clubs for you: ${clubs.join(", ")}`
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
    console.error("Error:", error.message);
    res.status(500).send(`
      <Response>
        <Message>Something went wrong. Please try again later.</Message>
      </Response>
    `);
  }
});
