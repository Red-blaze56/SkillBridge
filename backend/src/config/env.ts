import 'dotenv/config'

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 5000),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/skillbridge',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  adzunaAppId: process.env.ADZUNA_APP_ID ?? '',
  adzunaAppKey: process.env.ADZUNA_APP_KEY ?? '',
  adzunaCountry: (process.env.ADZUNA_COUNTRY || 'in').toLowerCase(),
  adzunaLocation: process.env.ADZUNA_LOCATION ?? '',
  disableAuth: process.env.DISABLE_AUTH === 'true' && (process.env.NODE_ENV ?? 'development') !== 'production',
}
