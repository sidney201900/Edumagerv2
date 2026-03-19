-- SQL Schema for EduManager Employee Module and User Enhancements

-- 1. Employee Categories Table
CREATE TABLE IF NOT EXISTS categorias_funcionarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Employees Table
CREATE TABLE IF NOT EXISTS funcionarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    cpf TEXT UNIQUE NOT NULL,
    telefone TEXT,
    email TEXT,
    data_admissao DATE,
    categoria_id UUID REFERENCES categorias_funcionarios(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Storage Bucket for Profile Pictures
-- Note: You need to create the bucket 'edumanager-assets' in the Supabase Dashboard
-- and set its policy to public or authenticated as needed.

-- Example Policies for Storage:
-- CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'edumanager-assets');
-- CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'edumanager-assets' AND auth.role() = 'authenticated');

-- 4. Update school_data table if needed (EduManager uses a single JSON blob for most data)
-- The application logic handles the JSON structure updates automatically.
