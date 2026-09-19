# Clearbook visual system: Strata

Clearbook is a brokerage statement for tokenized stocks on Solana. The interface
should feel like a precision instrument in a dark room: quiet, exact, alive.

## Concept

A wallet's history is a core sample. Every position is a column, every open tax
lot is a layer in that column. Layer height is market value. Layer colour is the
lot's unrealized P/L (coral loss, slate flat, mint gain, dark grey when the cost
is unknown). Stack order is chronological (oldest at the bottom) and never
changes. Switching the cost method sends an amber pulse through the layers in
the order a sale would relieve them. The trade page lifts the layers a sale
would take.

Everything else in the product supports that idea: a neutral near black
field, hairline rules, a single signal amber accent, a wide light grotesk for
display type and mono type for numbers.

## Landing page (src/pages/home.tsx)

The landing is one pinned scene, not a page of sections. A 7 x 108vh scroll
container holds a sticky viewport with `Story` (src/components/three/story.tsx)
and seven short copy overlays. Scroll progress is a framer `MotionValue` passed
into the scene and read in `useFrame`, so nothing on the landing animates on a
timer except the first headline. Every visual state is a pure function of
progress in `src/components/three/story-data.ts` and both the scene and the
DOM copy call the same functions. Copy budget is about a hundred words in
total: one eyebrow, one headline, at most one sentence and one live figure per
chapter.

Chapters alternate sides. Each `Chapter` takes `side` ("left", "right",
"bottom" or "center") and `CHAPTER_SIDE` in
`src/components/three/story-scene.tsx` must mirror those props (1 for copy on
the right, -1 for copy on the left, 0 for bottom and center) because the camera
shifts the ledger to the free side. Headlines are `Headline lines={[...]}`:
each line rises out of its own mask when the chapter becomes active, so keep
lines short enough to fit the copy column at 84px. The final chapter dims the
ledger and hides column labels so the centred form reads. Scrolling runs
through Lenis except under reduced motion, where native scrolling and snapped
camera moves are used.

## Ledger pages (src/pages/*.tsx under /w/:address)

Every wallet page renders inside one `Shell` (src/components/layout/shell.tsx),
mounted once by the router for the whole `/w/:address/*` tree. The shell is a
split view: a reading panel on the left (about 60vw) and the stage on the
right (`clamp(360px, 40vw, 720px)`, full height, sticky). On small screens the
stage is a 42vh band at the top and the panel scrolls under it. The stage is
the one WebGL view of the ledger (`Strata` in mode "stage") and it stays
mounted while pages change, so the camera moves between pages instead of the
scene reloading.

Pages never render their own `Strata`, `Shell`, header, nav, method control or
wallet strip. A page describes what the stage should show with the `useStage`
hook from `@/components/layout/stage`:

```tsx
const { hoverMint, setHoverMint, columns } = useStage({
  focusMint,          // string | null: the camera closes on this column
  highlightLayerId,   // string | null: draw this lot as hovered (table row hover)
  preview,            // { mint, quantity } | null: lift the layers a sale would relieve
  caption,            // string | null: one short sentence printed under the scene
});
```

Pass plain values (strings, numbers, null), never objects created inline
except `preview`, which is compared by its fields. `hoverMint` is shared: a
row under the pointer should call `setHoverMint(mint)` on enter and
`setHoverMint(null)` on leave, and rows whose mint equals `hoverMint` should
render active, because hovering a column in the stage sets the same value.
`columns` are the built `StrataColumn`s (mint, symbol, layers with `id`,
`quantity`, `costPerShare`, `value`) if a page needs to map rows to layers.
`lotDetail` says whether those layers are real lots ("ready") or one aggregate
layer per position while lots load or fail; only pass a `preview` when it is
"ready". Pages exit with an animation, so the stage keeps the state of the
latest page to publish and ignores the exiting page's cleanup.

The reading panel is narrow. Design for about 800px: single column sections,
tables of at most five columns, secondary detail as 11px sub lines inside
cells, panels stacked rather than side by side below `xl`. Page titles use
`PageHeader` at the top of the content with a one line description. Keep the
identity strip, the method control and the wallet button out of pages; the
shell owns them.

## Tokens (already defined in src/index.css, do not redefine)

- Background near black (`bg-background`), foreground warm white.
- `text-primary` phosphor amber. The only accent. Use it for the active state,
  the eyebrow label, links and the pulse. Never for large fills.
