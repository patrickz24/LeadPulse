import axios from 'axios';
import { env } from '../config/env';

interface HunterLead {
  fullName:    string | null;
  email:       string | null;
  jobTitle:    string | null;
  company:     string | null;
  linkedinUrl: string | null;
  phone:       string | null;
}

export const searchHunter = async (domain: string): Promise<HunterLead[]> => {
  // Nettoie l'input (URL → domaine)
  const cleaned = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];

  const { data } = await axios.get('https://api.hunter.io/v2/domain-search', {
    params: {
      domain: cleaned,
      api_key: env.HUNTER_API_KEY,
      limit: 10,
    },
    timeout: 10_000,
  });

  if (!data?.data?.emails) return [];

  return data.data.emails.map((e: any) => ({
    fullName:    [e.first_name, e.last_name].filter(Boolean).join(' ') || null,
    email:       e.value ?? null,
    jobTitle:    e.position ?? null,
    company:     data.data.organization ?? null,
    linkedinUrl: e.linkedin ?? null,
    phone:       e.phone_number ?? null,
  }));
};
