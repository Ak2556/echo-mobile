
const requiredVars = {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};

for (const [key, value] of Object.entries(requiredVars)) {
  if (!value) {
    throw new Error(`CRITICAL: Environment variable \${key} is missing. Check your .env file.`);
  }
}

export const env = {
  SUPABASE_URL: requiredVars.EXPO_PUBLIC_SUPABASE_URL as string,
  SUPABASE_ANON_KEY: requiredVars.EXPO_PUBLIC_SUPABASE_ANON_KEY as string,
};
