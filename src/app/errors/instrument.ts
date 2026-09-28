import { startErrorReporting } from "./reports"

// main.tsx imports this module first, so that Sentry sees errors from the first moment.
startErrorReporting()
