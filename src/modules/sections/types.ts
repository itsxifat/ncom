export interface PageTheme {
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  textColor: string
  headingFont: string
  bodyFont: string
  buttonStyle: 'SOLID' | 'OUTLINE' | 'GHOST'
  borderRadius: string
  spacingScale: string
  containerWidth: string
  customCss?: string | null
}

export interface SectionConfig {
  backgroundVariant?: 'default' | 'muted' | 'primary'
  alignment?: 'left' | 'center'
}
