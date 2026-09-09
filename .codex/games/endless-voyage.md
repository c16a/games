# Endless Voyage

## Premise and tone

A curious girl leaves home to explore the world, one day and one choice at a time. She visits unfamiliar towns, makes friends, discovers hobbies, and collects stories. Astronomy is one of her interests: clear nights, local star clubs, planetariums, and observatories can become memorable parts of her travels.

This is an endless, turn-based text game about enjoying a journey and caring for herself. There is no destination to reach, victory condition, survival pressure, death, or forced return home. The player can keep the same voyage going indefinitely, pause it, or voluntarily begin another.

## What the player tracks

- **Days on the voyage:** total in-game days elapsed, including travel, work, leisure, and rest. Days at home while the game is closed do not count.
- **Distance from home:** current distance from the starting location, not accumulated mileage. Show kilometres and update after travel.
- **Energy (health):** her physical capacity for activity, replenished by food and rest. Use the friendly player-facing label Energy.
- **Happiness:** how refreshed, connected, and inspired she feels.
- **Money:** available spending money, used for food, transport, lodging, and paid experiences.
- **Travel journal:** places, friendships, discoveries, and remembered choices. Optionally record greatest distance from home and total distance travelled separately.

Days and distance are descriptive milestones, not a score ratio. Resting is part of the journey and must not be presented as failure or wasted time.

## Turn structure

1. Present a short scene grounded in the current place, weather, people, and recent events.
2. Offer three to five distinct choices with clear costs, time requirements, and expected effects.
3. Resolve the chosen action once, update resources and days, and describe the outcome.
4. Remember important consequences and generate the next scene from the updated state.

A standard action takes one day. Longer journeys may take several days, with their full cost shown before confirmation. Reopening the game, reading the journal, or inspecting a choice does not advance time. Never apply real-time resource decay.

## Activities and resource rules

- **Travel:** spend time and usually energy; transport may cost money. Walking, buses, trains, and ferries offer different tradeoffs. Some routes lead farther from home; others lead sideways or back toward familiar places.
- **Eat:** buying a meal costs money and restores energy. Local food can introduce people, customs, or later opportunities.
- **Rest:** recover energy through a quiet day or sleep. Paid lodging may offer extra comfort, but free safe rest must always exist.
- **Enjoy an activity:** movies cost money and restore happiness. Reading, drawing, calling home, chatting, and stargazing can offer free alternatives.
- **Work:** earn money through age-appropriate, safe community tasks such as helping a library or watering a community garden. Effort costs energy; enjoyment varies with the character's interests and circumstances.
- **Explore or connect:** discover a place, join a local activity, or help someone. These can restore happiness, form friendships, and unlock later scenes.

Start with bounded resource meters, for example 0–100. Exact starting money, prices, costs, gains, and thresholds are configurable balance values. Clamp energy and happiness to their valid ranges, never allow spending unavailable money, and explain unaffordable choices without shaming the player.

## Gentle consequences for low resources

Use clearly labelled resource bands; proposed starting thresholds are Comfortable (40–100), Low (1–39), and Empty (0).

| Resource | Low | Empty | Recovery |
| --- | --- | --- | --- |
| Energy | Long walks and demanding work are unavailable; light activities and affordable short transport remain possible. | Pause onward travel and strenuous work until she has rested or eaten. | Meals, sleep, and free quiet rest. |
| Happiness | Ambitious excursions pause, and ordinary paid work can cost a little more energy; light enjoyable activities remain available. | Pause onward travel for a restorative day. | Friends, hobbies, calling home, entertainment, and free enjoyable activities. |

- Explain restricted activities in warm, concrete language: “A quiet day would help before that long walk.”
- There are no injuries, illnesses, escalating punishments, loss of possessions, or permanent stat penalties caused by empty meters.
- Recovery actions do not drain the other depleted resource. When both meters are low, always offer a free action that improves both.
- At zero money, energy, and happiness, a player must still have a safe, repeatable path back to travel and earning money.
- Free recovery must make meaningful progress without hidden costs, random failure, advertisements, or required purchases. Proposed minimum: restore both meters to Comfortable within at most three recovery turns from zero.
- Recovery days contain small scenes, conversations, or journal moments. Do not interrupt them with urgent deadlines or describe them as lost days.
- Do not steadily increase resource costs because the voyage is older. Different routes have different preparation needs, and restorative places remain available indefinitely.

## Generative narrative: variety with continuity

Each new voyage receives a fresh random seed. Build a coherent journey from authored narrative components and stateful procedural generation entirely on the device. Do not require a remote language model, account, API key, network connection, or usage payment.

### Generate meaningful combinations

- Create places from compatible combinations of geography, size, transport links, season, weather, local culture, amenities, and current happenings. A rainy harbour, mountain village, and sunny university town should offer different activities and decisions.
- Give recurring characters stable names, personalities, interests, relationships, and remembered encounters. Their dialogue and invitations should reflect what actually happened.
- Compose scenes from a situation, a person or discovery, a complication, choices, and outcomes. Vary mechanics and consequences as well as wording.
- Tag scene content with preconditions, location compatibility, resource bands, interests, narrative themes, character requirements, and follow-up eligibility.
- Let the player gradually express interests through choices, influencing future opportunities without permanently hiding other kinds of experience.
- Astronomy scenes must respect context: cloudy weather can lead to an indoor planetarium visit or star-chart conversation rather than impossible clear-sky observation.

