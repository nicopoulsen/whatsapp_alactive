const clubsData = require('./clubs.json');

function getMatchingClubs(preferences) {
    const matchingRule = clubsData.rules.find(rule => {
        const { music_preferences, budget, vibe, gender, match_mode } = rule.preferences;

        let matchesMusic = false;

        if (music_preferences.group_a && music_preferences.group_b && music_preferences.match_mode) {
            // Match at least one from group_a and one from group_b if match_mode is true
            const matchesGroupA = preferences.music_preferences.some(pref =>
                music_preferences.group_a.includes(pref)
            );
            const matchesGroupB = preferences.music_preferences.some(pref =>
                music_preferences.group_b.includes(pref)
            );
            matchesMusic = matchesGroupA && matchesGroupB;
        } else {
            // Match any preference in the flat list
            matchesMusic = preferences.music_preferences.some(pref =>
                (music_preferences.group_a || []).concat(music_preferences.group_b || []).concat(music_preferences).includes(pref)
            );
        }

        const matchesBudget = budget === preferences.budget;
        const matchesVibe = preferences.vibe.some(v => vibe.includes(v));
        const matchesGender = gender.includes(preferences.gender);

        return matchesMusic && matchesBudget && matchesVibe && matchesGender;
    });

    if (matchingRule) {
        return matchingRule.clubs.slice(0, 5); // Return top 5 clubs
    }

    return [];
}

module.exports = { getMatchingClubs };
