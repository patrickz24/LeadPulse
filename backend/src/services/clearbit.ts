import axios from 'axios';
import { env } from '../config/env';

interface ClearbitEnrichment {
  companySize?: string;
  company?:     string;
}

export const enrichWithClearbit = async (email: string): Promise<ClearbitEnrichment> => {
  try {
    const { data } = await axios.get('https://person.clearbit.com/v2/combined/find', {
      params: { email },
      headers: { Authorization: `Bearer ${env.CLEARBIT_API_KEY}` },
      timeout: 8_000,
    });

    return {
      company:     data?.company?.name ?? undefined,
      companySize: data?.company?.metrics?.employeesRange ?? undefined,
    };
  } catch {
    // Clearbit peut retourner 404 si inconnu — on ignore silencieusement
    return {};
  }
};
