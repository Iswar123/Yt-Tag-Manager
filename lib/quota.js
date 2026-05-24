// lib/quota.js
export async function addQuotaUnits(supabase, userId, units) {
  // Pacific Time mein aaj ki date
  const ptDate = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  }); // "2024-01-15" format

  const { error } = await supabase.rpc('increment_quota', {
    p_user_id: userId,
    p_date:    ptDate,
    p_units:   units,
  });

  if (error) console.error('Quota track error:', error.message);
}
