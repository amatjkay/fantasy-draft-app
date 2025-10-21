/**
 * Elite Prospects Design System
 * Colors extracted from eliteprospects.com screenshots
 */

export const eliteProspectsTheme = {
  // Background colors (from screenshots)
  colors: {
    // Primary dark teal/blue backgrounds
    primary: '#053950',      // Main dark teal background
    primaryDark: '#072338',  // Even darker blue for depth
    
    // Light backgrounds
    light: '#f6fafd',        // Light background
    lighter: '#fbffff',      // Almost white
    lightGray: '#f5f9fd',    // Light gray for cards
    
    // Card/Panel backgrounds (dark theme)
    cardDark: '#0a3d52',     // Dark card background
    cardHover: '#0d4a5f',    // Hover state for cards
    
    // Table colors
    tableHeader: '#053950',  // Table header background
    tableRow: '#084a63',     // Alternating row
    tableRowHover: '#0d5570', // Row hover state
    
    // Accent colors (from buttons and UI elements)
    accent: '#10b981',       // Green accent (DOWNLOAD, buttons)
    accentHover: '#059669',  // Darker green on hover
    accentDark: '#047857',   // Even darker for pressed state
    
    // Text colors
    textPrimary: '#ffffff',  // Primary white text
    textSecondary: '#94a3b8', // Secondary gray text
    textMuted: '#64748b',    // Muted text
    textDark: '#0f172a',     // Dark text for light backgrounds
    
    // Borders and dividers
    border: '#1e3a52',       // Border color (darker than background)
    borderLight: '#334155',  // Lighter border
    divider: '#1a3544',      // Subtle divider
    
    // Status colors
    success: '#10b981',      // Success green
    warning: '#f59e0b',      // Warning yellow/orange
    error: '#ef4444',        // Error red
    info: '#3b82f6',         // Info blue
    
    // Links
    link: '#60a5fa',         // Link color (light blue)
    linkHover: '#3b82f6',    // Link hover
  },
  
  // Typography
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSizeSm: '12px',
    fontSizeBase: '14px',
    fontSizeMd: '16px',
    fontSizeLg: '18px',
    fontSizeXl: '20px',
    fontSize2xl: '24px',
    fontSize3xl: '30px',
    
    fontWeightNormal: 400,
    fontWeightMedium: 500,
    fontWeightSemiBold: 600,
    fontWeightBold: 700,
    
    lineHeightTight: 1.25,
    lineHeightNormal: 1.5,
    lineHeightRelaxed: 1.75,
  },
  
  // Spacing (consistent with modern design)
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    base: '16px',
    lg: '20px',
    xl: '24px',
    '2xl': '32px',
    '3xl': '40px',
    '4xl': '48px',
  },
  
  // Border radius
  borderRadius: {
    none: '0',
    sm: '4px',
    base: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },
  
  // Shadows (subtle for dark theme)
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
    base: '0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 1px 2px 0 rgba(0, 0, 0, 0.3)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.3)',
  },
  
  // Transitions
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

// Helper function to get color with opacity
export const withOpacity = (color: string, opacity: number): string => {
  return `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
};

// CSS Variables generator (for global use)
export const generateCSSVariables = () => {
  const vars: Record<string, string> = {};
  
  Object.entries(eliteProspectsTheme.colors).forEach(([key, value]) => {
    vars[`--color-${key}`] = value;
  });
  
  Object.entries(eliteProspectsTheme.spacing).forEach(([key, value]) => {
    vars[`--spacing-${key}`] = value;
  });
  
  Object.entries(eliteProspectsTheme.borderRadius).forEach(([key, value]) => {
    vars[`--radius-${key}`] = value;
  });
  
  return vars;
};

export default eliteProspectsTheme;
