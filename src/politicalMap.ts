// TODO: Are the internal NP interfaces declared elsewhere? These declarations are just the ones I need for now

export interface NP4Galaxy {
  players: { [uid: number]: NP4GalaxyPlayer; };
  stars: { [uid: number]: NP4GalaxyStar}
}

export interface NP4GalaxyPlayer {
  rawAlias: string;
  uid: number;
}

export interface NP4GalaxyStar {
  puid: number;
  uid: number;
  x: number;
  y: number;
  name: string;
}

export interface NPAController {
  worldToScreenX(x: number): number;
  worldToScreenY(y: number): number;
  worldToPixels(d: number): number;
}

export interface Star {
  readonly id: number;
  readonly ownerID: number;
  readonly x: number;
  readonly y: number;
  readonly influenceRange: number;
  readonly exclave: boolean;
};

export interface StarRegion {
  readonly ownerID: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly captionLeft: number;
  readonly captionRight: number;
  readonly starIDs: readonly number[];
}

export interface Player {
  readonly id: number;
  readonly name: string;
}

export class PoliticalMap {
  private starData?: ReturnType<typeof parseRawStarData>;
  private borderCanvas: OffscreenCanvas;
  private borderCanvasDrawingContext: OffscreenCanvasRenderingContext2D;

  public constructor() {
    this.borderCanvas = new OffscreenCanvas(1, 1);
    this.borderCanvasDrawingContext = this.borderCanvas.getContext("2d");
  }

  public updateStarData(galaxy: NP4Galaxy) {
    this.starData = parseRawStarData(galaxy);
  }

