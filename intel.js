console.log("Intel script injected.");

linkFleets = function() {
	let universe = NeptunesPride.universe;
	let fleets = NeptunesPride.universe.galaxy.fleets;
	for (const f in fleets) {
		let fleet = fleets[f];
		let fleetLink = "<a onClick='Crux.crux.trigger(\"show_fleet_uid\", \"" + fleet.uid + "\")'>" + fleet.n + "</a>";
		universe.hyperlinkedMessageInserts[fleet.n] = fleetLink;
	}
};

Mousetrap.bind("*", function() {
	let output = [];
	let players = NeptunesPride.universe.galaxy.players;
	let stars = NeptunesPride.universe.galaxy.stars;
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
	navigator.clipboard.writeText(output.join("\n"));
});

let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
Mousetrap.bind("^", function() {
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
			let dx = stars[stop].x - fleet.x;
			let dy = stars[stop].y - fleet.y;
			let distance = Math.sqrt(dx*dx + dy*dy);
			let ticks = 0;
			let remaining = distance;
			while (remaining > 0) {
				remaining -= NeptunesPride.universe.galaxy.fleet_speed;
				ticks += 1;
			}
			let day = wday;
			let adjust = 0;

      if (hour + ticks > 24) {
          day += 1;
          adjust -= 24;
			}
      let ampm = "AM"
      if (hour + ticks + adjust > 12) {
        adjust -= 12
        ampm = "PM"
			}
      flights.push([ticks, "[[{5}]] [[{0}]] {6} → [[{1}]] {2} @ {3}{4}".format(fleet.n, stars[stop]['n'], days[day], hour + ticks + adjust, ampm, fleet.puid, fleet.st)]);

		}
	}
	flights = flights.sort(function(a, b) { return a[0] - b[0]; });
	navigator.clipboard.writeText(flights.map(x => x[1]).join("\n"));
});

let fleetOutcomes = {};
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
      flights.push([ticks, "[[{0}]] [[{1}]] {2} → [[{3}]] {4}".format(
      	fleet.puid, fleet.n, fleet.st, stars[stop]['n'], tickToEtaString(ticks)
			), fleet]);
		}
	}
	flights = flights.sort(function(a, b) { return a[0] - b[0]; });
	let starstate = {};
	let output = [];
	for (const i in flights) {
		let fleet = flights[i][2];
		if (fleet.orbiting) {
			let orbit = fleet.orbiting.uid;
			if (!starstate[orbit]) {
				starstate[orbit] = { last_updated: 0, ships: stars[orbit].totalDefenses, puid: stars[orbit].puid };
			}
			// This fleet is departing this tick; remove it from the origin star's totalDefenses
			starstate[orbit].ships -= fleet.st;
		}
	}
	for (const i in flights) {
		let fleet = flights[i][2];
		let star = fleet.o[0][1];
		let tick = flights[i][0];
		let etaString = flights[i][1];
		output.push(flights[i][1]);
		//output.push("Step {0} at tick {1} star [[{2}]] ({3})".format(i, flights[i][0], stars[star].n, star));
		if (!starstate[star]) {
			starstate[star] = { last_updated: 0, ships: stars[star].totalDefenses, puid: stars[star].puid };
		}
		let tickDelta = tick - starstate[star].last_updated;
		if (tickDelta > 1) {
			let oldShips = starstate[star].ships;
			starstate[star].last_updated = tick - 1;
			if (stars[star].shipsPerTick) {
				starstate[star].ships += stars[star].shipsPerTick * tickDelta;
				output.push("  {0} + {2}/h = {1}".format(oldShips, starstate[star].ships, stars[star].shipsPerTick));
			}
		}
		if (fleet.puid == starstate[star].puid || starstate[star].puid == -1) {
			let oldShips = starstate[star].ships;
			if (starstate[star].puid == -1) {
				starstate[star].ships = fleet.st;
			} else {
				starstate[star].ships += fleet.st;
			}
			let landingString = "  {0} + {2} landing = {1}".format(oldShips, starstate[star].ships, fleet.st);
			output.push(landingString);
			landingString = landingString.substring(2);
			let outcomeString = "{0} ships on {1}".format(Math.floor(starstate[star].ships), stars[star].n);
			fleetOutcomes[fleet.uid] = { eta: tickToEtaString(fleet.etaFirst), outcome: outcomeString };
		} else {
			let defense = starstate[star].ships;
			let offense = fleet.st;
			let awt = players[fleet.puid].tech.weapons.level;
			let dwt = players[starstate[star].puid].tech.weapons.level;
			output.push("  Combat! [[{0}]] vs [[{1}]]".format(starstate[star].puid, fleet.puid));
			output.push("    Defenders {0} ships, WS {1}".format(defense, dwt));
			output.push("    Attackers {0} ships, WS {1}".format(offense, awt));
			//output.push("  Combat {4} [[{0}]] WS {1} defends vs {5} [[{2}]] WS {3}".format(starstate[star].puid, dwt, fleet.puid, awt, 
					//defense, offense));
			dwt += 1;
			while (defense > 0 && offense > 0) {
				offense -= dwt;
				if (offense <= 0) break;
				defense -= awt;
			}
			let outcomeString = "ERROR";
			if (defense > offense) {
				starstate[star].ships = defense;
				outcomeString = "Loses; {0} live".format(Math.trunc(defense));
			} else {
				starstate[star].puid = fleet.puid;
				starstate[star].ships = offense;
				output.push("  Attackers win with {0} ships remaining".format(offense));
				outcomeString = "Wins; {0} arrive!".format(offense);
			}
			let combatString = "  [[{0}]] wins ({1} ships)".format(starstate[star].puid, starstate[star].ships);
			output.push(combatString);
			fleetOutcomes[fleet.uid] = { eta: tickToEtaString(fleet.etaFirst), outcome: outcomeString };
		}
	}
	return output;
}

