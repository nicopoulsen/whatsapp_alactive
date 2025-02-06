const { getPreferences, savePreferences } = require("../../services/firebase");
const { sendWhatsAppMessage } = require("../../services/metaApi");
const { initChatModel } = require("langchain/chat_models/universal");

async function profileContextNode({ senderNumber, userMessage }) {
  try {
    let userPreferences = await getPreferences(senderNumber) || {};

    const chat = await initChatModel("gpt-3.5-turbo", {
      modelProvider: "openai",
      openAIApiKey: process.env.OPENAI_API_KEY,
      temperature: 0.5,
    });

    const response = await chat.invoke([
      {
        role: "user",
        content: `
          Extract the following from the user's message: "${userMessage}"
          - Location (e.g., "London", "Shoreditch", "Mayfair")
          - Date (in dd/mm/yyyy format if mentioned, otherwise assume today)
          
          Return "location" and "date" as values or null if missing.
          Example Output:
          {
            "location": "Shoreditch",
            "date": "12/02/2025"
          }
        `,
      },
    ]);

    let extractedData;
    try {
      extractedData = JSON.parse(response.content.trim());
    } catch (parseError) {
      await sendWhatsAppMessage(senderNumber, "Sorry, I couldn't understand your request. Can you try again?");
      return { next: "profileContext" };
    }

    userPreferences = { ...userPreferences, ...extractedData };
    await savePreferences(senderNumber, userPreferences);

    const missingDetails = [];
    if (!userPreferences.location) missingDetails.push("location (area)");
    if (!userPreferences.date) missingDetails.push("date");

    if (missingDetails.length > 0) {
      const missingPrompt = `Seems exciting! Any preferences on the ${missingDetails.join(" and ")}? 📅📍`;
      await sendWhatsAppMessage(senderNumber, missingPrompt);
      return { next: "profileContext" };
    }

    const preferenceMessage = `
Alright, let’s customize your perfect night out! 🕺💃 Answer these quick-fire questions, and I’ll find the best spot for you! 🚀

What’s your type of place for a night out? 🤔
1️⃣ Cocktail Bar🥂  
2️⃣ Party/Club vibe Bar 🎉  
3️⃣ Lounge Bar 🪞  
4️⃣ Sports Bar ⚽  
5️⃣ High End ✨  
6️⃣ Rooftop with Views 🌇  
7️⃣ Underground/Speakeasy🍸  
8️⃣ Elegant 🏛️  
9️⃣ Instagrammable/Trendy 📸  
🔟 Shisha/Hookah Bar 💨  
👉 You can pick up to 3 options.
    `;

    await sendWhatsAppMessage(senderNumber, preferenceMessage);

    return { next: "profileContext" };
  } catch (error) {
    await sendWhatsAppMessage(senderNumber, "Oops! Something went wrong. Try again later.");
    return { next: "profileContext" };
  }
}

module.exports = { profileContextNode };
