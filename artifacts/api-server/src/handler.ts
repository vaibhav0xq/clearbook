import { attachDatabasePool } from "@vercel/functions";
import { pool } from "@workspace/db";
import app from "./app";

/**
 * Entry for hosts that call the app per request instead of keeping a listening process, such as
 * Vercel functions. The app itself is unchanged; only `index.ts` binds a port.
 */

// Keeps the instance awake until its idle database clients have closed, so an instance that is
// then suspended holds no connection the pooler would drop behind its back. Outside such a host
// this does nothing.
attachDatabasePool(pool);

export default app;
