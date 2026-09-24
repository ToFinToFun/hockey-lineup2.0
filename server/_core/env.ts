export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  lagetSeUsername: process.env.LAGET_SE_USERNAME ?? "",
  lagetSePassword: process.env.LAGET_SE_PASSWORD ?? "",
};
