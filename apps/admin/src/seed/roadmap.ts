import type { Payload } from 'payload'

export const INITIAL_ROADMAP = [
  {
    key: 'mobile-presence',
    title: 'Keep mobile sessions connected',
    description:
      'Investigate disconnects when a phone locks or changes apps. Distinguish a temporarily suspended connection from leaving, restore the same guest on return, and test iOS and Android without weakening inactivity or single-session rules.',
    status: 'planned',
    priority: 'high',
    category: 'reliability',
  },
  {
    key: 'loading',
    title: 'Improve loading in the header and lobby',
    description:
      'Use stable placeholders while identity and rooms load. Avoid header flashes and layout shifts, and provide useful retry states on slow or failed connections.',
    status: 'planned',
    priority: 'high',
    category: 'experience',
  },
  {
    key: 'logging',
    title: 'Review operational logging',
    description:
      'Audit the existing server logs, add consistent request and connection correlation, and define retention and alerting. Redact credentials and personal data; do not introduce logging of private-message contents.',
    status: 'planned',
    priority: 'high',
    category: 'reliability',
  },
  {
    key: 'avatar-popover',
    title: 'Open person actions from an avatar',
    description:
      'Give avatars a consistent accessible popover for profile, private chat, mute, block and report actions where permitted. Support keyboard use, touch, outside clicks and Escape.',
    status: 'planned',
    priority: 'medium',
    category: 'experience',
  },
  {
    key: 'chat-docs',
    title: 'Write the chat guide',
    description:
      'Document guest and account sign-in, public rooms, private messages, notifications, moderation and privacy. Keep the guide aligned with the running website and available in the supported languages.',
    status: 'planned',
    priority: 'medium',
    category: 'documentation',
  },
  {
    key: 'api-docs',
    title: 'Document HTTP and socket contracts',
    description:
      'Describe supported endpoints and socket events, authentication, payloads, errors, rate limits and compatibility. Separate public integration contracts from internal admin APIs and never publish credentials.',
    status: 'planned',
    priority: 'medium',
    category: 'documentation',
  },
  {
    key: 'custom-rooms',
    title: 'Create your own room',
    description:
      'Design user-owned rooms with visibility, invitations, capacity and owner moderation. Resolve persistence, room lifetime, abuse prevention and permissions before opening creation to everyone.',
    status: 'planned',
    priority: 'medium',
    category: 'chat',
  },
  {
    key: 'subcategories',
    title: 'Organize rooms into subcategories',
    description:
      'Group related rooms into discoverable categories without hiding available rooms or their occupancy. Define how categories relate to custom rooms and how empty groups behave on mobile.',
    status: 'planned',
    priority: 'medium',
    category: 'chat',
  },
  {
    key: 'audio-recording',
    title: 'Record and send voice messages',
    description:
      'Add explicit microphone permission, recording, stop, preview, delete and send controls. Define duration and upload limits, accessible playback, storage retention and reporting before enabling voice messages.',
    status: 'planned',
    priority: 'medium',
    category: 'chat',
  },
  {
    key: 'dictation',
    title: 'Dictate a message',
    description:
      'Explore speech-to-text that fills an editable draft and never sends automatically. Check language and browser support, show microphone state, and explain whether audio leaves the device.',
    status: 'exploring',
    priority: 'medium',
    category: 'chat',
  },
  {
    key: 'webrtc',
    title: 'Evaluate WebRTC',
    description:
      'Decide whether real-time voice, video or peer-to-peer transfer solves a concrete chat need. Compare signaling, TURN costs, privacy, moderation, mobile support and reconnect behavior before committing to implementation.',
    status: 'exploring',
    priority: 'low',
    category: 'engineering',
  },
  {
    key: 'storybook',
    title: 'Add a component workbench',
    description:
      'Evaluate Storybook for shared controls and chat states. Cover loading, errors, localization, narrow screens, keyboard focus, forced colors and visual regressions without duplicating application logic.',
    status: 'planned',
    priority: 'low',
    category: 'engineering',
  },
  {
    key: 'hover-effects',
    title: 'Make button feedback consistent',
    description:
      'Audit hover, pressed, selected, disabled and keyboard-focus states across buttons. Reuse shared styling, keep touch behavior clear, and respect reduced motion and forced colors.',
    status: 'planned',
    priority: 'low',
    category: 'experience',
  },
  {
    key: 'splash',
    title: 'Evaluate an initial splash screen',
    description:
      'Check whether a lightweight startup screen improves perceived loading. It must not delay usable content or add an artificial timer; prioritize the loading-state improvements first.',
    status: 'exploring',
    priority: 'low',
    category: 'experience',
  },
  {
    key: 'axios',
    title: 'Evaluate Axios',
    description:
      'Completed the HTTP-client evaluation. Keep the existing fetch-based approach unless a concrete requirement justifies adding a separate client dependency.',
    status: 'done',
    priority: 'low',
    category: 'engineering',
  },
  {
    key: 'framework',
    title: 'Evaluate the frontend framework',
    description:
      'Completed the framework review. Continue with the current React and Vite stack rather than migrate without a demonstrated benefit; document measured trade-offs when revisiting this choice.',
    status: 'done',
    priority: 'low',
    category: 'engineering',
  },
  {
    key: 'notification-sounds',
    title: 'Offer more notification sounds',
    description:
      'Added selectable sounds for private messages, warnings and room joins, with shared volume and preview controls. Notification preferences can be saved and restored.',
    status: 'done',
    priority: 'medium',
    category: 'chat',
  },
  {
    key: 'typing',
    title: 'Show when others are typing',
    description:
      'Added typing activity for public rooms and private conversations. Private drafts only announce typing to their intended recipient, with names and counts reflecting the current conversation.',
    status: 'done',
    priority: 'medium',
    category: 'chat',
  },
] as const

export async function seedRoadmap(payload: Payload) {
  for (const [order, item] of INITIAL_ROADMAP.entries()) {
    const existing = await payload.count({
      collection: 'roadmap-items',
      where: { key: { equals: item.key } },
    })
    if (existing.totalDocs) continue
    await payload.create({
      collection: 'roadmap-items',
      locale: 'en',
      data: { ...item, order, published: true },
    })
  }
  payload.logger.info(
    'Roadmap seed complete; existing items and release history were left unchanged.',
  )
}
