// lib/quota.js
// Pacific Time date helper
function getPTDate() {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  }); // "YYYY-MM-DD"
}

export async function addQuotaUnits(supabase, userId, units) {
  try {
    const ptDate = getPTDate();
    await supabase.rpc('increment_quota', {
      p_user_id: userId,
      p_date:    ptDate,
      p_units:   units,
    });
  } catch (e) {
    console.error('Quota track error:', e.message);
  }
}

export async function getQuotaUsed(supabase, userId) {
  try {
    const ptDate = getPTDate();
    const { data } = await supabase
      .from('quota_usage')
      .select('units_used')
      .eq('user_id', userId)
      .eq('pt_date', ptDate)
      .single();
    return data?.units_used || 0;
  } catch {
    return 0;
  }
}
