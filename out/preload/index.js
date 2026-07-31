"use strict";
const electron = require("electron");
const api = {
  // Photos
  importFolder: () => electron.ipcRenderer.invoke("photos:import-folder"),
  importFiles: () => electron.ipcRenderer.invoke("photos:import-files"),
  getPhotos: (filter) => electron.ipcRenderer.invoke("photos:get-all", filter || {}),
  getGeoPhotos: () => electron.ipcRenderer.invoke("photos:get-geo"),
  exportPhotos: (ids, destination) => electron.ipcRenderer.invoke("photos:export", ids, destination),
  getPhotoById: (id) => electron.ipcRenderer.invoke("photos:get-by-id", id),
  getPhotoCount: (filter) => electron.ipcRenderer.invoke("photos:get-count", filter || {}),
  toggleFavorite: (id) => electron.ipcRenderer.invoke("photos:toggle-favorite", id),
  batchFavorite: (ids, favorite) => electron.ipcRenderer.invoke("photos:batch-favorite", ids, favorite),
  archive: (ids) => electron.ipcRenderer.invoke("photos:archive", ids),
  unarchive: (ids) => electron.ipcRenderer.invoke("photos:unarchive", ids),
  lockPhotos: (ids, locked) => electron.ipcRenderer.invoke("photos:lock", ids, locked),
  updateMetadata: (id, data) => electron.ipcRenderer.invoke("photos:update-metadata", id, data),
  trash: (ids) => electron.ipcRenderer.invoke("photos:trash", ids),
  emptyTrash: () => electron.ipcRenderer.invoke("photos:empty-trash"),
  getUnanalyzedPhotos: () => electron.ipcRenderer.invoke("photos:get-unanalyzed"),
  savePhotoAnalysis: (photoId, blurScore, perceptualHash) => electron.ipcRenderer.invoke("photos:save-analysis", photoId, blurScore, perceptualHash),
  getUtilitiesData: () => electron.ipcRenderer.invoke("photos:get-utilities-data"),
  scanDuplicates: () => electron.ipcRenderer.invoke("photos:scan-duplicates"),
  onDuplicateScanProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    electron.ipcRenderer.on("duplicate-scan:progress", handler);
    return () => electron.ipcRenderer.removeListener("duplicate-scan:progress", handler);
  },
  getUnscannedDocs: () => electron.ipcRenderer.invoke("photos:get-unscanned-docs"),
  saveDocumentScan: (photoId, text, isDocument, category) => electron.ipcRenderer.invoke("photos:save-document-scan", photoId, text, isDocument, category),
  resetLocationScanData: () => electron.ipcRenderer.invoke("locations:reset"),
  resetDocumentScanData: () => electron.ipcRenderer.invoke("docs:reset"),
  resetUtilityScanData: () => electron.ipcRenderer.invoke("analysis:reset"),
  fastDocPrefilter: () => electron.ipcRenderer.invoke("docs:fast-prefilter"),
  stopFastDocScan: () => electron.ipcRenderer.invoke("docs:stop-fast-scan"),
  getOcrBuffer: (photoId) => electron.ipcRenderer.invoke("docs:get-ocr-buffer", photoId),
  saveDocBatch: (results) => electron.ipcRenderer.invoke("docs:save-batch", results),
  onDocScanProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    electron.ipcRenderer.on("doc-scan:progress", handler);
    return () => electron.ipcRenderer.removeListener("doc-scan:progress", handler);
  },
  restore: (ids) => electron.ipcRenderer.invoke("photos:restore", ids),
  deletePermanently: (ids) => electron.ipcRenderer.invoke("photos:delete-permanently", ids),
  getTimeline: () => electron.ipcRenderer.invoke("photos:get-timeline"),
  getStats: () => electron.ipcRenderer.invoke("photos:get-stats"),
  search: (query) => electron.ipcRenderer.invoke("photos:search", query),
  openInExplorer: (filePath) => electron.ipcRenderer.invoke("photos:open-in-explorer", filePath),
  editPhoto: (id, edits) => electron.ipcRenderer.invoke("photos:edit", id, edits),
  // Albums
  createAlbum: (name) => electron.ipcRenderer.invoke("albums:create", name),
  getAlbums: () => electron.ipcRenderer.invoke("albums:get-all"),
  getAlbumById: (id) => electron.ipcRenderer.invoke("albums:get-by-id", id),
  updateAlbum: (id, name) => electron.ipcRenderer.invoke("albums:update", id, name),
  deleteAlbum: (id) => electron.ipcRenderer.invoke("albums:delete", id),
  addPhotosToAlbum: (albumId, photoIds) => electron.ipcRenderer.invoke("albums:add-photos", albumId, photoIds),
  removePhotosFromAlbum: (albumId, photoIds) => electron.ipcRenderer.invoke("albums:remove-photos", albumId, photoIds),
  // People & Faces
  getPeople: () => electron.ipcRenderer.invoke("people:get-all"),
  createPerson: (name, coverPhotoId, faceBase64) => electron.ipcRenderer.invoke("people:create", name, coverPhotoId, faceBase64),
  updatePersonName: (personId, name) => electron.ipcRenderer.invoke("people:update-name", personId, name),
  deletePerson: (personId) => electron.ipcRenderer.invoke("people:delete", personId),
  mergePeople: (primaryId, secondaryId) => electron.ipcRenderer.invoke("people:merge", primaryId, secondaryId),
  addPhotoToPerson: (personId, photoId) => electron.ipcRenderer.invoke("people:add-photo", personId, photoId),
  getPhotosByPerson: (personId) => electron.ipcRenderer.invoke("people:get-photos", personId),
  // Face Recognition
  getAllFaceDescriptors: () => electron.ipcRenderer.invoke("faces:get-all"),
  saveFaceDescriptor: (photoId, personId, descriptor) => electron.ipcRenderer.invoke("faces:save", photoId, personId, descriptor),
  getUnscannedPhotos: () => electron.ipcRenderer.invoke("faces:get-unscanned"),
  markPhotoScanned: (photoId) => electron.ipcRenderer.invoke("faces:mark-scanned", photoId),
  resetFaceScanData: () => electron.ipcRenderer.invoke("faces:reset"),
  getMergeSuggestions: () => electron.ipcRenderer.invoke("faces:get-merge-suggestions"),
  // Location Scanner
  startLocationScan: () => electron.ipcRenderer.invoke("photos:start-location-scan"),
  stopLocationScan: () => electron.ipcRenderer.invoke("photos:stop-location-scan"),
  onLocationScanProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    electron.ipcRenderer.on("location-scan:progress", listener);
    return () => {
      electron.ipcRenderer.removeListener("location-scan:progress", listener);
    };
  },
  // Folders & Sync
  getImportedFolders: () => electron.ipcRenderer.invoke("folders:get-all"),
  syncFolder: (folderPath) => electron.ipcRenderer.invoke("folders:sync", folderPath),
  syncAllFolders: () => electron.ipcRenderer.invoke("folders:sync-all"),
  removeImportedFolder: (folderId) => electron.ipcRenderer.invoke("folders:remove", folderId),
  // System ──────────────────────────────────────────────────────────
  getPlatform: () => electron.ipcRenderer.invoke("system:get-platform"),
  logError: (type, message) => electron.ipcRenderer.invoke("system:log-error", type, message),
  minimizeWindow: () => electron.ipcRenderer.invoke("window:minimize"),
  maximizeWindow: () => electron.ipcRenderer.invoke("window:maximize"),
  closeWindow: () => electron.ipcRenderer.invoke("window:close"),
  isWindowMaximized: () => electron.ipcRenderer.invoke("window:is-maximized"),
  // Event listeners
  onImportStatus: (callback) => {
    const handler = (_event, status) => {
      callback(status);
    };
    electron.ipcRenderer.on("import:status", handler);
    return () => electron.ipcRenderer.removeListener("import:status", handler);
  },
  onPhotoThumbnailUpdated: (callback) => {
    const handler = (_event, photoId) => {
      callback(photoId);
    };
    electron.ipcRenderer.on("photo:thumbnail-updated", handler);
    return () => electron.ipcRenderer.removeListener("photo:thumbnail-updated", handler);
  },
  onVideoThumbnailProgress: (callback) => {
    const handler = (_event, status) => {
      callback(status);
    };
    electron.ipcRenderer.on("video-thumbnail:progress", handler);
    return () => electron.ipcRenderer.removeListener("video-thumbnail:progress", handler);
  },
  onSyncStatus: (callback) => {
    const handler = (_event, status) => {
      callback(status);
    };
    electron.ipcRenderer.on("sync:status", handler);
    return () => electron.ipcRenderer.removeListener("sync:status", handler);
  },
  onSyncAllCompleted: (callback) => {
    const handler = (_event, results) => {
      callback(results);
    };
    electron.ipcRenderer.on("sync:all-completed", handler);
    return () => electron.ipcRenderer.removeListener("sync:all-completed", handler);
  },
  onMenuImportFolder: (callback) => {
    const handler = () => callback();
    electron.ipcRenderer.on("menu:import-folder", handler);
    return () => electron.ipcRenderer.removeListener("menu:import-folder", handler);
  },
  onMenuImportFiles: (callback) => {
    const handler = () => callback();
    electron.ipcRenderer.on("menu:import-files", handler);
    return () => electron.ipcRenderer.removeListener("menu:import-files", handler);
  }
};
electron.contextBridge.exposeInMainWorld("photoVault", api);
