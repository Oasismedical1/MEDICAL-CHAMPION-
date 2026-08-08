// Shared across pages that print receipts/results.
// Relies on `client` from auth-guard.js already being loaded.

async function fetchClinicSettings() {
  const { data, error } = await client.from('clinic_settings').select('*').eq('id', 1).maybeSingle();
  if (error || !data) return { clinic_name: 'MEDICAL CHAMPION', address: '', phone: '', logo_path: null };
  return data;
}

function clinicLogoUrl(logoPath) {
  if (!logoPath) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/clinic-assets/${logoPath}`;
}

async function buildClinicHeaderHtml() {
  const settings = await fetchClinicSettings();
  const logoUrl = clinicLogoUrl(settings.logo_path);
  return `
    <div class="receipt-header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Clinic logo" class="receipt-logo">` : ''}
      <div class="receipt-clinic-name">${settings.clinic_name || 'MEDICAL CHAMPION'}</div>
      ${settings.address ? `<div class="receipt-clinic-line">${settings.address}</div>` : ''}
      ${settings.phone ? `<div class="receipt-clinic-line">${settings.phone}</div>` : ''}
    </div>
  `;
}
