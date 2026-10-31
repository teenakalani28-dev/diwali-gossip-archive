

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
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [uploadProgress, setUploadProgress] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [adminMode, setAdminMode] = useState(
    window.location.hash === '#admin'
  );
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminUser, setAdminUser] = useState(null);
  const [adminChecking, setAdminChecking] = useState(false);
  const [adminMessage, setAdminMessage] = useState('');
  const [busyPhotoId, setBusyPhotoId] = useState(null);

  useEffect(() => {
    function handleHashChange() {
      setAdminMode(window.location.hash === '#admin');
      setAdminMessage('');
    }

    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  async function loadPhotos() {
    const { data, error } = await supabase
      .from('Photos')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) {
      setPhotos(data || []);
    } else {
      console.error('Photo loading error:', error.message);
    }
  }

  useEffect(() => {
    loadPhotos();

    const timer = setInterval(loadPhotos, 5000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (adminMode) {
      checkAdminSession();
    } else {
      setAdminUser(null);
    }
  }, [adminMode]);

  async function checkAdminSession() {
    setAdminChecking(true);
    setAdminMessage('');

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!sessionData.session) {
        setAdminUser(null);
        return;
      }

      const { data: isAdmin, error } = await supabase.rpc(
        'is_archive_admin'
      );

      if (error || !isAdmin) {
        await supabase.auth.signOut();
        setAdminUser(null);
        setAdminMessage(
          'This account is not authorised for the archive.'
        );
        return;
      }

      setAdminUser(sessionData.session.user);
    } catch (error) {
      setAdminUser(null);
      setAdminMessage(error.message);
    } finally {
      setAdminChecking(false);
    }
  }

  async function adminLogin(e) {
    e.preventDefault();
    setAdminChecking(true);
    setAdminMessage('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: adminEmail.trim(),
        password: adminPassword
      });

      if (error) throw error;

      const { data: isAdmin, error: adminError } =
        await supabase.rpc('is_archive_admin');

      if (adminError) throw adminError;

      if (!isAdmin) {
        await supabase.auth.signOut();

        throw new Error(
          'This account is not authorised for the archive.'
        );
      }

      setAdminUser(data.user);
      setAdminPassword('');

      await loadPhotos();
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setAdminChecking(false);
    }
  }

  async function adminLogout() {
    await supabase.auth.signOut();

    setAdminUser(null);
    setAdminMessage('');

    window.location.hash = '';
  }

  async function toggleFeatured(photo) {
    setBusyPhotoId(photo.id);
    setAdminMessage('');

    try {
      const { error } = await supabase
        .from('Photos')
        .update({ Featured: !photo.Featured })
        .eq('id', photo.id);

      if (error) throw error;

      await loadPhotos();

      setAdminMessage(
        photo.Featured ? 'Photo unfeatured.' : 'Photo featured.'
      );
    } catch (error) {
      setAdminMessage(`Could not update photo: ${error.message}`);
    } finally {
      setBusyPhotoId(null);
    }
  }

  async function deletePhoto(photo) {
    const confirmed = window.confirm(
      'Delete this photo permanently? This cannot be undone.'
    );

    if (!confirmed) return;

    setBusyPhotoId(photo.id);
    setAdminMessage('');

    try {
      const marker = '/diwali-photos/';
      const imageUrl = photo.image_url || '';
      const markerIndex = imageUrl.indexOf(marker);

      if (markerIndex === -1) {
        throw new Error('Could not identify the stored image file.');
      }

      const path = decodeURIComponent(
        imageUrl.substring(markerIndex + marker.length)
      );

      const { error: storageError } = await supabase.storage
        .from('diwali-photos')
        .remove([path]);

      if (storageError) throw storageError;

      const { error: deleteError } = await supabase
        .from('Photos')
        .delete()
        .eq('id', photo.id);

      if (deleteError) throw deleteError;

      await loadPhotos();

      setAdminMessage('Photo deleted from the archive.');
    } catch (error) {
      setAdminMessage(`Delete failed: ${error.message}`);
    } finally {
      setBusyPhotoId(null);
    }
  }

  function handlePhotoSelection(e) {
    const selected = Array.from(e.target.files || []);

    if (selected.length > 10) {
      setMessage('Maximum 10 photos at a time.');
      setSelectedPhotos([]);
      e.target.value = '';
      return;
    }

    setSelectedPhotos(
      selected.map(file => ({
        file,
        caption: captions[0],
        previewUrl: URL.createObjectURL(file)
      }))
    );

    setMessage('');
  }

  function updatePhotoCaption(index, newCaption) {
    setSelectedPhotos(current =>
      current.map((photo, i) =>
        i === index
          ? { ...photo, caption: newCaption }
          : photo
      )
    );
  }

  async function uploadPhoto(e) {
    e.preventDefault();

    if (selectedPhotos.length === 0) {
      setMessage('Please choose at least one photo.');
      return;
    }

    if (selectedPhotos.length > 10) {
      setMessage('Maximum 10 photos per upload.');
      return;
    }

    for (const photo of selectedPhotos) {
      const file = photo.file;

      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      ) {
        setMessage(`${file.name} is not a supported image format.`);
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setMessage(`${file.name} exceeds the 10 MB limit.`);
        return;
      }
    }

    setLoading(true);
    setMessage('');

    let successfulUploads = 0;

    try {
      for (let i = 0; i < selectedPhotos.length; i++) {
        const photo = selectedPhotos[i];
        const file = photo.file;

        setUploadProgress(
          `UPLOADING ${i + 1} OF ${selectedPhotos.length}...`
        );

        const safeName = file.name.replace(
          /[^a-zA-Z0-9.-]/g,
          '-'
        );

        const path = `${Date.now()}-${i}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('diwali-photos')
          .upload(path, file, {
            contentType: file.type
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('diwali-photos')
          .getPublicUrl(path);

        const { error: insertError } = await supabase
          .from('Photos')
          .insert({
            image_url: urlData.publicUrl,
            caption: photo.caption,
            Guest_name: guestName.trim() || 'Anonymous',
            likes: 0,
            Featured: false
          });

        if (insertError) throw insertError;

        successfulUploads++;
      }

      selectedPhotos.forEach(photo => {
        URL.revokeObjectURL(photo.previewUrl);
      });

      setSelectedPhotos([]);
      setGuestName('');

      e.currentTarget.reset();

      setMessage(
        `${successfulUploads} PHOTOS ADDED TO THE ARCHIVE.`
      );

      await loadPhotos();
    } catch (error) {
      console.error(error);

      setMessage(
        `${successfulUploads} uploaded. Remaining uploads stopped: ${error.message}`
      );

      await loadPhotos();
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  }

  if (adminMode) {
    return (
      <main
        className="archive"
        style={{
          minHeight: '100vh',
          padding: '32px 20px'
        }}
      >
        <section style={{ maxWidth: '900px', margin: '0 auto' }}>
          <p className="eyebrow">
            THE OFFICIAL AFTER-PARTY RECORD
          </p>

          <h1 style={{ marginBottom: '12px' }}>
            ARCHIVE <span>ADMIN</span>
          </h1>

          <p className="subtitle">
            Private access. Behind the evidence.
          </p>

          {adminChecking ? (
            <p>Checking access...</p>
          ) : !adminUser ? (
            <form
              onSubmit={adminLogin}
              className="upload-form"
              style={{
                maxWidth: '440px',
                margin: '35px auto'
              }}
            >
              <h2>Admin login</h2>

              <label className="field-label">EMAIL</label>

              <input
                type="email"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="Admin email"
                required
              />

              <label className="field-label">PASSWORD</label>

              <input
                type="password"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                placeholder="Password"
                required
              />

              <button type="submit" disabled={adminChecking}>
                {adminChecking ? 'VERIFYING...' : 'ACCESS ARCHIVE'}
              </button>

              {adminMessage && (
                <p className="status-message">{adminMessage}</p>
              )}
            </form>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  margin: '30px 0'
                }}
              >
                <div>
                  <p className="section-kicker">CONTROL ROOM</p>
                  <h2>{photos.length} photos on record</h2>
                  <p>{adminUser.email}</p>
                </div>

                <button type="button" onClick={adminLogout}>
                  LOG OUT
                </button>
              </div>

              {adminMessage && (
                <p className="status-message">{adminMessage}</p>
              )}

              <button
                type="button"
                onClick={loadPhotos}
                style={{ marginBottom: '20px' }}
              >
                REFRESH PHOTOS
              </button>

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

                      <p style={{ marginTop: '10px' }}>
                        {photo.Featured ? 'FEATURED' : 'NOT FEATURED'}
                      </p>

                      <button
                        type="button"
                        disabled={busyPhotoId === photo.id}
                        onClick={() => toggleFeatured(photo)}
                      >
                        {busyPhotoId === photo.id
                          ? 'PLEASE WAIT...'
                          : photo.Featured
                            ? 'UNFEATURE'
                            : 'FEATURE PHOTO'}
                      </button>

                      <button
                        type="button"
                        disabled={busyPhotoId === photo.id}
                        onClick={() => deletePhoto(photo)}
                        style={{ marginTop: '8px' }}
                      >
                        DELETE PHOTO
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="archive">
      <header className="hero">
        <p className="eyebrow">
          THE OFFICIAL AFTER-PARTY RECORD
        </p>

        <h1>
          DIWALI KI<br />
          <span>GOSSIP ARCHIVE</span>
        </h1>

        <p className="subtitle">
          Proof that we actually touched grass.
        </p>

        <div className="live">
          <span className="live-dot" /> LIVE ARCHIVE
        </div>

        <div className="photo-count">
          {photos.length} MOMENTS ON RECORD
        </div>
      </header>

      <section className="upload-section">
        <p className="section-kicker">GOT RECEIPTS?</p>

        <h2>Put it on record.</h2>

        <p className="description">
          Upload the evidence. The good, the chaotic and the questionable.
        </p>

        <form onSubmit={uploadPhoto} className="upload-form">
          <label className="field-label">
            YOUR NAME (OPTIONAL)
          </label>

          <input
            value={guestName}
            onChange={e => setGuestName(e.target.value)}
            placeholder="Who are we crediting?"
            maxLength={50}
          />

          <label className="field-label">
            UPLOAD YOUR EVIDENCE (UP TO 10 PHOTOS)
          </label>

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handlePhotoSelection}
            disabled={loading}
          />

          {selectedPhotos.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <p className="field-label">
                {selectedPhotos.length} PHOTOS SELECTED — ADD YOUR CAPTIONS
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '16px',
                  marginTop: '12px'
                }}
              >
                {selectedPhotos.map((photo, index) => (
                  <div
                    key={`${photo.file.name}-${photo.file.lastModified}-${index}`}
                    style={{
                      minWidth: 0,
                      padding: '10px',
                      background: 'rgba(255,255,255,0.65)',
                      borderRadius: '10px',
                      border: '1px solid rgba(41,60,52,0.15)'
                    }}
                  >
                    <img
                      src={photo.previewUrl}
                      alt={`Selected photo ${index + 1}`}
                      style={{
                        width: '100%',
                        height: '130px',
                        objectFit: 'cover',
                        borderRadius: '6px',
                        display: 'block',
                        marginBottom: '10px'
                      }}
                    />

                    <p
                      style={{
                        fontSize: '12px',
                        margin: '0 0 8px',
                        fontWeight: '600'
                      }}
                    >
                      PHOTO {index + 1}
                    </p>

                    <select
                      value={photo.caption}
                      onChange={e =>
                        updatePhotoCaption(index, e.target.value)
                      }
                      disabled={loading}
                      aria-label={`Caption for photo ${index + 1}`}
                      style={{
                        width: '100%',
                        minWidth: 0
                      }}
                    >
                      {captions.map(item => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {uploadProgress && (
            <p className="status-message">{uploadProgress}</p>
          )}

          <button type="submit" disabled={loading}>
            {loading ? 'UPLOADING...' : 'ADD TO THE ARCHIVE'}
          </button>

          {message && (
            <p className="status-message">{message}</p>
          )}
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
