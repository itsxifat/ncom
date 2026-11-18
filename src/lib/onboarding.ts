/**
 * The steps a new seller goes through, from the sign-up form to their first
 * package — one list, so the progress line reads the same on every screen.
 * "Confirm email" is only a step where the platform asks for it.
 */
export function signupSteps(withEmail: boolean): string[] {
  return [
    'Create account',
    ...(withEmail ? ['Confirm email'] : []),
    'Your business',
    'Choose a package',
  ]
}

export type OnboardingCategory =
  'fashion' | 'beauty' | 'food' | 'gadgets' | 'home' | 'other'

/**
 * The designs suggested at the end of onboarding for what the business
 * sells: one landing page and one store, each a template in
 * modules/templates with a screenshot in public/marketing/templates. Classic's
 * sample is clothing and Flash sale's is product-neutral, so Classic is only
 * suggested for fashion.
 */
export const SUGGESTED_TEMPLATES: Record<
  OnboardingCategory,
  { landing: string; store: string }
> = {
  fashion: { landing: 'landing-classic', store: 'store-boutique' },
  beauty: { landing: 'landing-glow', store: 'store-boutique' },
  food: { landing: 'landing-flash', store: 'store-fresh' },
  gadgets: { landing: 'landing-launch', store: 'store-volt' },
  home: { landing: 'landing-flash', store: 'store-essentials' },
  other: { landing: 'landing-flash', store: 'store-essentials' },
}

export const TEMPLATE_NAMES: Record<string, string> = {
  'landing-classic': 'Classic',
  'landing-glow': 'Glow',
  'landing-flash': 'Flash sale',
  'landing-launch': 'Launch',
  'store-boutique': 'Boutique',
  'store-volt': 'Volt',
  'store-fresh': 'Fresh',
  'store-essentials': 'Essentials',
}
