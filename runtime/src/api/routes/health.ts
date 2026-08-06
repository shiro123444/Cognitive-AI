import type { FastifyInstance } from 'fastify';

/**
 * Register a health check route for Docker healthchecks.
 * Returns a simple OK status without requiring database access.
 */
export function registerHealthRoute(app: FastifyInstance) {
  app.get('/health', async (_request, reply) => {
    reply.code(200);
    return {
      status: 'ok',
      protocol: 'v1alpha1'
    };
  });
}
