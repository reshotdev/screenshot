/**
 * Unit tests for isAuthRedirectUrl()
 * No browser required — pure function tests.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isAuthRedirectUrl } = require('../../src/lib/capture-engine');

describe('isAuthRedirectUrl', () => {
  // ─── Default path patterns ──────────────────────────────────────

  describe('default path patterns', () => {
    const authPaths = [
      'https://example.com/auth/signin',
      'https://example.com/auth/login',
      'https://example.com/auth/confirm',
      'https://example.com/login',
      'https://example.com/signin',
      'https://example.com/sign-in',
      'https://example.com/log-in',
      'https://example.com/sso/callback',
      'https://example.com/oauth/authorize',
      'https://example.com/saml/login',
      'https://example.com/cas/login',
    ];

    for (const url of authPaths) {
      it(`detects auth URL: ${url}`, () => {
        assert.equal(isAuthRedirectUrl(url), true);
      });
    }
  });

  // ─── OAuth provider domains ──────────────────────────────────────

  describe('OAuth provider domains', () => {
    const oauthUrls = [
      'https://accounts.google.com/o/oauth2/auth',
      'https://login.microsoftonline.com/common/oauth2',
      'https://myapp.auth0.com/authorize',
      'https://dev-12345.okta.com/oauth2/default',
      'https://login.salesforce.com/services/oauth2',
    ];

    for (const url of oauthUrls) {
      it(`detects OAuth domain: ${url}`, () => {
        assert.equal(isAuthRedirectUrl(url), true);
      });
    }
  });

  // ─── Custom patterns ──────────────────────────────────────────────

  describe('custom patterns', () => {
    it('matches custom path pattern', () => {
      assert.equal(
        isAuthRedirectUrl('https://example.com/custom-auth', ['/custom-auth']),
        true,
      );
    });

    it('does not match without custom pattern', () => {
      assert.equal(
        isAuthRedirectUrl('https://example.com/custom-auth'),
        false,
      );
    });

    it('supports multiple custom patterns', () => {
      const patterns = ['/my-login', '/authenticate'];
      assert.equal(isAuthRedirectUrl('https://example.com/authenticate', patterns), true);
      assert.equal(isAuthRedirectUrl('https://example.com/my-login', patterns), true);
    });
  });

  // ─── Non-auth URLs ──────────────────────────────────────────────

  describe('non-auth URLs', () => {
    const safeUrls = [
      'https://example.com/',
      'https://example.com/dashboard',
      'https://example.com/settings',
      'https://example.com/api/users',
      'https://example.com/blog/tips',
    ];

    for (const url of safeUrls) {
      it(`does not flag safe URL: ${url}`, () => {
        assert.equal(isAuthRedirectUrl(url), false);
      });
    }
  });

  // ─── Edge cases ──────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns false for null', () => {
      assert.equal(isAuthRedirectUrl(null), false);
    });

    it('returns false for empty string', () => {
      assert.equal(isAuthRedirectUrl(''), false);
    });

    it('returns false for undefined', () => {
      assert.equal(isAuthRedirectUrl(undefined), false);
    });

    it('handles malformed URL by substring matching', () => {
      // Malformed URLs that can't be parsed fall back to substring matching
      assert.equal(isAuthRedirectUrl('not-a-url/login'), true);
    });

    it('handles URL with query params', () => {
      assert.equal(
        isAuthRedirectUrl('https://example.com/login?redirect=/dashboard'),
        true,
      );
    });

    it('handles URL with hash', () => {
      assert.equal(
        isAuthRedirectUrl('https://example.com/signin#forgot'),
        true,
      );
    });
  });
});
