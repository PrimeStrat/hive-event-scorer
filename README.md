# Hive Event Scorer

Hive Event Scorer reads Hive chat logs and scores your event for you.
It counts kills, placements and team bonuses, and keeps totals for the whole event.

Made by Prime Software Development (PrimeStrat). Not affiliated with The Hive.

## Features
- Team and substitute management
- Automatic scoring from chat logs
- Live capture from the OderSo client chat log
- Event totals, per-player breakdowns and game history
- Score editor for finished games
- Custom point values, presets and gamemodes
- PNG posters of the winners and player standings

## How to use
1. Open the app.
2. Go to **Teams** and put each player on a team.
3. Go to **Scorer**, pick the gamemode, paste the chat log and press **Process Chat**.
   You can also turn on **Live Capture** to score the game while you play.
4. See the results on **Totals** and **History**.
5. Change point values and your own IGN on **Settings**.

Set **My IGN** in Settings so lines like "You killed ..." or "You finished in 1st place" count for you.
Leave it blank to skip those lines.

## Supported gamemodes
BedWars, SkyWars, Survival Games, DeathRun, Gravity, Block Drop and Block Party.
Kills are found by player names, so any kill message works without a word list.
BedWars bed breaks are added by hand on the Scorer tab, because the log does not show who broke other beds.

## Importing logs
Drag a `.txt` chat log onto the window. The gamemode is guessed from the file name
(for example `bedwars.txt`, `sg.txt` or `block party.txt`), a new game starts, and the log is scored.
Drag a `.json` save file to load event data.

Saving is done with **Save JSON** and **Load JSON**. Starting a new game moves the last game into history.

## License
This project uses the MIT License. See `LICENSE`.
Anyone can use, copy, change, fork, sell or share it, for any reason.
You must keep the copyright and license notice, which credits Prime Software Development
and the project contributors, in every copy or fork.

## Credits
Created by Prime Software Development (PrimeStrat).

This project grows with help from the community. Thank you to everyone who tests it,
reports bugs and sends changes.

Contributors:
- SandRosey ([Sand2075](https://github.com/Sand2075)) - the preset system and frequent bug reports

## Disclaimer
This software is provided as-is, with no warranty of any kind.
Prime Software Development and all contributors take no responsibility for how it is used or misused,
or for anything that happens as a result of using it. This includes wrong scores, lost data,
or any other damage or loss. You use it at your own risk.

## Contributing
Everyone is welcome to help.
- Fork the project and change it any way you like.
- Send a pull request to share a fix or a new feature.
- Open an issue to report a bug or ask for a feature.

By sending a pull request, you agree that your work is shared under the same MIT License.
Contributors are added to the Credits list.
