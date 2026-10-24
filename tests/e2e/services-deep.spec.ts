import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { launchTestApp, TestAppContext } from '../helpers/electron-app'
import { clusterAndPropagateLocations } from '../../src/main/services/location/sessionClusterer'

test.describe.serial('PhotoSort Advanced Services & Uncovered Subsystems Automation Suite', () => {
  test.setTimeout(120000)

  let appCtx: TestAppContext
  const sampleLibraryPath = path.join(process.cwd(), 'test-fixtures', 'sample-library')
  const tempDestDir = path.join(process.cwd(), 'test-fixtures', 'temp-large-files-dest')
  const tempTestFile = path.join(sampleLibraryPath, 'temp_test_mover.jpg')

  test.beforeAll(async () => {
    // Launch test app
    appCtx = await launchTestApp()
    const { page } = appCtx

    // Ensure sample photos are imported
    await page.evaluate(async (dir) => {
      if ((window as any).photoVault?.importFolder) {
        return await (window as any).photoVault.importFolder(dir)
      }
      return null
    }, sampleLibraryPath)

    await page.waitForTimeout(1000)
  })

  test.afterAll(async () => {
    // Clean up any test artifacts if left over
    if (fs.existsSync(tempTestFile)) {
      try { fs.unlinkSync(tempTestFile) } catch {}
    }
    if (fs.existsSync(tempDestDir)) {
      try { fs.rmSync(tempDestDir, { recursive: true, force: true }) } catch {}
    }
    if (appCtx) {
      await appCtx.close()
    }
  })

  test('Subsystem 1: Tags Lifecycle (Create, Query, Assign, Sync, Rename, Remove, Delete)', async () => {
    const { page, errors } = appCtx

    const tagResults = await page.evaluate(async () => {
      const pv = (window as any).photoVault
      const photos = await pv.getPhotos({})
      if (!photos || photos.length === 0) return { error: 'No photos found' }
      const photoId = photos[0].id

      // 1. Create tags
      const tag1 = await pv.createTag('SummerVacation', '#3b82f6')
      const tag2 = await pv.createTag('Landscapes', '#10b981')

      // 2. Query all tags
      const allTagsBefore = await pv.getAllTags()

      // 3. Assign tags to photo
      await pv.addTagsToPhotos([photoId], [tag1.id, tag2.id])
      const photoTags = await pv.getTagsForPhoto(photoId)

      // 4. Query photos by tag
      const taggedPhotos = await pv.getPhotosByTag(tag1.id)
      const allTagged = await pv.getAllTaggedPhotos()

      // 5. Rename tag
      await pv.renameTag(tag1.id, 'Summer2026', '#f59e0b')
      const renamedTags = await pv.getAllTags()

      // 6. Remove tag from photo
      await pv.removeTagFromPhotos([photoId], tag2.id)
      const photoTagsAfterRemove = await pv.getTagsForPhoto(photoId)

      // 7. Delete tag
      await pv.deleteTag(tag1.id)
      await pv.deleteTag(tag2.id)
      const allTagsAfter = await pv.getAllTags()

      return {
        tag1,
        tag2,
        allTagsBeforeCount: allTagsBefore.length,
        photoTagsCount: photoTags.length,
        taggedPhotosCount: taggedPhotos.length,
        allTaggedCount: allTagged.length,
        renamedTag: renamedTags.find((t: any) => t.id === tag1.id),
        photoTagsAfterRemoveCount: photoTagsAfterRemove.length,
        allTagsAfterCount: allTagsAfter.length
      }
    })

    expect(tagResults.tag1).toBeDefined()
    expect(tagResults.tag1.name).toBe('SummerVacation')
    expect(tagResults.allTagsBeforeCount).toBeGreaterThanOrEqual(2)
    expect(tagResults.photoTagsCount).toBe(2)
    expect(tagResults.taggedPhotosCount).toBeGreaterThanOrEqual(1)
    expect(tagResults.renamedTag?.name).toBe('Summer2026')
    expect(tagResults.photoTagsAfterRemoveCount).toBe(1)
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Subsystem 2: Albums Complete Lifecycle (Create, Add Photos, Update, Remove Photos, Delete)', async () => {
    const { page, errors } = appCtx

    const albumResults = await page.evaluate(async () => {
      const pv = (window as any).photoVault
      const photos = await pv.getPhotos({})
      if (!photos || photos.length < 2) return { error: 'Insufficient photos' }
      const photoIds = [photos[0].id, photos[1].id]

      // 1. Create album
      const album = await pv.createAlbum('Test Album Automation')

      // 2. Query all albums
      const allAlbums = await pv.getAlbums()

      // 3. Add photos to album
      await pv.addPhotosToAlbum(album.id, photoIds)
      const albumDetails = await pv.getAlbumById(album.id)

      // 4. Update album name
      const updated = await pv.updateAlbum(album.id, 'Renamed Album 2026')

      // 5. Remove 1 photo from album
      await pv.removePhotosFromAlbum(album.id, [photoIds[0]])
      const albumDetailsAfterRemove = await pv.getAlbumById(album.id)

      // 6. Delete album
      const deleted = await pv.deleteAlbum(album.id)
      const allAlbumsAfter = await pv.getAlbums()

      return {
        albumId: album.id,
        allAlbumsCount: allAlbums.length,
        albumPhotoCount: albumDetails.photo_count ?? 0,
        updatedTitle: updated.name || updated.title,
        albumPhotoCountAfterRemove: albumDetailsAfterRemove.photo_count ?? 0,
        deletedSuccess: deleted,
        albumPresentAfterDelete: allAlbumsAfter.some((a: any) => a.id === album.id)
      }
    })

    expect(albumResults.albumId).toBeGreaterThan(0)
    expect(albumResults.allAlbumsCount).toBeGreaterThanOrEqual(1)
    expect(albumResults.albumPhotoCount).toBe(2)
    expect(albumResults.updatedTitle).toBe('Renamed Album 2026')
    expect(albumResults.albumPhotoCountAfterRemove).toBe(1)
    expect(albumResults.deletedSuccess).toBe(true)
    expect(albumResults.albumPresentAfterDelete).toBe(false)
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Subsystem 3: Large Files Relocation Mover & 1-Click Manifest Undo Restoration', async () => {
    const { page, errors } = appCtx

    const targetFile = path.join(sampleLibraryPath, 'sunset_beach_resized.jpg')

    if (!fs.existsSync(tempDestDir)) {
      fs.mkdirSync(tempDestDir, { recursive: true })
    }

    const moveResults = await page.evaluate(async (dest) => {
      const pv = (window as any).photoVault
      const allPhotos = await pv.getPhotos({})
      const targetPhoto = allPhotos.find((p: any) => p.filename === 'sunset_beach_resized.jpg')

      if (!targetPhoto) {
        return { error: 'Target photo sunset_beach_resized.jpg not found in DB' }
      }

      // 1. Execute Move
      const moveRes = await pv.moveLargeFiles({
        fileIds: [targetPhoto.id],
        destinationDir: dest,
        preserveRelativeSubpath: false,
        collisionStrategy: 'rename'
      })

      // 2. Check manifests
      const manifests = await pv.getLargeFileManifests()

      // 3. Execute Undo
      let undoRes = null
      if (moveRes.manifestId) {
        undoRes = await pv.undoLargeFileMove(moveRes.manifestId)
      }

      return {
        moveRes,
        manifestsCount: manifests.length,
        undoRes
      }
    }, tempDestDir)

    expect(moveResults.moveRes).toBeDefined()
    expect(moveResults.moveRes.success).toBe(true)
    expect(moveResults.moveRes.movedCount).toBe(1)
    expect(moveResults.manifestsCount).toBeGreaterThanOrEqual(1)
    expect(moveResults.undoRes).toBeDefined()
    expect(moveResults.undoRes.errors).toEqual([])
    expect(moveResults.undoRes.success).toBe(true)
    expect(moveResults.undoRes.restoredCount).toBe(1)

    // Verify file was restored back to original location
    expect(fs.existsSync(targetFile)).toBe(true)

    // Clean up temp dest dir
    try { fs.rmSync(tempDestDir, { recursive: true, force: true }) } catch {}

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Subsystem 4: People Merging, Profile Association, and Cover Photos', async () => {
    const { page, errors } = appCtx

    const mergeResults = await page.evaluate(async () => {
      const pv = (window as any).photoVault
      const photos = await pv.getPhotos({})
      if (!photos || photos.length < 2) return { error: 'Insufficient photos' }

      // 1. Create two separate people
      const person1Id = await pv.createPerson('Person Alpha', photos[0].id)
      const person2Id = await pv.createPerson('Person Beta', photos[1].id)

      // 2. Associate photos
      await pv.addPhotoToPerson(person1Id, photos[0].id)
      await pv.addPhotoToPerson(person2Id, photos[1].id)

      // 3. Set custom cover photo
      await pv.setPersonCoverPhoto(person1Id, photos[0].id)

      // 4. Merge person 2 into person 1
      await pv.mergePeople(person1Id, person2Id)

      // 5. Query people and photos after merge
      const peopleAfter = await pv.getPeople()
      const p1Photos = await pv.getPhotosByPerson(person1Id)
      const isP2Present = peopleAfter.some((p: any) => p.id === person2Id)

      // Clean up created test person
      await pv.deletePerson(person1Id)

      return {
        person1Id,
        person2Id,
        p1PhotosCount: p1Photos.length,
        isP2Present
      }
    })

    expect(mergeResults.person1Id).toBeGreaterThan(0)
    expect(mergeResults.p1PhotosCount).toBeGreaterThanOrEqual(2)
    expect(mergeResults.isP2Present).toBe(false)
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Subsystem 5: Photo Archiving and Unarchiving Lifecycle', async () => {
    const { page, errors } = appCtx

    const archiveResults = await page.evaluate(async () => {
      const pv = (window as any).photoVault
      const initialPhotos = await pv.getPhotos({ isArchived: false })
      if (!initialPhotos || initialPhotos.length === 0) return { error: 'No photos' }
      const targetId = initialPhotos[0].id

      // 1. Archive photo
      await pv.archive([targetId])

      // 2. Check archived photos list
      const archivedList = await pv.getPhotos({ isArchived: true })
      const isArchived = archivedList.some((p: any) => p.id === targetId)

      // 3. Check regular list excludes it
      const regularList = await pv.getPhotos({ isArchived: false })
      const inRegular = regularList.some((p: any) => p.id === targetId)

      // 4. Unarchive photo
      await pv.unarchive([targetId])

      // 5. Check restored in regular list
      const restoredList = await pv.getPhotos({ isArchived: false })
      const inRestored = restoredList.some((p: any) => p.id === targetId)

      return {
        targetId,
        isArchived,
        inRegular,
        inRestored
      }
    })

    expect(archiveResults.isArchived).toBe(true)
    expect(archiveResults.inRegular).toBe(false)
    expect(archiveResults.inRestored).toBe(true)
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Subsystem 6: Privacy Lock and Unlock Lifecycle', async () => {
    const { page, errors } = appCtx

    const lockResults = await page.evaluate(async () => {
      const pv = (window as any).photoVault
      const initialPhotos = await pv.getPhotos({ isLocked: false })
      if (!initialPhotos || initialPhotos.length === 0) return { error: 'No photos' }
      const targetId = initialPhotos[0].id

      // 1. Lock photo
      await pv.lockPhotos([targetId], true)

      // 2. Verify in locked photos query
      const lockedPhotos = await pv.getPhotos({ isLocked: true })
      const isLocked = lockedPhotos.some((p: any) => p.id === targetId)

      // 3. Unlock photo
      await pv.lockPhotos([targetId], false)
      const lockedPhotosAfter = await pv.getPhotos({ isLocked: true })
      const isLockedAfter = lockedPhotosAfter.some((p: any) => p.id === targetId)

      return {
        isLocked,
        isLockedAfter
      }
    })

    expect(lockResults.isLocked).toBe(true)
    expect(lockResults.isLockedAfter).toBe(false)
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Subsystem 7: Photo Metadata Updates & Full-Text Search Retrieval', async () => {
    const { page, errors } = appCtx

    const searchResults = await page.evaluate(async () => {
      const pv = (window as any).photoVault
      const photos = await pv.getPhotos({})
      if (!photos || photos.length === 0) return { error: 'No photos' }
      const photoId = photos[0].id

      // 1. Update metadata with unique searchable keyword
      const uniqueKeyword = `ExoticVoyage${Date.now()}`
      await pv.updateMetadata(photoId, { description: `Trip photo with keyword ${uniqueKeyword}` })

      // 2. Search by unique keyword
      const matchedPhotos = await pv.search(uniqueKeyword)

      // 3. Search by partial filename keyword
      const filenameMatch = await pv.search('sunset')

      return {
        uniqueKeyword,
        matchedCount: matchedPhotos.length,
        firstMatchId: matchedPhotos[0]?.id,
        photoId,
        filenameMatchCount: filenameMatch.length
      }
    })

    expect(searchResults.matchedCount).toBe(1)
    expect(searchResults.firstMatchId).toBe(searchResults.photoId)
    expect(searchResults.filenameMatchCount).toBeGreaterThanOrEqual(1)
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Subsystem 8: Heuristic Classifiers & Document False-Positive Cleaner', async () => {
    const { page, errors } = appCtx

    const classifierResults = await page.evaluate(async (sampleDir) => {
      const pv = (window as any).photoVault
      const screenshotPath = `${sampleDir}\\Screenshot_2026-03-15.png`
      const stickerPath = `${sampleDir}\\whatsapp_sticker_sample.jpg`

      // 1. Classify Screenshot
      const screenshotResult = await pv.classifyScreenshot(screenshotPath)

      // 2. Classify Junk
      const junkResult = await pv.classifyJunk(stickerPath)

      // 3. Clean false positive documents
      const cleanResult = await pv.cleanFalsePositiveDocuments()

      return {
        screenshotResult,
        junkResult,
        cleanResult
      }
    }, sampleLibraryPath)

    expect(classifierResults.screenshotResult).toBeDefined()
    expect(classifierResults.screenshotResult.classification).toBeDefined()
    expect(classifierResults.junkResult).toBeDefined()
    expect(classifierResults.cleanResult).toBeDefined()
    expect(typeof classifierResults.cleanResult.cleared).toBe('number')
    expect(typeof classifierResults.cleanResult.kept).toBe('number')
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Subsystem 9: Location Name Updates & System Platform Query', async () => {
    const { page, errors } = appCtx

    const locationResults = await page.evaluate(async () => {
      const pv = (window as any).photoVault
      const photos = await pv.getPhotos({})
      if (!photos || photos.length === 0) return { error: 'No photos' }
      const photoId = photos[0].id

      // 1. Update location name
      await pv.updateLocationName([photoId], 'Goa Paradise Beach')
      const res = await pv.getPhotoById(photoId)
      const loc = res?.photo ? res.photo.location_name : res?.location_name

      // 2. Platform query
      const platform = await pv.getPlatform()

      return {
        locationName: loc,
        platform
      }
    })

    expect(locationResults.locationName).toBe('Goa Paradise Beach')
    expect(['win32', 'darwin', 'linux']).toContain(locationResults.platform)
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Subsystem 10: Photo Analyzer Blur Scores, aHash Fingerprinting & Scan Reset', async () => {
    const { page, errors } = appCtx

    const analysisResults = await page.evaluate(async () => {
      const pv = (window as any).photoVault
      const photos = await pv.getPhotos({})
      if (!photos || photos.length === 0) return { error: 'No photos' }
      const photoId = photos[0].id

      // 1. Reset analysis data
      await pv.resetUtilityScanData()

      // 2. Query unanalyzed photos
      const unanalyzed = await pv.getUnanalyzedPhotos()

      // 3. Save calculated perceptual hash and blur score
      const testHash = 'a1b2c3d4e5f60718'
      const testBlur = 145.82
      await pv.savePhotoAnalysis(photoId, testBlur, testHash)

      // 4. Verify photo row now reflects blur score and perceptual hash
      const photoRes = await pv.getPhotoById(photoId)
      const p = photoRes?.photo || photoRes

      return {
        unanalyzedCount: unanalyzed.length,
        savedBlur: p.blur_score,
        savedHash: p.perceptual_hash
      }
    })

    expect(analysisResults.unanalyzedCount).toBeGreaterThan(0)
    expect(analysisResults.savedBlur).toBeCloseTo(145.82, 1)
    expect(analysisResults.savedHash).toBe('a1b2c3d4e5f60718')
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Subsystem 11: Spatio-Temporal Session Clustering & Offline Location Propagation', async () => {
    const { errors } = appCtx

    const mockPhotos = [
      {
        id: 101,
        filename: 'taj_mahal_gate.jpg',
        created_at: '2026-04-10T10:00:00.000Z',
        file_path: 'C:/photos/taj1.jpg',
        gps_lat: 27.1751,
        gps_lon: 78.0421,
        extracted_text: null
      },
      {
        id: 102,
        filename: 'taj_mahal_garden.jpg',
        created_at: '2026-04-10T10:45:00.000Z',
        file_path: 'C:/photos/taj2.jpg',
        gps_lat: null, // Companion photo in same session without GPS
        gps_lon: null,
        extracted_text: null
      }
    ]

    const results = clusterAndPropagateLocations(mockPhotos)
    expect(results.length).toBe(2)

    const propagated = results.find(r => r.id === 102)
    expect(propagated).toBeDefined()
    expect(propagated?.isInferred).toBe(true)
    expect(propagated?.locationName).toContain('Agra')

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })
})

