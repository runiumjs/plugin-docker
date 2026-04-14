import { ProjectSchemaExtensionTask } from '@runium/types-plugin';

export function getDockerComposeTaskProjectSchema(): ProjectSchemaExtensionTask {
  return {
    type: 'docker-compose',
    options: {
      type: 'object',
      properties: {
        services: {
          type: 'object',
          patternProperties: {
            '^[a-zA-Z0-9_-]+$': {
              type: 'object',
              properties: {
                image: {
                  type: 'string',
                },
                containerName: {
                  type: 'string',
                },
                command: {
                  oneOf: [
                    { type: 'string' },
                    {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  ],
                },
                ports: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
                volumes: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
                environment: {
                  $ref: '#/$defs/Runium_Env',
                },
                networks: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
                dependsOn: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
                restart: {
                  type: 'string',
                  enum: ['no', 'always', 'on-failure', 'unless-stopped'],
                },
                user: {
                  type: 'string',
                },
                workdir: {
                  type: 'string',
                },
                hostname: {
                  type: 'string',
                },
                entrypoint: {
                  oneOf: [
                    { type: 'string' },
                    {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  ],
                },
                privileged: {
                  type: 'boolean',
                },
                expose: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
                extraHosts: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
                stopSignal: {
                  type: 'string',
                },
                stopGracePeriod: {
                  type: 'string',
                },
                healthcheck: {
                  type: 'object',
                  properties: {
                    test: {
                      oneOf: [
                        { type: 'string' },
                        {
                          type: 'array',
                          items: { type: 'string' },
                        },
                      ],
                    },
                    interval: {
                      type: 'string',
                    },
                    timeout: {
                      type: 'string',
                    },
                    retries: {
                      type: 'number',
                    },
                    start_period: {
                      type: 'string',
                    },
                  },
                  required: ['test'],
                  additionalProperties: false,
                },
                platform: {
                  type: 'string',
                },
              },
              required: ['image'],
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
        networks: {
          type: 'object',
          patternProperties: {
            '^[a-zA-Z0-9_-]+$': {
              type: 'object',
            },
          },
          additionalProperties: false,
        },
        volumes: {
          type: 'object',
          patternProperties: {
            '^[a-zA-Z0-9_-]+$': {
              type: 'object',
            },
          },
          additionalProperties: false,
        },
        ttl: {
          type: 'number',
        },
        log: {
          $ref: '#/$defs/Runium_TaskLog',
        },
      },
      required: ['services'],
      additionalProperties: false,
    },
  };
}
