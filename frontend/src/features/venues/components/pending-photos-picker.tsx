import { useRef, useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Lets the person pick photos before a venue exists yet — files are held
 * locally (never uploaded) until the venue is actually created, since
 * uploading needs a real venue id to attach to. `onFilesChange` fires with
 * the current staged list on every add/remove so the parent can upload them
 * right after creation succeeds.
 */
export function PendingPhotosPicker({
    onFilesChange,
}: {
    onFilesChange: (files: File[]) => void;
}) {
    const fileInput = useRef<HTMLInputElement>(null);
    const [staged, setStaged] = useState<{ file: File; previewUrl: string }[]>([]);

    const update = (next: { file: File; previewUrl: string }[]) => {
        setStaged(next);
        onFilesChange(next.map((s) => s.file));
    };

    // Batches every newly-picked file into one state update, rather than
    // calling this once per file in a loop — doing it one at a time would
    // have each call read the same "staged before this batch" snapshot and
    // overwrite each other, silently dropping all but the last file picked.
    const addFiles = (files: File[]) => {
        update([
            ...staged,
            ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
        ]);
    };

    const removeAt = (index: number) => {
        URL.revokeObjectURL(staged[index].previewUrl);
        update(staged.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-3">
            {staged.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {staged.map((s, i) => (
                        <div key={s.previewUrl} className="relative aspect-video overflow-hidden rounded-lg bg-ink-100">
                            <img src={s.previewUrl} alt="" className="size-full object-cover" />
                            <button
                                type="button"
                                onClick={() => removeAt(i)}
                                aria-label="Remove this photo"
                                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-red-600"
                            >
                                <X className="size-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-sm text-ink-500">
                    No photos added yet — you can add some now, or after saving.
                </p>
            )}

            <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length > 0) addFiles(files);
                    e.target.value = '';
                }}
            />
            <Button type="button" onClick={() => fileInput.current?.click()}>
                Add photos
            </Button>
        </div>
    );
}