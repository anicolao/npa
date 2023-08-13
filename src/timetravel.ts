import { ScanningData } from "./galaxy";
import { logCount } from "./npaserver";
import { clone } from "./patch";

export interface TimeMachineData {
    futureTime: boolean;
};
export function futureTime(
  galaxy: ScanningData,
  tickOffset: number
): ScanningData {
  const newState: ScanningData & TimeMachineData = {...galaxy, futureTime: true};
  newState.tick += tickOffset;
  if (tickOffset <= 0) {
    console.error("Future time machine going backwards NIY")
    logCount("error_back_to_the_future");
    return newState;
  }
  const stars = {...newState.stars};
  for (const sk in stars) {
    const star = stars[sk];
    if (star.v)
  }
  newState.stars = stars;
  return newState;
}
