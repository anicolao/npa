import { ScanningData } from "./galaxy";
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

  }
  return newState;
}
