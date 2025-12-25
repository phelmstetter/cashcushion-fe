# CashCushion Design Guidelines

## Design Approach: Fintech-Inspired Dashboard

**Primary Reference**: Stripe Dashboard + Mercury + Linear's precision
**Rationale**: Financial applications demand trust, clarity, and efficiency. Drawing from modern fintech leaders creates a professional, data-focused experience that inspires confidence.

## Core Design Principles

1. **Data Primacy**: Information hierarchy favors scanability and quick comprehension
2. **Restrained Elegance**: Sophisticated without decoration
3. **Purposeful Whitespace**: Breathing room around financial data reduces cognitive load
4. **Instant Clarity**: Users should understand their financial position at a glance

---

## Typography System

**Primary Font**: Inter (Google Fonts)
**Secondary Font**: JetBrains Mono (for numbers/data)

**Hierarchy**:
- Hero Numbers: 3xl-4xl, font-medium, tabular-nums
- Page Titles: 2xl-3xl, font-semibold
- Section Headers: xl, font-semibold
- Card Titles: lg, font-medium
- Body Text: base, font-normal
- Data Labels: sm, font-medium, uppercase tracking-wide
- Financial Values: JetBrains Mono, tabular-nums for alignment

---

## Layout System

**Spacing Units**: Use Tailwind's 4, 6, 8, 12, 16, 24 for consistent rhythm
**Grid Structure**: 12-column responsive grid
**Container Max-Width**: max-w-7xl for main content areas

**Dashboard Layout**:
- Persistent sidebar navigation (w-64, hidden on mobile)
- Top header bar with user actions and search
- Main content area with responsive card grid
- 2-column layout on desktop (lg:grid-cols-2), single column mobile

**Spacing Patterns**:
- Section padding: py-8 to py-12
- Card padding: p-6
- Card gaps: gap-6
- Content margins: mb-6 for vertical rhythm

---

## Component Library

### Navigation
- **Sidebar**: Fixed left navigation with icon + label items, collapsed state on mobile
- **Top Bar**: Search, notifications, user profile with dropdown

### Data Display
- **Stat Cards**: Prominent metric cards with large numbers, trend indicators, sparkline charts
- **Transaction Lists**: Clean rows with category icons, amounts (positive/negative styling), dates
- **Charts**: Use Recharts library - area charts for trends, bar charts for comparisons, donut for breakdowns
- **Tables**: Striped rows, sortable headers, hover states, sticky header on scroll

### Forms & Inputs
- **Input Fields**: Border-focused design, clear labels above fields, helper text below
- **Dropdowns**: Custom styled selects with search functionality
- **Date Pickers**: Calendar overlay with range selection
- **Buttons**: Solid primary, outline secondary, ghost tertiary - consistent sizing (px-4 py-2 for base)

### Feedback Elements
- **Alerts**: Top-right toast notifications with icons
- **Empty States**: Centered illustrations with helpful CTAs
- **Loading States**: Skeleton loaders matching content structure

---

## Dashboard-Specific Features

### Hero Section (Dashboard Home)
- Large metric summary cards showing total balance, income, expenses
- 3-column grid (grid-cols-1 md:grid-cols-3)
- Visual hierarchy through size variation and positioning

### Financial Data Visualization
- Trend charts showing balance over time
- Category breakdowns with visual weight
- Month-over-month comparisons
- Budget vs. actual progress bars

### Quick Actions
- Floating action button for adding transactions
- Quick filters for date ranges
- One-click budget creation

---

## Icons & Visual Elements

**Icon Library**: Heroicons (outline for navigation, solid for actions)
**Visual Accents**: Minimal use of subtle gradients on stat cards, otherwise flat design
**Illustrations**: Use for empty states and onboarding only

---

## Animations

**Sparingly Applied**:
- Smooth page transitions (150ms)
- Chart animations on load (subtle fade-in)
- Hover states on interactive elements (scale 1.02)
- Number count-ups for hero metrics (750ms)

**Avoid**: Excessive scroll animations, distracting micro-interactions

---

## Accessibility

- WCAG AA compliant throughout
- Keyboard navigation for all interactive elements
- Clear focus indicators (ring-2 ring-offset-2)
- Sufficient touch targets (min-h-10)
- Screen reader labels for data visualizations

---

## Mobile Considerations

- Bottom navigation bar replaces sidebar
- Stacked card layouts
- Simplified charts optimized for small screens
- Touch-friendly action buttons
- Swipe gestures for transaction actions