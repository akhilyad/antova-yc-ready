import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/** The node request interceptor every test runs behind (lifecycle in src/test/setup.ts). */
export const server = setupServer(...handlers)
