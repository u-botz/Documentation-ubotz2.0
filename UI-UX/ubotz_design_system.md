# Ubotz 2.0 Design System

This document outlines the core design language, theme configuration, and UI components currently implemented in the Ubotz 2.0 frontend.

## 1. Core Principles

The design of Ubotz 2.0 is based on a clean, responsive, and modern aesthetic. It uses Tailwind CSS v4 alongside Radix UI primitives to ensure high accessibility, flexibility, and performance.

### 1.1 Styling Strategy
- **Framework**: Tailwind CSS (v4)
- **Component Approach**: Variant-driven component architecture using `class-variance-authority` (cva).
- **Utility Functions**: `cn` utility (combining `clsx` and `tailwind-merge`) is used to dynamically construct class names without conflicts.
- **Glassmorphism**: Special `.glass-card` classes indicate the usage of translucent, blurred backgrounds.

---

## 2. Design Tokens & Theme

The theme tokens are configured natively via CSS variables and Tailwind `@theme` directives inside [app/globals.css](file:///d:/Ubotz%202.0/ubotz_2.0_frontend/app/globals.css).

### 2.1 Color Palette

#### Brand Colors
- **Brand 50-950**: Blue hues, scaling from `#eff6ff` (50) to `#172554` (950).
- **Primary**: `var(--color-ubotz-primary)` (`#1B4F72`) – Dark Slate Blue.
- **Secondary**: `var(--color-ubotz-secondary)` (`#2E86C1`) – Strong Blue.
- **Accent**: `var(--color-ubotz-accent)` (`#F39C12`) – Warm Orange/Gold.
- **Danger**: `var(--color-ubotz-danger)` (`#E74C3C`) – Red.
- **Success**: `var(--color-ubotz-success)` (`#27AE60`) – Green.

#### Neutrals & Backgrounds
- **Background**: `#f8fafc` (Slate 50)
- **Surface**: `#ffffff` (White)
- **Border**: `#e2e8f0` (Slate 200)
- **Text Primary**: `#111827` (Gray 900)
- **Text Secondary**: `#6B7280` (Gray 500)
- **Text Muted**: `#9CA3AF` (Gray 400)

#### Semantic Colors
- **Success**: `#10B981` (Emerald 500)
- **Warning**: `#F59E0B` (Amber 500)
- **Danger**: `#EF4444` (Red 500)
- **Info**: `#6366F1` (Indigo 500)

### 2.2 Typography
- **Primary Font (Sans)**: `'Inter', system-ui, sans-serif`
- **Display Font**: `'Plus Jakarta Sans', system-ui, sans-serif`

### 2.3 Borders & Radius
- **SM**: `4px`
- **MD**: `8px`
- **LG**: `12px`
- **XL**: `16px`
- **Full**: `9999px` (Pills)

### 2.4 Custom Classes
- **`.btn-gradient`**: Linear green gradient.
- **`.glass-card`**: Soft shadow, border, and backdrop-blur.
- **`.dashboard-glow`**: Environmental green glow effect used for focused areas.

---

## 3. UI Component Catalog

The components are built and located within `shared/ui/`. They encapsulate Radix UI primitives and are unified through `cva`.

### 3.1 Buttons (`Button.tsx`)
Responsive, accessible buttons relying on `buttonVariants`.
- **Variants**:
  - `default`: Primary solid button (`bg-ubotz-primary`).
  - `secondary`: Secondary solid button (`bg-ubotz-secondary`).
  - `outline`: Bordered white button with hover states.
  - `ghost`: Transparent button, gray background on hover.
  - `destructive`: Red background (`bg-ubotz-danger`).
  - `link`: Transparent button with blue underline on hover.
- **Sizes**: `default` (h-10), `sm` (h-9), `lg` (h-11), `icon` (40x40 square).

### 3.2 Badges (`badge.tsx`)
Pill-shaped text indicators typically used for statuses or tags.
- **Variants**:
  - `default`: High contrast primary background.
  - `secondary`: Subdued background.
  - `destructive`: Red danger background.
  - `outline`: Transparent with a border.

### 3.3 Cards (`card.tsx`)
Flexible container elements.
- Uses `rounded-xl`, `border-gray-200`, and `shadow`.
- Sub-components: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, and `CardFooter`.

### 3.4 Alerts (`alert.tsx`)
Contextual feedback messages.
- **Variants**:
  - `default`: Standard alert.
  - `info`: Blue tinted (`bg-blue-50`).
  - `success`: Green tinted (`bg-emerald-50`).
  - `warning`: Amber tinted (`bg-amber-50`).
  - `destructive`: Red outline and text.

### 3.5 Inputs (`input.tsx`)
Standard text inputs.
- Default styling: `h-10`, `rounded-md`, `border-gray-300`.
- Focus ring: `focus-visible:ring-ubotz-primary`.

---

## 4. Usage Guidelines

1. **Use Variables**: Always use the defined tailwind colors (e.g., `text-ubotz-primary`, `bg-brand-500`) instead of hardcoded hex values to support future theming.
2. **Compound Components**: When using components like `Card` or `Alert`, utilize their specific sub-components for proper semantic structure and spacing.
3. **Responsive Design**: Tailor component layouts using grid/flex standard Tailwind utilities while relying on the base component configurations for appearances.
