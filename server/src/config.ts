export const USE_SQLITE = process.env.USE_SQLITE === '1' || process.env.USE_SQLITE === 'true';
export const DB_FILE = process.env.DB_FILE || 'data/draft.db';
