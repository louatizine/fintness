import {
  COACH_SPECIALTIES,
  CONTACT_PREFERENCES,
  type CoachSpecialty,
  type ContactPreference,
} from './types.js';

function isSpecialty(value: unknown): value is CoachSpecialty {
  return typeof value === 'string' && (COACH_SPECIALTIES as readonly string[]).includes(value);
}

function isContactPreference(value: unknown): value is ContactPreference {
  return typeof value === 'string' && (CONTACT_PREFERENCES as readonly string[]).includes(value);
}

export function parseCoachProfile(body: Record<string, unknown>, fallbackEmail: string): { error?: string; profile?: Record<string, unknown> } {
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (displayName.length < 2 || displayName.length > 60) {
    return { error: 'displayName must be 2–60 characters' };
  }
  const bio = typeof body.bio === 'string' ? body.bio.trim() : '';
  if (bio.length < 10 || bio.length > 1000) {
    return { error: 'bio must be 10–1000 characters' };
  }
  const specialties = Array.isArray(body.specialties) ? body.specialties.filter(isSpecialty) : [];
  if (specialties.length < 1 || specialties.length > 8) {
    return { error: 'Pick 1–8 specialties' };
  }
  const certifications = typeof body.certifications === 'string' ? body.certifications.trim().slice(0, 500) : '';
  if (!isContactPreference(body.contactPreference)) {
    return { error: 'contactPreference must be app, email, or phone' };
  }
  const email = typeof body.email === 'string' ? body.email.trim() : fallbackEmail;
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (body.contactPreference === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'A valid email is required for email contact' };
  }
  if (body.contactPreference === 'phone') {
    if (!/^\+?[0-9\s().-]{8,20}$/.test(phone)) return { error: 'A valid phone number is required for phone contact' };
  }
  return {
    profile: {
      displayName,
      bio,
      specialties,
      certifications,
      contactPreference: body.contactPreference,
      email: email || '',
      phone,
    },
  };
}
