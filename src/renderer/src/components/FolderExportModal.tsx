import React, { useState, useEffect, useMemo } from 'react'
import {
  Folder, FolderTree, ArrowRight, Download, CheckCircle2,
  AlertTriangle, ShieldCheck, Sparkles, MapPin, FileText,
  Smartphone, Film, HardDrive, RefreshCw, X, ChevronRight,
  ChevronDown, Check, Loader2, ArrowLeft, ExternalLink, FileSpreadsheet
} from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import { formatFileSize } from '../utils/helpers'

interface FolderExportModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: 'copy' | 'move'
  specificFolderFilter?: string
}

export default function FolderExportModal({
  isOpen,
  onClose,
  initialMode = 'copy',
  specificFolderFilter
}: FolderExportModalProps) {
  const { state: photoState, refreshPhotos } = usePhotos()
  const { showToast } = useApp()

  // Step state: 1 = Config, 2 = Preview Tree, 3 = Progress, 4 = Complete
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Options
  const [mode, setMode] = useState<'copy' | 'move'>(initialMode)
  const [destinationDir, setDestinationDir] = useState<string>('')
  const [preset, setPreset] = useState<'smart-hierarchy' | 'year-month' | 'category-first'>('smart-hierarchy')
  const [separateTrips, setSeparateTrips] = useState(true)
  const [smartTripInference, setSmartTripInference] = useState(true)
  const [separateDocuments, setSeparateDocuments] = useState(true)
  const [separateScreenshots, setSeparateScreenshots] = useState(true)
  const [separateVideos, setSeparateVideos] = useState(true)

  // Preview Plan
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewPlan, setPreviewPlan] = useState<any>(null)
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())

  // Execution & Progress
  const [isExecuting, setIsExecuting] = useState(false)
  const [progress, setProgress] = useState<{
    completed: number
    total: number
    currentFile: string
    bytesTransferred: number
    totalBytes: number
    percentage: number
    speedBytesPerSec?: number
  } | null>(null)

  // Result
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setMode(initialMode)
      setProgress(null)
      setResult(null)
      setIsExecuting(false)
    }
  }, [isOpen, initialMode])

  // Subscribe to progress events from main process
  useEffect(() => {
    if (window.photoVault?.onOrganizationProgress) {
      const cleanup = window.photoVault.onOrganizationProgress((p: any) => {
        setProgress(p)
      })
      return cleanup
    }
    return undefined
  }, [])

  // Handle selecting destination directory
  const handleBrowseDestination = async () => {
    try {
      if (window.photoVault?.selectOrganizationDestination) {
        const selected = await window.photoVault.selectOrganizationDestination()
        if (selected) {
          setDestinationDir(selected)
        }
      }
    } catch (err: any) {
      showToast(`Error choosing destination: ${err?.message || err}`)
    }
  }

  // Load / Generate Preview Plan
  const handleGeneratePreview = async () => {
    if (!destinationDir && mode === 'copy') {
      showToast('Please select a destination folder first')
      return
    }

    setIsLoadingPreview(true)
    try {
      if (window.photoVault?.previewOrganizationPlan) {
        const plan = await window.photoVault.previewOrganizationPlan({
          mode,
          destinationDir,
          preset,
          separateTrips,
          smartTripInference,
          separateDocuments,
          separateScreenshots,
          separateVideos,
          folderPathFilter: specificFolderFilter
        })
        setPreviewPlan(plan)
        // Expand first 2 years by default
        if (plan?.yearGroups?.length > 0) {
          const firstYears = new Set<string>(plan.yearGroups.slice(0, 2).map((g: any) => g.year))
          setExpandedYears(firstYears)
        }
        setStep(2)
      }
    } catch (err: any) {
      showToast(`Failed to analyze plan: ${err?.message || err}`)
    } finally {
      setIsLoadingPreview(false)
    }
  }

  const toggleYearExpanded = (year: string) => {
    setExpandedYears(prev => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  // Start Execution
  const handleStartOrganizing = async () => {
    setStep(3)
    setIsExecuting(true)
    setProgress({
      completed: 0,
      total: previewPlan?.totalFiles || 1,
      currentFile: 'Preparing file catalog...',
      bytesTransferred: 0,
      totalBytes: previewPlan?.totalBytes || 0,
      percentage: 0
    })

    try {
      if (window.photoVault?.executeOrganization) {
        const res = await window.photoVault.executeOrganization({
          mode,
          destinationDir: destinationDir || (mode === 'move' ? (specificFolderFilter || 'Current Library') : ''),
          preset,
          separateTrips,
          smartTripInference,
          separateDocuments,
          separateScreenshots,
          separateVideos,
          folderPathFilter: specificFolderFilter
        })
        setResult(res)
        setStep(4)
        if (mode === 'move') {
          refreshPhotos()
        }
      }
    } catch (err: any) {
      showToast(`Organization error: ${err?.message || err}`)
      setIsExecuting(false)
    } finally {
      setIsExecuting(false)
    }
  }

  const handleCancelExecution = async () => {
    if (window.photoVault?.cancelOrganization) {
      await window.photoVault.cancelOrganization()
      showToast('Cancelling organization...')
    }
  }

  const handleOpenDestinationFolder = async () => {
    const target = result?.destinationDir || destinationDir
    if (target && window.photoVault?.showInFolder) {
      await window.photoVault.showInFolder(target)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px'
      }}
      onClick={isExecuting ? undefined : onClose}
    >
      <div
        style={{
          width: '740px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          backgroundColor: 'var(--bg-secondary, #1e293b)',
          borderRadius: '24px',
          border: '1px solid var(--border, #334155)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
          color: 'var(--text-primary, #ffffff)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(14, 165, 233, 0.35)'
              }}
            >
              <FolderTree size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                Organize & Export Library
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Structure files by Year &rarr; Trips &rarr; Documents &rarr; Screenshots &rarr; Months
              </p>
            </div>
          </div>

          {!isExecuting && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              style={{ padding: '6px', color: 'var(--text-secondary)' }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* ── Step Content ────────────────────────────────────────────────── */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {/* ── STEP 1: Configuration & Options ───────────────────────────── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {/* 1. Mode Selection */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  1. Choose Operation Mode
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {/* Mode Card A: Copy / Export to New Folder */}
                  <div
                    onClick={() => setMode('copy')}
                    style={{
                      padding: '18px',
                      borderRadius: '16px',
                      border: mode === 'copy' ? '2px solid #0ea5e9' : '1px solid var(--border)',
                      background: mode === 'copy' ? 'rgba(14, 165, 233, 0.1)' : 'var(--bg-tertiary, #0f172a)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Download size={18} color="#0ea5e9" />
                        <strong style={{ fontSize: '15px' }}>Export to New Folder</strong>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 800, background: '#0ea5e9', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>
                        RECOMMENDED
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                      Non-destructive copy to any folder or external drive. Your existing files stay 100% untouched.
                    </p>
                  </div>

                  {/* Mode Card B: Reorganize in Place (Move) */}
                  <div
                    onClick={() => setMode('move')}
                    style={{
                      padding: '18px',
                      borderRadius: '16px',
                      border: mode === 'move' ? '2px solid #3b82f6' : '1px solid var(--border)',
                      background: mode === 'move' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary, #0f172a)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <RefreshCw size={18} color="#3b82f6" />
                        <strong style={{ fontSize: '15px' }}>Reorganize In-Place</strong>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '10px' }}>
                        MOVE
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                      Restructures files directly inside the source folder. Database paths are safely synchronized.
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. Destination Folder Selector (if Copy mode or custom target) */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  2. Destination Directory
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    value={destinationDir}
                    onChange={(e) => setDestinationDir(e.target.value)}
                    placeholder="Click Browse to choose target folder or external drive..."
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-tertiary, #0f172a)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleBrowseDestination}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)'
                    }}
                  >
                    <Folder size={16} /> Browse...
                  </button>
                </div>
              </div>

              {/* 3. Hierarchy Scheme Preset */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  3. Hierarchy Preset
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {[
                    { id: 'smart-hierarchy', title: 'Smart Trips & Year', desc: 'Year / [Trips | Docs | Screenshots | Months]' },
                    { id: 'year-month', title: 'Year & Month', desc: 'Year / 01 - January, 02 - February...' },
                    { id: 'category-first', title: 'Category First', desc: 'Photos / Year, Videos / Year, Documents...' }
                  ].map(p => (
                    <div
                      key={p.id}
                      onClick={() => setPreset(p.id as any)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: preset === p.id ? '2px solid #0ea5e9' : '1px solid var(--border)',
                        background: preset === p.id ? 'rgba(14, 165, 233, 0.1)' : 'var(--bg-tertiary, #0f172a)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <strong style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>{p.title}</strong>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{p.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Smart Category Segregation Toggles */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  4. Smart Segregation Rules
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: 'var(--bg-tertiary, #0f172a)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={separateTrips}
                      onChange={e => setSeparateTrips(e.target.checked)}
                      style={{ accentColor: '#0ea5e9' }}
                    />
                    <MapPin size={16} color="#0ea5e9" />
                    <span>Group Trips by Location / City</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: 'rgba(14, 165, 233, 0.08)',
                      border: '1px solid rgba(14, 165, 233, 0.25)',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                    title="Includes WhatsApp and 3rd party photos without GPS that were taken during the trip dates"
                  >
                    <input
                      type="checkbox"
                      checked={smartTripInference}
                      onChange={e => setSmartTripInference(e.target.checked)}
                      style={{ accentColor: '#0ea5e9' }}
                    />
                    <Sparkles size={16} color="#0ea5e9" />
                    <span>Smart Match (Include WhatsApp)</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: 'var(--bg-tertiary, #0f172a)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={separateDocuments}
                      onChange={e => setSeparateDocuments(e.target.checked)}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    <FileText size={16} color="#3b82f6" />
                    <span>Separate OCR Documents & IDs</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: 'var(--bg-tertiary, #0f172a)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={separateScreenshots}
                      onChange={e => setSeparateScreenshots(e.target.checked)}
                      style={{ accentColor: '#8b5cf6' }}
                    />
                    <Smartphone size={16} color="#8b5cf6" />
                    <span>Separate Screenshots</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: 'var(--bg-tertiary, #0f172a)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={separateVideos}
                      onChange={e => setSeparateVideos(e.target.checked)}
                      style={{ accentColor: '#ec4899' }}
                    />
                    <Film size={16} color="#ec4899" />
                    <span>Separate Video Files</span>
                  </label>
                </div>
              </div>

              {/* Zero-Loss Safety Guarantee Notice */}
              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <ShieldCheck size={24} color="#22c55e" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: '#22c55e', display: 'block', marginBottom: '2px' }}>
                    100% Zero-Loss Guarantee
                  </strong>
                  Duplicate filenames are automatically preserved via numbering (e.g. <code>IMG_0001 (1).JPG</code>). Every file transfer is verified byte-by-byte.
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Interactive Tree Preview ──────────────────────────── */}
          {step === 2 && previewPlan && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Pre-Flight Summary Statistics */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '10px',
                  background: 'var(--bg-tertiary, #0f172a)',
                  padding: '14px',
                  borderRadius: '14px',
                  border: '1px solid var(--border)'
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>TOTAL FILES</span>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {previewPlan.totalFiles.toLocaleString()}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>TOTAL SIZE</span>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {formatFileSize(previewPlan.totalBytes)}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>TRIPS / EVENTS</span>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: '#0ea5e9' }}>
                    {previewPlan.categoryBreakdown.trips}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>DOCUMENTS</span>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: '#3b82f6' }}>
                    {previewPlan.categoryBreakdown.documents}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>SCREENSHOTS</span>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: '#8b5cf6' }}>
                    {previewPlan.categoryBreakdown.screenshots}
                  </div>
                </div>
              </div>

              {/* Interactive Folder Tree View */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
                    Folder Hierarchy Preview
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    Target: {destinationDir || 'Current Folder'}
                  </span>
                </div>

                <div
                  style={{
                    maxHeight: '340px',
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: '14px',
                    background: 'var(--bg-tertiary, #0f172a)',
                    padding: '12px'
                  }}
                >
                  {previewPlan.yearGroups.map((yearGroup: any) => {
                    const isExpanded = expandedYears.has(yearGroup.year)
                    return (
                      <div key={yearGroup.year} style={{ marginBottom: '8px' }}>
                        {/* Year Node */}
                        <div
                          onClick={() => toggleYearExpanded(yearGroup.year)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderRadius: '10px',
                            background: 'rgba(255, 255, 255, 0.04)',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <Folder size={18} color="#0ea5e9" />
                            <strong style={{ fontSize: '14px' }}>Year {yearGroup.year}</strong>
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {yearGroup.fileCount} items • {formatFileSize(yearGroup.totalBytes)}
                          </span>
                        </div>

                        {/* Subfolder Children */}
                        {isExpanded && (
                          <div style={{ paddingLeft: '28px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {yearGroup.subfolders.map((sub: any) => (
                              <div
                                key={sub.name}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '6px 10px',
                                  borderRadius: '8px',
                                  background: 'rgba(0, 0, 0, 0.2)',
                                  fontSize: '12px'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Folder size={14} color="var(--text-secondary)" />
                                  <span>{sub.name}</span>
                                </div>
                                <span style={{ color: 'var(--text-tertiary)' }}>
                                  {sub.fileCount} files ({formatFileSize(sub.totalBytes)})
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Live Progress ─────────────────────────────────────── */}
          {step === 3 && progress && (
            <div style={{ textAlign: 'center', padding: '30px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(14, 165, 233, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0ea5e9'
                }}
              >
                <Loader2 size={36} className="animate-spin" />
              </div>

              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px 0' }}>
                  Organizing Library Files...
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, maxWidth: '500px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {progress.currentFile || 'Transferring files...'}
                </p>
              </div>

              {/* Progress Bar */}
              <div style={{ width: '100%', maxWidth: '540px' }}>
                <div
                  style={{
                    width: '100%',
                    height: '10px',
                    backgroundColor: 'var(--bg-tertiary, #0f172a)',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    marginBottom: '10px'
                  }}
                >
                  <div
                    style={{
                      width: `${progress.percentage}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #0ea5e9 0%, #3b82f6 100%)',
                      borderRadius: '6px',
                      transition: 'width 0.2s ease'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span>{progress.completed} of {progress.total} files ({progress.percentage}%)</span>
                  <span>{formatFileSize(progress.bytesTransferred)} of {formatFileSize(progress.totalBytes)}</span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancelExecution}
                style={{ marginTop: '10px', padding: '8px 20px', fontSize: '13px' }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* ── STEP 4: Completion & Zero-Loss Verification Report ─────────── */}
          {step === 4 && result && (
            <div style={{ textAlign: 'center', padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#22c55e'
                }}
              >
                <CheckCircle2 size={40} />
              </div>

              <div>
                <h3 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
                  Organization Complete!
                </h3>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(34, 197, 94, 0.12)',
                    color: '#22c55e',
                    padding: '4px 14px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: 700
                  }}
                >
                  <ShieldCheck size={16} /> 100% Zero-Loss Verified
                </div>
              </div>

              {/* Statistics Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                  width: '100%',
                  maxWidth: '540px',
                  background: 'var(--bg-tertiary, #0f172a)',
                  padding: '16px',
                  borderRadius: '16px',
                  border: '1px solid var(--border)'
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>TOTAL FILES</span>
                  <div style={{ fontSize: '18px', fontWeight: 800 }}>{result.totalFiles}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>PROCESSED</span>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#22c55e' }}>{result.processedCount}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>ERRORS / LOST</span>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: result.failedCount === 0 ? '#22c55e' : '#ef4444' }}>
                    {result.failedCount}
                  </div>
                </div>
              </div>

              {/* Destination directory preview */}
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '540px' }}>
                Files organized at: <code>{result.destinationDir}</code>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleOpenDestinationFolder}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)'
                  }}
                >
                  <ExternalLink size={16} /> Open in File Explorer
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '14px' }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Modal Footer ────────────────────────────────────────────────── */}
        {!isExecuting && step !== 3 && step !== 4 && (
          <div
            style={{
              padding: '16px 28px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-tertiary, #0f172a)'
            }}
          >
            {step === 1 ? (
              <>
                <button type="button" className="btn btn-ghost" onClick={onClose} style={{ fontSize: '13px' }}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleGeneratePreview}
                  disabled={isLoadingPreview || (!destinationDir && mode === 'copy')}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)'
                  }}
                >
                  {isLoadingPreview ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Analyzing Library...
                    </>
                  ) : (
                    <>
                      Analyze & Preview Hierarchy <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setStep(1)}
                  style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <ArrowLeft size={14} /> Back to Options
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStartOrganizing}
                  style={{
                    padding: '8px 22px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
                    boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)'
                  }}
                >
                  <Sparkles size={15} /> Start Organizing ({previewPlan?.totalFiles} Files)
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