### Remember choices and develop small stories

- Maintain a compact voyage history: known places, people met, relationship changes, discoveries, promises, completed story beats, and pending follow-ups.
- Use short optional story arcs spanning several visits or turns: help prepare a festival, exchange letters with a friend, contribute to a travelling exhibition, or learn to identify constellations.
- Arcs may resolve, but resolving one never ends the voyage. Offer new independent experiences and occasional callbacks.
- Choices should sometimes affect later opportunities. Helping a bookseller might lead to a reading invitation; enjoying sketching might introduce an art club.
- Do not present a returning character as a stranger or reward the same one-time discovery repeatedly.
- Avoid mandatory quests, expiring obligations, and guilt for declining invitations. The player controls the pace.

### Prevent repetitive cycles

- Track recently shown scene IDs, scene families, activity categories, opening phrases, and choice combinations.
- Apply cooldowns to exact scenes and downweight recently used families. Do not show the same flavour scene twice in a rolling 20-turn window when compatible alternatives exist.
- Avoid repeating an identical set of choices on consecutive ordinary turns. Preserve essential recovery choices whenever needed, even if that repeats an action.
- Mix ordinary daily moments, local discoveries, social encounters, travel decisions, and story follow-ups. Vary pacing; every day need not contain a dramatic event.
- Keep stable actions such as rest available, but vary their scene and context. Changing a town name alone does not count as a new experience.
- Select eligible content first, then weight for novelty, player interests, and unresolved stories. Never choose an incompatible event merely to satisfy variety.
- Build an extensible content library. A proposed first implementation target is at least 60 distinct scene templates across at least 10 scene families, with multiple meaningful choices and authored outcome variants. Counts are a starting point, not proof of replayability.
- When novelty constraints exhaust eligible content, relax novelty rules gradually and use a context-valid everyday scene. Never break continuity or remove free recovery to avoid repetition.
- Preserve meaningful milestones and relationships while bounding recent-history buffers and archiving journal entries so a long-running voyage remains usable.

## World and distance

- Use a coherent generated map with persistent locations and connections. Revisiting a place preserves its identity and history.
- Store home at a fixed origin and derive distance from home from the current location's coordinates. Travel time and fare use route length, which is distinct from distance from home.
- Show expected travel days, resource costs, and resulting distance from home before choosing a destination.
- Generate new reachable places as the voyage expands. Every region must include accessible recovery and earning options; procedural geography must not trap the player.
- Distance need not increase every turn. A detour, rest, or revisit is a legitimate part of the journey.

## Example scene

> **Day 18 — Willow Quay · 340 km from home**
>
> Rain taps against the library windows. The librarian recognises the constellation you drew in your notebook. Across the square, the cinema is showing a film about a girl who builds a telescope.
>
> You feel tired today. There is no hurry to catch the next ferry.

Possible choices include buying soup for energy, watching the film for happiness, helping arrange a small book display for money and an energy cost, or spending a free quiet afternoon reading and chatting to restore both meters. Display concrete effects and duration for each choice in the implemented game.

## Interface and accessibility

- Portrait-first reading layout with short paragraphs, comfortably tappable semantic buttons, and body text at least 16px.
- Keep days, distance, money, energy, and happiness easy to inspect; communicate meter states with text as well as colour.
- Show disabled choices with an explanation and a visible recovery alternative.
- Use accessible names, visible keyboard focus, and concise live announcements for turn outcomes. Avoid automatically reading the entire journal after every action.
- Let players review the current scene and journal without advancing time. Respect reduced-motion preferences.
- Avoid compulsory name or personal-information entry. A fictional name or optional nickname is sufficient.

## Architecture and persistence

- Put implementation in `src/games/endless-voyage/` and dynamically load it from the catalogue.
- Use semantic HTML, CSS, and TypeScript; this text game does not need a rendering engine.
- Follow the shared `GameModule` lifecycle and clean up listeners and pending resources in `destroy()`.
- Separate authored content, generation rules, resource calculations, world generation, persistence, and UI.
- Use injectable seeded randomness. Save both the voyage state and random-generator state so resuming cannot reroll the current scene or its outcomes.
- Persist locally after resolved turns using a versioned save format. Validate saved data and handle unavailable storage without preventing play.
- Support resume and explicitly confirmed new-voyage reset. Preserve a journal summary when practical; never silently overwrite an active voyage.

## Verification and acceptance

- Verify costs, gains, clamping, resource-band restrictions, travel distance, elapsed days, and one-time turn resolution.
- Prove recovery from zero money and both empty meters within the configured bounded number of turns, with no luck or paid action required.
- Verify that no resource value or voyage age triggers death, forced return, or a mandatory ending.
- Test equal seeds and choices for deterministic results, and save/resume for unchanged scenes and random state.
- Simulate many seeds and long voyages to detect unavailable choices, unreachable recovery, invalid events, broken follow-ups, and unbounded recent-history growth.
- Measure scene-family frequency and repeat intervals; test cooldown and fallback behaviour. Review sample playthroughs for genuinely different choices, not just different nouns.
- Verify recurring characters and revisited places retain their histories and that completed one-time events stay completed.
- Test local saves, invalid save handling, unavailable storage, and confirmed resets.
- Exercise mobile and keyboard play, readable resource explanations, journal access, and navigation cleanup in a browser.
- Run `bun test` and `bun run build` before considering implementation complete.
