const { sendWhatsAppMessage } = require("../../services/metaApi");

async function welcomeNode(senderNumber) {
  const welcomeMessage = `
Hello, I’m Viky, nice to meet you! 🤖✨
I’m an AI Bot that can help you discover & book **nightclubs, events, and bars** based on your tastes all in one chat! 💃🕺 

Let’s get started! 🚀

What’s your gender? 👇
1️⃣ Woman 💃  
2️⃣ Man 🕺  
3️⃣ Other 🪩  

What do you need help with? ✨
1️⃣ Nightclubs 🪩  
2️⃣ Bar 🍸
  `;

  try {
    await sendWhatsAppMessage(senderNumber, welcomeMessage);
    console.log("Welcome message sent successfully!");
  } catch (error) {
    console.error("Failed to send welcome message:", error.message);
    throw error;
  }
}

module.exports = { welcomeNode };
