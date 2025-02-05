//connect to supabase

const { createClient } = require('@supabase/supabase-js');
const functions = require('firebase-functions');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || functions.config().supabase.url;
const supabaseKey = process.env.SUPABASE_KEY || functions.config().supabase.key;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_KEY must be set in environment variables.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;