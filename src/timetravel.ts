import { ScanningData } from "./galaxy";
import { clone } from "./patch";

export interface TimeMachineData {
    futureTime: boolean;
};
export function futureTime(
  galaxy: ScanningData,
  tickOffset: number
): ScanningData & TimeMachineData {
  const newState: ScanningData & TimeMachineData = {...galaxy};
  newState.futureTime = true;
  newState.tick += tickOffset;
  return newState;
}
