import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

/**
 * Uploads files to Supabase Storage using the service-role key, entirely
 * server-side. The frontend never talks to Supabase directly — it uploads
 * through our own NestJS endpoint, which reuses the same auth/ownership
 * checks as every other venue action, rather than needing a second,
 * separate permission system (Supabase's own storage policies).
 */
@Injectable()
export class SupabaseStorageService {
    private readonly client: SupabaseClient;
    private readonly bucket = 'venue-images';

    constructor() {
        this.client = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
    }

    async uploadVenueImage(
        venueId: string,
        file: Express.Multer.File,
    ): Promise<string> {
        // Never trust the original filename as part of the storage path — it can
        // contain spaces, unicode characters (macOS screenshot names include an
        // invisible "narrow no-break space"), or anything else the person's OS
        // happened to generate, any of which Supabase's storage keys can reject.
        // A generated, guaranteed-safe name sidesteps the whole category of bug.
        const extension = file.originalname.split('.').pop()?.toLowerCase() || 'bin';
        const path = `${venueId}/${randomUUID()}.${extension}`;

        const { error } = await this.client.storage
            .from(this.bucket)
            .upload(path, file.buffer, { contentType: file.mimetype });

        if (error) {
            throw new Error(`Supabase upload failed: ${error.message}`);
        }

        const { data } = this.client.storage.from(this.bucket).getPublicUrl(path);
        return data.publicUrl;
    }
}