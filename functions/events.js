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
      .select(`
        venue_name,
        name,
        date,
        tickets_link,
        min_age,
        starting_time,
        closing_time
      `)
      .eq('venue_name', club)
      .eq('date', date);

    if (error) {
      console.error(`Error fetching events for ${club}:`, error.message);
      events.push({ venue_name: club, tickets_link: null }); // Add error-handling fallback
      continue;
    }

    // Check if there are events with non-null `tickets_link`
    const validEvents = data.filter((event) => event.tickets_link !== null);

    if (validEvents.length > 0) {
      validEvents.forEach((event) => {
        events.push({
          venue_name: event.venue_name || club, // Fallback to the club name from the input list
          event_name: event.name || "N/A",
          date: event.date || "N/A",
          tickets_link: event.tickets_link,
          min_age: event.min_age || "N/A",
          time: `${event.starting_time || "N/A"} - ${event.closing_time || "N/A"}`,
        });
      });
    } else {
      // If no valid events with `tickets_link`, mark as "No events on this day!"
      events.push({ venue_name: club, tickets_link: null });
    }
  }

  return events;
}

module.exports = { extractEventQuery, getEventsForClubs };