- `text-success` mint and `text-destructive` coral. Only for signed deltas and
  status. Never decorative.
- `text-muted-foreground` for secondary copy.
- Fonts: `.display` (Archivo variable, normal width, page and section
  headings), `.display-wide` (Archivo at 122% width and light weight, landing
  headlines only), `.wordmark` (Archivo wide caps, the brand), default sans
  (Geist, body and UI), `.num` (Geist Mono, every number, address, hash,
  timestamp and ticker symbol), `.eyebrow` (mono uppercase tracked label).
- No italic accent words, no text glows, no glass cards on the landing.

## Utilities (src/index.css)

`.glass` and `.glass-strong` (panel surfaces), `.hairline` (1px border colour,
use with `border`), `.grain` (film grain overlay, absolute positioned child),
`.grid-lines`, `.shimmer` (loading), `.label` (10px uppercase tracked label),
`.row-hover` (table row hover with amber left rule), `.ring-glow` (focus
ring), `.ticker` (marquee), `ease-out-expo`, `animate-pulse-dot`,
`animate-sweep`, `animate-cue` (scroll cue).

## Components (reuse, do not modify)

- `@/components/surface`: `Panel`, `PageHeader`, `SectionTitle`, `Pill`
  (tones neutral, amber, gain, loss), `Skeleton`, `EmptyState`, `ErrorState`,
  `MethodologyLink`.
- `@/components/figure`: `Figure` (animated number with label, sub, tone,
  sizes sm md lg xl).
- `@/components/data-table`: `DataTable`, `TableHeader`, `TableHead`,
  `TableBody`, `TableRow` (index for stagger, active, hover and click
  handlers), `TableCell`.
- `@/components/motion`: `Reveal`, `Stagger`, `StaggerItem`, `EASE_OUT`,
  `AnimatedNumber`, `ScrambleText`, `Magnetic`, `TiltCard`, `PageTransition`.
- `@/components/three/strata`: `Strata` (props: columns, method, mode
  "hero" | "portfolio" | "trade" | "stage", highlightMint, highlightLayerId,
  focusMint, preview {mint, quantity}, onHoverColumn, onSelectColumn,
  className). Ledger pages must not mount it; the shell's stage does.
- `@/components/layout/stage`: `useStage(state)` (see Ledger pages),
  `useStageContext`, `StageView` (shell only).
- `@/components/three/strata-data`: `buildStrata(positions, lots)`,
  `reliefOrder(column, method)`, `reliefPreview(column, method, quantity)`,
  `reliefRank(column, method)`.
- `@/components/three/story`: `Story` (props: columns, progress MotionValue,
  featuredMint, incomeMint, onSelectColumn, className). Landing only.
  `story-scene.tsx` reuses `useLayout`, `Ground`, `SceneLights`, `Dust` and
  `LayerTooltipCard` from `strata-scene.tsx`.
- `@/components/layout/shell`: `Shell` (wallet pages), `Brand`,
  `CostMethodControl`.
- `@/lib/format`: `formatUSD`, `formatQuantity`, `formatPercent`,
  `truncateAddress`, `formatAge`, `issuerLabel`.

Wallet pages are rendered by the router inside `Shell`; a page component
returns its content directly (a fragment or a div), never a `Shell`.

## Motion

- Entrances use `Reveal`, `Stagger` and `TableRow` stagger. Durations 0.5 to
  0.9s with `EASE_OUT`. No bouncy springs on content.
- Numbers animate through `Figure` or `AnimatedNumber`. Hashes and signatures
  may use `ScrambleText` once on mount.
- Hover states move something (translate, rule, glow), not only colour.
- Reduced motion is handled by the primitives. Do not add motion that ignores
  `useReducedMotion`.

## States

Every page needs loading (Skeleton shapes in the final layout), error
(`ErrorState` with the API message), empty (`EmptyState` with a specific
sentence about what would fill it) and, where relevant, a visible note when a
value is unknown or estimated.

## Copy

- Sentence case everywhere, including headings, buttons and labels.
- Short, professional and clear. No hype words, no marketing filler.
- No em dashes or en dashes. Write "Jan 1 to Sep 19, 2026", not a dash range.
- No comma before "and" or "or".
- No emojis. No ampersands in headings.
- Unknown and estimated values are labelled as such.
- Nothing is tax advice and the copy should never imply it is.
