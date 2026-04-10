import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
	// use import.meta.env so Vite provides the values at build time
	import.meta.env.VITE_SUPABASE_URL,
	import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);