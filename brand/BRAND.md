# heribertova.do — Brand

## Logo
The mark is an **H whose crossbar is a check mark ✓**. It stands for registering people and moving forward, and it stays legible down to 16 px.

| File | Use |
|---|---|
| `logo-mark.svg` | Primary icon: beige H on brown (app icon, avatar, splash) |
| `logo-mark-light.svg` | Brown H on sand, for light surfaces where a brown block is too heavy |
| `logo-horizontal.svg` / `@2x.png` | Header and login on beige backgrounds |
| `logo-horizontal-dark.svg` | On dark (ink) backgrounds |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` | Browser and PWA icons |

The wordmark is set in **Poppins SemiBold** ("Heriberto") and **Poppins Medium**, letter-spaced ("SANTANA · HIGÜEY"). The text is converted to outlines, so the files render the same everywhere. Poppins is under the SIL Open Font License; the web app loads it via `next/font/google`.

## Colors (design tokens)

| Token | Hex | Use |
|---|---|---|
| `background` | `#F5EFE6` | Page background (soft beige) |
| `surface` | `#FBF8F3` | Cards, inputs |
| `sand` | `#EADFCF` | Borders, muted fills, table stripes |
| `soft-brown` | `#B08D68` | Decorative only (charts, illustrations). **Not for text** (2.7:1) |
| `primary` | `#8B6B4A` | Buttons and active nav. **White text on it passes AA (4.9:1).** On beige it passes only for large text or icons (4.3:1) |
| `primary-deep` | `#5E4630` | Links, small brown text, button hover (7.7:1 on beige) |
| `ink` | `#3B3024` | Body text (11.2:1 on beige) |
| `gold` | `#E4C99F` / `#C9A57A` | The check in the logo; highlights, progress "goal reached" accents |
| success / warning / danger | `#4F7A52` / `#B7791F` / `#B4493B` | Status (check AA against `surface` when implementing) |

Progress colors on the leader dashboard (LOE parity): red below 30 %, amber below 70 %, green at 70 % or more, using the muted status tones above.
