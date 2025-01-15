const { getChatHistory, saveChatMessage, getPreferences, savePreferences } = require('./firebase');
const { extractPreferencesFromMessage, mapBudgetToRange} = require('./gpt');
const { handleEventQuery } = require('./handlers/eventHandler');
const { sendWhatsAppMessage } = require('./metaApi');
const { extractEventQuery } = require('./events');
const { getMatchingClubs, getClubDetails } = require('./clubs');
const { initChatModel } = require("langchain/chat_models/universal");
const firstInteractionMessage = require("./firstMessage"); // <-- new import

// Store user club index for batching
let userClubIndexes = {};

async function processAndSendResponse(senderNumber, userMessage) {
  console.log(`[DEBUG] processAndSendResponse triggered for user: ${senderNumber}, message: "${userMessage}"`);

  try {
    const chatHistory = await getChatHistory(senderNumber) || {};
    console.log("[DEBUG] Retrieved chat history:", chatHistory);

    if (Object.keys(chatHistory).length === 0) {
      console.log("[DEBUG] This is the user's first interaction; sending initial message...");

      await saveChatMessage(senderNumber, "user", userMessage);

      await sendWhatsAppMessage(senderNumber, firstInteractionMessage);
      console.log("[DEBUG] Sent first interaction message to user.");

      await saveChatMessage(senderNumber, "assistant", firstInteractionMessage);

    
      return;
    }
    const preferences = await getPreferences(senderNumber) || {};
    console.log("[DEBUG] Retrieved user preferences:", preferences);

    await saveChatMessage(senderNumber, "user", userMessage);
    console.log(`[DEBUG] Saved user message: "${userMessage}"`);

    // Step 1: Extract preferences from the message
    let extractedPreferences;
    try {
      console.log("[DEBUG] Extracting preferences from message...");
      extractedPreferences = await extractPreferencesFromMessage(process.env.OPENAI_API_KEY, userMessage);
      console.log("[DEBUG] Extracted preferences:", extractedPreferences);
    } catch (error) {
      console.error("[ERROR] Failed to extract preferences:", error.message);

      const fallbackResponse = "I couldn't understand your preferences. Can you rephrase?";
      await saveChatMessage(senderNumber, "assistant", fallbackResponse);
      console.log("[DEBUG] Saved fallback response to chat history.");

      await sendWhatsAppMessage(senderNumber, fallbackResponse);
      console.log("[DEBUG] Sent fallback response to user.");
      return;
    }

    // Normalize budget if present
    if (extractedPreferences.budget) {
      console.log("[DEBUG] Mapping user budget to range:", extractedPreferences.budget);
      extractedPreferences.budget = mapBudgetToRange(extractedPreferences.budget);
      console.log("[DEBUG] Budget after mapping:", extractedPreferences.budget);
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
    console.log("[DEBUG] Updated preferences to save:", updatedPreferences);

    // Save updated preferences
    try {
      await savePreferences(senderNumber, updatedPreferences);
      console.log("[DEBUG] Saved updated preferences:", updatedPreferences);
    } catch (error) {
      console.error("[ERROR] Failed to save updated preferences:", error.message);
    }

    // Step 3: Check for missing preferences
    const missingFields = [];
    if (!updatedPreferences.gender) missingFields.push("gender");
    if (!updatedPreferences.music_preferences || updatedPreferences.music_preferences.length === 0)
      missingFields.push("music preferences (up to 3)");
    if (!updatedPreferences.budget) missingFields.push("budget");
    if (!updatedPreferences.vibe || updatedPreferences.vibe.length === 0) missingFields.push("vibe (up to 3)");

    if (missingFields.length > 0) {
      const promptMessage = `It seems like some information is still missing: ${missingFields.join(", ")}. Please provide them.`;
      console.log("[DEBUG] Missing preferences detected:", missingFields);

      await saveChatMessage(senderNumber, "assistant", promptMessage);
      console.log("[DEBUG] Saved missing-fields prompt to chat history.");

      await sendWhatsAppMessage(senderNumber, promptMessage);
      console.log("[DEBUG] Sent missing-fields prompt to user.");
      return;
    }

    // =========================
    // Step 4: Handle "more clubs" request
    // =========================
    if (userMessage.toLowerCase().includes("more clubs")) {
      console.log("[DEBUG] Handling 'more clubs' request...");

      const currentClubIndex = userClubIndexes[senderNumber] || 0;
      console.log("[DEBUG] Current user club index:", currentClubIndex);

      const clubs = getMatchingClubs(updatedPreferences);
      console.log("[DEBUG] Full list of matching clubs:", clubs);

      const clubBatch = clubs.slice(currentClubIndex, currentClubIndex + 5);
      console.log("[DEBUG] Next 5 clubs to show:", clubBatch);

      const clubDetails = await getClubDetails(clubBatch);
      console.log("[DEBUG] Retrieved club details:", clubDetails);

      let responseMessage = "Here are some clubs for you:\n\n";
      if (clubDetails.length > 0) {
        clubDetails.forEach((club) => {
          responseMessage += `${club.venue_name}\n📍 Location: ${club.municipality}\n🍸 Max Price: £${club.cocktail_max_price}\n\n`;
        });
      } else {
        responseMessage = "Sorry, no matching clubs found.";
      }

      userClubIndexes[senderNumber] = currentClubIndex + 5;
      console.log("[DEBUG] Updated user club index to:", userClubIndexes[senderNumber]);

      if (userClubIndexes[senderNumber] < clubs.length) {
        responseMessage += "\nWant more clubs? Just say 'more clubs'!";
      }

      await sendWhatsAppMessage(senderNumber, responseMessage);
      console.log("[DEBUG] Sent 'more clubs' batch to user.");
      return;
    }

    // =========================
    // Step 5: Output clubs if preferences are complete
    // =========================
    const userIndexExists = typeof userClubIndexes[senderNumber] !== 'undefined';
    if (!userIndexExists) {
      console.log("[DEBUG] User has not seen clubs yet, showing initial list...");

      const clubs = getMatchingClubs(updatedPreferences);
      console.log("[DEBUG] Full list of matching clubs:", clubs);

      const clubBatch = clubs.slice(0, 5);
      console.log("[DEBUG] First 5 clubs to show:", clubBatch);

      const clubDetails = await getClubDetails(clubBatch);
      console.log("[DEBUG] Retrieve club details:", clubDetails);

      let responseMessage = "Here are some clubs for you:\n\n";
      if (clubDetails.length > 0) {
        clubDetails.forEach((club) => {
          responseMessage += `
${club.venue_name}  
📍 Location: ${club.municipality}  
🏷️ Address: ${club.address}  
📮 Postcode: ${club.postcode}  
🍸 Cocktail Max Price: ${club.cocktail_max_price}  
📱 Instagram Link: ${club.instagram_link}
📝 Description: ${club.description || "N/A"}\n\n`;
        });
        responseMessage += "\nWant more clubs? Just say 'more clubs'! You can also ask for event recommendations.";
      } else {
        responseMessage = "Sorry, no matching clubs found.";
      }

      userClubIndexes[senderNumber] = 5; // So that "more clubs" starts at index 5
      console.log("[DEBUG] Initialized user club index to 5.");

      await sendWhatsAppMessage(senderNumber, responseMessage);
      console.log("[DEBUG] Sent initial clubs list to user.");
      return;
    }

    // Step 6: Handle event queries
    console.log("[DEBUG] Checking for event query...");
    const eventQuery = await extractEventQuery(process.env.OPENAI_API_KEY, userMessage);
    console.log("[DEBUG] Event query result:", eventQuery);

    if (eventQuery && eventQuery.wants_events) {
      console.log("[DEBUG] Detected event request. Invoking handleEventQuery...");

      const responseMessage = await handleEventQuery(senderNumber, eventQuery, updatedPreferences);
      console.log("[DEBUG] handleEventQuery returned:", responseMessage);

      await sendWhatsAppMessage(senderNumber, responseMessage);
      console.log("[DEBUG] Sent event query response to user.");
      return;
    }

    // 6b) wants_more_info -> Let GPT rely on its own knowledge (no DB context)
    if (eventQuery.wants_more_info) {
      console.log("[DEBUG] Detected user wants more club info (GPT knowledge).");

      const chat = await initChatModel("gpt-3.5-turbo", {
        modelProvider: "openai",
        openAIApiKey: process.env.OPENAI_API_KEY,
        temperature: 0.7,
      });

      const systemPrompt = `
You are an expert on London's nightlife scene. 
If the user wants dress code, min age, table pricing, etc for a specific London club, 
answer from your general knowledge. Also at the end be like " Please refer to the club descriptions above" If you are unsure, politely say so.
If user asks about something else, answer briefly and steer them back to clubs/events.
`;

      const gptResponse = await chat.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ]);

      const moreInfoResponse = gptResponse.content.trim();

      await saveChatMessage(senderNumber, "assistant", moreInfoResponse);
      await sendWhatsAppMessage(senderNumber, moreInfoResponse);
      console.log("[DEBUG] Sent GPT-based 'more info' response (no DB).");
      return;
    }

    if (eventQuery.general_chat) {
      console.log("[DEBUG] Detected general chat. Generating GPT frienldy response...");

      const chat = await initChatModel("gpt-3.5-turbo", {
        modelProvider: "openai",
        openAIApiKey: process.env.OPENAI_API_KEY,
        temperature: 0.7,
      });

      const systemPrompt = `
You are a friendly chatbot that specializes in London nightlife. 
If the user is making small talk, respond politely in 1-2 sentences.
Then gently steer them back to the main usage: 
1. Ask for more clubs
2. Ask for event reccomendations (on a specific day)
3. Reset your preferences to start over
`;

      const gptGeneralResponse = await chat.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ]);

      const generalChatResponse = gptGeneralResponse.content.trim();

      await saveChatMessage(senderNumber, "assistant", generalChatResponse);
      await sendWhatsAppMessage(senderNumber, generalChatResponse);
      console.log("[DEBUG] Sent general chat GPT response.");
      return;
    }

    console.log("[DEBUG] No more actions required, finishing processAndSendResponse...");
  } catch (error) {
    console.error("[ERROR] Error in processAndSendResponse:", error.message);
    await sendWhatsAppMessage(senderNumber, "An error occurred. Please try again later.");
    console.log("[DEBUG] Sent error fallback message to user.");
  }
}

module.exports = { processAndSendResponse };
