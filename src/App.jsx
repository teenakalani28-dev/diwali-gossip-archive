
import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import './index.css';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

const captions = [
  'MAIN CHARACTER MOMENT',
  'FULL TOO FILMY',
  'CORE MEMORY UNLOCKED',
  'AUNTY CAMERA APPROVED',
  'NO CONTEXT. JUST VIBES.',
  'CAUGHT IN 4K',
  'TOO GLAM TO GIVE A DAMN',
  'PROOF OF ATTENDANCE'
];

export default function App() {
  const [photos, setPhotos] = useState([]);
  const [guestName, setGuestName] = useState('');
  const [caption, setCaption] = useState(captions[0]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function loadPhotos() {
    const { data, error } = await supabase
      .from('Photos')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setPhotos(data || []);
    else console.error('Photo loading error:', error.message);
  }

  useEffect(() => {
    loadPhotos();
    const timer = setInterval(loadPhotos, 5000);
    return () => clearInterval(timer);
  }, []);

  async function uploadPhoto(e) {
    e.preventDefault();

    if (!file) {
      setMessage('Please choose a photo first.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setMessage('Please select an image file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessage('Photo must be smaller than 10 MB.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
      const path = `${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('diwali-photos')
        .upload(path, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('diwali-photos')
        .getPublicUrl(path);

      const { error: insertError } = await supabase
        .from('Photos')
        .insert({
          image_url: urlData.publicUrl,
          caption,
          Guest_name: guestName.trim() || 'Anonymous',
          likes: 0,
          Featured: false
        });

      if (insertError) throw insertError;

      setFile(null);
      setGuestName('');
      setCaption(captions[0]);
      e.target.reset();
      setMessage('YOUR EVIDENCE IS NOW ON RECORD.');
      await loadPhotos();
    } catch (error) {
      console.error(error);
      setMessage(`Upload failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="archive">
      <header className="hero">
        <p className="eyebrow">THE OFFICIAL AFTER-PARTY RECORD</p>
        <h1>DIWALI KI<br /><span>GOSSIP ARCHIVE</span></h1>
        <p className="subtitle">Proof that we actually touched grass.</p>
        <div className="live">
          <span className="live-dot" /> LIVE ARCHIVE
        </div>
        <div className="photo-count">{photos.length} MOMENTS ON RECORD</div>
      </header>

      <section className="upload-section">
        <p className="section-kicker">GOT RECEIPTS?</p>
        <h2>Put it on record.</h2>
        <p className="description">
          Upload the evidence. The good, the chaotic and the questionable.
        </p>

        <form onSubmit={uploadPhoto} className="upload-form">
          <label className="field-label">YOUR NAME (OPTIONAL)</label>
          <input
            value={guestName}
            onChange={e => setGuestName(e.target.value)}
            placeholder="Who are we crediting?"
            maxLength={50}
          />

          <label className="field-label">PICK YOUR CAPTION</label>
          <select value={caption} onChange={e => setCaption(e.target.value)}>
            {captions.map(item => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>

          <label className="field-label">UPLOAD YOUR EVIDENCE</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={e => setFile(e.target.files?.[0] || null)}
          />

          {file && <p className="file-name">{file.name}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'UPLOADING...' : 'ADD TO THE ARCHIVE'}
          </button>

          {message && <p className="status-message">{message}</p>}
        </form>
      </section>

      <section className="gallery-section">
        <div className="gallery-heading">
          <div>
            <p className="section-kicker">THE EVIDENCE</p>
            <h2>The night, documented.</h2>
          </div>
          <span>{photos.length} PHOTOS</span>
        </div>

        {photos.length === 0 ? (
          <p className="empty-state">
            No evidence yet. Be the first to make history.
          </p>
        ) : (
          <div className="gallery">
            {photos.map(photo => (
              <article className="photo-card" key={photo.id}>
                <img
                  src={photo.image_url}
                  alt={photo.caption || 'Diwali memory'}
                  loading="lazy"
                />
                <div className="photo-info">
                  <p>{photo.caption}</p>
                  <span>{photo.Guest_name || 'Anonymous'}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        <p>NO CONTEXT. JUST CORE MEMORIES.</p>
        <span>THE GOSSIP ARCHIVE · DIWALI 2026</span>
      </footer>
    </main>
  );
}
