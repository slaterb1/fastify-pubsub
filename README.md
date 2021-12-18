# fastify-pubsub
This is a fastify plugin that allows you to setup multiple redis subscribers on-demand or through plugin initiations.

## Plugin Example
```js
'use strict'

const fp = require('fastify-plugin')

module.exports = fp(async function (fastify, opts) {
  fastify.register(require('fastify-pubsub'), {
    channels: ['ch1', 'ch2'],
    subAction: (ch, msg) => {
      console.log(`${ch}: ${msg}`)
    },
    config: {
      host: '127.0.0.1'
    }
  })
})
```

**Note:** channels and subAction can be excluded if you do not want a subscriber registered with the plugin. 

Once plugin is initiated the following decorators become available:

- fastify.subscribe(action || null, ...channels)
- fastify.endSubscription(subscriberName)

The decorators allow for on-demand subscriber addition and removal. The default subscriber action is to print out the message received as well as what channel it was on. The `subscriberName` is returned when registering a new subscriber

## OnDemand Subscriber

```js
'use strict'

module.exports = async function (fastify, opts) {
  fastify.get('/', async function (req, reply) {
    // add new subscriber
    const name = await fastify.subscriber(null, 'ch1', 'ch2')
    // test publish with fastify-redis plugin
    await fastify.redis.publish('ch1', 'publish test')
    // remove new subscriber
    await fastify.endSubscription(name)
  })
}
```

## Namespaces
If you supply a `namespace` option to `fastify-pubsub` the decorators will be under the namespace name instead of just fastify.

```js
'use strict'

const fp = require('fastify-plugin')

module.exports = fp(async function (fastify, opts) {
  fastify.register(require('fastify-pubsub'), {
    channels: ['ch1', 'ch2'],
    subAction: (ch, msg) => {
      console.log(`${ch}: ${msg}`)
    },
    namespace: 'labs',
    config: {
      host: '127.0.0.1'
      port: 5555
    }
  })
})
```

You can now add subscribers to this redis connection with `fastify.labs.subscribe` or remove with `fastify.labs.endSubscription`
