//get meta details

const axios = require('axios');
require('dotenv').config();

async function sendWhatsAppMessage(senderNumber, message) {
  try {
    const url = `https://graph.facebook.com/v16.0/${process.env.META_PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: senderNumber,
      text: { body: message },
    };

    const headers = {
      Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    };

    const response = await axios.post(url, payload, { headers });
    console.log("Message sent successfully:", response.data);
  } catch (error) {
    console.error("Error sending WhatsApp message:", error.response?.data || error.message);
  }
}

module.exports = { sendWhatsAppMessage };