  public drawPoliticalMap(drawingContext: CanvasRenderingContext2D, viewportWidth: number, viewportHeight: number, map: NPAController) {
    if (this.borderCanvas.width != viewportWidth || this.borderCanvas.height != viewportHeight) {
      this.borderCanvas = new OffscreenCanvas(viewportWidth, viewportHeight);
      this.borderCanvasDrawingContext = this.borderCanvas.getContext("2d");
    }
    if (this.starData) {
      this.borderCanvasDrawingContext.save();
      this.borderCanvasDrawingContext.clearRect(0, 0, viewportWidth, viewportHeight);

      // Draw star borders for all stars grouped into regions (i.e. not exclave stars)
      for (let star of this.starData.stars) {
        if (!star || star.exclave) continue;
        const playerColor = "#003366FF";
        this.borderCanvasDrawingContext.strokeStyle = playerColor;
        this.borderCanvasDrawingContext.fillStyle = playerColor;
        const screenX = map.worldToScreenX(star.x);
        const screenY = map.worldToScreenY(star.y);
        const radius = map.worldToPixels(star.influenceRange) - 4;
        if (radius <= 0) continue;
        this.borderCanvasDrawingContext.beginPath();
        this.borderCanvasDrawingContext.arc(screenX, screenY, radius, 0, 2 * Math.PI);
        this.borderCanvasDrawingContext.fill();
      }
      this.borderCanvasDrawingContext.strokeStyle = "#FFFFFF";
      this.borderCanvasDrawingContext.fillStyle = "#FFFFFF";
      this.borderCanvasDrawingContext.globalCompositeOperation = "destination-out"
      for (let star of this.starData.stars) {
        if (!star || star.exclave) continue;
        const radius = map.worldToPixels(star.influenceRange) - 8;
        if (radius <= 0) continue;
        const screenX = map.worldToScreenX(star.x);
        const screenY = map.worldToScreenY(star.y);
        this.borderCanvasDrawingContext.beginPath();
        this.borderCanvasDrawingContext.arc(screenX, screenY, radius, 0, 2 * Math.PI);
        this.borderCanvasDrawingContext.fill();
      }

      // Draw star borders for all exclave stars after grouped stars
      this.borderCanvasDrawingContext.globalCompositeOperation = "source-over"
      for (let star of this.starData.stars) {
        if (!star || !star.exclave) continue;
        const playerColor = "#663333";
        this.borderCanvasDrawingContext.strokeStyle = playerColor;
        this.borderCanvasDrawingContext.fillStyle = playerColor;
        const screenX = map.worldToScreenX(star.x);
        const screenY = map.worldToScreenY(star.y);
        const radius = map.worldToPixels(star.influenceRange) - 4;
        if (radius <= 0) continue;
        this.borderCanvasDrawingContext.beginPath();
        this.borderCanvasDrawingContext.arc(screenX, screenY, radius, 0, 2 * Math.PI);
        this.borderCanvasDrawingContext.fill();
      }
      this.borderCanvasDrawingContext.strokeStyle = "#FFFFFF";
      this.borderCanvasDrawingContext.fillStyle = "#FFFFFF";
      this.borderCanvasDrawingContext.globalCompositeOperation = "destination-out"
      for (let star of this.starData.stars) {
        if (!star || !star.exclave) continue;
        const radius = map.worldToPixels(star.influenceRange) - 8;
        if (radius <= 0) continue;
        const screenX = map.worldToScreenX(star.x);
        const screenY = map.worldToScreenY(star.y);
        this.borderCanvasDrawingContext.beginPath();
        this.borderCanvasDrawingContext.arc(screenX, screenY, radius, 0, 2 * Math.PI);
        this.borderCanvasDrawingContext.fill();
      }
      this.borderCanvasDrawingContext.restore();
  
      drawingContext.save();
      drawingContext.drawImage(this.borderCanvas, 0, 0);

      for (let starRegion of this.starData.starRegions) {
        const player = this.starData.players[starRegion.ownerID];
        if (!player) continue;
        const playerCaption = player.name.toLocaleUpperCase().replace(/ /gm, "  ").split("").join("  ");
        const captionHorizontalPadding = 0.1;
        const captionWidth = starRegion.captionRight - starRegion.captionLeft;
        const screenX = map.worldToScreenX(starRegion.captionLeft + captionWidth * captionHorizontalPadding);
        const screenY = map.worldToScreenY(starRegion.centerY);
        const screenWidth = map.worldToPixels(captionWidth * (1.0 - captionHorizontalPadding * 2))
        // if (screenWidth <= 100) continue;
        const minCaptionWidthDisplay = 100;
        const fullBrightCaptionWidthDisplay = Math.min(viewportWidth / 4, 300);
        const captionWidthPartialDisplayRange = fullBrightCaptionWidthDisplay - minCaptionWidthDisplay;
        const brightness = 96;
          // screenWidth > fullBrightCaptionWidthDisplay ? 128 :
          // screenWidth < minCaptionWidthDisplay ? 0 :
          // Math.round((screenWidth - minCaptionWidthDisplay) / captionWidthPartialDisplayRange * 128);
        const metrics = drawingContext.measureText(playerCaption);
        const scaleX = screenWidth / metrics.width;
        drawingContext.font = "italic 12px Century Gothic, Verdana, sans-serif";
        // drawingContext.strokeStyle = `#003366${twoDigitHex(brightness)}`;
        drawingContext.fillStyle = `#FFFFFF${twoDigitHex(brightness)}`;
        drawingContext.save();
        drawingContext.scale(scaleX, scaleX);
        drawingContext.textAlign = "left";
        // drawingContext.strokeText(playerCaption, screenX / scaleX, screenY / scaleX);
        drawingContext.fillText(playerCaption, screenX / scaleX, screenY / scaleX);
        drawingContext.restore();
      }
      drawingContext.restore();
    }
  }
}

export const politicalMap = new PoliticalMap();

function twoDigitHex(val: number) {
  if (val < 16) {
    return "0" + val.toString(16);
  } else {
    return val.toString(16);
  }
}

type WritableStar = { -readonly [P in keyof Star]: Star[P] };

