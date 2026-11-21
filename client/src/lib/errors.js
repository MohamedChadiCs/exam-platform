import i18n from '../i18n';

/** Localised message for an ApiError; field errors from Zod details are returned separately. */
export function errorText(err) {
  const key = `errors.${err?.code ?? 'GENERIC'}`;
  return i18n.exists(key) ? i18n.t(key) : i18n.t('errors.GENERIC');
}
export function fieldErrors(err) {
  const out = {};
  if (err?.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
    for (const d of err.details) if (d.path && !out[d.path]) out[d.path] = d.message;
  }
  return out;
}
