# Stocklana design reference research

Research date: September 19, 2026

## Scope and method

This report covers the design section of the Stocklana brief. I fetched each reference home page plus linked component, documentation, pricing, gallery, terms, or repository pages. I also searched for pages that were not exposed in the first fetch. Product and price details below reflect what the sites showed on the research date.

Five visual captures are saved locally:

- [ThreeUI browse](screens/threeui-browse.png)
- [Pryzm home](screens/pryzm-home.png)
- [Solana home](screens/solana-home.png)
- [Ondo home](screens/ondo-home.png)
- [Linear home](screens/linear-home.png)

The screenshots matter because text extraction does not capture composition, depth, timing, or WebGL output. The ThreeUI capture also confirms that its browse page listed 421 components at the time of capture.

## Executive finding

**ThreeUI is the large, high-quality 3D and interactive component library in this set.** It is the strongest source for a cinematic hero and procedural backgrounds. FeralUI is the strongest source for small physical interactions. Pryzm is a browser visual studio, not a component library. Jiro is primarily a prompt and template shop. Skiper UI is a copy-paste shadcn component collection.

The right approach is not to assemble an entire page from showcase effects. Use one WebGL hero, one restrained procedural background language, and normal product UI for everything that communicates money, risk, portfolio state, or execution.

---

# Part A. Reference site deep dives

## 1. Pryzm

