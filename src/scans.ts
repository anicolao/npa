import { Heap } from "./heap";
import { scanCache } from "./npaserver";
import { clone, patch } from "./patch";

export const getCodeFromApiText = (key: string) => {
  const tokens = key.split(/[^\w]/);
  return tokens[3];
};

export class ScanKeyIterator {
  apikey;
  currentScanRecord;
  currentScanData;
  constructor(apilink: string) {
    this.apikey = getCodeFromApiText(apilink);
    if (scanCache[this.apikey]?.length) {
      this.currentScanRecord = scanCache[this.apikey][0];
      this.currentScanData = clone(this.currentScanRecord.cached);
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
    console.log(`hasNext for ${this.apikey} is ${ret} @ ${this.currentScanData.tick}`)
    return ret;
  }
  next() {
    const p = patch(this.currentScanData, this.currentScanRecord?.forward);
    this.currentScanData = p;
    this.currentScanRecord = this.currentScanRecord?.next;
  }
  timestamp() {
    return this.currentScanRecord?.timestamp;
  }
}

export class TickIterator {
  scanIteratorHeap: Heap<any>;
  constructor(apilinks: string[], preferredUser?: number) {
    const iterators = apilinks.map((link) => new ScanKeyIterator(link));
    this.scanIteratorHeap = new Heap(iterators, (a, b) => {
      const aScan = a.getScanData();
      const bScan = b.getScanData();
      if (aScan === undefined) return aScan;
      if (bScan === undefined) return bScan;
      let preference = 0;
      if (preferredUser === bScan.player_uid) {
        // (b - p) - a = b - a - p
        preference = 0.5;
      } else if (preferredUser === aScan.player_uid) {
        // b - (a - p) = b - a + p
        preference = -0.5;
      }
      return bScan.tick - aScan.tick - preference;
    });
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
    console.log(`hasNext size pre: ${h.size()}`)
      while (this.getScanData() === undefined && h.size() > 0) {
        h.extract();
      }
    console.log(`hasNext size pre: ${h.size()}`)
    const ret = h.size() > 0 && h.peek().hasNext();
    console.log(`hasNext size: ${h.size()} is ${ret}`)
    return ret;
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
