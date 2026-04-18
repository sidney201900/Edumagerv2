import { createClient } from '@supabase/supabase-js';

// Access environment variables injected by Vite's define or standard import.meta.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ekbuvcjsfcczviqqlfit.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || process.env.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrYnV2Y2pzZmNjenZpcXFsZml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5OTU0MzIsImV4cCI6MjA4NjU3MTQzMn0.oIzBeGF-PjaviZejYb1TeOOEzMm-Jjth1XzvJrjD6us';

export const isSupabaseConfigured = () => {
  return !!supabaseUrl && !!supabaseKey && supabaseUrl !== 'https://placeholder.supabase.co';
};

// Initialize client with error handling to prevent UI crashes
let supabaseClient;
try {
  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      headers: { 'x-application-name': 'edumanager' },
    },
  });
} catch (error) {
  console.error('Failed to initialize Supabase client:', error);
  // Fallback to a dummy client that won't crash the app but will fail gracefully on calls
  supabaseClient = createClient('https://placeholder.supabase.co', 'placeholder');
}

export const supabase = supabaseClient;

export const uploadProfilePicture = async (userId: string, file: File): Promise<string | null> => {
  if (!isSupabaseConfigured()) return null;

  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Math.random()}.${fileExt}`;
    const filePath = `profiles/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('edumanager-assets')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('edumanager-assets')
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    return null;
  }
};

export const uploadLogo = async (file: File): Promise<string | null> => {
  if (!isSupabaseConfigured()) return null;

  try {
    const fileExt = file.name.split('.').pop() || 'webp';
    const fileName = `logo-${Date.now()}.${fileExt}`;
    const filePath = `logos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('edumanager-assets')
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('edumanager-assets')
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error) {
    console.error('Error uploading logo:', error);
    return null;
  }
};

export const uploadExamImage = async (file: File): Promise<string | null> => {
  if (!isSupabaseConfigured()) {
    console.error('Supabase is not configured. Check your environment variables.');
    return null;
  }

  try {
    const fileExt = file.name.split('.').pop() || 'webp';
    const fileName = `exam-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `exams/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('edumanager-assets')
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type
      });

    if (uploadError) {
      console.error('Supabase upload error details:', uploadError);
      throw uploadError;
    }

    const { data } = supabase.storage
      .from('edumanager-assets')
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error: any) {
    console.error('Error uploading exam image:', error);
    // Return a more descriptive error if possible by throwing it back to UI
    throw error;
  }
};

export const uploadStudentPhoto = async (photoData: string): Promise<string | null> => {
  if (!isSupabaseConfigured() || !photoData || !photoData.startsWith('data:image')) {
    return photoData && photoData.startsWith('http') ? photoData : null; // Return if already a URL
  }

  try {
    const [header, base64Data] = photoData.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    if (!mimeMatch) return null;
    const mimeType = mimeMatch[1];
    
    // Decode base64 
    const byteString = atob(base64Data);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeType });

    const fileExt = mimeType.split('/')[1] || 'webp';
    const fileName = `student-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `students/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('edumanager-assets')
      .upload(filePath, blob, {
        upsert: true,
        contentType: mimeType
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('edumanager-assets')
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error: any) {
    console.error('Error uploading student photo:', error);
    return null;
  }
};
