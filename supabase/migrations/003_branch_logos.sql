-- Add logo_url column to branches
ALTER TABLE branches ADD COLUMN IF NOT EXISTS logo_url text;

-- Create storage bucket for branch logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('branch-logos', 'branch-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to branch-logos bucket
CREATE POLICY "Authenticated users can upload branch logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'branch-logos');

-- Allow authenticated users to update/replace their uploads
CREATE POLICY "Authenticated users can update branch logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'branch-logos');

-- Allow authenticated users to delete branch logos
CREATE POLICY "Authenticated users can delete branch logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'branch-logos');

-- Allow public read access to branch logos
CREATE POLICY "Public read access for branch logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'branch-logos');