Pages reviewed: [home](https://pryzm.design/), [studio](https://pryzm.design/studio), [gallery](https://pryzm.design/gallery), [about](https://pryzm.design/about), [blog](https://pryzm.design/blog), [support](https://pryzm.design/support), and [terms](https://pryzm.design/terms).

### What it is

Pryzm is an in-browser background and visual studio. It blends gradients, photos, patterns, grain, glass, pixel effects, and chromatic effects, then exports stills, loops, or live embeddable backgrounds. It is a design tool rather than a conventional React component catalog.

### Delivery, stack, license, and price

- Rendering runs in the browser. The public pages do not identify its private rendering stack, so Three.js, React Three Fiber, or GSAP should not be claimed.
- Pro can export live code for **Framer, React, and HTML**. The exported component stays live and responsive rather than embedding a large video.
- Free: full studio and effects, preview-size PNG without a watermark, preview-size watermarked video, sharing, gallery, and up to nine saved looks.
- Pro: **$6.75 per month billed as $81 yearly** on the research date. It adds live code, clean video, high-resolution output through 4K, longer loops, higher frame rates, unlimited saves, Lab stacks, and Pro assets.
- Terms allow exported code on personal and client sites and inside products or templates sold by the customer. Exported code cannot be sold alone or used to make a competing generator.
- Workflow: create or remix in the studio, then export media or choose a Framer, React, or HTML code export. This is not an npm install.

### Specific effects and fit

| Effect or output | What it does | Fintech fit |
|---|---|---|
| Gradient and Grain | Adds controlled film texture to a multi-stop gradient | Strong for section atmospheres if contrast stays high |
| Fluted Glass | Slices light into vertical refractive bands | Strong for a restrained token or market hero |
| Halftone | Converts tone into a dot field | Good for editorial research sections |
| Dither | Simulates shades through distributed pixels | Good as a subtle data texture |
| ASCII | Rebuilds an image with text glyphs | Weak for core finance UI, useful for one developer detail |
| Aberration | Separates color channels at edges | Use only at low intensity |
| Scanlines | Adds horizontal display texture | Weak for trading UI, acceptable in a small cinematic layer |
| Pixelate | Resolves an image into a coarse grid | Good for a tokenization transition |
| Pixel Bloom | Combines pixels with a light bloom | Good for one hero transition |
| Bloom Blur | Creates a soft luminous field | Strong for depth behind product UI |
| Photo and Grain | Gives photography a less stock-photo finish | Strong for institutional or real-world asset stories |
| Photo and Scanlines | Gives imagery a market-terminal texture | Moderate, easy to overdo |

**Use:** a custom near-black, mineral-blue background with small plum and mint light, exported as a live React layer. Avoid the bright cobalt and magenta presets, which read as generic crypto.

## 2. FeralUI

Pages reviewed: [home](https://feralui.dev/), [about](https://feralui.dev/about), [gradient builder](https://feralui.dev/gradients), [animated gradient](https://feralui.dev/gradients/animated-gradient), [linear gradient](https://feralui.dev/gradients/linear-gradient), [mesh gradient](https://feralui.dev/gradients/mesh-gradient), [radial gradient](https://feralui.dev/gradients/radial-gradient), [PullCord](https://feralui.dev/pullcord), [Blinds](https://feralui.dev/blinds), [Hologram](https://feralui.dev/hologram), [Crumple](https://feralui.dev/crumple), [Screenery](https://feralui.dev/scenes), [Blob](https://feralui.dev/blob), [ClawCaptcha](https://feralui.dev/captcha), and [Brandkit](https://feralui.dev/brandkit).

### What it is

FeralUI is a set of playful React components and small tools centered on real-feeling physics, tactile reactions, and unusual input. It is both a component showcase and a collection of individual npm or GitHub projects.

### Delivery, stack, license, and price

- The public description says React components. Repositories and package descriptions identify TypeScript and SVG or Canvas techniques where relevant.
- Most published components are on npm and install individually. The about page lists packages including `pullcord`, `playcaptcha`, `feral-blob`, `feral-fur`, and `animaps-react`.
- Each package's own LICENSE governs it. The published packages reviewed were marked MIT, but that must be checked per package.
- FeralUI is free. The site asks for voluntary support and sells sponsorship placement, not component access.
- Motion is not uniform. PullCord uses a simulated rope, Blinds says it uses springs and no libraries, Hologram uses an SVG bump map, and other pieces use their own Canvas or SVG logic. Do not describe the whole library as Framer Motion or Three.js.

### Specific components and fit

| Component | What it does | Fintech fit |
|---|---|---|
| Gradient Builder | Builds Japanese-color linear, radial, conic, grainy, mesh, aurora, and animated gradients | Strong palette exploration tool |
| Hologram | Relights a foil card in real time from a height field | Strong for a tokenized share certificate, if used once |
| Blinds | Spring-driven carousel with nine layouts and live tuning | Strong for product or asset stories |
| PullCord | A simulated rope that hangs, swings, and toggles light | Poor for primary flows, good for a theme easter egg |
| Screenery | Finished app screens with signature transitions and AI-ready packs | Useful for studying onboarding and paywall choreography |
| MotionView | Turns images into seamless motion loops | Useful for social assets, not the app shell |
| Brandkit | Places identity assets into editable mockup grids | Useful for launch collateral |
| Stamp | Rolls a date and physically stamps an invoice | Moderate for settlement confirmations |
| DeskFolio | Opens and turns a small spring-driven book | Weak for finance, possible research report detail |
| Crumple | Crumples a deleted note and drops it into a bin | Poor for irreversible financial actions |
| Vacuum | Sucks selected tiles through a hose | Poor for fintech |
| Blob | Reactive jelly mascot with moods | Poor for a premium brokerage tone |
| AniMaps | Exports animated routes | Good for showing settlement or capital flow |
| Fur | Renders a pettable strand field | No product fit |
| ClawCaptcha | Replaces CAPTCHA with a claw-machine game | No fit for a serious transaction product |

**Use:** Hologram's lighting idea, not necessarily its trading-card styling. A restrained certificate surface can respond to pointer movement while the adjacent quote and disclosure remain static.

## 3. Jiro

Pages reviewed: [home](https://jiro.build/), [components](https://jiro.build/components), [newest](https://jiro.build/components/newest), [how it works](https://jiro.build/components/how-it-works), [about sections](https://jiro.build/components/about-us), [Luma pricing section](https://jiro.build/components/pricing/pricing-01-luma), [templates](https://jiro.build/templates), [pricing](https://jiro.build/pricing), and [lifetime deal](https://jiro.build/lifetime-deal).

### What it is

Jiro is a design prompt, section, and full-template shop for AI coding tools. Its main action is to copy a tuned prompt or source and paste it into Bolt, Lovable, v0, Cursor, Replit, Claude, or a similar builder. It is not an npm component system with one stable runtime.

### Delivery, stack, license, and price

- The catalog advertises 1,147+ premium templates and sections on the research date, including 88 full landing pages and 1,059 sections in its lifetime offer.
- The site explicitly promotes polished **Framer Motion** output. Individual generated results can vary, so stack and accessibility must be audited after generation.
- Delivery is copy prompt, view or copy code, extensions, and an MCP offering. It is not a normal package install.
- A small free collection is available. The research date offer was **$179 once**, reduced from $384, with current and future premium templates, source code, and updates.
- The visible terms describe prompts, code, templates, and components as service materials. Before shipping a commercial product, the purchased plan terms should be archived because the fetched excerpt did not expose a clean open-source license.

### Specific sections and fit

| Section | What it does | Fintech fit |
|---|---|---|
| Commission Calculator Header | Centers an interactive financial calculator | Strong structural reference |
| Invoice Generator Header | Frames a useful tool in the hero | Strong product-first pattern |
| Pricing 01 Luma | Three-tier pricing with a product preview | Moderate, but this product may not need pricing |
| Process 01 Payway | Explains a payment flow in steps | Strong for mint, trade, settle |
| Testimonials 01 Payway | Pairs quotes with a payments visual system | Moderate, only with authentic users |
| Social Proof VoiceFlow | Creates a compact customer or partner strip | Strong if partners are real |
| Features 01 Lightspeed | Shows product features with large visual regions | Strong composition reference |
| Case Study Benjamen | Gives a result-led case study section | Strong after real usage exists |
| AI Creative Workflow Header | Stages product steps in a cinematic hero | Moderate, remove AI template mannerisms |
| Zen Garden Header | Uses a 3D water-ripple scene | Weak concept fit, useful motion reference |

**Use:** study its section taxonomy and product-first composition. Do not paste a master prompt and accept the first output. The brief explicitly rejects generic AI landing pages.

## 4. Skiper UI

Pages reviewed: [home](https://skiper-ui.com/), [components](https://skiper-ui.com/components?source=free), [quick start](https://skiper-ui.com/docs/quick-start), [pricing](https://skiper-ui.com/pricing), [support](https://skiper-ui.com/docs/support), [GitHub components](https://github.com/Keshav-Bhaiya/skiper/tree/main/components), and individual pages for `skiper1`, `skiper6`, `skiper15`, `skiper16`, `skiper22`, `skiper43`, `skiper56`, and `skiper71`.

### What it is

Skiper UI is a collection of uncommon components made to work with shadcn/ui. It includes scroll effects, animated cards, navigation, Web3 displays, text effects, forms, carousels, and developer utilities.

### Delivery, stack, license, and price

- React and shadcn/ui are the delivery model. The site identifies Tailwind CSS and its examples are designed for modern Next.js projects.
- Components are copied through the shadcn registry, for example `pnpm dlx shadcn add @skiper-ui/skiper56`. Source lands in the project and can be edited.
- Its quick start says free components may be modified for personal and commercial projects with Skiper UI attribution. Pro removes attribution.
- Free and Pro components are mixed in the gallery.
- The home page showed **$129 one-time Premium** and **$549 one-time Exclusive** on the research date. The latter added the Figma file and planned full website templates. The pricing fetch exposed $549 but the home page exposed both tiers, so confirm checkout before purchase.
- Free lifetime updates and component requests were listed for paid access.

### Specific components and fit

| Component | What it does | Fintech fit |
|---|---|---|
| Card Stack Scroll (`skiper16`) | Pins and stacks project cards as the user scrolls | Strong for explaining three product layers |
| Web3 asset display (`skiper22`) | Presents Ethereum balance and asset UI | Useful layout reference, restyle away from crypto tropes |
| Devouring Details Sign In (`skiper56`) | Animated sign-in panel with registry install | Moderate, motion must not distract wallet connection |
| Scroll Reveal Images (`skiper71`) | Reveals large images progressively on scroll | Strong for product walkthroughs |
| Command Palette (`skiper15`) | Search and action surface with keyboard access | Strong for the app |
| Action menu (`skiper43`) | Compact command or inbox-style menu | Strong for asset actions |
| Shadcn ClipPath Carousel (`skiper54`) | Clips changing media into shaped frames | Moderate for editorial content |
| Loop Animation Hook (`skiper62`) | Coordinates repeatable animation cycles | Good infrastructure when motion is subtle |
| Breakpoint Indicator (`skiper65`) | Shows the active responsive breakpoint | Development only |
| Debug Panel (`skiper102`) | Exposes runtime debug controls | Development only |
| Video Player 001 (`skiper67`) | Custom media player | Useful for the demo page |

**Use:** command palette, card stack, and progressive product reveals. Do not use animated sign-in motion during an actual wallet authorization state.

## 5. ThreeUI

Pages reviewed: [browse](https://threeui.com/browse), [UI elements](https://threeui.com/ui-elements), [installation](https://threeui.com/installation), [MCP](https://threeui.com/mcp), [pricing](https://threeui.com/pricing), [3D tag](https://threeui.com/browse/tag/3d), [Three.js tag](https://threeui.com/browse/tag/three-js), and individual pages for Data Field, Orbital Sphere, Predictive Arc, Signal Particles, 3D Paper Certificate, Gallery, Character Wave, and Animated Top Dock.

### What it is

ThreeUI is a large collection of copy-ready Three.js components, procedural shaders, WebGL backgrounds, complete landing pages, hero sections, CSS effects, and interactive UI elements. This is the 3D library requested in the brief.

### Delivery, stack, license, and price

- Community install: `npm install @designcodeio/threeui`, then import its stylesheet and named React components.
- Peer dependencies are React and React DOM 18.2 or newer. Browser runtime requires WebGL or WebGL2.
- The catalog openly identifies Three.js, WebGL, GLSL shader, Canvas, Canvas2D, CSS, and UI implementations. Components are first-party React wrappers where packaged.
- Pro source installs through `npx @designcodeio/threeui-cli add <component>`. OAuth verifies entitlement before source is copied. Node 20 or newer is required for the CLI.
- Pro also provides an authenticated MCP endpoint with item prompts and source access.
- Community package code is MIT, subject to item-specific attribution or third-party notices.
- Pro permits commercial end products but forbids redistributing the source as a standalone asset, template, source collection, generator, or competing library. A client needs a license to extract and reuse Pro material in another project.
- Research date price: **$99 per year** or **$199 lifetime**, both shown as launch prices.

### Thorough component inventory

The catalog had 421 items in the captured browse view. These are the most relevant families and variants:

| Component | What it does | Fintech fit |
|---|---|---|
| Structure Flow: Data Field | Draws a global network field with nodes and connecting flow | Excellent for market and settlement infrastructure |
| Structure Flow: Orbital Sphere | Builds a spherical point and line system | Good for an asset universe, but avoid globe cliches |
| Structure Flow: Logic Core | Concentrates flows around a computational core | Strong for routing or execution |
| Structure Flow: Topology Field | Shows shifting connected topology | Strong for liquidity paths |
| Structure Flow: Dot Matrix | Forms volume from a structured particle matrix | Strong as a low-contrast hero layer |
| Structure Flow: Dimensional Field | Creates layered spatial data planes | Strong for price, liquidity, and ownership layers |
| Structure Flow: Emerald Horizon | Renders a quiet green data horizon | Strong palette starting point |
| Structure Flow: Expanse Field | Extends a sparse field across the viewport | Good for wide hero backgrounds |
| Structure Flow: Fluid Field | Moves data as a continuous field | Moderate, keep motion slow |
| Structure Flow: Nebula | Forms a dense atmospheric particle cloud | Weak if it looks like space crypto |
| Structure Flow: Flux Vortex | Pulls particles into a rotating vortex | Weak for finance, too dramatic |
| Predictive Arc: Default | Draws a luminous pixel arc across a dark field | Excellent abstract price-curve device |
| Predictive Arc: Data Pixel Arc | Resolves the arc from large data pixels | Excellent for tokenization and pricing |
| Predictive Arc: Signal Particles | Sends sparse signals through a dot matrix | Strong for live market updates |
| Predictive Arc: Override Grid | Disturbs a regular grid with a moving form | Strong for a controlled risk or execution visual |
| Predictive Arc: Ribbon Field | Converts the signal into a broader ribbon | Good, but can resemble generic aurora art |
| Predictive Arc: Halftone Flow | Renders the curve as a print-like dot pattern | Strong editorial fit |
| Predictive Arc: Amber Halftone | Warms the signal to an amber print texture | Strong for a less crypto-coded direction |
| 3D Paper: Certificate | Makes a paper certificate bend and respond in 3D | Excellent metaphor for a tokenized share |
| 3D Paper: Original | Adds physical depth and motion to a paper sheet | Good for ownership records |
| 3D Paper: Japanese | Uses a more crafted paper treatment | Moderate, style may distract |
| Character Carousel: Wave | Moves a row of characters in a responsive wave | Good for ticker symbols, use sparingly |
| Character Carousel: Filmstrip | Slides characters through a filmstrip layout | Moderate for stock universe browsing |
| Animated Top Dock: Command Bar | Creates a compact, animated command surface | Strong for the application shell |
| Animated Top Dock: Liquid Glass | Places actions in a glass dock | Moderate, use only with clear contrast |
| Gallery | Provides an interactive spatial media gallery | Good for research cards, not quotes |
| Sylva Living World | Builds a detailed interactive tree environment | No direct product fit, quality benchmark only |
| Country Towers | Builds 3D landmark scenes by country | No direct fit |
| Temple Night | Builds a cinematic environment with time-of-day variants | No direct fit |

### Best Stocklana use

Start with Predictive Arc or Data Field and make it react to real quote data. Pair it with a 3D Paper Certificate that transitions into the actual AAPLx or other tokenized stock position card. Disable pointer-heavy motion on touch and honor `prefers-reduced-motion`. The effect should never sit behind a trade ticket or legal disclosure.

---

# Part B. Quality benchmarks

## MetaMask

Pages reviewed: [home](https://metamask.io/), [developer](https://metamask.io/developer), [institutions](https://metamask.io/institutions), [brand assets](https://metamask.io/en-GB/assets), and [Portfolio](https://portfolio.metamask.io/).

- **Typography:** extracted custom `MMSansVariable` headings and `MMEuclidCircularB` body. The huge display type is expressive, while body copy remains plain.
- **Color:** white ground, deep plum `#190066`, purple text, pale lime `#E5FFC3`, and pale blue accents. It is crypto-branded without relying on black plus rainbow neon.
- **Rhythm:** oversized editorial headline, generous white space, then dense product and proof sections.
- **Hero device:** animated typographic wordplay around money plus the fox identity. Product capabilities follow quickly.
- **Motion:** elastic character and illustration transitions, cursor-responsive brand moments, and repeated shape language.
- **Trust:** 100M+ downloads, 4.7 App Store rating, billions of transactions since 2016, third-party audits, support in 134 languages, transaction protection up to $10k, and a security ranking claim linked to detail.
- **Borrow:** pair one ownable verbal idea with one ownable motion idea; quantify usage beside the product; give security a full section with links rather than a shield icon.

## Solana

Pages reviewed: [home](https://solana.com/), [developers](https://solana.com/developers), [ecosystem](https://solana.com/ecosystem), [solutions](https://solana.com/solutions), and [brand](https://solana.com/branding).

- **Typography:** extracted Diatype for headings with system sans body fallbacks. The home hero uses very large, tight, direct display text.
- **Color:** true black, white, soft gray, Solana violet `#9945FF`, and muted lavender. Green and cyan appear as narrow signals, not floods.
- **Rhythm:** broad 12-column layout, long headline measure, sparse hero controls, and cards that become denser below the fold.
- **Hero device:** a dark cinematic market waveform over a low-resolution color field. It reads as capital-market infrastructure rather than a floating coin.
- **Motion:** slow signal movement, subtle parallax, horizontal ecosystem movement, and restrained card transitions.
- **Trust:** the current message names capital markets, payments, and applications. Developer pages expose templates and documentation. Solutions pages explain concrete use cases. Ecosystem depth is visible rather than claimed.
- **Borrow:** use a price or liquidity signal instead of a coin; make the Solana tie visible through speed and market structure; keep most of the palette neutral and reserve chain colors for live state.

## Akedo

[Akedo](https://akedo.gg/) is an ad-free web game platform with a Web3 history. Its landing page is a game catalog with arcade categories, not a finance or infrastructure benchmark. The playful brand, game tiles, and reward framing are not relevant to a trusted tokenized-stock product. No design direction should be taken from it.

## Stripe

Pages reviewed: [home](https://stripe.com/), [pricing](https://stripe.com/pricing), [security](https://stripe.com/security), and [customers](https://stripe.com/customers).

- **Typography:** extracted Söhne for headings and body. It uses compact, precise sans typography and strong numeric hierarchy.
- **Color:** white, ink navy `#0D1738`, saturated indigo `#533AFD`, and pale pink or peach fields. Color is sectional and diagrammatic.
- **Rhythm:** narrow explanatory copy next to large product diagrams, alternating technical density with broad color fields.
- **Hero device:** product UI and infrastructure diagrams are integrated into the page, not isolated in a laptop mockup.
- **Motion:** connected flows, data pulses, staged UI states, and gentle perspective.
- **Trust:** transparent pricing, customer case studies, security documentation, compliance language, global coverage, and technical product detail.
- **Borrow:** put a live order preview in the hero; explain execution as an annotated system diagram; make fees, backing, and settlement readable without opening a modal.

## Linear

Pages reviewed: [home](https://linear.app/), [pricing](https://linear.app/pricing), [about](https://linear.app/about), [security](https://linear.app/security), and [customers](https://linear.app/customers).

- **Typography:** extracted Inter body and SF Pro Display headings. The design depends more on spacing, weight, and contrast than decorative type.
- **Color:** near-black `#08090A`, off-white, cool gray, muted indigo `#5E6AD2`, with rare yellow status.
- **Rhythm:** rigid centered container, large empty hero area, one dominant product frame, then modular feature sections.
- **Hero device:** a real, readable product interface at almost full width.
- **Motion:** slow spotlight gradients, crisp UI state changes, and small hover responses. Motion never competes with product legibility.
- **Trust:** security page, customer directory and cases, transparent pricing, changelog-like product detail, and visibly coherent real UI.
- **Borrow:** show the actual portfolio and order interface early; use one accent per state; make interaction speed and polish carry the premium feeling.

## Mercury

Pages reviewed: [home](https://mercury.com/), [about](https://mercury.com/about), [security](https://mercury.com/security), and [pricing](https://mercury.com/pricing).

- **Typography:** extracted custom Arcadia and ArcadiaDisplay. Display type has editorial character, while controls remain practical.
- **Color:** deep charcoal `#171721`, stone and cream surfaces, cool blue `#5266EB`, and restrained warm accents.
- **Rhythm:** magazine-like feature introductions alternate with dense banking product UI and legal details.
- **Hero device:** banking product screens and composed editorial art, not an abstract blockchain object.
- **Motion:** subtle reveals, controlled UI transitions, and ambient graphic movement.
- **Trust:** banking-partner and deposit language, pricing details, security controls, founder and company story, and product-specific operational explanations.
- **Borrow:** combine an editorial headline with sober operational copy; show account mechanics in realistic screens; keep disclosures visually integrated rather than relegated to tiny footer text.

## Jupiter

Pages reviewed: [main app](https://jup.ag/), [developer home](https://dev.jup.ag/), [API plans](https://dev.jup.ag/docs/portal/plans), and [security docs](https://docs.jup.ag/user-docs/more/security). The main app was Cloudflare protected during text fetch, so analysis relies on the visible public product and developer site.

- **Typography:** extracted Plus Jakarta Sans heading, Inter body, and Geist Mono for technical values.
- **Color:** near-black `#121318`, dark blue-gray panels, and pale lime `#C7F284`.
- **Rhythm:** a dense product surface surrounded by clear developer documentation and pricing.
- **Hero device:** a working swap interface with editable inputs. The product itself is the proof.
- **Motion:** quote refresh, route and state changes, and crisp input feedback rather than marketing animation.
- **Trust:** published audits in security documentation, exact API plans, developer support, route and quote detail, and a product users can operate immediately.
- **Borrow:** let the order composer be interactive in the hero; show route, quote source, and slippage plainly; use monospaced type only for prices, addresses, and timestamps.

## Ondo Finance

Pages reviewed: [home](https://ondo.finance/), [docs](https://docs.ondo.finance/), [Ondo Stocks overview](https://docs.ondo.finance/ondo-stocks/overview), and [security philosophy](https://ondo.finance/blog/ondo-security-philosophy).

- **Typography:** extracted Arizona for display and Gellix for body. This serif and grotesk pairing feels closer to asset management than software tooling.
- **Color:** white, soft institutional blue, black, and subdued periwinkle. The capture shows a lavender city film rather than neon.
- **Rhythm:** full-screen editorial video, restrained navigation, partner strip, then long-form institutional content.
- **Hero device:** real city footage with a simple statement. It ties onchain assets to the physical financial world.
- **Motion:** cinematic video, slow image movement, and minimal interface effects.
- **Trust:** partner marks including established financial institutions and chains, KYC and eligibility explanations, bankruptcy-remote structure, asset backing and overcollateralization, third-party security interest, daily attestations, monthly reconciliations, annual audits, and detailed security reasoning.
- **Borrow:** make backing and legal structure a product feature; use physical market imagery in one place; provide an evidence panel with attestations, custodian, oracle, contract, and update time.

## Cross-benchmark conclusions

1. Real products show real interfaces in or immediately after the hero.
2. Trust is specific. It names audits, backing, partners, controls, prices, or measured usage.
3. Premium finance sites use broad neutral fields and small accents. They do not coat every surface in gradients.
4. Cinematic motion works when there is one dominant device and the rest of the page is quiet.
5. Serif display type can add institutional tone, but all values, controls, and disclosures need a highly legible sans.
6. A product with irreversible actions must separate ambient motion from transaction state.

---

# Part C. Candidate visual systems

## Direction 1: Ledger Field

**Concept:** A dark, precise market infrastructure direction. The hero shows a sparse field of live price nodes resolving into one tokenized stock position and its settlement path. Most of the site is black, graphite, bone, and cool gray. A muted plum links to Solana, while mint marks confirmed state and amber marks market limitations. Product screens are nearly flat and sharply legible. This is the best direction for credibility and technical judges.

**Type:** [Instrument Sans](https://fonts.google.com/specimen/Instrument+Sans) for display and UI, paired with [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) for quotes, addresses, and time. Both are free.

**Palette logic:**

- Ink `#080A0D`
- Graphite `#11151A`
- Bone `#F3F1EA`
- Cool gray `#98A1AD`
- Solana plum `#7456A8`, used in less than 10 percent of the page
- Confirmed mint `#8ECFA8`
- Warning amber `#D5A64A`

**Hero options:**

1. ThreeUI Data Field driven by Pyth quote updates, with the selected stock path highlighted.
2. ThreeUI Predictive Arc moving through open, closed, and 24/7 token market sessions.
3. A low-motion Data Pixel Arc that resolves into the actual portfolio UI on scroll.

**Components:** ThreeUI Data Field, Topology Field, Data Pixel Arc, Signal Particles, Skiper Command Palette, Skiper Card Stack Scroll, Pryzm Gradient and Grain, Jiro Process 01 Payway structure.

## Direction 2: Registered Share

**Concept:** An editorial ownership direction built around the idea that a stock certificate can become programmable without losing its legal and financial meaning. The hero is a tactile share certificate that bends slightly and turns into a real position card. Warm paper, near-black ink, mineral blue, and restrained plum replace crypto neon. Serif display type gives the story authority, while a neutral sans keeps the application modern.

**Type:** [Newsreader](https://fonts.google.com/specimen/Newsreader) for editorial display, paired with [Manrope](https://fonts.google.com/specimen/Manrope) for UI and [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) for values. All are free.

**Palette logic:**

- Paper `#F1EEE6`
- Warm white `#FAF9F5`
- Ink `#111315`
- Mineral blue `#526B82`
- Muted plum `#725B78`
- Ledger green `#2E6A4F`
- Fine borders `#D8D3C8`

**Hero options:**

1. ThreeUI 3D Paper Certificate with pointer relighting and a token ID embossed into the surface.
2. FeralUI Hologram technique applied only to a small verification seal.
3. Certificate folds into the app's position sheet as the user scrolls, then motion stops.

**Components:** ThreeUI 3D Paper Certificate, 3D Paper Original, Predictive Arc Amber Halftone, FeralUI Hologram, FeralUI AniMaps for settlement, Pryzm Photo and Grain, Skiper Scroll Reveal Images.

## Direction 3: Open Market Daylight

**Concept:** A light institutional direction influenced by Ondo, Mercury, and Stripe. It uses real city and market photography, clear product UI, and blue-gray surfaces. Solana appears as a fine spectral edge on charts rather than a gradient background. The hero pairs a direct statement with a live portfolio and order composer. This direction is easiest for mainstream users and least likely to look like a generic crypto launch.

**Type:** [DM Sans](https://fonts.google.com/specimen/DM+Sans) for UI and text, paired with [Source Serif 4](https://fonts.google.com/specimen/Source+Serif+4) for selected editorial headlines. Both are free.

**Palette logic:**

- Daylight `#F6F7F8`
- White `#FFFFFF`
- Navy ink `#17202B`
- Steel `#607083`
- Institutional blue `#5C78A6`
- Soft lavender `#B9B1CC`
- Positive green `#287A58`

**Hero options:**

1. Product-first portfolio UI over a very slow Pryzm Photo and Grain city field.
2. Interactive order preview that switches between brokerage hours and a tokenized 24/7 market.
3. A Stripe-like execution diagram linking quote, wallet, Solana settlement, backing, and attestation.

**Components:** Pryzm Photo and Grain, Fluted Glass at low intensity, ThreeUI Signal Particles, Skiper Card Stack Scroll, Skiper action menu, Jiro Commission Calculator Header structure, Jiro Social Proof VoiceFlow structure.

## Recommended direction

Build **Ledger Field** for the application and borrow the certificate moment from **Registered Share** for the hero. This pairing gives the site one cinematic idea while keeping the actual product direct and credible. Use Open Market Daylight only if the product strategy targets first-time onchain investors rather than active Solana users.

## Motion rules

- One WebGL canvas above the fold, lazy loaded after the core headline and actions.
- Stop ambient canvas work when it leaves the viewport.
- Target a stable 60 fps on a mid-range laptop and degrade to a still image on low-power mobile devices.
- Honor `prefers-reduced-motion`.
- Never animate a quoted price, fee, balance, warning, or authorization in a way that delays comprehension.
- Do not use scroll hijacking. Standard scroll with small staged reveals is enough.
- Keep hover travel under 8 px and button response under 180 ms.
- Tie any data animation to authentic quote, position, or settlement data.

## Anti-patterns to avoid

- Black background plus full-spectrum neon on every surface
- Floating coins, chrome tokens, astronauts, planets, and glowing cubes
- A purple-to-cyan gradient as the entire identity
- Fake order books, fake profit charts, or invented TVL
- Huge claims without the legal, backing, or execution detail underneath
- Wallet connection as the only visible product action
- Constant marquee text and ticker strips with no information value
- Glass panels layered over low-contrast copy
- Excessive blur, bloom, chromatic aberration, and particle noise
- Generic bento grids filled with abstract icons
- AI-generated copy patterns such as "reimagine finance" and "the future is here"
- Three or more unrelated animation systems on one page
- Scroll-jacked storytelling that blocks access to the product
- Monospace type for paragraphs or legal text
- Gamified confetti after a financial trade
- Hidden fees, backing, oracle source, market-hours behavior, or eligibility limits
- An animated 3D scene that consumes battery while a user is entering an order

---

# Source index

Primary pages are linked inline. Pricing and rights should be rechecked immediately before adoption:

- [Pryzm terms](https://pryzm.design/terms)
- [Skiper quick start](https://skiper-ui.com/docs/quick-start)
- [Skiper pricing](https://skiper-ui.com/pricing)
- [ThreeUI installation](https://threeui.com/installation)
- [ThreeUI pricing](https://threeui.com/pricing)
- [ThreeUI terms](https://threeui.com/terms)
- [ThreeUI MCP](https://threeui.com/mcp)
- [Jiro lifetime offer](https://jiro.build/lifetime-deal)
- [FeralUI about and package list](https://feralui.dev/about)
- [Ondo Stocks structure](https://docs.ondo.finance/ondo-stocks/overview)
- [Ondo security philosophy](https://ondo.finance/blog/ondo-security-philosophy)
- [Linear security](https://linear.app/security)
- [Stripe security](https://stripe.com/security)
- [Jupiter security docs](https://docs.jup.ag/user-docs/more/security)