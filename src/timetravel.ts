import { ScanningData } from "./galaxy";
import { clone } from "./patch";

export function futureTime(
  galaxy: ScanningData,
  tickOffset: number
): ScanningData {
  const newState = {...galaxy};
  newState.futureTime = true;
  newState.tick += tickOffset;
  return newState;
}
