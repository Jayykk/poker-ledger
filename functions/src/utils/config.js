/**
 * Deployment configuration shared by the Cloud Functions.
 */

// Region every Cloud Function deploys to. Single source for the backend — used
// by setGlobalOptions in index.js and by the LINE login callback URL. Override
// with the FUNCTIONS_REGION env var (functions/.env) for a different env.
export const FUNCTIONS_REGION = process.env.FUNCTIONS_REGION || 'asia-east1';
