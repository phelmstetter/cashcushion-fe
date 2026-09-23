# Cash Cushion Style Guide

## Design direction
Cash Cushion is a clean, data-dense personal finance workspace. It uses a light slate canvas, crisp white surfaces, balanced spacing, and one blue interaction accent. The existing product layout stays intact; visual hierarchy does the work instead of adding more decoration.

## Color roles

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#F3F5F8` | Page backgrounds and section separation |
| Surface | `#FFFFFF` | Cards, dialogs, inputs, menus |
| Primary | `#2563EB` | Main actions, selected states, links, focus, primary chart series |
| Heading / body | `#172554` | Strong headings, money values, primary text |
| Muted | `#64748B` | Labels, secondary text, inactive controls |
| Border | `#E2E8F0` | Card, input, and table separation |
| Success | `#15803D` | Income, deposits, completed/success feedback |
| Danger | `#B91C1C` | Expenses amounts, destructive actions, errors |
| Warning | `#B45309` | Upcoming bills, due dates, attention states |

Blue communicates Cash Cushion controls. Green, red, and amber communicate financial meaning, so they should not be used as generic decoration.

## Components
- **Cards:** white, 12–16px radius, 1px slate border, minimal elevation.
- **Inputs and filters:** white, slate border, blue focus ring, readable labels.
- **Primary buttons:** solid blue with white text. Secondary buttons remain white or transparent with slate borders.
- **Transactions:** keep the card neutral. Use compact labels, amounts, badges, and icons to show state. Forecasts may use a restrained blue surface; income and expense colors belong on the amount or small indicator, not the entire card.
- **Charts:** blue is the lead series; gridlines are low contrast; selection uses a subtle light-blue treatment.
- **Feedback:** confirmations, warnings, errors, and success states use the same card shape with one semantic signal and direct copy.

## Accessibility
Never rely on color alone for posted, forecast, pending, income, or expense states. Preserve descriptive labels, icons, and accessible names alongside color. Use visible focus states for interactive controls.

## Typography and density
Use the shared system sans-serif stack. Establish hierarchy through weight and size: prominent page headings, clear section headings, strong monetary values, readable body text, and compact muted metadata. Keep transaction-heavy views balanced rather than oversized.