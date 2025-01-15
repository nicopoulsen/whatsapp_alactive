// event formatting and handling

const { getMatchingClubs } = require('../clubs');
const { getEventsForClubs } = require('../events');

async function handleEventQuery(senderNumber, eventQuery, preferences) {
  if (!preferences.gender || !preferences.music_preferences.length || !preferences.budget || !preferences.vibe.length) {
    return "I couldn't fetch events without your preferences. Please provide them.";
  }

  const recommendedClubs = getMatchingClubs(preferences);
  if (!recommendedClubs || recommendedClubs.length === 0) {
    return "No clubs match your preferences.";
  }

  let events = await getEventsForClubs(recommendedClubs, eventQuery.date);
  if (events.length < 5) {
    for (let i = 1; i <= 7; i++) {
      const nextDate = new Date(eventQuery.date);
      nextDate.setDate(nextDate.getDate() + i);
      const nextDayEvents = await getEventsForClubs(recommendedClubs, nextDate.toISOString().split('T')[0]);
      events = events.concat(nextDayEvents);
      if (events.length >= 5) break;
    }
  }

  if (!events || events.length === 0) {
    return "No events found for your requested date or the next 7 days.";
  }

  let responseMessage = `Here are some events for ${eventQuery.date}:\n\n`;
  events.forEach(event => {
    responseMessage += `
    🎉 **${event.event_name || "Event"}**  
    📍 **Venue**: ${event.venue_name || "Venue Unknown"}  
    📅 **Date**: ${event.date || "N/A"}  
    ⏰ **Time**: ${event.time || "N/A"}  
    🔞 **Minimum Age**: ${event.min_age || "N/A"}  
    🎟 **Tickets**: [Get Tickets Here](${event.tickets_link || "N/A"})  
    👔 **Gentleman Guest List**: £${event.guest_list_min_price_gentlemen || "N/A"} - £${event.guest_list_max_price_gentlemen || "N/A"}  
    👗 **Ladies Guest List**: £${event.guest_list_min_price_ladies || "N/A"} - £${event.guest_list_max_price_ladies || "N/A"}  
    🍾 **Current Lowest Table Price**: £${event.tables_min_price || "N/A"}\n\n`;
          });

  return responseMessage;
}

module.exports = { handleEventQuery };
