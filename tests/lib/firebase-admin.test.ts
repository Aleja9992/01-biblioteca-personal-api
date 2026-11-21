import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firebaseMocks = vi.hoisted(() => ({
  cert: vi.fn(),
  createPrivateKey: vi.fn(),
  getApps: vi.fn(),
  getFirestore: vi.fn(),
  initializeApp: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("node:crypto", () => ({
  createPrivateKey: firebaseMocks.createPrivateKey,
}));

vi.mock("firebase-admin/app", () => ({
  cert: firebaseMocks.cert,
  getApps: firebaseMocks.getApps,
  initializeApp: firebaseMocks.initializeApp,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: firebaseMocks.getFirestore,
}));

async function loadFirebaseAdminModule() {
  vi.resetModules();
  return import("../../src/lib/firebase-admin");
}

function getErrorMessage(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : "";
  }

  return "";
}

function setTestEnvironment(): void {
  vi.stubEnv("FIREBASE_PROJECT_ID", "test-project-not-real");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "not-a-real-account@example.invalid");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "NOT_A_CREDENTIAL");
}

describe("Firebase Admin infrastructure", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    firebaseMocks.getApps.mockReturnValue([]);
    firebaseMocks.createPrivateKey.mockReturnValue(Object.create(null));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports missing configuration variables without exposing values", async () => {
    const { parseFirebaseAdminEnvironment } = await loadFirebaseAdminModule();

    expect(() => parseFirebaseAdminEnvironment({})).toThrow(
      "Firebase Admin configuration is invalid: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY",
    );
  });

  it("rejects malformed configuration without echoing the supplied value", async () => {
    const { parseFirebaseAdminEnvironment } = await loadFirebaseAdminModule();
    const testOnlyInvalidEmail = "not-an-email";

    let errorMessage = "";
    try {
      parseFirebaseAdminEnvironment({
        FIREBASE_PROJECT_ID: "test-project-not-real",
        FIREBASE_CLIENT_EMAIL: testOnlyInvalidEmail,
        FIREBASE_PRIVATE_KEY: "NOT_A_CREDENTIAL",
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "";
    }

    expect(errorMessage).toContain("FIREBASE_CLIENT_EMAIL");
    expect(errorMessage).not.toContain(testOnlyInvalidEmail);
  });

  it("rejects an invalid private key without exposing its value", async () => {
    const { parseFirebaseAdminEnvironment } = await loadFirebaseAdminModule();
    const internalError = "PRIVATE_KEY_TEST_DETAIL";
    firebaseMocks.createPrivateKey.mockImplementation(() => {
      throw new Error(internalError);
    });

    const errorMessage = getErrorMessage(() =>
      parseFirebaseAdminEnvironment({
        FIREBASE_PROJECT_ID: "test-project-not-real",
        FIREBASE_CLIENT_EMAIL: "not-a-real-account@example.invalid",
        FIREBASE_PRIVATE_KEY: "NOT_A_CREDENTIAL",
      }),
    );

    expect(errorMessage).toBe(
      "Firebase Admin configuration is invalid: FIREBASE_PRIVATE_KEY",
    );
    expect(errorMessage).not.toContain(internalError);
  });

  it("normalizes escaped newlines without changing other characters", async () => {
    const { parseFirebaseAdminEnvironment } = await loadFirebaseAdminModule();
    const nonCredentialTestValue = "  NOT_A_CREDENTIAL\\nSTILL_NOT_A_KEY  ";
    const parsed = parseFirebaseAdminEnvironment({
      FIREBASE_PROJECT_ID: "test-project-not-real",
      FIREBASE_CLIENT_EMAIL: "not-a-real-account@example.invalid",
      FIREBASE_PRIVATE_KEY: nonCredentialTestValue,
    });

    expect(parsed.privateKey).toBe(
      "  NOT_A_CREDENTIAL\nSTILL_NOT_A_KEY  ",
    );
    expect(firebaseMocks.createPrivateKey).toHaveBeenCalledWith(
      "  NOT_A_CREDENTIAL\nSTILL_NOT_A_KEY  ",
    );
  });

  it("initializes and then reuses a new default app", async () => {
    const { getFirebaseAdminApp } = await loadFirebaseAdminModule();
    const testCredential = { testOnly: true };
    const testApp = { name: "[DEFAULT]" };
    setTestEnvironment();
    firebaseMocks.cert.mockReturnValue(testCredential);
    firebaseMocks.initializeApp.mockReturnValue(testApp);

    expect(getFirebaseAdminApp()).toBe(testApp);
    expect(getFirebaseAdminApp()).toBe(testApp);
    expect(firebaseMocks.cert).toHaveBeenCalledWith({
      projectId: "test-project-not-real",
      clientEmail: "not-a-real-account@example.invalid",
      privateKey: "NOT_A_CREDENTIAL",
    });
    expect(firebaseMocks.initializeApp).toHaveBeenCalledTimes(1);
    expect(firebaseMocks.initializeApp).toHaveBeenCalledWith({
      credential: testCredential,
      projectId: "test-project-not-real",
    });
  });

  it("reuses the default app and obtains Firestore from that app", async () => {
    const { getFirebaseAdminApp, getFirestoreDb } =
      await loadFirebaseAdminModule();
    const existingApp = Object.assign(Object.create(null), {
      name: "[DEFAULT]",
    });
    const database = Object.create(null);

    firebaseMocks.getApps.mockReturnValue([existingApp]);
    firebaseMocks.getFirestore.mockReturnValue(database);

    expect(getFirebaseAdminApp()).toBe(existingApp);
    expect(getFirebaseAdminApp()).toBe(existingApp);
    expect(getFirestoreDb()).toBe(database);
    expect(firebaseMocks.initializeApp).not.toHaveBeenCalled();
    expect(firebaseMocks.getFirestore).toHaveBeenCalledWith(existingApp);
  });

  it("sanitizes errors from certificate creation", async () => {
    const { getFirebaseAdminApp } = await loadFirebaseAdminModule();
    const internalError = "CERTIFICATE_TEST_DETAIL";
    setTestEnvironment();
    firebaseMocks.cert.mockImplementation(() => {
      throw new Error(internalError);
    });

    const errorMessage = getErrorMessage(() => getFirebaseAdminApp());

    expect(errorMessage).toBe("Firebase Admin certificate creation failed.");
    expect(errorMessage).not.toContain(internalError);
    expect(firebaseMocks.initializeApp).not.toHaveBeenCalled();
  });

  it("sanitizes errors from app initialization", async () => {
    const { getFirebaseAdminApp } = await loadFirebaseAdminModule();
    const internalError = "APP_INITIALIZATION_TEST_DETAIL";
    setTestEnvironment();
    firebaseMocks.cert.mockReturnValue({ testOnly: true });
    firebaseMocks.initializeApp.mockImplementation(() => {
      throw new Error(internalError);
    });

    const errorMessage = getErrorMessage(() => getFirebaseAdminApp());

    expect(errorMessage).toBe("Firebase Admin app initialization failed.");
    expect(errorMessage).not.toContain(internalError);
  });

  it("sanitizes errors from Firestore initialization", async () => {
    const { getFirestoreDb } = await loadFirebaseAdminModule();
    const existingApp = Object.assign(Object.create(null), {
      name: "[DEFAULT]",
    });
    const internalError = "FIRESTORE_TEST_DETAIL";
    firebaseMocks.getApps.mockReturnValue([existingApp]);
    firebaseMocks.getFirestore.mockImplementation(() => {
      throw new Error(internalError);
    });

    const errorMessage = getErrorMessage(() => getFirestoreDb());

    expect(errorMessage).toBe("Firestore initialization failed.");
    expect(errorMessage).not.toContain(internalError);
  });
});
