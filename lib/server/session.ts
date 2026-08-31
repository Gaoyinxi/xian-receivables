// Authentication is selected by the build, never by request input or a public feature flag.
export {
  getOrCreateSession,
  requireSession,
  sessionCookie,
  switchDemoSession,
} from '@runtime/session';
