import "server-only";
import { createPrivateKey } from "node:crypto";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";

const firebaseAdminEnvironmentSchema = z.object({
  projectId: z.string().trim().min(1),
  clientEmail: z.string().trim().email(),
  privateKey: z.string().min(1),
});

const environmentNameByField: Record<string, string> = {
  projectId: "FIREBASE_PROJECT_ID",
  clientEmail: "FIREBASE_CLIENT_EMAIL",
  privateKey: "FIREBASE_PRIVATE_KEY",
};

type FirebaseAdminEnvironmentVariables = Record<string, string | undefined>;

export function normalizeFirebasePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

export function parseFirebaseAdminEnvironment(
  environment: FirebaseAdminEnvironmentVariables,
): z.infer<typeof firebaseAdminEnvironmentSchema> {
  const parsed = firebaseAdminEnvironmentSchema.safeParse({
    projectId: environment.FIREBASE_PROJECT_ID,
    clientEmail: environment.FIREBASE_CLIENT_EMAIL,
    privateKey: environment.FIREBASE_PRIVATE_KEY,
  });

  if (!parsed.success) {
    const invalidNames = new Set(
      parsed.error.issues.flatMap((issue) => {
        const field = issue.path[0];
        const environmentName =
          typeof field === "string" ? environmentNameByField[field] : undefined;

        return environmentName ? [environmentName] : [];
      }),
    );

    throw new Error(
      `Firebase Admin configuration is invalid: ${[...invalidNames].join(", ")}`,
    );
  }

  const privateKey = normalizeFirebasePrivateKey(parsed.data.privateKey);

  try {
    createPrivateKey(privateKey);
  } catch {
    throw new Error(
      "Firebase Admin configuration is invalid: FIREBASE_PRIVATE_KEY",
    );
  }

  return { ...parsed.data, privateKey };
}

let firebaseAdminApp: App | undefined;

export function getFirebaseAdminApp(): App {
  if (firebaseAdminApp) {
    return firebaseAdminApp;
  }

  const existingDefaultApp = getApps().find((app) => app.name === "[DEFAULT]");

  if (existingDefaultApp) {
    firebaseAdminApp = existingDefaultApp;
    return existingDefaultApp;
  }

  const environment = parseFirebaseAdminEnvironment(process.env);
  let credential: ReturnType<typeof cert>;

  try {
    credential = cert(environment);
  } catch {
    throw new Error("Firebase Admin certificate creation failed.");
  }

  try {
    firebaseAdminApp = initializeApp({
      credential,
      projectId: environment.projectId,
    });
  } catch {
    throw new Error("Firebase Admin app initialization failed.");
  }

  return firebaseAdminApp;
}

export function getFirestoreDb(): Firestore {
  const app = getFirebaseAdminApp();

  try {
    return getFirestore(app);
  } catch {
    throw new Error("Firestore initialization failed.");
  }
}
