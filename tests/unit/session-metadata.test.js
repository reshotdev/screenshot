const { beforeEach, afterEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const recordCdp = require("../../src/lib/record-cdp");

describe("session metadata", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reshot-session-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes a metadata sidecar with origin evidence", () => {
    const sessionPath = path.join(tempDir, "session-state.json");
    const storageState = {
      cookies: [
        {
          name: "sb",
          value: "abc",
          domain: ".preview.example.com",
          path: "/",
          httpOnly: true,
          secure: true,
        },
      ],
      origins: [
        {
          origin: "https://preview.example.com",
          localStorage: [{ name: "token", value: "abc" }],
        },
      ],
    };

    const artifactInfo = recordCdp.writeSessionArtifacts(sessionPath, storageState, {
      pageUrl: "https://preview.example.com/app/projects",
    });

    assert.equal(fs.existsSync(sessionPath), true);
    assert.equal(fs.existsSync(artifactInfo.metadataPath), true);

    const metadata = JSON.parse(fs.readFileSync(artifactInfo.metadataPath, "utf-8"));
    assert.equal(metadata.sourceOrigin, "https://preview.example.com");
    assert.deepEqual(metadata.storageOrigins, ["https://preview.example.com"]);
    assert.deepEqual(metadata.cookieDomains, ["preview.example.com"]);
  });

  it("falls back to stored origins when metadata is missing", () => {
    const sessionPath = path.join(tempDir, "session-state.json");
    fs.writeFileSync(
      sessionPath,
      JSON.stringify(
        {
          cookies: [
            {
              name: "sb",
              value: "abc",
              domain: ".preview.example.com",
              path: "/",
            },
          ],
          origins: [{ origin: "https://preview.example.com", localStorage: [] }],
        },
        null,
        2,
      ),
    );

    const assessment = recordCdp.assessSessionHealth(
      sessionPath,
      "https://preview.example.com",
    );

    assert.equal(assessment.compatible, true);
    assert.match(
      assessment.warnings.join("\n"),
      /Session metadata is missing/i,
    );
    assert.equal(assessment.evidence.matchSource, "sourceOrigin");
  });

  it("flags cross-environment session reuse and stale sessions", () => {
    const sessionPath = path.join(tempDir, "session-state.json");
    recordCdp.writeSessionArtifacts(
      sessionPath,
      {
        cookies: [
          {
            name: "sb",
            value: "abc",
            domain: ".staging.example.com",
            path: "/",
          },
        ],
        origins: [{ origin: "https://staging.example.com", localStorage: [] }],
      },
      {
        pageUrl: "https://staging.example.com/app/projects",
        capturedAt: "2024-01-01T00:00:00.000Z",
      },
    );

    const assessment = recordCdp.assessSessionHealth(
      sessionPath,
      "https://preview.example.com",
      { maxAgeMinutes: 10 },
    );

    assert.equal(assessment.compatible, false);
    assert.equal(assessment.stale, true);
    assert.match(assessment.issues.join("\n"), /not https:\/\/preview\.example\.com/i);
  });
});
