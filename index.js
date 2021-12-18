'use strict'

const fp = require('fastify-plugin')
const Redis = require('ioredis')

async function pubsubRedis(fastify, opts) {
  const {
    config,
    channels,
    subAction,
    url,
  } = opts

  // Private inner function to subscribe to channels passed for new Redis subscriber.
  async function _subscribe(sub, action, ...channels) {
    await sub.subscribe(channels)

    if (action) {
      sub.on('message', action)
    } else {
      sub.on('message', (ch, msg) => {
        console.log(`${ch}: ${msg}`)
      })
    }
  }

  // Public function paired with decorator to instantiate new Redis subscriber to channels passed
  // returns: name allocated to subscriber
  async function newSubscriber(action, ...channels) {
    if (![...channels].length) {
      throw new Error('Must include at least one channel in subscribe call')
    } else if (action && typeof action !== 'function') {
      throw new Error('Must register a function for the subAction if overriding the default')
    } else {
      const sub = url ? new Redis(url) : new Redis(config)
      await _subscribe(sub, action, ...channels)
      const subName = [...channels].join('-').concat(':', Date.now().toString())
      // init object that holds subscribers created
      if (!fastify.subscribers) {
        fastify.subscribers = {}
      }
      fastify.subscribers[subName] = sub
      return subName
    }
  }

  // Public function paired with decorator to shutdown subscriber matching name
  async function endSubscription(name) {
    await fastify.subscribers[name].quit()
    delete fastify.subscribers[name]
  }

  // Wrap up function added to onClose lifecycle hook
  async function close(fastify) {
    if (fastify.subscribers) {
      await Promise.all(Object.keys(fastify.subscribers).map(async (key) => {
        await endSubscription(key)
      }))
    }
  }

  // Validation
  if (!config && !url) {
    throw new Error('Must send redis connect "url" string OR connection "config" object') 
  } else if (config && url) {
    throw new Error('Cannot send both "url" and "config" for Redis connection, pick one')
  } else {
    // Create a one-off subscriber that responds to subAction defined on channels specified
    // Default action is print "{channel}: {message} for debugging"
    if (channels && channels.length) {
      await newSubscriber(subAction, ...channels)
    }

    // Allow on-demand subscriber allocation
    fastify.decorate('subscribe', newSubscriber)

    // Allow on-demand subscriber removal
    fastify.decorate('endSubscription', endSubscription)

    // Clean up on application close
    fastify.addHook('onClose', close)
  }
}

module.exports = fp(pubsubRedis, {
  fastify: '>=1.x',
  name: 'fastify-pubsub'
})
