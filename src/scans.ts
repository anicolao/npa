import type { ScanningData } from "./galaxy";
import { Heap } from "./heap";
import { patch } from "./patch";
import { type CachedScan, getCacheForKey } from "./timemachine";

export const getCodeFromApiText = (key: string) => {
  const tokens = key.split(/[^\w]/);
  return tokens[3];
};

export class ScanKeyIterator {
  apikey: string;
  currentScanRecord: CachedScan;
  currentScanData: ScanningData;
  constructor(apilink: string) {
    this.apikey = getCodeFromApiText(apilink);
    const cache = getCacheForKey(this.apikey);
    if (cache !== undefined) {
      this.currentScanRecord = cache.next;
      this.currentScanData = {} as ScanningData;
      //const p = patch(this.currentScanData, cache.forward);
      //this.currentScanData = p as ScanningData;
    } else this.currentScanRecord = undefined;
  }
  getScanRecord() {
    return this.currentScanRecord;
  }
  getScanData() {
    return this.currentScanData;
  }
  hasNext() {
    const ret = this.currentScanRecord?.next !== undefined;
    return ret;
  }
  next() {
    const p = patch(this.currentScanData, this.currentScanRecord?.forward);
    this.currentScanData = p as ScanningData;
    this.currentScanRecord = this.currentScanRecord?.next;
  }
  timestamp() {
    return this.currentScanRecord?.timestamp;
  }
}

export class TickIterator {
  scanIteratorHeap: Heap<any>;
  constructor(apilinks: string[], preferredUser?: number) {
    const iterators = apilinks
      .map((link) => new ScanKeyIterator(link))
      .filter((i) => i.hasNext());
    this.scanIteratorHeap = new Heap(
      iterators,
      (a: ScanKeyIterator, b: ScanKeyIterator): number => {
        const aScan = a.getScanData();
        const bScan = b.getScanData();
        if (aScan === undefined) return 1;
        if (bScan === undefined) return -1;
        let preference = 0;
        if (preferredUser === bScan.player_uid) {
          // (b - p) - a = b - a - p
          preference = 0.5;
        } else if (preferredUser === aScan.player_uid) {
          // b - (a - p) = b - a + p
          preference = -0.5;
        }
        return bScan.tick - aScan.tick - preference;
      },
    );
    while (this.getScanData() === undefined && this.scanIteratorHeap.size()) {
      this.scanIteratorHeap.extract();
    }
  }
  getScanRecord() {
    const h = this.scanIteratorHeap;
    return h.peek()?.getScanRecord();
  }
  getScanData() {
    const h = this.scanIteratorHeap;
    return h.peek()?.getScanData();
  }
  hasNext() {
    const h = this.scanIteratorHeap;
    if (h.size() > 1) return true;
    return h.size() > 0 && h.peek().hasNext();
  }
  next() {
    if (this.hasNext()) {
      const h = this.scanIteratorHeap;
      h.peek().next();
      while (this.getScanData() === undefined && h.size() > 0) {
        h.extract();
      }
      return this.getScanData();
    }
    return undefined;
  }
  timestamp() {
    const h = this.scanIteratorHeap;
    return h.peek().timestamp();
  }
}
