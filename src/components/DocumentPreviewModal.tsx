import { useEffect, useState } from 'react';
import { useDialog } from '../useDialog';
import { useModalPresence } from '../lib/useModalPresence';
import { Icon } from './Icons';
import { api, type AppDocumentFile } from '../api';

interface Props {
  open: boolean;
  appId: string;
  company: string;
  role: string;
  folderPath?: string;
  onClose: () => void;
  onRequestCv?: () => void;
}

export function DocumentPreviewModal({
  open,
  appId,
  company,
  role,
  folderPath,
  onClose,
  onRequestCv,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<AppDocumentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<AppDocumentFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useDialog(open, onClose);
  const presence = useModalPresence(open);

  useEffect(() => {
    if (!open || !appId) return;
    setLoading(true);
    setError(null);
    api
      .getDocuments(appId)
      .then((res) => {
        setFiles(res.files || []);
        // Pick PDF first if available, else first document
        const initial =
          res.files.find((f) => f.kind === 'cvPdf') ||
          res.files.find((f) => f.ext === 'pdf') ||
          res.files[0] ||
          null;
        setSelectedFile(initial);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, appId]);

  if (!presence.mounted) return null;

  const handleOpenFolder = () => {
    if (folderPath) {
      api.openFolder(folderPath);
    }
  };

  return (
    <div
      ref={presence.ref}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        data-modal-panel
        className="relative flex h-[92vh] w-full max-w-5xl flex-col rounded-md border-2 border-line bg-panel shadow-hardMd"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-line px-5 py-3.5 bg-panel-2/30">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="section-label text-accent">Document Viewer</span>
              {files.length > 0 && (
                <span className="chip text-micro font-mono">
                  {files.length} {files.length === 1 ? 'file' : 'files'}
                </span>
              )}
            </div>
            <h2 className="truncate text-heading font-semibold text-ink">
              {company} — <span className="text-ink-soft">{role}</span>
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {folderPath && (
              <button
                onClick={handleOpenFolder}
                title="Open containing folder in File Explorer (Windows local)"
                className="btn-quiet hidden sm:inline-flex py-1.5 px-3 text-micro"
              >
                <Icon.Folder className="h-3.5 w-3.5" />
                Folder
              </button>
            )}
            <button
              onClick={onClose}
              title="Close (Esc)"
              className="rounded-full border border-line p-1.5 text-ink-soft transition hover:border-accent hover:text-accent"
            >
              <Icon.Close className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* File Tabs Strip */}
        {files.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line-soft px-5 py-2 bg-panel">
            {files.map((f) => {
              const active = selectedFile?.name === f.name;
              return (
                <button
                  key={f.name}
                  onClick={() => setSelectedFile(f)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label font-medium transition ${
                    active
                      ? 'border-2 border-line bg-accent text-on-accent shadow-hardXs'
                      : 'border border-line-soft text-ink-soft hover:border-line hover:text-ink'
                  }`}
                >
                  {f.ext === 'pdf' ? (
                    <Icon.Check className="h-3 w-3" />
                  ) : (
                    <Icon.Folder className="h-3 w-3" />
                  )}
                  <span>
                    {f.kind === 'cvPdf'
                      ? 'CV (PDF)'
                      : f.kind === 'cvDocx'
                        ? 'CV (Word)'
                        : f.kind === 'coverPdf'
                          ? 'Cover Letter (PDF)'
                          : f.kind === 'coverDocx'
                            ? 'Cover Letter (Word)'
                            : f.name}
                  </span>
                  <span className="text-micro opacity-70">
                    ({Math.round(f.size / 1024)} KB)
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Content Viewer Area */}
        <div className="relative flex min-h-0 flex-1 flex-col bg-canvas/40 p-4">
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-center">
              <div>
                <Icon.Clock className="mx-auto h-8 w-8 animate-spin text-accent" />
                <p className="mt-3 text-subhead text-ink-soft">Loading documents…</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <div className="max-w-md rounded-md border-2 border-rose/30 bg-rose/10 p-6">
                <Icon.Warning className="mx-auto h-8 w-8 text-rose" />
                <p className="mt-2 font-medium text-rose">Error loading documents</p>
                <p className="mt-1 text-meta text-ink-soft">{error}</p>
              </div>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <div className="max-w-md">
                <Icon.Folder className="mx-auto h-12 w-12 text-ink-faint" />
                <h3 className="mt-3 text-heading font-medium text-ink">No Documents Yet</h3>
                <p className="mt-1.5 text-body text-ink-soft">
                  Tailored CV and Cover Letter haven't been drafted for this application yet.
                </p>
                {onRequestCv && (
                  <button
                    onClick={() => {
                      onClose();
                      onRequestCv();
                    }}
                    className="btn-primary mt-5 inline-flex items-center gap-2"
                  >
                    <Icon.Sparkles className="h-4 w-4" />
                    Queue Tailored CV Generation
                  </button>
                )}
              </div>
            </div>
          ) : selectedFile ? (
            <div className="flex h-full flex-col">
              {/* Document Actions Bar */}
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-label text-ink-soft font-mono truncate">
                  <span className="font-semibold text-ink">{selectedFile.name}</span>
                  <span>· {Math.round(selectedFile.size / 1024)} KB</span>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={api.documentDownloadUrl(appId, selectedFile.name)}
                    download={selectedFile.name}
                    className="btn-primary inline-flex items-center gap-1.5 py-1 px-3 text-micro"
                  >
                    <Icon.Download className="h-3.5 w-3.5" />
                    Download {selectedFile.ext.toUpperCase()}
                  </a>
                  {selectedFile.ext === 'pdf' && (
                    <a
                      href={api.documentInlineUrl(appId, selectedFile.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-quiet inline-flex items-center gap-1.5 py-1 px-3 text-micro"
                    >
                      <Icon.External className="h-3.5 w-3.5" />
                      Open Full Tab
                    </a>
                  )}
                </div>
              </div>

              {/* Viewport: PDF iframe or Word download prompt */}
              {selectedFile.ext === 'pdf' ? (
                <div className="relative flex-1 overflow-hidden rounded-md border-2 border-line bg-white shadow-inner">
                  <iframe
                    title={selectedFile.name}
                    src={`${api.documentInlineUrl(appId, selectedFile.name)}#toolbar=1&navpanes=0`}
                    className="h-full w-full border-none"
                  />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-md border-2 border-line bg-panel p-8 text-center shadow-inner">
                  <div className="max-w-md">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 border-2 border-line text-accent">
                      <Icon.Folder className="h-8 w-8" />
                    </div>
                    <h3 className="mt-4 text-heading font-semibold text-ink">
                      Word Document (.docx)
                    </h3>
                    <p className="mt-1.5 text-body text-ink-soft">
                      Web browsers cannot render .docx files natively. You can download and open it in Microsoft Word or LibreOffice.
                    </p>
                    <div className="mt-5 flex justify-center gap-3">
                      <a
                        href={api.documentDownloadUrl(appId, selectedFile.name)}
                        download={selectedFile.name}
                        className="btn-primary inline-flex items-center gap-2"
                      >
                        <Icon.Download className="h-4 w-4" />
                        Download {selectedFile.name}
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
