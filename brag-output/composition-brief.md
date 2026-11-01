# Hyperframes Composition Brief: learn-git

## Objective
Create a short launch-style brag reel for learn-git that ends on "Coming soon" and asks viewers to like and share for a faster launch. No narration.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: vertical — 1080x1920
- Duration: 22.5 seconds

## Source Material
- Project root: /home/rudra/temp/learn-git
- Primary files read: README.md, index.html, css/style.css (:root tokens), .notes/game-design.md, .notes/style-superhi.md, .notes/learn-git-v2-ui.md, js/ui/twig.js (mascot SVG, copied verbatim), js/ui/complete.js, js/ui/lesson.js, js/ui/home.js
- Product name: learn-git
- Tagline / strongest claim: "Learn git in three-minute lessons: a winding path, a live repo, a streak to keep alive, and Twig to cheer you on." 338 exercises, 7 units, first commit to bisect.
- Key UI moments: the path with bouncing START, build-the-command tiles + green "Nice!" sheet with combo, terminal + live commit graph, "Merged into main!" celebration, the git-themed rewards (cherries, stash, release tag v0.1)
- Copy that must appear verbatim (from the app):
  - "Nice!"
  - "Merged into main!"
  - "START"
  - `git reset --hard HEAD~3`, `git reflog`, `git rebase -i HEAD~3`, `git merge feature`
- Reel copy (ours): "Lost 3 commits?", "Learn git like a game.", "338 bite-sized exercises", "Tap. Snap. Nice!", "A real git engine.", "Coming soon.", "Like + share = faster launch"

## Creative Direction
- Tone preset: chaotic pacing, default finish
- Creative direction: overproduced mobile game ad meets dev tool; fun, specific, not cringe
- Interpretation: cut every ~3s, slam-in type that then holds, springy paper-cut shapes; strictly SuperHi palette and Inter 400
- Angle: open on universal git panic (reset --hard ate 3 commits), rescue it with reflog, then show the game that teaches it, and land on "Coming soon"
- Hook: typed `git reset --hard HEAD~3`, commits ghost out, "Lost 3 commits?"
- Outro: "Coming soon." + iris CTA pill "Like + share = faster launch →"
- Avoid: generic SaaS language, abstract filler, bold type, gradients, soft shadows, accent colours on text

## Visual Identity
- Background: #f0f6ff; cards #ffffff with 2px #e1edff border and `0 4px 0 0 #111118` hard shadow at video scale
- Text: #111118
- Accent: #2727e6 (only action colour)
- Shape fills: #ff4141 #ffda00 #91d8ec #ffbac4 #16ab59 #ffe54d
- Display/body font: Inter 400 (vendored woff2 in assets/fonts), mono Martian Mono 400
- Visual references: paper-cut shape layer, Twig SVG, terminal (#111118), commit graph lanes, pill buttons with stamp press

## Storyboard
See `brag-output/brag-plan.md`.
1. Hook — 0-3.3s — typed reset, ghost commits, "Lost 3 commits?", Twig worried
2. Rescue + reveal — 3.3-6.3s — reflog, commits snap back, "Learn git like a game."
3. Path — 6.3-9.0s — real path screenshot with START, "338 bite-sized exercises"
4. Build -> Nice! — 9.0-12.4s — tiles snap in, Check stamps, green Nice! sheet, combo
5. Real engine — 12.4-15.4s — terminal + live graph merge, "A real git engine."
6. Merged into main! — 15.4-18.4s — celebration + confetti, rewards one by one
7. Coming soon — 18.4-22.5s — "Coming soon." + CTA pill

## Audio
- Audio role: dense rhythmic layer, tidy
- Audio arc: bouncy bed from 0, typing and thuds in the hook, tactile clicks through the product, jackpot at the merge, bell on "Coming soon.", fade out
- Music: assets/music/happy-beats-business-moves-vol-10-by-ende-dot-app.mp3, volume ~0.38, fade in 0.3s, fade out last 1.2s
- Music cue guidance: preset `assets/music/cues/happy-beats-business-moves-vol-10-by-ende-dot-app.music-cues.json` (109.96 BPM). Beat-lock "Coming soon." to 18.55, CTA to 20.19, Merged burst to 15.82. Tiles on 9.29/9.83/10.38/10.93; rewards on 16.38/16.93/17.47.
- Audio-reactive treatment: subtle; bass drives the background shapes' scale/rotation. No visualiser graphics.
- SFX: keypress set per typed char (thinned), soft thuds for ghost/transition, card-slide/chip-lay for tiles and rewards, click for Check/CTA, glass ding for Nice!, bell for Merged + Coming soon. Chosen files copied into assets/sfx/.
- Exact SFX choice: decided during composition against the real animation.

## Hyperframes Instructions
Standalone index.html, one paused GSAP timeline at window.__timelines["main"], seek-safe, seeded randomness only, local fonts via @font-face, `npx hyperframes check` must pass before render.