Mousetrap.bind("&", function() { navigator.clipboard.writeText(combatOutcomes().join("\n")); });

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
let tickToEtaString = function(tick) {
	let now = new Date();
	let msplus = msToTick(tick);
	let arrival = new Date(now.getTime() + msplus);
	let ttt = "ETA " + ampm(arrival.getHours(), arrival.getMinutes());
	if (arrival.getDay() != now.getDay())
		ttt = "ETA " + days[arrival.getDay()] + " @ " + ampm(arrival.getHours(), arrival.getMinutes());
	return ttt;
}

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

let loadHooks = function() {
	let superDrawText = NeptunesPride.npui.map.drawText;
	NeptunesPride.npui.map.drawText = function() {
		let universe = NeptunesPride.universe;
		let stars = NeptunesPride.universe.galaxy.stars;
		let map = NeptunesPride.npui.map;
		superDrawText();
		if  (universe.selectedFleet && universe.selectedFleet.path.length > 0) {
			map.context.font = "bolder " + (14 * map.pixelRatio) + "px OpenSansRegular, sans-serif";
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
			combatOutcomes();
			let s = fleetOutcomes[universe.selectedFleet.uid].eta;
			let o = fleetOutcomes[universe.selectedFleet.uid].outcome;
			let x = map.worldToScreenX(universe.selectedFleet.x) + offsetx;
			let y = map.worldToScreenY(universe.selectedFleet.y) + offsety;
			drawOverlayString(map.context, s, x, y);
			drawOverlayString(map.context, o, x, y + lineHeight);
		}
		if (universe.timeToTick(1).length < 3) {
			let lineHeight = 16 * map.pixelRatio;
			map.context.font = "bolder " + (14 * map.pixelRatio) + "px OpenSansRegular, sans-serif";
			map.context.fillStyle = "#FF0000";
			map.context.textAlign = "left";
			map.context.textBaseline = "middle";
			let s = "Tick < 10s away!";
			if (universe.timeToTick(1) === '0s') {
				s = "Tick passed. Click production countdown to refresh.";
			}
			drawOverlayString(map.context, s, 1000, lineHeight);
		}
		if (universe.selectedStar && universe.selectedStar.puid != universe.player.uid) {
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
	}
}

if (NeptunesPride.universe && NeptunesPride.universe.galaxy && NeptunesPride.npui.map) {
	console.log("Universe already loaded. Hyperlink fleets & load hooks.");
	linkFleets();
	loadHooks();
} else {
	let superOnServerResponse = NeptunesPride.np.onServerResponse;
	NeptunesPride.np.onServerResponse = function(response) {
		superOnServerResponse(response);
		if (response.event === "order:player_achievements") {
			console.log("Universe received. Hyperlink fleets.");
			linkFleets();
			loadHooks();
		}
	}
}

