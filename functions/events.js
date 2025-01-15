const supabase = require('./supabaseClient');
const { initChatModel } = require("langchain/chat_models/universal");

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
          You are a classification model. 
          Analyze the following message: "${userMessage}"

          1. Does the user literally request "events"? 
             (The user must literally mention "events" or "recommend events" or "suggest events" 
              to be considered "wants_events: true".) 
             If yes, try to extract a requested date (YYYY-MM-DD). If no date is provided, leave it empty.

          2. Does the user want more information about a specific club in london -- things like:  (like dress code, min age, location, table pricing, etc.)?
          so like "whats the dress code at Koko?" would be true: 
             Mark that as "wants_more_info: true" if so, otherwise false.

          3. if neither events nor more info about clubs, assume it's general chat. 
             mark "general_chat" as true in that case, false otherwise.

          Return your answer in strict JSON with these fields only:
          {
            "wants_events": boolean,
            "date": "YYYY-MM-DD" or "",
            "wants_more_info": boolean,
            "general_chat": boolean
          }
        `,
      },
    ]);

    const responseContent = response.content.trim();
    if (responseContent.startsWith("{") && responseContent.endsWith("}")) {
      return JSON.parse(responseContent);
    } else {
      console.error("Invalid GPT response format.");
      return {
        wants_events: false,
        date: "",
        wants_more_info: false,
        general_chat: true,
      };
    }
  } catch (error) {
    console.error("Error extracting event query:", error.message);
    return {
      wants_events: false,
      date: "",
      wants_more_info: false,
      general_chat: true,
    };
  }
}

// Get events for a list of clubs and a specific date
async function getEventsForClubs(clubs, date) {
  try {
    // Single query for all clubs in one go
    const { data, error } = await supabase
      .from('events')
      .select(`
        venue_name,
        name,
        date,
        tickets_link,
        min_age,
        starting_time,
        closing_time,
        guest_list_min_price_gentlemen,
        guest_list_max_price_gentlemen,
        guest_list_min_price_ladies,
        guest_list_max_price_ladies,
        tables_min_price
      `)
      .in('venue_name', clubs) // Single query for all clubs
      .eq('date', date);

    if (error) {
      console.error("Error fetching events for clubs:", error.message);
      return [];
    }

    // Filter out events that lack a tickets_link
    const validEvents = data.filter((event) => event.tickets_link !== null);

    // Map each event to the desired shape
    return validEvents.map((event) => ({
      venue_name: event.venue_name || "N/A",
      event_name: event.name || "N/A",
      date: event.date || "N/A",
      tickets_link: event.tickets_link,
      min_age: event.min_age || "N/A",
      time: `${event.starting_time || "N/A"} - ${event.closing_time || "N/A"}`,
      guest_list_min_price_gentlemen: event.guest_list_min_price_gentlemen || "N/A",
      guest_list_max_price_gentlemen: event.guest_list_max_price_gentlemen || "N/A",
      guest_list_min_price_ladies: event.guest_list_min_price_ladies || "N/A",
      guest_list_max_price_ladies: event.guest_list_max_price_ladies || "N/A",
      tables_min_price: event.tables_min_price || "N/A"
    }));
  } catch (e) {
    console.error("Unexpected error fetching events:", e.message);
    return [];
  }
}

module.exports = { extractEventQuery, getEventsForClubs };
