// ==UserScript==
// @name        Neptune's Pride Agent
// @description HUD and reporting for Neptune's Pride.
// @match       https://np.ironhelmet.com/*
// @version     MAJOR_VERSION.MINOR_VERSION
// @updateURL   https://bitbucket.org/osrictheknight/iosnpagent/raw/HEAD/intel.js
// ==/UserScript==


function NeptunesPrideAgent() {
	let title = (document && document.currentScript && document.currentScript.title) || "Neptune's Pride Agent vMAJOR_VERSION.MINOR_VERSIONu";
	let version = title.replace(/^.*v/, 'v');
	console.log(title);

	let hotkeys = [];
	let hotkey = function(key, action) {
		hotkeys.push([key, action]);
		Mousetrap.bind(key, action);
	}

	if (!String.prototype.format) {
		String.prototype.format = function() {
			var args = arguments;
			return this.replace(/{(\d+)}/g, function(match, number) { 
				if (typeof args[number] === 'number') {
					return Math.trunc(args[number]*1000)/1000;
				}
				return typeof args[number] != 'undefined'
					? args[number]
					: match
				;
			});
		};
	}

	var lastClip = "Error";
	let clip = function(text) {
		lastClip = text;
		navigator.clipboard.writeText(text);
	}

	linkFleets = function() {
		let universe = NeptunesPride.universe;
		let fleets = NeptunesPride.universe.galaxy.fleets;

		for (const f in fleets) {
			let fleet = fleets[f];
			let fleetLink = "<a onClick='Crux.crux.trigger(\"show_fleet_uid\", \"" + fleet.uid + "\")'>" + fleet.n + "</a>";
			universe.hyperlinkedMessageInserts[fleet.n] = fleetLink;
		}
	};

	function starReport() {
		let players = NeptunesPride.universe.galaxy.players;
		let stars = NeptunesPride.universe.galaxy.stars;

		let output = [];
		for (const p in players) {
			let player = players[p];
			output.push("[[{0}]]".format(p));
			for (const s in stars) {
				let star = stars[s];
				if (star.puid == p && star.shipsPerTick >= 0) {
					output.push("  [[{0}]] {1}/{2}/{3} {4} ships".format(star.n, star.e, star.i, star.s, star.totalDefenses));
				}
			}
		}
		clip(output.join("\n"));
	};
	hotkey("*", starReport);
	starReport.help = "Generate a report on all stars in your scanning range, and copy it to the clipboard." +
		"<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.";

	let ampm = function(h, m) {
		if (m < 10)
			m = "0" + m;
		if (h < 12) {
			if (h == 0) h = 12;
			return "{0}:{1} AM".format(h, m);
		} else if (h > 12) {
			return "{0}:{1} PM".format(h-12, m);
		}
		return "{0}:{1} PM".format(h, m);
	}

	let msToTick = function (tick, wholeTime) {
		let universe = NeptunesPride.universe;
		var ms_since_data = 0;
		var tf = universe.galaxy.tick_fragment;
		var ltc = universe.locTimeCorrection;

		if (!universe.galaxy.paused) {
				ms_since_data = new Date().valueOf() - universe.now.valueOf();
		}

		if (wholeTime || universe.galaxy.turn_based) {
				ms_since_data = 0;
				tf = 0;
				ltc = 0;
		}

		var ms_remaining = (tick * 1000 * 60 * universe.galaxy.tick_rate) -
						(tf * 1000 * 60  * universe.galaxy.tick_rate) -
						ms_since_data - ltc ;
		return ms_remaining;
	}

	let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	let msToEtaString = function(msplus, prefix) {
		let now = new Date();
		let arrival = new Date(now.getTime() + msplus);
		let p = prefix !== undefined ? prefix : "ETA ";
		let ttt = p + ampm(arrival.getHours(), arrival.getMinutes());
		if (arrival.getDay() != now.getDay())
			ttt = p + days[arrival.getDay()] + " @ " + ampm(arrival.getHours(), arrival.getMinutes());
		return ttt;
	}
	let tickToEtaString = function(tick, prefix) {
		let msplus = msToTick(tick);
		return msToEtaString(msplus, prefix);
	}

	let fleetOutcomes = {};
	let combatHandicap = 0;
	let combatOutcomes = function() {
		let universe = NeptunesPride.universe;
		let players = NeptunesPride.universe.galaxy.players;
		let fleets = NeptunesPride.universe.galaxy.fleets;
		let stars = NeptunesPride.universe.galaxy.stars;
		let now = new Date();
		let wday = now.getDay();
		let hour = now.getHours();
		let flights = [];
		fleetOutcomes = {};
		for (const f in fleets) {
			let fleet = fleets[f];
			if (fleet.o && fleet.o.length > 0) {
				let stop = fleet.o[0][1];
				let ticks = fleet.etaFirst;
				let starname = stars[stop] && stars[stop].n;
				if (!starname) {
					continue;
				}
				flights.push([ticks, "[[{0}]] [[{1}]] {2} → [[{3}]] {4}".format(
					fleet.puid, fleet.n, fleet.st, starname, tickToEtaString(ticks)
				), fleet]);
			}
		}
		flights = flights.sort(function(a, b) { return a[0] - b[0]; });
		arrivals = {};
		let output = [];
		let arrivalTimes = [];
		let starstate = {};
		for (const i in flights) {
			let fleet = flights[i][2];
			if (fleet.orbiting) {
				let orbit = fleet.orbiting.uid;
				if (!starstate[orbit]) {
					starstate[orbit] = { last_updated: 0, ships: stars[orbit].totalDefenses, puid: stars[orbit].puid, c: stars[orbit].c };
				}
				// This fleet is departing this tick; remove it from the origin star's totalDefenses
				starstate[orbit].ships -= fleet.st;
			}
			if (arrivalTimes.length === 0 || arrivalTimes[arrivalTimes.length-1] !== flights[i][0]) {
				arrivalTimes.push(flights[i][0]);
			}
			let arrivalKey = [flights[i][0], fleet.o[0][1]];
			if (arrivals[arrivalKey] !== undefined) {
				arrivals[arrivalKey].push(fleet);
			} else {
				arrivals[arrivalKey] = [fleet];
			}
		}
		for (const k in arrivals) {
			let arrival = arrivals[k];
			let ka = k.split(",");
			let tick = ka[0];
			let starId = ka[1];
			if (!starstate[starId]) {
				starstate[starId] = { last_updated: 0, ships: stars[starId].totalDefenses, puid: stars[starId].puid, c: stars[starId].c };
			}
			if (starstate[starId].puid == -1) {
				// assign ownership of the star to the player whose fleet has traveled the least distance
				let minDistance = 10000;
				let owner = -1;
				for (const i in arrival) {
					let fleet = arrival[i];
					let d = universe.distance(stars[starId].x, stars[starId].y, fleet.lx, fleet.ly);
					if (d < minDistance || owner == -1) {
						owner = fleet.puid;
						minDistance = d;
					}
				}
				starstate[starId].puid = owner;
			}
			output.push("{0}: [[{1}]] [[{2}]] {3} ships".format(tickToEtaString(tick, "@"), starstate[starId].puid, stars[starId].n, starstate[starId].ships))
			let tickDelta = tick - starstate[starId].last_updated - 1;
			if (tickDelta > 0) {
				let oldShips = starstate[starId].ships;
				starstate[starId].last_updated = tick - 1;
				if (stars[starId].shipsPerTick) {
					let oldc = starstate[starId].c;
					starstate[starId].ships += stars[starId].shipsPerTick * tickDelta + oldc;
					starstate[starId].c = starstate[starId].ships - Math.trunc(starstate[starId].ships);
					starstate[starId].ships -= starstate[starId].c;
					output.push("  {0}+{3} + {2}/h = {1}+{4}".format(oldShips, starstate[starId].ships, stars[starId].shipsPerTick, oldc, starstate[starId].c));
				}
			}
			for (const i in arrival) {
				let fleet = arrival[i];
				if (fleet.puid == starstate[starId].puid || starstate[starId].puid == -1) {
					let oldShips = starstate[starId].ships;
					if (starstate[starId].puid == -1) {
						starstate[starId].ships = fleet.st;
					} else {
						starstate[starId].ships += fleet.st;
					}
					let landingString = "  {0} + {2} on [[{3}]] = {1}".format(oldShips, starstate[starId].ships, fleet.st, fleet.n);
					output.push(landingString);
					landingString = landingString.substring(2);
				}
			}
			for (const i in arrival) {
				let fleet = arrival[i];
				if (fleet.puid == starstate[starId].puid) {
					let outcomeString = "{0} ships on {1}".format(Math.floor(starstate[starId].ships), stars[starId].n);
					fleetOutcomes[fleet.uid] = { eta: tickToEtaString(fleet.etaFirst), outcome: outcomeString };
				}
			}
			let awt = 0;
			let offense = 0;
			let contribution = {};
			for (const i in arrival) {
				let fleet = arrival[i];
				if (fleet.puid != starstate[starId].puid) {
					let olda = offense;
					offense += fleet.st;
					output.push("  [[{4}]]! {0} + {2} on [[{3}]] = {1}".format(olda, offense, fleet.st, fleet.n, fleet.puid));
					contribution[[fleet.puid,fleet.uid]] = fleet.st;
					let wt = players[fleet.puid].tech.weapons.level;
					if (wt > awt) {
						awt = wt;
					}
				}
			}
			let attackersAggregate = offense;
			while (offense > 0) {
				let dwt = players[starstate[starId].puid].tech.weapons.level;
				let defense = starstate[starId].ships;
				output.push("  Combat! [[{0}]] defending".format(starstate[starId].puid));
				output.push("    Defenders {0} ships, WS {1}".format(defense, dwt));
				output.push("    Attackers {0} ships, WS {1}".format(offense, awt));
				dwt += 1;
				if (starstate[starId].puid !== universe.galaxy.player_uid) {
					if (combatHandicap > 0) {
						dwt += combatHandicap;
						output.push("    Defenders WS{0} = {1}".format(handicapString(""), dwt));
					} else {
						awt -= combatHandicap;
						output.push("    Attackers WS{0} = {1}".format(handicapString(""), awt));
					}
				} else {
					if (combatHandicap > 0) {
						awt += combatHandicap;
						output.push("    Attackers WS{0} = {1}".format(handicapString(""), awt));
					} else {
						dwt -= combatHandicap;
						output.push("    Defenders WS{0} = {1}".format(handicapString(""), dwt));
					}
				}

				if (universe.galaxy.player_uid === starstate[starId].puid) {
					// truncate defense if we're defending to give the most
					// conservative estimate
					defense = Math.trunc(defense);
				}
				while (defense > 0 && offense > 0) {
					offense -= dwt;
					if (offense <= 0) break;
					defense -= awt;
				}

				let outcomeString = "ERROR";
				let newAggregate = 0;
				let playerContribution = {};
				let biggestPlayer = -1;
				let biggestPlayerId = starstate[starId].puid;
				if (offense > 0) {
					output.push("  Attackers win with {0} ships remaining".format(offense));
					for (const k in contribution) {
						let ka = k.split(",");
						let fleet = fleets[ka[1]];
						let playerId = ka[0];
						contribution[k] = offense * contribution[k] / attackersAggregate;
						let olda = newAggregate;
						newAggregate += contribution[k];
						if (playerContribution[playerId]) {
							playerContribution[playerId] += contribution[k];
						} else {
							playerContribution[playerId] = contribution[k];
						}
						if (playerContribution[playerId] > biggestPlayer) {
							biggestPlayer = playerContribution[playerId];
							biggestPlayerId = playerId;
						}
						output.push("    [[{0}]] has {1} on [[{2}]]".format(fleet.puid, contribution[k], fleet.n));
						let outcomeString = "Wins! {0} land.".format(contribution[k]);
						fleetOutcomes[fleet.uid] = { eta: tickToEtaString(fleet.etaFirst), outcome: outcomeString };
					}
					offense = newAggregate - playerContribution[biggestPlayerId];
					starstate[starId].puid = biggestPlayerId;
					starstate[starId].ships = playerContribution[biggestPlayerId];
				} else {
					starstate[starId].ships = defense;
					for (const i in arrival) {
						let fleet = arrival[i];
						if (fleet.puid == starstate[starId].puid) {
							let outcomeString = "{0} ships on {1}".format(Math.floor(starstate[starId].ships), stars[starId].n);
							fleetOutcomes[fleet.uid] = { eta: tickToEtaString(fleet.etaFirst), outcome: outcomeString };
						}
					}
					for (const k in contribution) {
						let ka = k.split(",");
						let fleet = fleets[ka[1]];
						let outcomeString = "Loses! {0} live.".format(defense);
						fleetOutcomes[fleet.uid] = { eta: tickToEtaString(fleet.etaFirst), outcome: outcomeString };
					}
				}
				attackersAggregate = offense;
			}
			output.push("  [[{0}]] [[{1}]] {2} ships".format(starstate[starId].puid, stars[starId].n, starstate[starId].ships));
		}
		return output;
	}

	function incCombatHandicap() {
		combatHandicap += 1;
	}
	function decCombatHandicap() {
		combatHandicap -= 1;
	}
	hotkey(".", incCombatHandicap);
	incCombatHandicap.help = "Change combat calculation to credit your enemies with +1 weapons. Useful " + 
		"if you suspect they will have achieved the next level of tech before a battle you are investigating." +
		"<p>In the lower left of the HUD, an indicator will appear reminding you of the weapons adjustment. If the " +
		"indicator already shows an advantage for defenders, this hotkey will reduce that advantage first before crediting " + 
		"weapons to your opponent.";
	hotkey(",", decCombatHandicap);
	decCombatHandicap.help = "Change combat calculation to credit yourself with +1 weapons. Useful " + 
		"when you will have achieved the next level of tech before a battle you are investigating." +
		"<p>In the lower left of the HUD, an indicator will appear reminding you of the weapons adjustment. When " +
		"indicator already shows an advantage for attackers, this hotkey will reduce that advantage first before crediting " + 
		"weapons to you.";

	function longFleetReport() { 
		clip(combatOutcomes().join("\n")); 
	}
	hotkey("&", longFleetReport);
	longFleetReport.help = "Generate a detailed fleet report on all carriers in your scanning range, and copy it to the clipboard." +
		"<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.";

	function briefFleetReport() {
		let universe = NeptunesPride.universe;
		let fleets = NeptunesPride.universe.galaxy.fleets;
		let stars = NeptunesPride.universe.galaxy.stars;
		let now = new Date();
		let wday = now.getDay();
		let hour = now.getHours();
		let flights = [];
		for (const f in fleets) {
			let fleet = fleets[f];
			if (fleet.o && fleet.o.length > 0) {
				let stop = fleet.o[0][1];
				if (stars[stop] === undefined) continue;
				let dx = stars[stop].x - fleet.x;
				let dy = stars[stop].y - fleet.y;
				let distance = Math.sqrt(dx*dx + dy*dy);
				let ticks = 0;
				let remaining = distance;
				while (remaining > 0) {
					remaining -= NeptunesPride.universe.galaxy.fleet_speed;
					ticks += 1;
				}
				flights.push([ticks, "[[{0}]] [[{1}]] {2} → [[{3}]] {4}".format(fleet.puid, fleet.n, fleet.st, stars[stop].n, tickToEtaString(ticks, ""))]);
			}
		}
		flights = flights.sort(function(a, b) { return a[0] - b[0]; });
		clip(flights.map(x => x[1]).join("\n"));
	};

	hotkey("^", briefFleetReport);
	briefFleetReport.help = "Generate a summary fleet report on all carriers in your scanning range, and copy it to the clipboard." +
		"<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.";

	function screenshot() {
		let map = NeptunesPride.npui.map;
		clip(map.canvas[0].toDataURL('image/webp', 0.05));
	}

	hotkey("#", screenshot);
	screenshot.help = "Create a data: URL of the current map. Paste it into a browser window to view. This is likely to be removed.";

	let homePlanets = function() {
		let p = NeptunesPride.universe.galaxy.players; 
		let output = [];
		for (i in p) { 
			let home = p[i].home;
			if (home) {
				output.push("Player #{0} is [[{0}]] home {2} [[{1}]]".format(i, home.n, i == home.puid ? "is" : "was")) 
			} else {
				output.push("Player #{0} is [[{0}]] home unknown".format(i)) 
			}
		}
		clip(output.join("\n"));
	}
	hotkey("!", homePlanets);
	homePlanets.help = "Generate a player summary report and copy it to the clipboard." +
		"<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown. " + 
		"It is most useful for discovering player numbers so that you can write [[#]] to reference a player in mail.";

	let drawOverlayString = function(context, s, x, y, fgColor) {
			context.fillStyle = "#000000";
			for (let smear = 1; smear < 4; ++smear) {
				context.fillText(s, x+smear, y+smear);
				context.fillText(s, x-smear, y+smear);
				context.fillText(s, x-smear, y-smear);
				context.fillText(s, x+smear, y-smear);
			}
			context.fillStyle = fgColor || "#00ff00";
			context.fillText(s, x, y);
	}

	let anyStarCanSee = function(owner, fleet) {
		let stars = NeptunesPride.universe.galaxy.stars;
		let universe = NeptunesPride.universe;
		let scanRange = universe.galaxy.players[owner].tech.scanning.value;
		for (const s in stars) {
			let star = stars[s];
			if (star.puid == owner) {
				let distance = universe.distance(star.x, star.y, fleet.x, fleet.y);
				if (distance <= scanRange) {
					return true;
				}
			}
		}
		return false;
	}

	let hooksLoaded = false;
	let handicapString = function(prefix) {
		let p = prefix !== undefined ? prefix : ((combatHandicap > 0) ? "Enemy WS" : "My WS");;
		return p + (combatHandicap > 0 ? "+" : "") + combatHandicap 
	}
	let loadHooks = function() {
		let superDrawText = NeptunesPride.npui.map.drawText;
		NeptunesPride.npui.map.drawText = function() {
			let universe = NeptunesPride.universe;
			let stars = NeptunesPride.universe.galaxy.stars;
			let map = NeptunesPride.npui.map;
			superDrawText();

			map.context.font = (14 * map.pixelRatio) + "px OpenSansRegular, sans-serif";
			map.context.fillStyle = "#FF0000";
			map.context.textAlign = "right";
			map.context.textBaseline = "middle";
			let v = version;
			if (combatHandicap !== 0) {
				v = handicapString() + " " + v;
			}
			drawOverlayString(map.context, v, map.viewportWidth - 10, map.viewportHeight - 16 * map.pixelRatio);
			if (NeptunesPride.originalPlayer === undefined) {
				NeptunesPride.originalPlayer = universe.player.uid;
			}
			if (NeptunesPride.originalPlayer !== universe.player.uid) {
				let n = universe.galaxy.players[universe.player.uid].alias;
				drawOverlayString(map.context, n, map.viewportWidth - 100, map.viewportHeight - 2 * 16 * map.pixelRatio);
			}

			if  (universe.selectedFleet && universe.selectedFleet.path.length > 0) {
				//console.log("Selected fleet", universe.selectedFleet);
				map.context.font = (14 * map.pixelRatio) + "px OpenSansRegular, sans-serif";
				map.context.fillStyle = "#FF0000";
				map.context.textAlign = "left";
				map.context.textBaseline = "middle";
				let dy = universe.selectedFleet.y - universe.selectedFleet.ly;
				let dx = universe.selectedFleet.x - universe.selectedFleet.lx;
				dy = universe.selectedFleet.path[0].y - universe.selectedFleet.y;
				dx = universe.selectedFleet.path[0].x - universe.selectedFleet.x;
				let lineHeight = 16 * map.pixelRatio;
				let radius = 2 * 0.028 * map.scale * map.pixelRatio;
				let angle = Math.atan(dy/dx);
				let offsetx = radius*Math.cos(angle);
				let offsety = radius*Math.sin(angle);
				if (offsetx > 0 && dx > 0) {
					offsetx *= -1;
				}
				if (offsety > 0 && dy > 0) {
					offsety *= -1;
				}
				if (offsetx < 0 && dx < 0) {
					offsetx *= -1;
				}
				if (offsety < 0 && dy < 0) {
					offsety *= -1;
				}
				combatOutcomes();
				let s = fleetOutcomes[universe.selectedFleet.uid].eta;
				let o = fleetOutcomes[universe.selectedFleet.uid].outcome;
				let x = map.worldToScreenX(universe.selectedFleet.x) + offsetx;
				let y = map.worldToScreenY(universe.selectedFleet.y) + offsety;
				if (offsetx < 0) {
					map.context.textAlign = "right";
				}
				drawOverlayString(map.context, s, x, y);
				drawOverlayString(map.context, o, x, y + lineHeight);
			}
			if (universe.timeToTick(1).length < 3) {
				let lineHeight = 16 * map.pixelRatio;
				map.context.font = (14 * map.pixelRatio) + "px OpenSansRegular, sans-serif";
				map.context.fillStyle = "#FF0000";
				map.context.textAlign = "left";
				map.context.textBaseline = "middle";
				let s = "Tick < 10s away!";
				if (universe.timeToTick(1) === '0s') {
					s = "Tick passed. Click production countdown to refresh.";
				}
				drawOverlayString(map.context, s, 1000, lineHeight);
			}
			if (universe.selectedStar && universe.selectedStar.puid != universe.player.uid && universe.selectedStar.puid !== -1) {
				// enemy star selected; show HUD for scanning visibility
				map.context.textAlign = "left";
				map.context.textBaseline = "middle";
				let xOffset = 26 * map.pixelRatio;
				//map.context.translate(xOffset, 0);
				let fleets = NeptunesPride.universe.galaxy.fleets;
				for (const f in fleets) {
					let fleet = fleets[f];
					if (fleet.puid === universe.player.uid) {
						let dx = universe.selectedStar.x - fleet.x;
						let dy = universe.selectedStar.y - fleet.y;
						let distance = Math.sqrt(dx*dx + dy*dy);
						let offsetx = xOffset;
						let offsety = 0;
						let x = map.worldToScreenX(fleet.x) + offsetx;
						let y = map.worldToScreenY(fleet.y) + offsety;
						if (distance > universe.galaxy.players[universe.selectedStar.puid].tech.scanning.value) {
							if (fleet.path && fleet.path.length > 0) {
								dx = fleet.path[0].x - universe.selectedStar.x;
								dy = fleet.path[0].y - universe.selectedStar.y;
								distance = Math.sqrt(dx*dx + dy*dy);
								if (distance < universe.galaxy.players[universe.selectedStar.puid].tech.scanning.value) {
									let stepRadius = NeptunesPride.universe.galaxy.fleet_speed;
									if (fleet.warpSpeed) stepRadius *= 3;
									dx = fleet.x - fleet.path[0].x;
									dy = fleet.y - fleet.path[0].y;
									let angle = Math.atan(dy/dx);
									let stepx = stepRadius*Math.cos(angle);
									let stepy = stepRadius*Math.sin(angle);
									if (stepx > 0 && dx > 0) {
										stepx *= -1;
									}
									if (stepy > 0 && dy > 0) {
										stepy *= -1;
									}
									if (stepx < 0 && dx < 0) {
										stepx *= -1;
									}
									if (stepy < 0 && dy < 0) {
										stepy *= -1;
									}
									let ticks = 0;
									do {
										let x = ticks*stepx + Number(fleet.x);
										let y = ticks*stepy + Number(fleet.y);
										//let sx = map.worldToScreenX(x);
										//let sy = map.worldToScreenY(y);
										dx = x - universe.selectedStar.x;
										dy = y - universe.selectedStar.y;
										distance = Math.sqrt(dx*dx + dy*dy);
										//console.log(distance, x, y);
										//drawOverlayString(map.context, "o", sx, sy);
										ticks += 1;
									} while (distance > universe.galaxy.players[universe.selectedStar.puid].tech.scanning.value && ticks <= fleet.etaFirst + 1);
									ticks -= 1;
									let visColor = "#00ff00";
									if (anyStarCanSee(universe.selectedStar.puid, fleet)) {
										visColor = "#888888";
									}
									drawOverlayString(map.context, "Scan " + tickToEtaString(ticks), x, y, visColor);
								}
							}
						}
					}
				}
				//map.context.translate(-xOffset, 0);
			}
			if (universe.ruler.stars.length == 2) {
				let p1 = universe.ruler.stars[0].puid;
				let p2 = universe.ruler.stars[1].puid;
				if (p1 !== p2 && p1 !== -1 && p2 !== -1) {
					//console.log("two star ruler");
				}
			}
		}
		Crux.format = function (s, templateData) {
			if (!s) {
					return "error";
			}
			var i, fp, sp, sub, pattern;

			i = 0;
			fp = 0;
			sp = 0;
			sub = "";
			pattern = "";

			// look for standard patterns
			while (fp >= 0 && i < 1000) {
					i = i + 1;
					fp = s.search("\\[\\[");
					sp = s.search("\\]\\]");
					sub = s.slice(fp + 2, sp);
					pattern = "[[" + sub + "]]";
					if (templateData[sub] !== undefined) {
							s = s.replace(pattern, templateData[sub]);
					} else if (sub.startsWith("api:")) {
						let apiLink = "<a onClick='Crux.crux.trigger(\"switch_user_api\", \"" + sub + "\")'> View as " + sub + "</a>";
						apiLink += " or <a onClick='Crux.crux.trigger(\"merge_user_api\", \"" + sub + "\")'> Merge " + sub + "</a>";
						s = s.replace(pattern, apiLink);
					} else if (sub.startsWith("data:")) {
						s = s.replace(pattern, '<div width="100%" class="screenshot"><img class="screenshot" src="' + sub + '"/></div>');
					} else {
							s = s.replace(pattern, "(" + sub + ")");
					}
			}
			return s;
		};
    let npui = NeptunesPride.npui;
		NeptunesPride.templates["n_p_a"] = "NP Agent";
		NeptunesPride.templates["npa_report_type"] = "Report Type:";
		NeptunesPride.templates["npa_paste"] = "Intel";
    let superNewMessageCommentBox = npui.NewMessageCommentBox;
		let reportPasteHook = function(e, d) {
			let inbox = NeptunesPride.inbox;
			inbox.commentDrafts[inbox.selectedMessage.key] += "\n" + lastClip;
			inbox.trigger("show_screen", "diplomacy_detail");
		}
		NeptunesPride.np.on("paste_report", reportPasteHook);
    npui.NewMessageCommentBox = function () {
    	let widget = superNewMessageCommentBox();
			let reportButton = Crux.Button("npa_paste", "paste_report", "intel")
					.grid(10, 12, 10, 3)
			reportButton.roost(widget);
    	return widget;
		}
		npaReports = function (screenConfig) {
        npui.onHideScreen(null, true);
        npui.onHideSelectionMenu();

        npui.trigger("hide_side_menu");
        npui.trigger("reset_edit_mode");
        var reportScreen = npui.Screen("n_p_a");

        Crux.Text("", "rel pad12 txt_center col_black  section_title")
            .rawHTML(title)
            .roost(reportScreen);

        var report = Crux.Widget("rel  col_accent")
            .size(480, 48);
        var output = Crux.Widget("rel");

        Crux.Text("npa_report_type", "pad12")
            .roost(report);
        var selections = {
        	"planets": "Home Planets",
        	"fleets": "Fleets (short)",
        	"combats": "Fleets (long)",
        	"stars": "Stars",
        };
        Crux.DropDown("", selections, "exec_report")
            .grid(15,0,15,3)
            .roost(report);

        let text = Crux.Text("", "pad12 rel txt_selectable")
            .size(432)
            .pos(48)

            .rawHTML("Choose a report from the dropdown.");
				text.roost(output);

				report.roost(reportScreen);
				output.roost(reportScreen);

				let reportHook = function(e, d) {
					console.log("Execute report", e, d);
					if (d === "planets") {
						homePlanets();
					} else if (d === "fleets") {
						briefFleetReport();
					} else if (d === "combats") {
						longFleetReport();
					} else if (d === "stars") {
						starReport();
					}
					html = lastClip.replace(/\n/g, '<br>');
					html = NeptunesPride.inbox.hyperlinkMessage(html);
					text.rawHTML(html);
				};
			  reportHook(0, "planets");
				NeptunesPride.np.on("exec_report", reportHook);

        npui.activeScreen = reportScreen;
				reportScreen.roost(npui.screenContainer);
				npui.layoutElement(reportScreen);
    };
		NeptunesPride.np.on("trigger_npa", npaReports);
		npui.SideMenuItem("icon-eye", "n_p_a", "trigger_npa")
            .roost(npui.sideMenu);

		let superFormatTime = Crux.formatTime;
    let relativeTimes = true;
    Crux.formatTime = function (ms, mins, secs) {
    	if (relativeTimes) {
    		return superFormatTime(ms, mins, secs);
			} else {
				return msToEtaString(ms, "");
			}
		}
		let toggleRelative = function() { relativeTimes = !relativeTimes; }
		hotkey("%", toggleRelative);
		toggleRelative.help = "Change the display of ETAs from relative times to absolute clock times. Makes predicting " +
			"important times of day to sign in and check much easier especially for multi-leg fleet movements. Sometimes you " + 
			"will need to refresh the display to see the different times.";
		hooksLoaded = true;
	}

	let init = function() {
		if (NeptunesPride.universe && NeptunesPride.universe.galaxy && NeptunesPride.npui.map) {
			linkFleets();
			console.log("Fleet linking complete.");
			if (!hooksLoaded) {
				loadHooks();
				console.log("HUD setup complete.");
			} else {
				console.log("HUD setup already done; skipping.");
			}
			homePlanets();
		} else {
			console.log("Game not fully initialized yet; wait.", NeptunesPride.universe);
		}
	}
	hotkey("@", init);
	init.help = "Reinitialize Neptune's Pride Agent. Use the @ hotkey if the version is not being shown on the map after dragging.";

	if (NeptunesPride.universe && NeptunesPride.universe.galaxy && NeptunesPride.npui.map) {
		console.log("Universe already loaded. Hyperlink fleets & load hooks.");
		init();
	} else {
		console.log("Universe not loaded. Hook onServerResponse.");
		let superOnServerResponse = NeptunesPride.np.onServerResponse;
		NeptunesPride.np.onServerResponse = function(response) {
			superOnServerResponse(response);
			if (response.event === "order:player_achievements") {
				console.log("Initial load complete. Reinstall.");
				init();
			} else if (response.event === "order:full_universe") {
				console.log("Universe received. Reinstall.");
				NeptunesPride.originalPlayer = NeptunesPride.universe.player.uid;
				init();
			} else if (!hooksLoaded && NeptunesPride.npui.map) {
				console.log("Hooks need loading and map is ready. Reinstall.");
				init();
			}
		}
	}

	var otherUserCode = undefined;
	let game = NeptunesPride.gameNumber;
	let switchUser = function(event, data) {
		if (NeptunesPride.originalPlayer === undefined) {
			NeptunesPride.originalPlayer = NeptunesPride.universe.player.uid;
		}
		let code = (data && data.split(":")[1]) || otherUserCode;
		otherUserCode = code;
		if (otherUserCode) {
			let params = { game_number: game, api_version: "0.1", code: otherUserCode };
			let eggers = jQuery.ajax({ type: 'POST', url: "https://np.ironhelmet.com/api", async: false, data: params, dataType: "json"})
			NeptunesPride.np.onFullUniverse(null, eggers.responseJSON.scanning_data);
			NeptunesPride.npui.onHideScreen(null, true);
			NeptunesPride.np.trigger("select_player", [NeptunesPride.universe.player.uid, true]);
			init();
		}
	}

	let mergeUser = function(event, data) {
		if (NeptunesPride.originalPlayer === undefined) {
			NeptunesPride.originalPlayer = NeptunesPride.universe.player.uid;
		}
		let code = (data && data.split(":")[1]) || otherUserCode;
		otherUserCode = code;
		if (otherUserCode) {
			let params = { game_number: game, api_version: "0.1", code: otherUserCode };
			let eggers = jQuery.ajax({ type: 'POST', url: "https://np.ironhelmet.com/api", async: false, data: params, dataType: "json"})
			let universe = NeptunesPride.universe;
			let scan = eggers.responseJSON.scanning_data;
			universe.galaxy.stars = {...scan.stars, ...universe.galaxy.stars};
			for (s in scan.stars) {
				star = scan.stars[s];
				if (star.v !== "0") {
					universe.galaxy.stars[s] = {...universe.galaxy.stars[s], ...star};
				}
			}
			universe.galaxy.fleets = {...scan.fleets, ...universe.galaxy.fleets};
			NeptunesPride.np.onFullUniverse(null, universe.galaxy);
			NeptunesPride.npui.onHideScreen(null, true);
			init();
		}
	}
	hotkey(">", switchUser);
	switchUser.help = "Switch views to the last user whose API key was used to load data. The HUD shows the current user when " + 
		"it is not your own alias to help remind you that you aren't in control of this user.";
	hotkey("|", mergeUser);
	mergeUser.help = "Merge the latest data from the last user whose API key was used to load data. This is useful after a tick " + 
		"passes and you've reloaded, but you still want the merged scan data from two players onscreen.";
	NeptunesPride.np.on("switch_user_api", switchUser);
	NeptunesPride.np.on("merge_user_api", mergeUser);

  let npaHelp = function() {
		let help = [ "<H1>" + title + "</H1>" ];
		for (pair in hotkeys) {
			let key = hotkeys[pair][0];
			let action = hotkeys[pair][1];
			help.push("<h2>Hotkey: " + key + "</h2>");
			if (action.help) {
				help.push(action.help);
			} else {
				help.push("<p>No documentation yet.<p><code>" + action.toLocaleString() + "</code>");
			}
		}
		NeptunesPride.universe.helpHTML = help.join("");
		NeptunesPride.np.trigger("show_screen", "help");
	}
	npaHelp.help = "Display this help screen.";
	hotkey("?", npaHelp);

	var autocompleteMode = 0;
	let autocompleteTrigger = function(e) {
		if (e.target.type === "textarea") {
			if (autocompleteMode) {
				let start = autocompleteMode;
				let endBracket = e.target.value.indexOf("]", start);
				if (endBracket === -1) endBracket = e.target.value.length;
				let autoString = e.target.value.substring(start, endBracket);
				let key = e.key;
				if (key === "]") {
					autocompleteMode = 0;
					let m = autoString.match(/^[0-9][0-9]*$/);
					if (m && m.length) {
						let puid = Number(autoString);
						let end = e.target.selectionEnd;
						let auto = "" + puid + "]] " + NeptunesPride.universe.galaxy.players[puid].alias;
						e.target.value = e.target.value.substring(0, start) + auto + e.target.value.substring(end, e.target.value.length);
						e.target.selectionStart = start + auto.length;
						e.target.selectionEnd = start + auto.length;
					}
				}
			} else if (e.target.selectionStart > 1) {
				let start = e.target.selectionStart - 2;
				let ss = e.target.value.substring(start, start+2);
				autocompleteMode = ss === "[[" ? e.target.selectionStart : 0;
			}
		}
	}
	document.body.addEventListener('keyup', autocompleteTrigger);

	console.log("Neptune's Pride Agent injection fini.");
}

NeptunesPrideAgent();
