# Stoned Ape Tools
## Table of Contents
- [What Tools?](#what-tools-)
  * [What are used for?](#what-are-used-for-)
  * [What does it do?](#what-does-it-do-)
    + [Ledger](#ledger)
    + [Research](#research)
    + [Battle Calc](#battle-calc)
    + [Bulk Trade](#bulk-trade)
- [Installation](#installation)
  * [Option 1: Install with chrome plugin store](#option-1--install-with-chrome-plugin-store)
    + [Does it work on firefox?](#does-it-work-on-firefox-)
  * [Option 2: Install using Git Version of Plugin](#option-2--install-using-git-version-of-plugin)
- [Features:](#features-)
  * [Neptunes Pride Agent](#neptunes-pride-agent)
  * [Future Features](#future-features)
- [Previous Description](#previous-description)


# What Tools?

Computer tools, designed to assit your communication betwen your allies; let these tools remove burdensome tasks and recieve a free collection of additions to improve your quality of life.

## What are used for?

This plugin is for [Neptunes Pride](https://np.ironhelmet.com): is the most unique, engaging multiplayer game oriented on a competition to Explore community and space, Expand into the universe, Exploit friends and foes, Exterminate others ([4X](https://en.wikipedia.org/wiki/4X)).

## What does it do?
It has a few main modules that expand the interface to give you more control over your gamepay:
 - Ledger: keep track of debts!
 - Reseach Button: Auto-types your current and next research along with the estimate time (ETA) your current research level.
 - Battle Calc: Predict battles quickly. 
 - Bulk Trade: Quickly pay for tech and automatically share all your tech. 

### Ledger
![Ledger](https://github.com/Tsangares/stoned_ape_tools/blob/master/pictures/np_1.png?raw=true)
Ledger (hotkey ‘m’):  Adds a row to the menu titled ‘Ledger’. When clicked tabulates then displays a ledger of debt owed between you and anyone you’ve traded tech or cash with so far in the game. Accurately shows you who you owe money to, who owes you money, and how much money is owed. If you owe someone else money, displays a button to repay the debt owed.

### Research
![Research](https://github.com/Tsangares/stoned_ape_tools/blob/master/pictures/research.png?raw=true)
 Research ETA Chat Button: Adds a button to chat between ‘Back’ and ‘Send’ titled ‘Research’. When clicked pastes your current research tech and your next research tech into the chat input box.
### Battle Calc
![Battle Calc](https://github.com/Tsangares/stoned_ape_tools/blob/master/pictures/np_2.png?raw=true)
When you select a carrier, if the carrier is headed for an enemy star, displays a battle calculator. Accounts for you and your opponent’s current weapons tech, manufacturing tech, and industry.

### Bulk Trade
![Bulk Trade](https://github.com/Tsangares/stoned_ape_tools/blob/master/pictures/np_3.png?raw=true)
Quick Tech Trading: Adds 2 buttons to other players’ Empire pages:
 - ‘Share All Tech’ button allows you to share all the tech you have that another player does not in one easy click.
 - ‘Pay for All Tech’ button allows you to send the cash required for another player to send you all the tech they have that you don’t in one easy click (and without having to do any math!).
 - Forgive debt button for ledger to allow you to forgive debt owed to you.

# Installation
Probably you want to use the chrome plugin store:

## Option 1: Install with chrome plugin store

Simply go to the chrome store and click "Add to Chrome":

[chrome.google.com/stoned-ape-tools](https://chrome.google.com/webstore/detail/stoned-ape-tools/fjneickecjinecmcmikiedapbjpginao)

*Benefits*: Simple installation.
*Downsides*: Not the latest features.

### Does it work on firefox?

No, I am open to pull requests though. Just make sure it works on both chrome and firefox. :wink:

## Option 2: Install using Git Version of Plugin


Clone this repository somewhere on your system. Either by unzipping it, using terminal `git` or github desktop. Once you have a copy on your system use the following to enable this git version:

 1. Enter `chrome://extensions/` into your URL on CHROME. 
 2. Remove or disable `Neptunes Pride Agent` or `Stoned Ape Tools` plugins. 
 3. Click `Load Unpacked` on the extentions page at the top.
 4. Navigate to the stones ape repository and click `OK`
 5. Make sure the plugin is enabled in the `chrome://extensions/` interface.
 
Completed! Welcome to the development cycle. Please send any issues you have!

# Features:
## Neptunes Pride Agent
This plugin is a fork of Neptunes Pride Agent which originally contained the previous features:

 - Battle Calculator: When you select a carrier, if the carrier is headed for an enemy star, displays a battle calculator. Accounts for you and your opponent’s current weapons tech, manufacturing tech, and industry.
 - Scanning Range Timer: Displays scanning range time in green when you select an enemy star if that enemy cannot yet see your carrier, and in grey if that enemy can already see your carrier.
 - Carrier Linking in Chat:  [[Carrier Name]] text in messages now links to the fleet, so that when the message recipient clicks on the fleet you’re referring to their map view is navigated to show it, the same way that [[Star Name]] or [[Player Number]] works in the base game.
 - API Sharing:  When you type [[api:APIKEY]] into a message it will convert it into a button that allows you (or other users of this extension in your message) to either see their scans or merge both scans.
 - Hotkeys:  Check out @Osric’s original post 2 to learn more.

New features only available on Stoned Ape Tools 3:

 - Ledger (hotkey ‘m’):  Adds a row to the menu titled ‘Ledger’. When clicked tabulates then displays a ledger of debt owed between you and anyone you’ve traded tech or cash with so far in the game. Accurately shows you who you owe money to, who owes you money, and how much money is owed. If you owe someone else money, displays a button to repay the debt owed.
 - Quick Tech Trading: Adds 2 buttons to other players’ Empire pages:
‘Share All Tech’ button allows you to share all the tech you have that another player does not in one easy click.
 - ‘Pay for All Tech’ button allows you to send the cash required for another player to send you all the tech they have that you don’t in one easy click (and without having to do any math!).
 - Research ETA Chat Button: Adds a button to chat between ‘Back’ and ‘Send’ titled ‘Research’. When clicked pastes your current research tech and your next research tech into the chat input box.
 - Forgive debt button for ledger to allow you to forgive debt owed to you.
 - Ignore debt button for ledger to allow you to ignore debt you owe.
 - Automatic API merging on refresh for any previously shared API.
Example:
Now: Experimentation 2 - 5 ticks.
Next: Weapons 2 - 24 ticks.

## Future Features
Future features (not guaranteed):

 - Tracking of enemy carriers who have entered, then exited, your scanning range.
 - The option to see how expensive it will be to build the science needed to research something in a given time.
 - When the extension recognizes the format of its own research update text, provide a live update for that research.
 - Mark AI with a reminder of every fourth tick after they became AI (ie the only ticks when AI make moves).
 - Automatically create a timelapse, probably by integrating this tool 2 by @olus2000.
 - Improvement to bulk tech upgrading. 1
 - Firefox. This one is unlikely to happen, unfortunately. Maybe if someone else wanted to take up the task… 
 - Your suggestions! See @Lorentz in the discord or forum.
# Previous Description


Stoned ape tools.
Tools that only a stoned ape could use.
For stoned ape use. 



