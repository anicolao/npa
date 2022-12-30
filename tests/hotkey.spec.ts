import { expect } from 'chai';
import { describe, it } from 'vitest';

import { setClip, getClip } from '../src/hotkey';

describe('hotkey tests', () => {
	it('clip sets lastClip', () => {
		expect(getClip()).to.equal('Error');
		const hello = "Hello, world";
		setClip(hello);
		expect(getClip()).to.equal(hello);
	});
});
