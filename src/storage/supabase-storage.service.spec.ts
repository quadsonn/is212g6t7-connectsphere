import { createClient } from '@supabase/supabase-js';

import { SupabaseStorageService } from './supabase-storage.service';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

/**
 * Unit tests for SupabaseStorageService.uploadVenueImage(), with the Supabase
 * client mocked: the generated storage path, the returned public URL, and the
 * upload-error path.
 */
describe('SupabaseStorageService', () => {
  let upload: jest.Mock;
  let getPublicUrl: jest.Mock;
  let from: jest.Mock;
  let service: SupabaseStorageService;

  const file = (originalname: string) =>
    ({ originalname, buffer: Buffer.from('img'), mimetype: 'image/png' }) as Express.Multer.File;

  beforeEach(() => {
    upload = jest.fn().mockResolvedValue({ error: null });
    getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn/venue-1/x.png' } });
    from = jest.fn().mockReturnValue({ upload, getPublicUrl });
    (createClient as jest.Mock).mockReturnValue({ storage: { from } });
    service = new SupabaseStorageService();
  });

  it('uploads under a generated name with the original extension and returns the public URL', async () => {
    const url = await service.uploadVenueImage('venue-1', file('Screen Shot 2026.PNG'));

    expect(from).toHaveBeenCalledWith('venue-images');
    const [path, buffer, options] = upload.mock.calls[0];
    expect(path).toMatch(/^venue-1\/[0-9a-f-]{36}\.png$/);
    expect(buffer).toEqual(Buffer.from('img'));
    expect(options).toEqual({ contentType: 'image/png' });
    expect(getPublicUrl).toHaveBeenCalledWith(path);
    expect(url).toBe('https://cdn/venue-1/x.png');
  });

  it('falls back to a .bin extension when the filename has none', async () => {
    await service.uploadVenueImage('venue-1', file('photo.'));

    expect(upload.mock.calls[0][0]).toMatch(/\.bin$/);
  });

  it('throws with the Supabase message when the upload fails', async () => {
    upload.mockResolvedValue({ error: { message: 'bucket not found' } });

    await expect(service.uploadVenueImage('venue-1', file('a.png'))).rejects.toThrow(
      'Supabase upload failed: bucket not found',
    );
    expect(getPublicUrl).not.toHaveBeenCalled();
  });
});
