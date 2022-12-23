import { expect } from 'chai';
import { describe, it } from 'vitest';

import { clip, lastClip } from '../src/hotkey';

describe('hotkey tests', () => {
	it('clip sets lastClip', () => {
		expect(lastClip).to.equal('Error');
		const hello = "Hello, world";
		clip(hello);
		expect(lastClip).to.equal(hello);
	});
});
