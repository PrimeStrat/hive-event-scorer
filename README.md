# Hive Event Scorer

A desktop app that scores Hive custom server events for you. It reads the game chat, figures out
kills, placements and wins, and keeps a running scoreboard for the whole event.

Not affiliated with The Hive.

## Getting started

1. Download and run the installer (or the portable exe) from the Releases page.
2. Open the **Teams** tab and add your players to their teams.
3. Open the **Settings** tab and put your Minecraft username in **My IGN**. This lets the app score
   lines like "You killed ..." that only show up as "You" in your chat.

That's it. The app comes preloaded with the HiveSilly point values, and everything you do is saved
automatically to `AppData\Local\HiveEventScorer`, so you can close the app and pick up where you
left off.

## Scoring a game

1. On the **Scorer** tab, pick the gamemode.
2. Get the chat into the app. Three ways:
   - **Live Capture** - if you use the OderSo client, hit the Live Capture button and the app
     scores the chat as it happens. Only new chat counts, so nothing old gets scored by accident.
   - **Paste** - copy the chat into the text box and press Process Chat.
   - **Drag and drop** - drop a `.txt` chat log onto the window. The app guesses the gamemode from
     the file name (like `bedwars.txt` or `skywars 1.txt`) and scores it right away.
3. Watch the scoreboard and activity log fill in. Undo and Redo are there if something goes wrong.

Playing BedWars? The chat only shows bed breaks against your own bed, so use the **Manual Events**
panel to record each bed break as it happens.

When a game ends, it rolls into History automatically the next time you start a game.

## Substitutes

If someone has to leave mid-event, open **Teams > Subs** and add the substitute's username along
with who they're playing for. Everything the sub does from then on counts for the original player.

## After the event

- **Totals** shows the event standings and every player's points. Click a player for their full
  game-by-game breakdown.
- **History** lists every finished game. Use Edit Scores there if you need to fix a result by hand.
- **Export PNG** (on Totals) makes shareable posters of the standings and winners. You pick where
  each image gets saved.
- **Save JSON / Load JSON** (top right) backs up the whole event to a file and loads it back later.
  Saves go to `AppData\Local\HiveEventScorer\saves`.
- **Wipe Statistics** clears all scores and history but keeps your teams.

## Settings

- **Point values** - every gamemode has its own point table, including placements down to 50th.
  Anything you leave at 0 just doesn't score.
- **Misc Toggles** - optional extras, all off by default:
  - *Kill Leader bonus* - SkyWars kill leader gets bonus points at the end of the game.
  - *2nd/3rd place team bonuses* - extra tiers for the team finish and last-team-standing bonuses.
  - *Solo placements in PvP modes* - score SkyWars, Survival Games and BedWars placements per
    player (by how long each player survived) instead of per team.
  - *Mystery Chest points* - opening the SkyWars Mystery Chest scores points.
- **Block Party tie handling** - when several players survive the last round, choose whether they
  all share 1st place or all share the next placement down (3 tied players = all 3rd).
- **Presets** - save your whole settings setup under a name and swap between them. Two presets
  come bundled: HiveSilly (the default) and SandRosey.

## Supported gamemodes

BedWars, SkyWars, Survival Games, DeathRun, Gravity, Block Drop and Block Party. Kill messages are
matched by the player names in them, so The Hive's joke kill messages ("rolled ... beyond space
and time", "ten hearted", and so on) all count without any setup.

You can also add your own gamemode in Settings if you run something custom.
