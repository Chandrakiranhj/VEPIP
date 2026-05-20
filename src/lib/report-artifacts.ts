interface Artifact {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  createdAt: number;
}

const globalStore = globalThis as typeof globalThis & {
  __vepipReportArtifacts?: Map<string, Artifact>;
};

const store = globalStore.__vepipReportArtifacts ?? new Map<string, Artifact>();
globalStore.__vepipReportArtifacts = store;

export function putReportArtifact(id: string, artifact: Omit<Artifact, "createdAt">) {
  store.set(id, { ...artifact, createdAt: Date.now() });
}

export function getReportArtifact(id: string) {
  return store.get(id) ?? null;
}
