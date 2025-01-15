//File for club handling and formatting
//not currently using btw (can adjust back into processor when logic is good for showcase)

const { getMatchingClubs, getClubDetails } = require('../clubs');

async function handleClubRecommendations(senderNumber, preferences) {
  const clubs = getMatchingClubs(preferences);

  if (!clubs || clubs.length === 0) {
    return "Sorry, no matching clubs found.";
  }

  const clubBatch = clubs.slice(0, 5); // Return first 5 clubs
  const clubDetails = await getClubDetails(clubBatch);

  let responseMessage = "Here are some clubs you might like:\n\n";
  clubDetails.forEach(club => {
    responseMessage += `
      ${club.venue_name}
      📍 Location: ${club.municipality || "N/A"}
      🏷️ Address: ${club.address || "N/A"}
      📮 Postcode: ${club.postcode || "N/A"}
      🍸 Cocktail Max Price: ${club.cocktail_max_price || "N/A"}
      📝 Description: ${club.description || "N/A"}\n\n`;
  });

  return responseMessage;
}

module.exports = { handleClubRecommendations };
