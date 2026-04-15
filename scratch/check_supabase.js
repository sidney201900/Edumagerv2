
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ekbuvcjsfcczviqqlfit.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrYnV2Y2pzZmNjenZpcXFsZml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5OTU0MzIsImV4cCI6MjA4NjU3MTQzMn0.oIzBeGF-PjaviZejYb1TeOOEzMm-Jjth1XzvJrjD6us';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  const results = {
    tables: {},
    storage: {},
    errors: []
  };

  // 1. Check school_data table
  try {
    const { data: schoolData, error: schoolError } = await supabase.from('school_data').select('*').limit(1);
    results.tables.school_data = { exists: !schoolError, error: schoolError?.message };
    if (schoolData?.[0]?.data) {
        results.tables.school_data.hasData = true;
        results.tables.school_data.hasExams = Array.isArray(schoolData[0].data.exams);
    }
  } catch (e) { results.errors.push('school_data check failed: ' + e.message); }

  // 2. Check provas_submissoes table
  try {
    const { data: subData, error: subError } = await supabase.from('provas_submissoes').select('*').limit(1);
    results.tables.provas_submissoes = { exists: !subError, error: subError?.message };
  } catch (e) { results.errors.push('provas_submissoes check failed: ' + e.message); }

  // 3. Check alunos_cobrancas table
  try {
    const { data: cobData, error: cobError } = await supabase.from('alunos_cobrancas').select('*').limit(1);
    results.tables.alunos_cobrancas = { exists: !cobError, error: cobError?.message };
  } catch (e) { results.errors.push('alunos_cobrancas check failed: ' + e.message); }

  // 4. Check edumanager-assets storage
  try {
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
        results.storage.error = bucketError.message;
    } else {
        const bucket = buckets.find(b => b.id === 'edumanager-assets');
        results.storage.edumanagerAssets = { exists: !!bucket, public: bucket?.public };
    }
  } catch (e) { results.errors.push('storage check failed: ' + e.message); }

  console.log(JSON.stringify(results, null, 2));
}

checkDatabase();
