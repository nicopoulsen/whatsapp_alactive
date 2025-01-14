//process clubs with json

const clubsData = require('./clubs.json');
const supabase = require('./supabaseClient');  

// Function to fetch matching clubs based on preferences
function getMatchingClubs(preferences) {
    const matchingRule = clubsData.rules.find(rule => {
        const { music_preferences, budget, vibe, gender, match_mode } = rule.preferences;

        let matchesMusic = false;

        if (music_preferences.group_a && music_preferences.group_b && music_preferences.match_mode) {
            // Match at least one from group_a and one from group_b if match_mode is true -- this is given our rule-based logic
            const matchesGroupA = preferences.music_preferences.some(pref =>
                music_preferences.group_a.includes(pref)
            );
            const matchesGroupB = preferences.music_preferences.some(pref =>
                music_preferences.group_b.includes(pref)
            );
            matchesMusic = matchesGroupA && matchesGroupB;
        } else {
            // Match any preference in the list
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
        return matchingRule.clubs; 
    }

    return [];
}

async function getClubDetails(clubs) {
    // clubs is an array of strings, e.g. ["Maroto", "Maddox (Green Room)", ...]
    const { data, error } = await supabase
      .from('venues')
      .select(`
        name,
        municipality,
        postcode,
        address,
        description,
        cocktail_max_price
      `)
      .in('name', clubs);  // Single query for all clubs
  
    if (error) {
      console.error('Error fetching club details:', error.message);
      return [];
    }
  
    // data will be an array of rows that matched the "in('name', clubs)" filter
    const clubDetails = [];
    data.forEach(venue => {
      clubDetails.push({
        venue_name: venue.name,
        municipality: venue.municipality || 'N/A',
        postcode: venue.postcode || 'N/A',
        address: venue.address || 'N/A',
        description: venue.description || 'N/A',
        cocktail_max_price: venue.cocktail_max_price || 'N/A',
      });
    });
  
    return clubDetails;
  }
  


module.exports = { getMatchingClubs, getClubDetails };