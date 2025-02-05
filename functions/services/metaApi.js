const axios = require('axios');
require('dotenv').config();

async function sendWhatsAppMessage(senderNumber, message) {
  // Validate required environment variables
  if (!process.env.META_PHONE_NUMBER_ID || !process.env.META_ACCESS_TOKEN) {
    console.error("Missing environment variables: META_PHONE_NUMBER_ID or META_ACCESS_TOKEN");
    return;
  }

  try {
    const url = `https://graph.facebook.com/v16.0/${process.env.META_PHONE_NUMBER_ID}/messages`;

    // Payload for WhatsApp API
    const payload = {
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: { body: message },
    };

    const headers = {
      Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    };

    // Make POST request
    const response = await axios.post(url, payload, { headers });
    console.log("Message sent successfully:", response.data);

    return response.data; // Return response data if needed
  } catch (error) {
    // Log detailed error
    if (error.response) {
      console.error("Error response:", error.response.data);
    } else {
      console.error("Error:", error.message);
    }
  }
}

module.exports = { sendWhatsAppMessage };
