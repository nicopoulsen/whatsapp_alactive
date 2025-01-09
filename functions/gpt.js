//gpt processing and querying

const { initChatModel } = require("langchain/chat_models/universal");

async function processMessageWithGPT(apiKey, chatHistory, userMessage) {
  const chat = await initChatModel("gpt-3.5-turbo", {
    modelProvider: "openai",
    openAIApiKey: apiKey,
    temperature: 0.8,
  });

  const formattedHistory = chatHistory.map((message) => ({
    role: message.sender === "user" ? "user" : "assistant",
    content: message.content,
  }));

  try {
    const gptResponse = await chat.invoke([
      ...formattedHistory,
      { role: "user", content: userMessage },
    ]);

    return gptResponse.content || "Sorry, I couldn't understand your request. Could you rephrase it?";
  } catch (error) {
    console.error("Error processing message with GPT:", error.message);
    return "An error occurred while processing your request. Please try again.";
  }
}

async function extractPreferencesFromMessage(apiKey, userMessage) {
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
          Extract preferences from this message: "${userMessage}".
          Match the preferences to the following predefined options:
          - Gender: [Man, Woman, Other]
          - Music Preferences: [House, Deep House / Afro House, Commercial, Hip-Hop / Rap, Reggaeton, Tech House, Techno, EDM, Big Room, 80s, Bass Music]
          - Price Range: [Up to £30, £30-60, £60-100, £100+]. If the message includes a number (e.g., "80 bucks", "80 dollars"), normalize the number and map it to one of the predefined ranges as follows:
            - Up to 30 → "Up to £30"
            - Between 31 and 60 → "£30-60"
            - Between 61 and 100 → "£60-100"
            - Greater than 100 → "£100+"
          - Vibe: [High-end, Exclusive, Doesn't matter, Rave]

          But the preferences must match so if someone says like "afro" you must put it into lets say afro house, and let say someone says luxury for vibes, then choose high or exclusive (these type of situations )
          make sure for vibes it must not confuse it and update music simultaneously - 
           also dont update vibes without being very sure -- sometimes u tend to update vibe for no reason when user is just specifying music- the vibe will be very clear based on user specification
           

          Return a JSON object like:
          {
            "gender": "Man",
            "music_preferences": ["House"],
            "budget": "£60-100",
            "vibe": ["High-end"]
          }

          If any field is missing, leave it empty or as an empty array.
        `,
      },
    ]);


    const responseContent = response.content.trim();

    if (responseContent.startsWith("{") && responseContent.endsWith("}")) {
      return JSON.parse(responseContent);
    } else {
      console.error("Invalid GPT response format");
      return {
        gender: "",
        music_preferences: [],
        budget: "",
        vibe: [],
      };
    }
  } catch (error) {
    console.error("Error extracting preferences from message:", error.message);
    return {
      gender: "",
      music_preferences: [],
      budget: "",
      vibe: [],
    };
  }
}

function mapBudgetToRange(budgetInput) {
  
    const rangeMatch = budgetInput.match(/(\d+)-(\d+)/); 
    if (rangeMatch) {
      const lowerBound = parseInt(rangeMatch[1], 10);
      const upperBound = parseInt(rangeMatch[2], 10);
  
      if (upperBound <= 30) return "Up to £30";
      if (upperBound > 30 && upperBound <= 60) return "£30-60";
      if (upperBound > 60 && upperBound <= 100) return "£60-100";
      if (upperBound > 100) return "£100+";
    }
  
    // Handlng single values like "80" or "80 bucks"
    const singleValue = parseFloat(budgetInput.replace(/[^0-9.]/g, ""));
    console.log("Parsed Single Value:", singleValue); // Debugging
  
    if (!isNaN(singleValue)) {
      if (singleValue <= 30) return "Up to £30";
      if (singleValue > 30 && singleValue <= 60) return "£30-60";
      if (singleValue > 60 && singleValue <= 100) return "£60-100";
      if (singleValue > 100) return "£100+";
    }
  
    // Default case: invalid input
    return ""; 
  }
  

module.exports = { processMessageWithGPT, extractPreferencesFromMessage, mapBudgetToRange };
