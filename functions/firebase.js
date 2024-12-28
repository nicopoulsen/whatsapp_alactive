const admin = require('firebase-admin');

// Check if Firebase is already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: "https://whatsapp-alactive-default-rtdb.europe-west1.firebasedatabase.app/" 
  });
}

const db = admin.database();

// Function to save chat messages
async function saveChatMessage(phoneNumber, role, content) {
  const messageRef = db.ref(`users/${phoneNumber}/chat_history`);
  const newMessageRef = messageRef.push();
  const timestamp = new Date().toISOString();

  await newMessageRef.set({
    role,
    content,
    timestamp,
  });
}

// Function to retrieve chat history
async function getChatHistory(phoneNumber) {
  const chatRef = db.ref(`users/${phoneNumber}/chat_history`);
  const snapshot = await chatRef.once('value');
  return snapshot.val();
}

// Function to save user preferences
async function savePreferences(phoneNumber, preferences) {
  await db.ref(`users/${phoneNumber}/preferences`).set(preferences);
}

// Function to retrieve user preferences
async function getPreferences(phoneNumber) {
  const prefRef = db.ref(`users/${phoneNumber}/preferences`);
  const snapshot = await prefRef.once('value');
  return snapshot.val();
}

module.exports = { saveChatMessage, getChatHistory, savePreferences, getPreferences };