function parseRawStarData(rawStarData: NP4Galaxy) {
  let stars: WritableStar[] = [];

  for (let starID in rawStarData.stars) {
    const nativeStar = rawStarData.stars[starID as unknown as keyof typeof rawStarData.stars] as typeof rawStarData.stars["1"];
    const star = {
      id: nativeStar.uid,
      ownerID: nativeStar.puid,
      x: nativeStar.x,
      y: nativeStar.y,
      lastPendingFleetArrivalTick: 0,
      influenceRange: 10000, // TODO: Make this less arbitrary?
      exclave: nativeStar.puid == -1
    };
    stars[star.id] = star;
  }

  // We use overlapping spheres to create zones of influence for each empire; there may be some
  // mathematically perfect way to calculate this but in the interest of simplicity what we'll do
  // is get a rough distance from each star to its nearest unfriendly star, use that distance to
  // sort the stars in order of largest to smallest distance between friendly and unfriendly, then
  // adjust every overlapping radius back in distance order; the reason we use distance order is
  // because stars that are adjusted back first will mean that stars adjusted later in the process
  // will have more room to grow and we don't want to arbitrarily give a size advantage to stars
  // with either higher or lower IDs

  // First border calculation step is to find the minimum distance to an unaligned star and use
  // that as a starting influence zone; this will produce a large amount of overlap but we can
  // use it to give us something to sort on for other calculations (our algorithm trims back but
  // doesn't allow us to grow to fill gaps)
  initializeInfluenceRadiusToOpponentHalfwayPoint(stars);

  // Default influence distances will produce a lot of gaps because we go halfway to any opponent
  // stars but those stars may have influence ranges that are much smaller; in reverse order
  // (smallest to largest) let's expand the sphere of influence to try to fill these remaining
  // gaps; this will heavily favor individual stars so they show up as large as possible while still
  // allowing large groupings to consolidate as much as possible
  expandInfluenceRadiiToFillGaps(stars);

  // Group the stars based on intersecting influences; this will merge together stars whose influence
  // spheres intersect; because of how we did our prior calculations this wil only include stars that
  // are owned by the same player because we've adjusted influence circles to only go as far as
  // the closest border to an unfriendly star; this will be the initial pass through grouping that we
  // use to identify exclave stars
  const initialStarGroupsByStarID = groupStarsByInfluence(stars);

  // We now want to eliminate individual stars that didn't wind up in groups from further groupings
  // by marking them as exclaves
  let starGroupSet = new Set<number[]>();
  for (let starGroup of Array.from(initialStarGroupsByStarID.values())) {
    starGroupSet.add(starGroup);
  }
  // let nationStarGroups = Array.from(starGroupSet).filter(x => x.length > 1);
  let satelliteStarIDs: number[] = [];
  for (let starGroup of Array.from(starGroupSet).filter(x => x.length <= 1)) {
    satelliteStarIDs.push.apply(satelliteStarIDs, starGroup);
  }
  for (let starID of satelliteStarIDs) {
    stars[starID].exclave = true;
  }

  // Now that we've marked certain owned stars as exclaves, expand the star influence spheres
  // again; this will prevent individual stars from breaking up star regions
  expandInfluenceRadiiToFillGaps(stars);

  // Redo the star grouping with the final influence spheres; this will merge previously split
  // regions that were interrupted due to exclaves
  const starGroupsByStarID = groupStarsByInfluence(stars);
  starGroupSet = new Set<number[]>();
  for (let starGroup of Array.from(starGroupsByStarID.values())) {
    starGroupSet.add(starGroup);
  }

  // Get every star group with more than one star - these are our final nation groups
  let nationStarGroups = Array.from(starGroupSet).filter(x => x.length > 1);

  // For each star ID list, create a star group, calculating the rough weighted center (we'll
  // weight the average based on the size of the influence radius)
  let starRegions: StarRegion[] = [];
  for (let starGroup of nationStarGroups) {
    let x = 0;
    let y = 0;
    let totalInfluence = 0;
    let star: Star;
    for (let starID of starGroup) {
      star = stars[starID];
      x += star.x * star.influenceRange;
      y += star.y * star.influenceRange;
      totalInfluence += star.influenceRange;
    }

    // Now that we have a center, project outward to the left and right until we reach another
    // star; capture the width of that line, and the center will be our new center; we'll use
    // influence boxes instead of circles to simplify the calculation
    const originalCenterX = x / totalInfluence;
    const centerY = y / totalInfluence;
    let minRegionX = originalCenterX;
    let maxRegionX = originalCenterX;
    const ownerID = star.ownerID;
    for (let otherStarID of starGroup) {
      let otherStar = stars[otherStarID];
      if (otherStar.y + otherStar.influenceRange > centerY && otherStar.y - otherStar.influenceRange < centerY) {
        minRegionX = Math.min(otherStar.x - otherStar.influenceRange, minRegionX);
        maxRegionX = Math.max(otherStar.x + otherStar.influenceRange, maxRegionX);
      }
    }
    starRegions.push({
      ownerID,
      centerX: (maxRegionX - minRegionX) / 2 + minRegionX,
      centerY,
      captionLeft: minRegionX,
      captionRight: maxRegionX,
      starIDs: starGroup
    });
  }

  let players: Player[] = [];
  for (let playerID in rawStarData.players) {
    const player = rawStarData.players[playerID];
    players[playerID] = {
      id: player.uid,
      name: player.rawAlias
    };
  }

  return {
    stars: stars as readonly Star[],
    starRegions: starRegions as readonly StarRegion[],
    players: players as readonly Player[]
  };
}

