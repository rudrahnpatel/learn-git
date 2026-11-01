# Brag Plan: learn-git

## What is this app?
A Duolingo-style daily game that teaches git on top of a real simulated git engine: 338 bite-sized exercises across 7 units, from the first commit to `rebase -i`, reflog rescue, force-with-lease and bisect, with Twig the paper-cut sprout cheering you on.

## The angle
"Overproduced mobile game ad, but the boss fight is your git history." Mobile game ads open on a fail state the viewer itches to fix; ours opens on the most universal git panic there is (`git reset --hard` just ate three commits) and then shows the game that teaches you how to get them back. Everything after the hook is the real product in use: the path, the tiles, the "Nice!" sheet, the live graph, the "Merged into main!" celebration. The rewards are git puns made real (cherries to cherry-pick, stashes that save a streak, release tags), which is the joke and the hook for retention in one. Ends on "Coming soon" with a like-and-share CTA framed as making the launch ship faster.

## Hook (first 2-3 seconds)
A dark terminal card on the chalk-blue canvas types `git reset --hard HEAD~3`. On Enter, three commit dots on the graph above it go ghost-pale. A huge line slams in: "Lost 3 commits?" Twig pops in worried. Every developer has felt this; the first frame already reads as a puzzle.

## Key moments (the middle)
- The rescue: `git reflog` -> `git reset --hard HEAD@{1}` and the three ghost commits snap back to full colour. "Learn git like a game." brand reveal.
- The path: the real home screen with its bouncing START bubble. "338 three-minute exercises."
- Build-the-command: tiles `git` `rebase` `-i` `HEAD~3` snap into the answer line, Check stamps down, and the green "Nice!" sheet slides up with a combo flame.
- The live engine: the terminal plus commit graph animating a real merge. "A real git engine. Live graph."
- The payoff: "Merged into main!" with paper-cut confetti, then the git-flavoured rewards arriving one by one: cherries, a stash, release tag v0.1.

## Outro / punchline
"Coming soon." lands on the track's strong beat, big, in Inter 400 with Twig cheering. Then an iris pill button: "Like + share = faster launch". Hold long enough to read and screenshot.

## User flow worth showing
Path (tap START) -> lesson exercise (build tiles, Check, "Nice!") -> type a real command into the live repo and watch the graph change -> "Merged into main!" celebration + streak/rewards. This is the centerpiece (scenes 3-6).

## Tone
- Preset: chaotic (pacing) leaning default (finish)
- Creative direction: "overproduced mobile game ad meets dev tool": fun, specific, not cringe
- Interpretation: snappy cuts every ~3s, punchy slam-in type, springy paper-cut shapes and confetti, but every caption holds long enough to read and the palette stays strictly SuperHi (no neon, no bold, no gradients). The humour is git puns the app already makes, never fake "only 1% can solve this" claims.

## Format: vertical — 1080x1920
## Duration: 22.5s

