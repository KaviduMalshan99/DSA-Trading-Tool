/**
 * Course site: ALL editable content lives in this file.
 *
 * How placeholders work:
 *   - Any string that starts with "TODO" (or is empty), and any `null` number,
 *     counts as "not filled in yet".
 *   - In dev (`npm run dev`) unfilled values are shown as yellow "TODO" tags so
 *     you can see what is missing.
 *   - In production builds unfilled OPTIONAL items are hidden instead.
 *
 * IMPORTANT: keep this file free of `import.meta.env` / browser APIs. It is
 * also imported by vite.config.ts to build the <head> SEO / Open Graph tags.
 */

export type IconName =
  | 'trend' | 'page' | 'video' | 'megaphone' | 'target'
  | 'tools' | 'users' | 'record' | 'certificate';
export type LearnItem = { icon: IconName; title: string; text: string };
export type IncludeItem = { icon: IconName; title: string; text: string };
export type Step = { title: string; text: string };
export type Faq = { q: string; a: string };

export const siteConfig = {
  // ---------------------------------------------------------------- brand
  brand: {
    /** Full brand name, used in the header, titles, policies and messages. */
    name: 'CYC Digital Academy',
    /** Short name (logo alt / compact places). */
    shortName: 'CYC',
    /** Domain the site is served on. Shown next to the brand name in footer, contact and policies. */
    domain: 'checkyourchart.net',
  },
  courseName: 'Facebook Monetization & Digital Marketing Course',
  heroLabel: 'Live online course on Zoom',
  heroSubtitle:
    'Learn how to set up, manage and grow a Facebook page, create content, and run Meta ads, in live, step-by-step sessions with an instructor.',

  // ---------------------------------------------------------------- course facts
  /** Course fee in Sri Lankan Rupees. Shown as "LKR 5,000.00". */
  priceLKR: 5000 as number | null,
  /** Shown wherever the class schedule would appear (pricing card, order summary). */
  schedule: 'Class schedule is shared with enrolled students',
  deliveryMode: 'Live on Zoom',
  /** Language the sessions are taught in. */
  language: 'Sinhala',

  /** Short trust points under the hero buttons. */
  trustPoints: ['Live Zoom sessions', 'Lifetime recordings', 'Certificate of completion', 'Student support group'],

  /** Shown in the pricing card and order summary as "what's included". */
  included: [
    'Live Zoom sessions with the instructor',
    'Practical, step-by-step training',
    'Student support group',
    'Lifetime access to session recordings',
    'Certificate of completion',
  ],

  // ---------------------------------------------------------------- hero image
  hero: {
    /**
     * Right-hand hero image at frontend/public/course/hero.jpg (max 1200px on
     * the long side, under ~300 KB). Until the file exists a neutral
     * placeholder panel is shown automatically.
     */
    image: '/course/hero.jpg',
    /** Actual pixel size of the file: the frame uses this aspect ratio (no cropping, no layout shift). */
    width: 1200,
    height: 1018,
    /** Describes the image for screen readers and search engines. */
    alt: 'Online digital marketing class',
  },

  // ---------------------------------------------------------------- business / legal
  business: {
    // Business name is brand.name ("CYC Digital Academy"). Not a registered company yet:
    // policies refer to it as "CYC Digital Academy (checkyourchart.net)".
    address: 'Near Old Sathosa, Yanthampalawa, Kurunegala, Sri Lanka',
    /** Display phone. The tel: link is derived from it (+94740020222). */
    phone: '+94 74 002 0222',
    /** WhatsApp number in international format, digits only. */
    whatsapp: '94740020222',
    email: 'info@checkyourchart.net',
    hours: 'Monday - Saturday, 9:00 AM - 6:00 PM (Sri Lanka time)',
  },

  /**
   * Social profile URLs. Leave '' to show the icon as a non-clickable decoration;
   * paste a full https:// URL and that icon automatically becomes a link.
   */
  social: {
    facebook: '',
    youtube: '',
    instagram: '',
    tiktok: '',
  },

  // ---------------------------------------------------------------- policies
  /** Shown as "Last updated" on the policy pages. Update when you change a policy. */
  policiesLastUpdated: '13 November 2026',

  refund: {
    /** Days after payment within which a full refund can be requested. */
    windowDays: 14,
    /** Working days to process an approved refund (back to the original payment method). */
    processingDays: 7,
    /** Extra conditions shown as bullet points. Edit freely. */
    extraConditions: [
      'Refund requests must be sent from the email address or phone number used at enrolment.',
    ],
  },

  // ---------------------------------------------------------------- payments
  /**
   * Keep false until OnePay is approved and the backend endpoint
   * POST /api/v1/course/checkout exists. While false, the checkout page offers
   * "enroll via WhatsApp" instead of online payment.
   */
  paymentsEnabled: false,
  acceptedCards: 'Visa / Mastercard',
  /** How people pay while online payments are off (shown in FAQ). */
  manualPaymentNote: 'Until then, contact us on WhatsApp and we will send you the payment details (for example, bank transfer).',

  // ---------------------------------------------------------------- SEO / sharing
  seo: {
    siteUrl: 'https://checkyourchart.net',
    title: 'Facebook Monetization & Digital Marketing Course | CYC Digital Academy',
    description:
      'A live online course on Zoom covering Facebook monetization, page management, Reels and content creation, Meta Ads and digital marketing. Includes lifetime recordings, a student support group and a certificate of completion.',
    /** Put a 1200x630 image at frontend/public/course/og.jpg (only used if the file exists at build time). */
    ogImage: '/course/og.jpg',
  },

  // ---------------------------------------------------------------- page content
  learn: [
    {
      icon: 'trend',
      title: 'Facebook Monetization',
      text: 'The eligibility requirements, the monetization tools Meta offers, and how to prepare a page to qualify.',
    },
    {
      icon: 'page',
      title: 'Page Management',
      text: 'Setting up a professional page, organising roles and settings, and keeping it consistent over time.',
    },
    {
      icon: 'video',
      title: 'Reels & Content Creation',
      text: 'Planning, filming and editing Reels and posts with a phone, and building a regular content schedule.',
    },
    {
      icon: 'megaphone',
      title: 'Meta Ads',
      text: 'Creating ad campaigns, choosing audiences, setting budgets and reading the results in Ads Manager.',
    },
    {
      icon: 'target',
      title: 'Digital Marketing',
      text: 'Putting together a practical online marketing plan for a small business or a personal brand.',
    },
  ] as LearnItem[],

  includes: [
    { icon: 'tools', title: 'Practical training', text: 'Each topic is demonstrated step by step so you can follow along on your own page.' },
    { icon: 'users', title: 'Student support group', text: 'A private group where you can ask questions during and after the course.' },
    { icon: 'record', title: 'Lifetime recordings', text: 'Every live session is recorded, so you can review it whenever you need.' },
    { icon: 'certificate', title: 'Certificate', text: 'A certificate of completion when you finish the course.' },
  ] as IncludeItem[],

  steps: [
    { title: 'Enroll', text: 'Fill in the short enrolment form and complete the payment.' },
    { title: 'Get access', text: 'We send you the class schedule, the Zoom link and an invitation to the student support group.' },
    { title: 'Learn live', text: 'Join the live sessions and watch the recordings at your own pace.' },
    { title: 'Complete the course', text: 'Receive your certificate of completion at the end of the course.' },
  ] as Step[],

  /** Payment-method and refund FAQs are added automatically from the settings above. */
  faq: [
    {
      q: 'Who is this course for?',
      a: 'Anyone who wants to start or grow a Facebook page, or promote a business online. This includes students, content creators and small business owners.',
    },
    {
      q: 'Do I need any prior experience?',
      a: 'No. You need a phone or computer, an internet connection and a Facebook account. The course starts from the basics.',
    },
    {
      q: 'How do I join the Zoom sessions?',
      a: 'After you enroll, we send the Zoom link by WhatsApp and email. Install the free Zoom app on your phone or computer before the first session.',
    },
    {
      q: 'What if I miss a session?',
      a: 'Every session is recorded and shared with enrolled students, so you can watch it later.',
    },
    {
      q: 'Are earnings guaranteed?',
      a: 'No. The course teaches skills and methods. Results depend on your own effort, content and consistency, and on the rules of third-party platforms such as Meta.',
    },
    {
      q: 'How do I receive the certificate?',
      a: 'You receive a certificate of completion after you finish the course.',
    },
  ] as Faq[],

  earningsDisclaimer:
    'This is an educational course. Results depend on each student’s own effort, skills, content and consistency. No earnings are guaranteed.',
};

export type SiteConfig = typeof siteConfig;