function initializeInfluenceRadiusToOpponentHalfwayPoint(stars: WritableStar[]) {
  for (let starID = 0; starID < stars.length; starID++) {
    const star = stars[starID];
    if (!star) continue;
    if (star.ownerID == -1) {
      star.influenceRange = 0;
      continue;
    }
    for (let otherStarID = starID + 1; otherStarID < stars.length; otherStarID++) {
      const otherStar = stars[otherStarID];
      if (otherStar && otherStar.ownerID != star.ownerID) {
        const otherStarOffsetX = otherStar.x - star.x;
        const otherStarOffsetY = otherStar.y - star.y;
        const otherStarDistance = Math.sqrt(otherStarOffsetX * otherStarOffsetX + otherStarOffsetY * otherStarOffsetY);
        const influenceRange = otherStar.ownerID == -1 ? otherStarDistance * 9 / 10 : otherStarDistance / 2;
        star.influenceRange = Math.min(star.influenceRange, influenceRange);
        otherStar.influenceRange = Math.min(otherStar.influenceRange, influenceRange);
      }
    }
  }
}

function groupStarsByInfluence(stars: Star[]) {
  // Try to get a list of regions so we can put a label on the screen in the rough center of
  // any larger regions; we start by creating region objects that contain every star
  const groupedStarIDs = new Map<number, number[]>();
  for (let starID = 0; starID < stars.length; starID++) {
    const star = stars[starID];
    if (!star) continue;

    // We might have been included as part of another star group already; if we are we'll start
    // with that group
    let starGroup = groupedStarIDs.get(starID);
    if (!starGroup) {
      starGroup = [starID];
      groupedStarIDs.set(starID, starGroup);
    }

    // Loop through other stars after this one (prior stars will already have matched to us)
    for (let otherStarID = starID + 1; otherStarID < stars.length; otherStarID++) {
      const otherStar = stars[otherStarID];
      if (!otherStar || otherStar.ownerID != star.ownerID) continue;
      const otherStarOffsetX = otherStar.x - star.x;
      const otherStarOffsetY = otherStar.y - star.y;
      const otherStarDistance = Math.sqrt(otherStarOffsetX * otherStarOffsetX + otherStarOffsetY * otherStarOffsetY);
      const totalInfluenceRadius = star.influenceRange + otherStar.influenceRange;
      if (totalInfluenceRadius > otherStarDistance) {
        // If we get here, the two stars are within range; the merged group needs to include all
        // stars in both groups, and any star in the first and second group should all point to
        // the new merged group; note that if we were already matched the other star group will
        // be equal to this group
        let otherStarGroup = groupedStarIDs.get(otherStarID);
        if (otherStarGroup != starGroup) {
          if (!otherStarGroup) {
            otherStarGroup = [otherStarID];
            groupedStarIDs.set(otherStarID, starGroup);
          }
          let mergedStarGroup = [...starGroup, ...otherStarGroup].sort((a, b) => a - b);
          for (let mergedStarID of mergedStarGroup) {
            groupedStarIDs.set(mergedStarID, mergedStarGroup);
          }
          starGroup = mergedStarGroup;
        }
      }
    }
  }
  return groupedStarIDs;
}

function expandInfluenceRadiiToFillGaps(stars: WritableStar[]) {
  const starIDsByInfluenceSize = stars.slice().filter(x => !!x).sort((a, b) => b.influenceRange - a.influenceRange).map(x => x.id);
  for (let starID of starIDsByInfluenceSize) {
    const star = stars[starID];
    // Exclave stars never expand and are ignored by other expansions; they will show up as
    // embedded in other empires in a sort of "disputed zone" fashion if they overlap
    if (star.exclave) continue;
    let smallestGap = 10000; // TODO: Make this less arbitrary?
    for (let otherStarID of starIDsByInfluenceSize) {
      const otherStar = stars[otherStarID];
      if (otherStar && otherStar.ownerID != star.ownerID && !otherStar.exclave) {
        const otherStarOffsetX = otherStar.x - star.x;
        const otherStarOffsetY = otherStar.y - star.y;
        const otherStarDistance = Math.sqrt(otherStarOffsetX * otherStarOffsetX + otherStarOffsetY * otherStarOffsetY);
        const totalInfluenceRadius = star.influenceRange + otherStar.influenceRange;
        smallestGap = Math.min(otherStarDistance - totalInfluenceRadius, smallestGap);
      }
    }
    star.influenceRange += smallestGap;
  }
}