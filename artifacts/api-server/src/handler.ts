import app from "./app";

/**
 * Entry for hosts that call the app per request instead of keeping a listening process, such as
 * Vercel functions. The app itself is unchanged; only `index.ts` binds a port.
 */
export default app;
