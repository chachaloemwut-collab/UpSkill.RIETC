// Release label baked in at build time by the deploy workflow ("YYYY.MM.DD-<commit>"); "dev" for local builds.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
