import { describe, it, expect } from 'vitest';
import { joinVaultPath, normalizeVaultRelativePath } from '../../src/utils/vaultPath.js';

describe('vaultPath', () => {
	it('normalizes an absolute vault path to a relative path', () => {
		expect(
			normalizeVaultRelativePath('/vault/exports/books', '/vault'),
		).toBe('exports/books');
	});

	it('keeps a relative path as-is', () => {
		expect(
			normalizeVaultRelativePath('exports/books', '/vault'),
		).toBe('exports/books');
	});

	it('joins folder and leaf without introducing an absolute prefix', () => {
		expect(joinVaultPath('exports/books', 'export.pdf')).toBe('exports/books/export.pdf');
	});

	it('joins root folder and leaf cleanly', () => {
		expect(joinVaultPath('', 'export.pdf')).toBe('export.pdf');
	});
});
