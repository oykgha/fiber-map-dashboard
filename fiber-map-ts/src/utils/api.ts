const API_BASE_URL = 'http://localhost:8080';

export interface SaveSegmentPayload {
  name: string;
  lengthKm?: number;
  customerTrunk?: string;
  technicalData?: string;
  coreCount?: number;
  attenuationRate?: number;
  nodeA?: string;
  nodeZ?: string;
  coreCapacity?: string;
  // This cable's current line shape as [lng, lat] pairs — sent on every
  // save (not just hand-drawn/retraced ones) so the backend can rebuild
  // this line on the map after a refresh. See segmentId.ts/FiberMap.tsx's
  // resolveLineFeatureId for how this stays linked to the same segment id.
  geometry?: [number, number][];
  sourceFile?: string;
}

export interface SorFileResponse {
  id: string;
  name: string;
  size: string;
  uploadDate: string;
  wavelength?: string;
  fiberLengthKm?: number;
  totalLossDb?: number;
  orlDb?: number;
  eventsCount?: number;
}

export interface SegmentResponse {
  id: string;
  name: string;
  lengthKm?: number;
  customerTrunk?: string;
  technicalData?: string;
  coreCount?: number;
  attenuationRate?: number;
  nodeA?: string;
  nodeZ?: string;
  coreCapacity?: string;
  geometry?: [number, number][];
  sourceFile?: string;
  sorFiles: SorFileResponse[];
}

export async function getSegment(id: string): Promise<SegmentResponse | null> {
  const res = await fetch(`${API_BASE_URL}/api/segments/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to fetch segment (${res.status}): ${body}`);
  }
  return res.json();
}

// Every segment that has a geometry saved — used on app startup to rebuild
// routes that don't come from the 5 default KMZ files (custom uploads,
// "Gambar Rute" drawn/retraced paths).
export async function listSegments(): Promise<SegmentResponse[]> {
  const res = await fetch(`${API_BASE_URL}/api/segments`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to list segments (${res.status}): ${body}`);
  }
  return res.json();
}

export async function saveSegment(id: string, payload: SaveSegmentPayload): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/segments/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to save segment (${res.status}): ${body}`);
  }
}

export interface NodeStub {
  name: string;
  nodeType?: string;
  longitude: number;
  latitude: number;
  status?: string;
  sourceFile?: string;
}

export interface NodeListItem {
  id: string;
  name: string;
  node_type: string;
  longitude: number;
  latitude: number;
  status: string;
  sourceFile?: string;
}

// Every node ever saved — used on app startup to rebuild nodes that don't
// come from the 5 default KMZ files.
export async function listNodes(): Promise<NodeListItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/nodes`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to list nodes (${res.status}): ${body}`);
  }
  return res.json();
}

async function putOrPatch(method: 'POST' | 'PATCH', path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} failed (${res.status}): ${text}`);
  }
}

export function renameNode(id: string, node: NodeStub): Promise<void> {
  return putOrPatch('PATCH', `/api/nodes/${encodeURIComponent(id)}`, { node });
}

export interface SaveXccPortPayload {
  node: NodeStub;
  status: string;
  serviceName: string;
  remarks: string;
  destNodeName: string;
  destPortId?: number | null;
  attenuation?: number;
  connectorType: string;
}

export function saveXccPort(
  xccId: string,
  group: 'k1' | 'k2',
  portNumber: number,
  payload: SaveXccPortPayload
): Promise<void> {
  return putOrPatch(
    'POST',
    `/api/xcc/${encodeURIComponent(xccId)}/ports/${group}/${portNumber}`,
    payload
  );
}

export interface SaveXccTrayPayload {
  node: NodeStub;
  trayName?: string;
  targetNodeName?: string;
}

export function saveXccTray(xccId: string, trayIndex: number, payload: SaveXccTrayPayload): Promise<void> {
  return putOrPatch('POST', `/api/xcc/${encodeURIComponent(xccId)}/trays/${trayIndex}`, payload);
}

export interface XccPortResponse {
  portGroup: 'k1' | 'k2';
  portNumber: number;
  status: string;
  serviceName: string;
  remarks: string;
  destNodeName: string;
  destPortNumber?: number;
  attenuation?: number;
  connectorType: string;
}

export interface XccTrayResponse {
  trayIndex: number;
  trayName?: string;
  targetNodeName?: string;
}

export interface XccResponse {
  id: string;
  name?: string;
  ports: XccPortResponse[];
  trays: XccTrayResponse[];
}

export async function getXcc(xccId: string): Promise<XccResponse> {
  const res = await fetch(`${API_BASE_URL}/api/xcc/${encodeURIComponent(xccId)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch XCC (${res.status}): ${text}`);
  }
  return res.json();
}

export interface UploadSorFilePayload {
  id: string;
  file: File;
  segmentName: string;
  segmentLengthKm?: number;
  wavelengthNm?: number;
  fiberLengthKm?: number;
  totalLossDb?: number;
  orlDb?: number;
  eventsCount?: number;
}

export async function uploadSorFile(segmentId: string, payload: UploadSorFilePayload): Promise<void> {
  const form = new FormData();
  form.set('id', payload.id);
  form.set('file', payload.file);
  form.set('segmentName', payload.segmentName);
  if (payload.segmentLengthKm !== undefined) form.set('segmentLengthKm', String(payload.segmentLengthKm));
  if (payload.wavelengthNm !== undefined) form.set('wavelengthNm', String(payload.wavelengthNm));
  if (payload.fiberLengthKm !== undefined) form.set('fiberLengthKm', String(payload.fiberLengthKm));
  if (payload.totalLossDb !== undefined) form.set('totalLossDb', String(payload.totalLossDb));
  if (payload.orlDb !== undefined) form.set('orlDb', String(payload.orlDb));
  if (payload.eventsCount !== undefined) form.set('eventsCount', String(payload.eventsCount));

  const res = await fetch(`${API_BASE_URL}/api/segments/${encodeURIComponent(segmentId)}/sor-files`, {
    method: 'POST',
    body: form
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to upload .sor file (${res.status}): ${text}`);
  }
}

export async function deleteSorFile(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/sor-files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to delete .sor file (${res.status}): ${text}`);
  }
}

// Permanently removes every node and segment saved under this source file —
// without this, deleting a KMZ file from the sidebar panel only removed it
// from the current tab's view; the next refresh pulled it right back in
// from the database.
export async function deleteKmzFile(fileName: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/kmz-files/${encodeURIComponent(fileName)}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to delete KMZ file (${res.status}): ${text}`);
  }
}
