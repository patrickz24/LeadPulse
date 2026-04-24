import dns from 'dns/promises';

export const verifyEmail = async (email: string): Promise<boolean> => {
  try {
    const domain = email.split('@')[1];
    if (!domain) return false;
    // Vérifie qu'un serveur MX existe pour le domaine
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
};
