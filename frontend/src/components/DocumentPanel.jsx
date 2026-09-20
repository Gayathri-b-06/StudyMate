import { useCallback, useEffect, useRef, useState } from 'react'
import { getDocumentStatus, getProjectDocuments, removeDocument, uploadProjectDocuments } from '../api/client'
import IndexTab from './common/IndexTab'

const documentStatuses = {
  uploaded: { label: 'Uploaded', variant: 'muted', detail: 'File uploaded. Preparing indexing…' },
  indexing: { label: 'Indexing', variant: 'warning', detail: 'Preparing your document for study.' },
  ready: { label: 'Ready', variant: 'success', detail: 'Available to AI Tutor and document search.' },
  error: { label: 'Error', variant: 'danger', detail: 'Indexing failed.' },
}

function documentStatusFor(status) {
  return documentStatuses[status] ?? documentStatuses.uploaded
}

/* ── Icon helpers (inline SVG) ─────────────────────────── */
function FileIcon() {
  return (
    <svg className="size-5 shrink-0 text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg className="size-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
  )
}

/* ── Skeleton row ───────────────────────────────────────── */
function SkeletonRow() {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5">
      <div className="skeleton size-5 shrink-0 rounded" />
      <div className="flex-1 space-y-1.5">
        <div className="skeleton h-3 w-2/3 rounded" />
        <div className="skeleton h-2.5 w-1/3 rounded" />
      </div>
    </li>
  )
}

/* ── Per-document indexing status poller ────────────────── */
function useIndexingPoller(documents, setDocuments, onDocumentStatusChanged) {
  const intervalsRef = useRef({})

  useEffect(() => {
    // The backend status is authoritative; only poll non-terminal states.
    documents.forEach((doc) => {
      if (!['uploaded', 'indexing'].includes(doc.index_status)) return
      if (intervalsRef.current[doc.id]) return // already polling

      const poll = async () => {
        try {
          const status = await getDocumentStatus(doc.id)
          setDocuments((prev) => prev.map((d) => d.id === doc.id ? {
            ...d,
            index_status: status.index_status,
            page_count: status.page_count,
            chunk_count: status.chunk_count,
            index_error: status.index_error ?? null,
          } : d))
          if (['ready', 'error'].includes(status.index_status)) {
            clearInterval(intervalsRef.current[doc.id])
            delete intervalsRef.current[doc.id]
            // Keep the project-level library in sync so every study tool sees
            // the completed indexing state without a browser refresh.
            void onDocumentStatusChanged?.()
          }
        } catch {
          // Network blip — keep polling
        }
      }
      void poll()
      const id = setInterval(poll, 2000)

      intervalsRef.current[doc.id] = id
    })

    // Clear intervals for docs no longer in list
    Object.keys(intervalsRef.current).forEach((docId) => {
      if (!documents.find((d) => d.id === docId)) {
        clearInterval(intervalsRef.current[docId])
        delete intervalsRef.current[docId]
      }
    })
  }, [documents, setDocuments, onDocumentStatusChanged])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(intervalsRef.current).forEach(clearInterval)
    }
  }, [])
}

