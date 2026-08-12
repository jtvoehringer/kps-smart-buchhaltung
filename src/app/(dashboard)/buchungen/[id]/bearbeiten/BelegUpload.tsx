'use client';

import { useState, useRef, useCallback } from 'react';
import { useServerState } from '@/lib/useServerState';
import { createClient } from '@/lib/supabase/client';

type Attachment = {
  id: string;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
};

type Props = {
  transactionId: string;
  clientId: string;
  initialAttachments: Attachment[];
};

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_MB   = 10;

function fileIcon(name: string): string {
  if (name.endsWith('.pdf')) return 'PDF';
  if (name.match(/\.(jpg|jpeg|png|webp)$/i)) return 'Bild';
  return 'Datei';
}

export default function BelegUpload({ transactionId, clientId, initialAttachments }: Props) {
  const supabase   = createClient();
  const fileInput   = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const [attachments, setAttachments] = useServerState<Attachment[]>(initialAttachments);
  const [uploading, setUploading]     = useState(false);
  const [dragOver, setDragOver]       = useState(false);
  const [error, setError]             = useState('');

  async function uploadFile(file: File) {
    setError('');
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Nur PDF, JPG, PNG und WebP-Dateien erlaubt.');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Datei zu groß (max. ${MAX_SIZE_MB} MB).`);
      return;
    }

    setUploading(true);
    const ext       = file.name.split('.').pop() ?? 'bin';
    const fileName  = `${Date.now()}.${ext}`;
    const storagePath = `${clientId}/${transactionId}/${fileName}`;

    // Upload in Supabase Storage
    const { error: storageError } = await supabase.storage
      .from('belege')
      .upload(storagePath, file, { upsert: false });

    if (storageError) {
      setError(`Upload fehlgeschlagen: ${storageError.message}`);
      setUploading(false);
      return;
    }

    // Eintrag in attachments-Tabelle
    const { data: att, error: dbError } = await supabase
      .from('attachments')
      .insert({
        transaction_id: transactionId,
        client_id:      clientId,
        file_name:      file.name,
        storage_path:   storagePath,
        mime_type:      file.type,
        file_size:      file.size,
        uploaded_by:    (await supabase.auth.getUser()).data.user?.id,
      })
      .select('id, file_name, storage_path, uploaded_at')
      .single();

    if (dbError) {
      setError(`Datenbankeintrag fehlgeschlagen: ${dbError.message}`);
    } else if (att) {
      setAttachments(prev => [...prev, att]);
    }
    setUploading(false);
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      await uploadFile(file);
    }
  }

  async function deleteAttachment(att: Attachment) {
    if (!confirm(`Beleg "${att.file_name}" wirklich löschen?`)) return;

    const { error: storageError } = await supabase.storage
      .from('belege')
      .remove([att.storage_path]);

    if (storageError) {
      setError(`Löschen fehlgeschlagen: ${storageError.message}`);
      return;
    }

    await supabase.from('attachments').delete().eq('id', att.id);
    setAttachments(prev => prev.filter(a => a.id !== att.id));
  }

  async function getSignedUrl(storagePath: string): Promise<string | null> {
    const { data } = await supabase.storage
      .from('belege')
      .createSignedUrl(storagePath, 300); // 5 Minuten gültig
    return data?.signedUrl ?? null;
  }

  async function openAttachment(att: Attachment) {
    const url = await getSignedUrl(att.storage_path);
    if (url) window.open(url, '_blank');
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-700">Belege</span>
        <span className="text-xs text-gray-400">(optional · PDF, JPG, PNG · max. {MAX_SIZE_MB} MB)</span>
      </div>

      {/* Bestehende Belege */}
      {attachments.length > 0 && (
        <ul className="space-y-2">
          {attachments.map(att => (
            <li
              key={att.id}
              className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 group"
            >
              <span className="text-lg">{fileIcon(att.file_name)}</span>
              <button
                type="button"
                onClick={() => openAttachment(att)}
                className="flex-1 text-left text-sm text-[#35609E] hover:underline truncate"
                title={att.file_name}
              >
                {att.file_name}
              </button>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {new Date(att.uploaded_at).toLocaleDateString('de-AT')}
              </span>
              <button
                type="button"
                onClick={() => deleteAttachment(att)}
                className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                title="Beleg löschen"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Kamera-Direktaufnahme */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => cameraInput.current?.click()}
          className="inline-flex items-center gap-1 text-xs text-white font-medium bg-[#35609E] hover:bg-[#4F90E8] px-3 py-1.5 rounded-lg transition-colors">
          Foto aufnehmen
        </button>
        <span className="text-xs text-gray-400">oder Datei unten hochladen</span>
      </div>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment"
        onChange={e => handleFiles(e.target.files)} className="hidden" />

      {/* Upload-Bereich */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInput.current?.click()}
        className={`border-2 border-dashed rounded-xl px-4 py-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-[#35609E] bg-blue-50'
            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <svg className="animate-spin h-4 w-4 text-[#35609E]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Wird hochgeladen…
          </div>
        ) : (
          <>
            <div className="text-2xl mb-1">⬆️</div>
            <p className="text-sm text-gray-500">
              Datei hierher ziehen oder <span className="text-[#35609E] font-medium">auswählen</span>
            </p>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={e => handleFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {error && (
        <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}
    </div>
  );
}
