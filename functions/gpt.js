const { initChatModel } = require('langchain/chat_models/universal');

async function processMessageWithGPT(apiKey, chatHistory, userMessage) {
  const chat = await initChatModel("gpt-3.5-turbo", {
    modelProvider: "openai",
    openAIApiKey: apiKey,
    temperature: 0.7,
  });

  const formattedHistory = chatHistory.map(message => ({
    role: message.sender === "user" ? "user" : "assistant",
    content: message.content
  }));

  const gptResponse = await chat.invoke([
    ...formattedHistory,
    { role: "user", content: userMessage }
  ]);

  return gptResponse.content || "I'm sorry, I couldn't process your request.";
}

async function extractPreferencesFromMessage(apiKey, userMessage) {
  const chat = await initChatModel("gpt-3.5-turbo", {
    modelProvider: "openai",
    openAIApiKey: apiKey,
    temperature: 0.5,
  });

  const response = await chat.invoke([
    {
      role: "user",
      content: `
        Extract preferences from this message: "${userMessage}"
        Return a JSON object in the format:
        {
          "gender": "",
          "music_preferences": [],
          "budget": "",
          "vibe": []
        }
      `
    }
  ]);

  return JSON.parse(response.content);
}

module.exports = { processMessageWithGPT, extractPreferencesFromMessage };
