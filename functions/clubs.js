const clubsData = require('./clubs.json');

function getMatchingClubs(preferences) {
  const matchingRule = clubsData.rules.find(rule => {
    const matchesMusic = preferences.music_preferences.some(pref =>
      rule.preferences.music_preferences.includes(pref)
    );
    const matchesBudget = rule.preferences.budget === preferences.budget;
    const matchesVibe = preferences.vibe.some(v => rule.preferences.vibe.includes(v));
    const matchesGender = rule.preferences.gender.includes(preferences.gender);

    return matchesMusic && matchesBudget && matchesVibe && matchesGender;
  });

  if (matchingRule) {
    return matchingRule.clubs.slice(0, 5); // Return top 5 clubs
  }

  return [];
}

module.exports = { getMatchingClubs };