/* ── Main Component ─────────────────────────────────────── */
export default function DocumentPanel({ projectId, documents: projectDocuments = [], onDocumentUploaded }) {
  const [documents, setDocuments] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState('')
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef(null)

  // Start polling for any documents still indexing
  useIndexingPoller(documents, setDocuments, onDocumentUploaded)

  // The parent owns the shared project document library used by Quiz,
  // Flashcards, the planner, and AI Tutor. Mirror parent updates here rather
  // than leaving this page with an isolated post-upload list.
  useEffect(() => {
    setDocuments(projectDocuments)
  }, [projectDocuments])

  /* Load docs whenever threadId changes */
  useEffect(() => {
    if (!projectId) { setDocuments([]); return }

    let cancelled = false
    setIsLoading(true)
    setError('')
    getProjectDocuments(projectId)
      .then((docs) => {
        if (!cancelled) {
          setDocuments(docs)
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [projectId])

  /* Upload logic — returns immediately (202), polling handles the rest */
  const handleUpload = useCallback(async (files) => {
    if (isUploading) return
    const pdfs = [...files].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) { setUploadError('Only PDF files are accepted.'); return }
    setUploadError('')
    setIsUploading(true)
    try {
      const result = await uploadProjectDocuments(projectId, pdfs)
      // Add placeholder docs with index_status='indexing' — poller will update them
      setDocuments((prev) => {
        return [...prev, ...result.documents]
      })
      await onDocumentUploaded?.()
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setIsUploading(false)
    }
  }, [projectId, isUploading, onDocumentUploaded])

  /* Delete logic */
  async function handleDelete(doc) {
    if (doc.index_status === 'indexing') {
      alert('Please wait until indexing is complete before deleting.')
      return
    }
    if (!window.confirm(`Remove "${doc.filename}" from this project?`)) return
    try {
      await removeDocument(doc.id)
      setDocuments((prev) => {
        return prev.filter((document) => document.id !== doc.id)
      })
      await onDocumentUploaded?.()
    } catch (err) {
      setError(err.message)
    }
  }

  /* Drag-and-drop handlers */
  function onDragOver(e) { e.preventDefault(); setIsDragOver(true) }
  function onDragLeave() { setIsDragOver(false) }
  function onDrop(e) {
    e.preventDefault()
    setIsDragOver(false)
    void handleUpload(e.dataTransfer.files)
  }

  /* ── No thread selected state ──────────────────────────── */
  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center animate-fade-in font-sans">
        <div className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200">
          <FileIcon />
        </div>
        <p className="text-sm font-bold text-slate-900 font-heading">No project selected</p>
        <p className="text-xs leading-5 text-slate-500">Choose a project to upload and manage its study sources.</p>
      </div>
    )
  }

  return (
    <div className="study-documents flex flex-col gap-4 animate-fade-in font-sans">
      {/* Upload area */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload PDF files"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed py-7 text-center transition-all ${
          isDragOver
            ? 'border-emerald-500 bg-emerald-50 scale-[1.01]'
            : 'border-emerald-300/80 bg-emerald-50/30 hover:border-emerald-500 hover:bg-emerald-50/60 shadow-xs'
        }`}
      >
        <UploadIcon />
        <p className="text-sm font-bold text-slate-900 font-heading">
          {isUploading ? 'Uploading…' : 'Drop PDFs here or click to browse'}
        </p>
        <p className="text-xs text-slate-500">PDF only · multiple files supported</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          disabled={isUploading}
          onChange={(e) => {
            void handleUpload(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {/* Errors */}
      {uploadError && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{uploadError}</p>
      )}
      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{error}</p>
      )}

      {/* Document list */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400 font-mono-numbers">
          Uploaded Documents
        </p>
        <ul className="space-y-2">
          {isLoading ? (
            <><SkeletonRow /><SkeletonRow /></>
          ) : documents.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500">
              No documents yet. Upload a PDF to get started.
            </li>
          ) : (
            documents.map((doc) => (
              <li
                key={doc.id}
                className="group flex items-start gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 transition hover:border-emerald-300 shadow-xs card-lift"
              >
                <FileIcon />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900 font-heading" title={doc.filename}>
                    {doc.filename}
                  </p>
                  {(() => {
                    const lifecycle = documentStatusFor(doc.index_status)
                    return <>
                      <div className="mt-1 flex items-center gap-2">
                        <IndexTab variant={lifecycle.variant}>{lifecycle.label}</IndexTab>
                        {doc.index_status === 'indexing' && <span className="size-2.5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" aria-label="Indexing in progress" />}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{lifecycle.detail}</p>
                      {doc.index_status === 'error' && doc.index_error && <p className="mt-1 text-xs font-medium text-rose-700">{doc.index_error}</p>}
                    </>
                  })()}
                  {doc.index_status === 'error' ? (
                    <p className="mt-0.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 p-1 rounded inline-block">Indexing failed — try re-uploading</p>
                  ) : doc.index_status === 'ready' ? (
                    <p className="mt-0.5 text-xs text-slate-500 font-mono-numbers">
                      {doc.page_count ?? '?'} pages · {doc.chunk_count ?? '?'} chunks
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(doc)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 cursor-pointer"
                  aria-label={`Delete ${doc.filename}`}
                  title="Delete document"
                >
                  <TrashIcon />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
