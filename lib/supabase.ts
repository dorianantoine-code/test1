// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://egxyotjmixjwikwljhun.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVneHlvdGptaXhqd2lrd2xqaHVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NzQ1NjUsImV4cCI6MjA3NDU1MDU2NX0.ucaz9BUb1Wg2C8SPHvuw2mvYsUqPdxBnaPS_kNmQHLo'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)