## Visual identity (from the project)
- Background: #f0f6ff (--chalk), cards #ffffff, hairlines #e1edff (--frost)
- Accent / action: #2727e6 (--iris), the only colour on buttons
- Text: #111118 (--ink)
- Shape fills only: #ff4141 red, #ffda00 yellow, #91d8ec sky, #ffbac4 pink, #16ab59 green, #ffe54d sunbeam
- Terminal: #111118 bg, #e8eaf4 fg, #7fe0a6 adds, #b9b9ff meta; graph lanes #2727e6 / #ff4141 / #16ab59
- Display + body font: Inter 400 only (vendored woff2), tight negative tracking; mono: Martian Mono 400
- Hard offset shadows (0 4px 0 #111118 on buttons, 0 2px 0 on cards), pills (48px radius), cards 24px radius
- Strongest visual element: oversized paper-cut shapes (pentagon, triangle, semicircle, star, circle) spilling off the frame, plus Twig

## Share copy (draft)
learn-git turns git into a daily game: 338 three-minute exercises, a real git engine, and a sprout named Twig. Coming soon. Like and share and we ship faster.

## Audio direction
- Role: dense rhythmic layer (mobile-ad energy), tidy enough to stay pleasant
- Music: happy-beats-business-moves-vol-10-by-ende-dot-app.mp3 (punchy compact loop, ~110 BPM)
- Music treatment: start at 0 at ~0.38 volume, 0.3s fade-in, fade out over the last ~1.2s
- Music cue guidance: bundled preset read (`assets/music/cues/happy-beats-business-moves-vol-10-by-ende-dot-app.music-cues.json`), tempo 109.96 BPM, beat ~0.545s. Strong cues: 18.55s ("Coming soon." lands, beat-locked), 20.19s (CTA pill stamps in), 15.82s (Merged into main! burst). Beat grid for sequences: reward items at 16.38 / 16.93 / 17.47 (each item is a 1-2 word label and the set holds afterwards); build tiles at 9.29 / 9.83 / 10.38 / 10.93.
- Audio-reactive treatment: subtle; bass energy makes the background paper-cut shapes breathe (scale/rotation a few percent). No waveform or equaliser visuals; text never pulses.
- SFX posture: moderate-to-dense, motion-matched
- Audio-coupled moments: hook typing (keypresses per character), Enter + ghosting (soft thud), commits snapping back (bright hit), tile snaps (card place), Check stamp (click), Nice sheet (glass/ding), graph merge (drop), Merged into main (bell + chips), rewards one by one (chip lay), Coming soon (heavy bell), CTA (click)
- Restraint rule: no SFX stacked on top of reading-heavy holds; nothing harsh/high-frequency repeated; music never above 0.45

## Storyboard

### Scene 1 — Hook: "Lost 3 commits?" — 0.0-3.3s (3.3s)
Chalk canvas, two big shapes spilling off edges. A mini commit graph (5 iris dots on one lane, labels `main`, `HEAD`) above a terminal card. `git reset --hard HEAD~3` types out (~0.9s). Enter: the last three commits fade to ghost outlines, HEAD jumps back. "Lost 3 commits?" slams in at the top (settled from ~1.6s, ~1.7s hold). Twig (worried) pops in bottom-right.
Sequential/interaction: yes, typed command character by character, then commits ghost one by one (fast, non-text).
Audio intent: tension with a wink.
Audio-coupled idea: keypress per character; soft thud as the commits ghost.
Transition mood: hard -> Scene 2 (same terminal stays, continuity)

### Scene 2 — Rescue + reveal — 3.3-6.3s (3.0s)
Same terminal: `git reflog` (1 line output with `HEAD@{1}`), then `git reset --hard HEAD@{1}`. The three ghosts snap back to full iris with a springy pop. Headline swaps to "Learn git like a game." (settled ~4.6s, ~1.6s hold), small mono tag `learn-git` above it, Twig switches to happy and hops.
Sequential/interaction: yes, typed commands; commits restore one by one.
Audio intent: relief, lift.
Audio-coupled idea: keypress ticks (thinned); bright hit on restore.
Transition mood: chaotic zoom/whip -> Scene 3

### Scene 3 — The path — 6.3-9.0s (2.7s)
Real UI: phone frame showing the path with the bouncing START bubble (captured screenshot, 390x844@3x). Caption above: "338 bite-sized exercises" and a mono sub-line "7 units · first commit → bisect". Phone drifts up slightly.
Sequential/interaction: START bubble bounce (real); a tap ripple on START at ~8.6s to motivate the cut.
Audio intent: momentum.
Audio-coupled idea: tap click on START.
Transition mood: hard push -> Scene 4

### Scene 4 — Build the command -> "Nice!" — 9.0-12.4s (3.4s)
Real UI, recreated faithfully (from the build exercise renderer): prompt "Replay the last 3 commits interactively", empty answer line, tile bank. Tiles `git` `rebase` `-i` `HEAD~3` fly into the line one per beat. Check button stamps down (translateY 4px, shadow collapses), the green-wash feedback sheet slides up: "Nice!" + combo flame "5". Caption: "Tap. Snap. Nice!"
Sequential/interaction: yes, simulated taps, 4 tiles on the beat grid, then Check.
Audio intent: tactile satisfaction.
Audio-coupled idea: card-place per tile; click on Check; ding on "Nice!".
Transition mood: clean slide up -> Scene 5

### Scene 5 — A real git engine — 12.4-15.4s (3.0s)
Real UI: the challenge/type screen terminal + live commit graph (captured). Overlay: recreated graph animates a merge: `git merge feature` types, a merge commit draws joining the green lane into the iris lane. Caption: "A real git engine." + mono "live graph · three trees".
Sequential/interaction: typed command, graph edge draws.
Audio intent: precision.
Audio-coupled idea: keypress ticks, drop on the merge commit.
Transition mood: burst -> Scene 6

### Scene 6 — "Merged into main!" + rewards — 15.4-18.4s (3.0s)
Real UI: the lesson-complete celebration (Twig cheering, stat cards) captured; paper-cut confetti burst on 15.82. Then a rewards stack arrives one by one on the beat: cherry icon "+12 cherries", stash icon "Streak stashed", tag pill "v0.1 shipped". Hold the full set.
Sequential/interaction: yes, three reward rows on beats 16.38 / 16.93 / 17.47.
Audio intent: jackpot, celebratory.
Audio-coupled idea: bell + chips on the burst; chip-lay per reward.
Transition mood: big wipe of iris -> Scene 7

### Scene 7 — Coming soon + CTA — 18.4-22.5s (4.1s)
Chalk canvas, 6-8 paper-cut shapes, Twig cheering. "Coming soon." slams in on 18.55 (beat-locked), huge. At ~19.64-20.19 the iris pill CTA "Like + share = faster launch →" stamps in with its hard ink shadow, then one tiny mono line "learn-git". Holds ~2.3s fully settled. Music fades over the last 1.2s.
Sequential/interaction: CTA pill presses (stamp) once.
Audio intent: big landing, then warm resolve.
Audio-coupled idea: heavy bell on "Coming soon."; click on the CTA stamp.

**Music mood for this video:** upbeat, punchy
**Audio summary:** a bouncy bed from frame 0, typing and thuds in the hook, tactile clicks through the product, a jackpot burst at the merge, a bell on "Coming soon." and a gentle fade out.
