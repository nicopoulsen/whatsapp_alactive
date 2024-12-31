// events.js

const supabase = require('./supabaseClient');
const { initChatModel } = require("langchain/chat_models/universal");

// Extract event query from user input
async function extractEventQuery(apiKey, userMessage) {
  const chat = await initChatModel("gpt-3.5-turbo", {
    modelProvider: "openai",
    openAIApiKey: apiKey,
    temperature: 0.5,
  });

  try {
    const response = await chat.invoke([
      {
        role: "user",
        content: `
          Analyze the following message: "${userMessage}".
          1. Does the user want event recommendations? Answer "yes" or "no".
          2. If yes, extract the requested date. If no date is provided, leave it empty.
          Return this as JSON:
          {
            "wants_events": true/false,
            "date": "YYYY-MM-DD"
          }`,
      },
    ]);

    const responseContent = response.content.trim();
    if (responseContent.startsWith("{") && responseContent.endsWith("}")) {
      return JSON.parse(responseContent);
    } else {
      console.error("Invalid GPT response format");
      return { wants_events: false, date: "" };
    }
  } catch (error) {
    console.error("Error extracting event query:", error.message);
    return { wants_events: false, date: "" };
  }
}

// Get events for a list of clubs and a specific date
async function getEventsForClubs(clubs, date) {
  const events = [];

  for (const club of clubs) {
    const { data, error } = await supabase
      .from('events')
      .select('tickets_link, date')
      .eq('venue_name', club)
      .eq('date', date);

    if (error) {
      console.error(`Error fetching events for ${club}:`, error.message);
      events.push({ club, tickets_link: null, date: null });
      continue;
    }

    if (data && data.length > 0) {
      events.push({ club, tickets_link: data[0].tickets_link, date: data[0].date });
    } else {
      events.push({ club, tickets_link: null, date: null }); // No events found
    }
  }

  return events;
}

module.exports = { extractEventQuery, getEventsForClubs };
