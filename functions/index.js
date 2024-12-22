const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

admin.initializeApp();

const clubsData = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'clubs.json'), 'utf8')
);

exports.whatsappWebhook = functions.https.onRequest((req, res) => {
    console.log('Received WhatsApp message:', req.body); 

    const messageBody = req.body.Body ? req.body.Body.toLowerCase() : ""; 
    const senderNumber = req.body.From; 

    console.log(`Message from ${senderNumber}: ${messageBody}`);

    if (messageBody.includes("suggest me nightclubs")) {
        // Example user preferences (for now hardcoded, later fto be dynamic)
        const userPreferences = {
            music_preferences: ["commercial", "house", "techno"], // Adjust based on actual messages
            budget: "£60-100+",
            vibe: "high-end",
            gender: "man"
        };

        // Match preferences with clubs.json rules
        const matchingRule = clubsData.rules.find(rule => {
            const matchesMusic = userPreferences.music_preferences.some(pref =>
                rule.preferences.music_preferences.map(p => p.toLowerCase()).includes(pref)
            );
            const matchesBudget = rule.preferences.budget === userPreferences.budget;
            const matchesVibe = rule.preferences.vibe.map(v => v.toLowerCase()).includes(userPreferences.vibe);
            const matchesGender = rule.preferences.gender.map(g => g.toLowerCase()).includes(userPreferences.gender);

            return matchesMusic && matchesBudget && matchesVibe && matchesGender;
        });

        if (matchingRule) {
            const topClubs = matchingRule.clubs.slice(0, 5); // Get top 5 clubs
            let responseMessage = `Here are some club recommendations for you:\n\n`;
            topClubs.forEach((club, index) => {
                responseMessage += `${index + 1}. *${club}*\n`;
            });
            responseMessage += `\nType "more clubs" if you'd like more suggestions.`;

            console.log(`Responding with: ${responseMessage}`);
            return res.status(200).send(`<Response><Message>${responseMessage}</Message></Response>`);
        } else {
            const responseMessage = "No matching clubs found for your preferences.";
            console.log(`Responding with: ${responseMessage}`);
            return res.status(200).send(`<Response><Message>${responseMessage}</Message></Response>`);
        }
    } else if (messageBody.includes("more clubs")) {
        const responseMessage = "Feature under development. Please stay tuned!";
        console.log(`Responding with: ${responseMessage}`);
        res.status(200).send(`<Response><Message>${responseMessage}</Message></Response>`);
    } else {
        const responseMessage = 
            "Hello! I will help you discover the best nightclubs & events based on your tastes with the lowest real-time offers! 🔥\n\n" +
            "To get started, type: Suggest me nightclubs.";
        console.log(`Responding with: ${responseMessage}`);
        res.status(200).send(`<Response><Message>${responseMessage}</Message></Response>`);
    }
});
