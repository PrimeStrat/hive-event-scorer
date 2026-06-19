# Hive Event Scorer

This is an advanced chat interpreter that allows Hive Events to automatically calculate and score their events!

### Features
- Team management and scoring
- Automatically calculate event stats
- Score editor
- Customizable settings
- Clean and intuitive interface

### How To Use
1. Open `index.html` in your web browser after downloading the project (no server or build step required)
2. Navigate to the **Teams** tab to add and manage team rosters (assign each in-game player to a team)
3. On the **Scorer** tab, pick the gamemode and paste the chat log, then **Process Chat**
4. View scores and per-player performance on the **Stats** tab
5. Adjust point values, detection, and your own IGN on the **Settings** tab

> Set **My IGN** in Settings so first-person log lines ("You killed ...", "You finished in 1st place")
> are attributed to you. Leave it blank to skip those lines.

### Supported gamemodes
BedWars, SkyWars, Survival Games, DeathRun, Gravity, Block Drop, and Block Party — each interpreted by a
dedicated parser tuned to The Hive's real chat formats. Combat kills are detected structurally, so any
flavour kill verb ("rolled ... beyond space and time", "ten hearted", "silenced", ...) is handled
automatically without a hard-coded list.

### Project structure
```
index.html            Single page; tabs switch client-side (no reload)
css/                  Styles
js/
  core/               ChatUtils, PointSystem, GameState, ScoringEngine
  parsers/            GamemodeParser (base) + one subclass per gamemode + registry
  renderers/          Scoreboard / Teams / Stats / Settings views
  app.js              Controller: wires the DOM to the engine and renderers
tests/                Node harnesses (no dependencies)
```

### Tests
Run with Node (no install needed):
```
node tests/run-logs.mjs    # parses the real Hive logs and asserts per-mode outcomes
node tests/boot-smoke.mjs  # boots the full app against a DOM shim and checks wiring
```
The log harness reads from `HIVE_LOGS` (defaults to the sample log folder); override it to point at your own logs.

### Feature Requests
Submit feature requests and bug reports through GitHub Issues.

